import {
    BasicRepresentation,
    Conditions,
    getLoggerFor,
    INTERNAL_QUADS,
    InternalServerError,
    RDF,
    Representation,
    RepresentationConverter,
    RepresentationMetadata,
    RepresentationPreferences,
    ResourceIdentifier
} from "@solid/community-server";
import {DOAP, FNO, FNS, SVR, XMLSchema} from "./Vocabulary";
import {Quad} from "rdf-js";
import N3, {DataFactory, Store} from "n3";
import {Functions} from "./Functions";
import {transformSafelyMultiple} from "./StreamUtils";
import {FunctionHandler} from "./functionHandlerJS/FunctionHandler";
import {JavaScriptHandler} from "./functionHandlerJS/handlers/JavaScriptHandler";
import {Function as InternalFunction} from "./functionHandlerJS/models/Function"
import {cyrb53} from "./StringUtils";
import {Cache} from "./Cache";

export type streamingObject = {
    "start": (() => Promise<void>) | undefined,
    "process": (arg0: Quad) => Promise<Quad[]>,
    "end": (() => Promise<Quad[]>) | undefined
}
export type FunctionLib = { contenttype: "stream" | "store", content: streamingObject | processor }
export const mapper: Record<string, "start" | "process" | "end" | undefined> = {}
mapper[SVR.Start] = "start"
mapper[SVR.Process] = "process"
mapper[SVR.End] = "end"

/**
 * Has a major collision problem when used with blank nodes
 */
export function hashQuad(quad: Quad) {
    let subj: string = quad.subject.value;
    let pred: string = quad.predicate.value;
    let obj: string = quad.object.value;
    let graph: string = quad.graph.value;
    if (quad.subject.termType === "BlankNode") {
        subj = "BLANK";
    }
    if (quad.object.termType === "BlankNode") {
        obj = "BLANK";
    }
    return cyrb53([subj, pred, obj, graph].join("_"))
}

export type processor = ((arg0: Store) => Quad[])

const quadPrefs = {type: {[INTERNAL_QUADS]: 1}};
const {namedNode, literal, quad} = DataFactory;
export type CacheRecord = {
    "hash": number,
    "value": (prefs: RepresentationPreferences, cond: (Conditions | undefined)) => Promise<Representation>
}

export class MetadataParser {
    private readonly logger = getLoggerFor(this);
    private readonly converter: RepresentationConverter

    private readonly cache: Cache<string, CacheRecord>

    constructor(converter: RepresentationConverter, size:number) {
        this.converter = converter
        this.cache = new Cache<string, CacheRecord>(size);
        this.logger.info(`Cache size set at ${size}`)
    }


