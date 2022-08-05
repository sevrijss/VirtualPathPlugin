import {
    BasicRepresentation,
    Conditions,
    getLoggerFor,
    INTERNAL_QUADS,
    InternalServerError,
    RDF,
    RDFS,
    Representation,
    RepresentationConverter,
    RepresentationMetadata,
    RepresentationPreferences,
    ResourceIdentifier
} from "@solid/community-server";
import {DOAP, FNO, SVR, XMLSchema} from "./Vocabulary";
import {Quad} from "rdf-js";
import N3, {DataFactory, Store} from "n3";
import {Functions} from "./Functions";
import {transformSafelyMultiple} from "./StreamUtils";

export type streamingObject = {
    "start": (() => {}) | undefined,
    "process": (arg0: Quad) => Quad[],
    "end": (() => Quad[]) | undefined
}

export type processor = ((arg0: Store) => Quad[])

const quadPrefs = {type: {[INTERNAL_QUADS]: 1}};

const {namedNode, literal, quad} = DataFactory;

export class MetadataParser {
    private readonly logger = getLoggerFor(this);
    private readonly converter: RepresentationConverter

    constructor(converter: RepresentationConverter) {
        this.converter = converter
    }

    parse(metadata: RepresentationMetadata,
          identifier: ResourceIdentifier,
          lookup: (identifier: ResourceIdentifier,
                   preferences: RepresentationPreferences,
                   conditions?: Conditions,
          ) => Promise<Representation>): (prefs: RepresentationPreferences, cond: (Conditions | undefined)) => Promise<Representation> {
        const store = new N3.Store(metadata.quads());
        const name = identifier.path;

        const resourceNode = namedNode(identifier.path)
        const sources = store.getQuads(resourceNode, namedNode(SVR.fromResources), null, null)
            .map(q => q.object.value)
            .map(iri => ({path: iri}));

        const streaming = store.has(quad(resourceNode, namedNode(SVR.streaming), literal("true", namedNode(XMLSchema.boolean))))

        // getting the processing function and output
        const fns = store.getQuads(resourceNode, namedNode(SVR.usesFunction), null, null).map(q => q.object.value);
        const fn_out = store.getQuads(resourceNode, namedNode(SVR.takesOutput), null, null).map(q => q.object.value);

        const mappings = fns.flatMap(functionIRI => store.getQuads(
            null,
            namedNode(FNO.function),
            namedNode(functionIRI),
            null
        )).map(q => q.subject.value);
        const implementations = mappings.flatMap(mappingIRI => store.getQuads(mappingIRI, FNO.implementation, null, null))

        const f = {
            contenttype: streaming ? "stream" : "store" as "stream" | "store",
            content: streaming ? {
                "start": undefined,
                "process": (q: Quad) => [],
                "end": undefined
            } as streamingObject : (() => []) as processor
        }
        for (const implementation of implementations) {
            // console.log(implementation)
            const internalImplementation = store.has(
                quad(
                    namedNode(implementation.object.value),
                    namedNode(RDF.type),
                    namedNode(SVR.internalImplementation)
                )
            )
            if (streaming) {
                if (internalImplementation) {
                    // there is an internal implementation
                    const name = store.getQuads(
                        implementation.object.value,
                        DOAP.name,
                        null,
                        null
                    )[0].object.value;
                    let label = store.getQuads(
                        implementation.object.value,
                        RDFS.label,
                        null,
                        null
                    )[0].object.value;
                    (f.content as streamingObject)[label as keyof streamingObject] = Functions[name] as any;
                } else {
                    this.logger.info("no internal implementation");
                    // there is no internal implementation
                    // TODO: take inspiration from https://github.com/FnOio/function-agent-java
                    //  and https://github.com/FnOio/function-handler-js
                }
            } else {
                this.logger.info("not streaming");
                const name = store.getQuads(
                    implementation.object.value,
                    DOAP.name,
                    null,
                    null
                )[0].object.value;
                (f.content as processor) = Functions[name] as processor
            }
        }
        if (f.contenttype === "stream") {
            const funcs = f.content as streamingObject
            return async (prefs: RepresentationPreferences, cond: Conditions | undefined): Promise<Representation> => {
                const data = []
                const dupes: Store = new Store()
                for (const source of sources) {
                    const input = await lookup(source, quadPrefs)
                    data.push(input.data)
                }
                if (funcs.start) {
                    funcs.start();
                }
                // Utility function derived from CSS, will make your life much easier
                const transformedStream = transformSafelyMultiple(data, {
                    transform(data: Quad): void {
                        for (const val of funcs.process(data)) {
                            if (!dupes.has(val)) {
                                this.push(val)
                                dupes.add(val);
                            }
                        }
                    },
                    flush(): void {
                        if (funcs.end) {
                            for (const r of funcs.end()) {
                                if (!dupes.has(r)) {
                                    this.push(r);
                                    dupes.add(r);
                                }
                            }
                        }
                    },
                    objectMode: true,
                });

                return await this.converter.handle({
                    representation: new BasicRepresentation(transformedStream, INTERNAL_QUADS),
                    identifier: {path: name},
                    preferences: prefs
                });
            }
        } else if (f.contenttype === "store") {
            const func = f.content as processor;
            return async (prefs: RepresentationPreferences, cond: Conditions | undefined): Promise<Representation> => {
                const store = new Store();
                const data = []
                for (const source of sources) {
                    const input = await lookup(source, quadPrefs)
                    data.push(input.data)
                }

                // Utility function derived from CSS, will make your life much easier
                const transformedStream = transformSafelyMultiple(data, {
                    transform(data: Quad): void {
                        if (!store.has(data)) {
                            store.add(data)
                        }
                    },
                    flush() {
                        const result = func(store)
                        for (const val of result) {
                            this.push(val)
                        }
                    },
                    objectMode: true,
                });
                const out = new BasicRepresentation(transformedStream, INTERNAL_QUADS);
                return await this.converter.handle({
                    representation: out,
                    identifier: {path: name},
                    preferences: prefs
                });
            }

        } else throw new InternalServerError("Error in metadata");

    }

}
