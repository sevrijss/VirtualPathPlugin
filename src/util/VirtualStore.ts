import {Quad} from "rdf-js";
import N3, {DataFactory, Store} from 'n3';
import {
    BasicRepresentation,
    Conditions,
    getLoggerFor,
    guardedStreamFrom,
    INTERNAL_QUADS,
    InternalServerError,
    MethodNotAllowedHttpError,
    PassthroughStore,
    Patch,
    RDF,
    Representation,
    RepresentationConverter,
    RepresentationMetadata,
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

    private dependencies: Record<string, string[]> = {};

    private printMetadata(metadata: RepresentationMetadata) {
        this.logger.info(metadata.quads().map(q => `${q.subject.value}\t${q.predicate.value}\t${q.object.value}`).join("\n"));
    }

    public constructor(source: T, converter: RepresentationConverter, urlBuilder: UrlBuilder, metadataParser: MetadataParser) {
        super(source);
        this.converter = converter;
        this.urlBuilder = urlBuilder;
        this.metadataParser = metadataParser;
    }

    /**
     * Keeps dependencies between existing resources and their derived ones.
     * The dependencies are used when resources are modified or deleted
     * @param name - relative path of the derived resources
     * @param originals - name of the resources from which something is derived
     * @private
     *
     * @returns - list of resourceIdentifiers for the original resources
     */
    private checkDependencies(name: string, originals: string[]): ResourceIdentifier[] {
        if (this.isVirtual(name)) {
            this.logger.error("duplicate routes in Virtual routers");
            return []
        }
        const sources: ResourceIdentifier[] = originals.map(
            (val: string) => ({path: this.urlBuilder.resolve(val)})
        )
        for (const source of sources) {
            if (source.path in this.dependencies) {
                this.dependencies[source.path].push(this.resolve(name))
            } else {
                this.dependencies[source.path] = [this.resolve(name)]
            }
        }
        return sources;
    }

    /**
     * Returns a list of identifiers of the resources that depend on the given identifier.
     * @param name - relative path of the identifier
     *
     * @returns - a list of paths
     */
    public getDependants(name: string): string[] {
        // console.log(`dependencies:\t${Object.keys(this.dependencies).join("\t")}\n name:\t${this.resolve(name)}`);
        if (this.resolve(name) in this.dependencies) {

            return this.dependencies[this.resolve(name)];
        } else return []
    }

    /**
     * returns if a given identifier is a derived resource or not
     * @param name - a relative identifier
     *
     * @returns - true if the resource is derived
     */
    public isVirtual(name: string): boolean {
        // console.log(`identifiers:\t${Object.keys(this.virtualIdentifiers).join("\t")}\n name:\t${this.resolve(name)}`);
        return Object.keys(this.virtualIdentifiers).includes(this.resolve(name));
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
        const store = new N3.Store(result.metadata.quads());
        const resourceNode = namedNode(identifier.path)
        if (store.has(quad(resourceNode, namedNode(RDF.type), namedNode(SVR.VirtualSolidResource)))) {
            // getting the sources for the derived resource
            const f = await this.metadataParser.parse(
                result.metadata,
                identifier,
                (ident, pref, cond) => this.getRepresentation(ident, pref, cond)
            );

            //const func = this.virtualIdentifiers[identifier.path]
            try {
                return await f(preferences, conditions)
            } catch (e) {
                console.log(e)
                throw new InternalServerError()
            }
        } else return result
        /*
        return this.source.getRepresentation(identifier, preferences, conditions)*/
    }

    setRepresentation(identifier: ResourceIdentifier, representation: Representation, conditions?: Conditions): Promise<ResourceIdentifier[]> {
        const deps: ResourceIdentifier[] = []
        if (identifier.path in this.virtualIdentifiers) {
            throw new MethodNotAllowedHttpError(["setRepresentation"]);
        } else if (identifier.path in this.dependencies) {
            for (const s of this.dependencies[identifier.path]) {
                deps.push({
                    path: s
                })
            }
        }
        return this.source.setRepresentation(identifier, representation, conditions).then(value => {
            for (const val of deps) {
                if (value.includes(val)) {
                    value.push(val);
                }
            }
            return value
        })
    }

    // todo insert a file to mirror the virtual routes
    addResource(container: ResourceIdentifier, representation: Representation, conditions?: Conditions): Promise<ResourceIdentifier> {
        return super.addResource(container, representation, conditions);
    }

    hasResource(identifier: ResourceIdentifier): Promise<boolean> {
        return super.hasResource(identifier);
    }

    async deleteResource(identifier: ResourceIdentifier, conditions ?: Conditions): Promise<ResourceIdentifier[]> {
        const altered: ResourceIdentifier[] = []
        if (identifier.path in this.dependencies) {
            for (const p of this.dependencies[identifier.path]) {
                altered.push({path: p})
            }
        }
        if (identifier.path in this.virtualIdentifiers) {
            const name = identifier.path
            delete this.virtualIdentifiers[name]
            altered.push(identifier);
            altered.forEach((ident: ResourceIdentifier) => this.deleteResource(ident, conditions))
            return new Promise((resolve, reject) => {
                resolve(altered);
            })
        } else {
            const result = await super.deleteResource(identifier, conditions)
            this.logger.info(result.length.toString());
            //result.filter(ident => ident.path !== identifier.path).forEach((ident: ResourceIdentifier) => this.deleteResource(ident, conditions))
            altered.forEach(val => {
                this.deleteResource(val);
                result.push(val)
            })
            return result
        }
    }

    modifyResource(identifier: ResourceIdentifier, patch: Patch, conditions ?: Conditions): Promise<ResourceIdentifier[]> {
        if (identifier.path in this.virtualIdentifiers
        ) {
            throw new MethodNotAllowedHttpError();
        }
        return super.modifyResource(identifier, patch, conditions);
    }
}