    async parse(metadata: RepresentationMetadata,
                identifier: ResourceIdentifier,
                lookup: (identifier: ResourceIdentifier,
                         preferences: RepresentationPreferences,
                         conditions?: Conditions,
                ) => Promise<Representation>):
        Promise<(prefs: RepresentationPreferences, cond: (Conditions | undefined)) => Promise<Representation>> {
        // compute a hash from all the quads
        const hash = cyrb53(metadata.quads().map(q => hashQuad(q)).sort().join("_"))
        console.log(hash);
        if (this.cache.has(identifier.path)) {
            const cached = this.cache.get(identifier.path);
            this.logger.info("returning cached function");
            return cached.value;
        } else {
            this.logger.info("no up-to-date cache found");
        }


        const handler = new FunctionHandler();
        await handler.addFunctionResourceQuads(FNS.namespace, metadata.quads());
        const name = identifier.path;
        this.logger.info(name);
        const store = new N3.Store(metadata.quads());
        const resourceNode = namedNode(identifier.path);
        //console.log(store.getObjects(null, namedNode(POSIX.mtime), null))
        //console.log(store.getObjects(null, namedNode(DC.modified), null))

        // extract sources to use
        const sources: ResourceIdentifier[] = store.getQuads(
            resourceNode,
            namedNode(SVR.fromResources),
            null,
            null)
            .map(q => q.object.value)
            .map(iri => ({path: iri}));

        // check if it's a streaming route
        const streaming = store.has(quad(
            resourceNode,
            namedNode(SVR.streaming),
            literal("true", namedNode(XMLSchema.boolean)))
        )

        // get all the function IRI's in the metadata File.
        const fns_iris = store.getQuads(
            null,
            RDF.type,
            FNO.Function,
            null
        ).map(q => q.subject.value);

        // object to collect the functions for the routes
        const f: FunctionLib = {
            contenttype: streaming ? "stream" : "store" as "stream" | "store",
            content: streaming ? {
                "start": undefined,
                "process": (q: Quad) => new Promise(() => []),
                "end": undefined
            } as streamingObject : ((s: Store) => []) as processor
        }

        // use the FnO handler to load the functions
        const jsHandler = new JavaScriptHandler();
        let fns2: ({ function: InternalFunction, internal: boolean, name: string | undefined })[] =
            await Promise.all(
                fns_iris.map(
                    async iri => {
                        const result = await handler.getFunction(iri);
                        const mappings = store.getQuads(
                            null,
                            namedNode(FNO.function),
                            namedNode(iri),
                            null).filter((q: Quad) => store.has(quad(q.subject, namedNode(RDF.type), namedNode(FNO.Mapping))));
                        let internal = true;
                        let internalName: string | undefined = undefined
                        mappings.forEach(mappingQuad => {
                            store.getQuads(mappingQuad.subject, FNO.implementation, null, null).forEach(implementation => {
                                const hasInternal = store.has(
                                    quad(
                                        namedNode(implementation.object.value),
                                        namedNode(RDF.type),
                                        namedNode(SVR.internalImplementation)
                                    )
                                )
                                if (hasInternal) {
                                    internalName = store.getQuads(
                                        implementation.object.value,
                                        DOAP.name,
                                        null,
                                        null
                                    )[0].object.value;
                                    if (internalName) {
                                        if (Functions[internalName]) {
                                            handler.implementationHandler.loadImplementation(implementation.object.value, jsHandler, {fn: Functions[internalName]});
                                        } else {
                                            throw new InternalServerError(`no internal implementation found for name ${internalName}`);
                                        }
                                    } else {
                                        throw new InternalServerError("No `DOAP.name` predicate found.");
                                    }
                                } else {
                                    /**
                                     * TODO: if remote function "collection" gets implemented, it should be used here.
                                     * Currently the function is created from a string in de rdf file, using the `Function` constructor
                                     */
                                    let functionString = store.getObjects(implementation.object, SVR.literalImplementation, null)[0].value;
                                    const f = Function(`return ${functionString}`)
                                    handler.implementationHandler.loadImplementation(implementation.object.value, jsHandler, {fn: f()});
                                }
                                internal = internal && hasInternal
                            })
                        })
                        if (store.has(
                            quad(
                                resourceNode,
                                namedNode(SVR.usesFunction),
                                namedNode(iri)
                            )
                        )) {
                            if (streaming) {
                                const name = store.getObjects(iri, SVR.streamingFunctionType, null)[0].value;
                                const type = mapper[name];
                                if (!type) {
                                    throw new InternalServerError("something went wrong while parsing the function metadata");
                                }
                                f.contenttype = "stream";
                                switch (type) {
                                    case "start":
                                        (f.content as streamingObject)["start"] = async () => {
                                            const functionResult = await handler.executeFunction(result, {});
                                            const outputs = Object.keys(functionResult);
                                            if (outputs.length !== 0) {
                                                this.logger.warn("Start function has outputs. They are ignored");
                                            }
                                            return;
                                        }
                                        break;
                                    case "process":
                                        (f.content as streamingObject)["process"] = async (arg0: Quad) => {
                                            const quadName = "https://example.com/functions#quad"
                                            const functionResult = await handler.executeFunction(result, {[`${quadName}`]: arg0,});
                                            const outputs = Object.keys(functionResult);
                                            if (outputs.length !== 1) {
                                                throw new InternalServerError("The Processing function must return 1 and only 1 value of type Quad[]")
                                            }
                                            return functionResult[outputs[0]] as Quad[]
                                        }
                                        break;
                                    case "end":
                                        (f.content as streamingObject)["end"] = async () => {
                                            const functionResult = await handler.executeFunction(result, {});
                                            const outputs = Object.keys(functionResult);
                                            if (outputs.length !== 1) {
                                                throw new InternalServerError("The End function must return 1 and only 1 value of type Quad[]")
                                            }
                                            return functionResult[outputs[0]] as Quad[]
                                        }
                                        break;
                                    default:
                                        throw new InternalServerError("The server encountered an impossible state");
                                }

                            }

                        }
                        return {
                            function: result,
                            internal: internal,
                            name: internalName
                        };
                    }
                ));

        if (f.contenttype === "stream") {
            const funcs = f.content as streamingObject
            const returned = async (prefs: RepresentationPreferences, cond: Conditions | undefined): Promise<Representation> => {
                const data = []
                const dupes: Store = new Store()
                for (const source of sources) {
                    const input = await lookup(source, quadPrefs)
                    data.push(input.data)
                }
                if (funcs.start) {
                    await funcs.start();
                }
                // Utility function derived from CSS, will make your life much easier
                const transformedStream = transformSafelyMultiple(data, {
                    async transform(data: Quad): Promise<void> {
                        for (const val of await funcs.process(data)) {
                            if (!dupes.has(val)) {
                                this.push(val)
                                dupes.add(val);
                            }
                        }
                    },
                    async flush(): Promise<void> {
                        if (funcs.end) {
                            for (const r of await funcs.end()) {
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
            this.cache.add(identifier.path, {hash, "value": returned})
            return returned
        } else if (f.contenttype === "store") {
            const func = f.content as processor;
            const returned = async (prefs: RepresentationPreferences, cond: Conditions | undefined): Promise<Representation> => {
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
            this.cache.add(identifier.path, {hash, "value": returned})
            return returned

        } else throw new InternalServerError("Error in metadata");

    }
}
