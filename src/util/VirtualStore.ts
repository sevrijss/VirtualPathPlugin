import {Quad} from "rdf-js";
import N3, {DataFactory, Store} from 'n3';
import {
    BasicRepresentation,
    Conditions,
    getLoggerFor,
    guardedStreamFrom,
    INTERNAL_QUADS,
    InternalServerError,
    PassthroughStore,
    RDF,
    Representation,
    RepresentationConverter,
    RepresentationPreferences,
    ResourceIdentifier,
    ResourceStore
} from "@solid/community-server";
import {transformSafelyMultiple} from "./StreamUtils";
import {UrlBuilder} from "./PathResolver";
import fetch from "node-fetch";
import {SVR} from "./Vocabulary";
import {MetadataParser} from "./MetadataParser";


const {namedNode, literal, quad} = DataFactory;

const quadPrefs = {type: {[INTERNAL_QUADS]: 1}};

/**
 * Allow containers to have derived resources.
 */
export class VirtualStore<T extends ResourceStore = ResourceStore> extends PassthroughStore<T> {
    readonly converter: RepresentationConverter;
    private readonly logger = getLoggerFor(this);
    readonly urlBuilder: UrlBuilder;
    readonly metadataParser: MetadataParser;
    private virtualIdentifiers: Record<string, (prefs: RepresentationPreferences, cond: Conditions | undefined) => Promise<Representation>> = {};

    public constructor(source: T, converter: RepresentationConverter, urlBuilder: UrlBuilder, metadataParser: MetadataParser) {
        super(source);
        this.converter = converter;
        this.urlBuilder = urlBuilder;
        this.metadataParser = metadataParser;
    }

    /**
     * wrapper to resolve urls
     *
     * @param name - relative identifier
     *
     * @returns - full identifier
     */
    public resolve(name: string): string {
        return this.urlBuilder.resolve(name)
    }

    /**
     * Experimental feature - needs work.
     *
     * Lets the user provide a function which supplies a list of quads, acquired by converting the json from the api.
     *
     * @param name - identifier of the newly created resource
     * @param original - remote resource
     * @param jsonToQuads - function to map json to quads
     * @param processFunction - function to process a representation
     */
    public addVirtualRouteRemoteSource(name: string,
                                       original: string,
                                       jsonToQuads: (arg0: object) => Promise<Quad[]>,
                                       processFunction: (arg0: N3.Store) => Quad[]) {
        name = this.urlBuilder.resolve(name);
        // Construct a new function to use the original resource and pass on any preferences and/or conditions
        this.virtualIdentifiers[name] =
            async (prefs: RepresentationPreferences, cond: Conditions | undefined): Promise<Representation> => {
                const store = new Store();
                const result = await fetch(original);
                const jsonData = await result.json();
                const data = [guardedStreamFrom(await jsonToQuads(jsonData))]

                // Utility function derived from CSS, will make your life much easier
                const transformedStream = transformSafelyMultiple(data, {
                    transform(data: Quad): void {
                        if (!store.has(data)) {
                            store.add(data)
                        }
                    },
                    flush() {
                        const result = processFunction(store)
                        for (const val of result) {
                            this.push(val)
                        }
                    },
                    objectMode: true,
                });
                const out = new BasicRepresentation(transformedStream, INTERNAL_QUADS);
                return await this.converter.handle({representation: out, identifier: {path: name}, preferences: prefs});
            }
    }

    async getRepresentation(
        identifier: ResourceIdentifier,
        preferences: RepresentationPreferences,
        conditions?: Conditions,
    ): Promise<Representation> {
        this.logger.info(identifier.path);
        const result = await this.source.getRepresentation(identifier, preferences, conditions);
        const virtual = new Store(result.metadata.quads()).has(quad(namedNode(identifier.path), namedNode(RDF.type), namedNode(SVR.VirtualSolidResource)));
        if (virtual) {
            // creating the function to execute base on the metadata from the resource
            const f = await this.metadataParser.parse(
                result.metadata,
                identifier,
                (ident, pref, cond) => this.getRepresentation(ident, pref, cond)
            );
            // executing the function
            try {
                return await f(preferences, conditions)
            } catch (e) {
                const error = e as Error
                this.logger.error(error.message)
                throw new InternalServerError(error.message)
            }
        } else return result
    }
}
