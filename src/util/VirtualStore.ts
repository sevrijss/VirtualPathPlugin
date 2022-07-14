import {Quad} from "rdf-js";
import N3 from 'n3';
import {
    BasicRepresentation,
    Conditions,
    getLoggerFor,
    guardedStreamFrom,
    INTERNAL_QUADS,
    MethodNotAllowedHttpError,
    PassthroughStore,
    Patch,
    Representation,
    RepresentationConverter,
    RepresentationPreferences,
    ResourceIdentifier,
    ResourceStore
} from "@solid/community-server";
import {transformSafelyMultiple} from "./StreamUtils";
import {UrlBuilder} from "./PathResolver";
import {Processor} from "./Processor";
import fetch from "node-fetch";

const quadPrefs = {type: {'internal/quads': 1}};

/**
 * Allow containers to have derived resources.
 */
export class VirtualStore<T extends ResourceStore = ResourceStore> extends PassthroughStore<T> {
    //protected readonly source: T;
    readonly converter: RepresentationConverter;
    private readonly logger = getLoggerFor(this);
    readonly urlBuilder: UrlBuilder;

    private virtualIdentifiers = {};

    dependencies = {};

    public constructor(source: T, converter: RepresentationConverter, urlBuilder: UrlBuilder) {
        super(source);
        this.converter = converter;
        this.urlBuilder = urlBuilder;
    }

    /**
     * Keeps dependencies between existing resources and their derived ones.
     * The dependencies are used when resources are modified or deleted
     * @param name - name of the derived resources
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
        const sources: ResourceIdentifier[] = originals.map((val: string) => {
            return {path: this.urlBuilder.resolve(val)}
        })
        sources.forEach((source: ResourceIdentifier) => {
            if (source.path in this.dependencies) {
                // @ts-ignore
                this.dependencies[source.path].push(this.resolve(name))
            } else {
                // @ts-ignore
                this.dependencies[source.path] = [this.resolve(name)]
            }
        })
        return sources;
    }

    /**
     * Returns a list of identifiers of the resources that depend on the given identifier.
     * @param name - relative path of the identifier
     *
     * @returns - a list of relative paths
     */
    public getDependants(name: string): string[] {
        // console.log(`dependencies:\t${Object.keys(this.dependencies).join("\t")}\nname:\t${this.resolve(name)}`);
        if (this.resolve(name) in this.dependencies) {
            // @ts-ignore
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
        // console.log(`identifiers:\t${Object.keys(this.virtualIdentifiers).join("\t")}\nname:\t${this.resolve(name)}`);
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
     * Lets the user provide a function which supplies a Representation.
     * That representation can come from anywhere (api or local file)
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
        // @ts-expect-error indexing doesn't work for some reason when using strings
        this.virtualIdentifiers[name] =
            async (prefs: RepresentationPreferences, cond: Conditions): Promise<Representation> => {
                const store = new N3.Store();
                const result = await fetch(original);
                let jsonData = await result.json();
                let data = [guardedStreamFrom(await jsonToQuads(jsonData))]

                // Utility function derived from CSS, will make your life much easier
                const transformedStream = transformSafelyMultiple(data, {
                    transform(data: Quad): void {
                        console.log(data);
                        if (!store.has(data)) {
                            store.add(data)
                        }
                    },
                    flush() {
                        const result = processFunction(store)
                        result.forEach(val => {
                            this.push(val)
                        });
                    },
                    objectMode: true,
                });
                const out = new BasicRepresentation(transformedStream, INTERNAL_QUADS);
                return await this.converter.handle({representation: out, identifier: {path: name}, preferences: prefs});
            }
    }

    /**
     * Create a derived resource for which the processing function works on single Quads.
     *
     * The Quads are supplied in a streaming fashion: one by one.
     *
     * @param name - identifier of the newly created resource
     * @param originals - identifiers of the resources from which needs to be derived
     * @param startFunction - function that will be called before the data arrives (Optional)
     * @param deriveFunction - function that will be called with the data chunks (Quads)
     * @param endFunction - function that will be called after the data arrives (Optional)
     */
    public addVirtualRouteStream(name: string,
                                 originals: string[],
                                 startFunction: undefined | ((arg0: void) => void),
                                 deriveFunction: (arg0: Quad) => Quad[],
                                 endFunction: undefined | ((arg0: void) => Quad[])): void {
        const sources = this.checkDependencies(name, originals);
        name = this.urlBuilder.resolve(name);
        if (sources.length === 0) {
            return;
        }
        // @ts-ignore
        this.virtualIdentifiers[name] =
            async (prefs: RepresentationPreferences, cond: Conditions): Promise<Representation> => {
                let data = []
                let dupes: N3.Store = new N3.Store()
                for (const source of sources) {
                    const input = await this.getRepresentation(source, quadPrefs)
                    data.push(input.data)
                }
                if (startFunction) {
                    startFunction();
                }
                // Utility function derived from CSS, will make your life much easier
                const transformedStream = transformSafelyMultiple(data, {
                    transform(data: Quad): void {
                        const res = deriveFunction(data);
                        if (res.length > 0) {
                            res.forEach(val => {
                                if (!dupes.has(val)) {
                                    this.push(val)
                                    dupes.add(val);
                                }
                            });
                        }
                    },
                    flush(): void {
                        if (endFunction) {
                            const result = endFunction();
                            if (result.length !== 0) {
                                result.forEach(r => {
                                    if (!dupes.has(r)) {
                                        this.push(r);
                                        dupes.add(r);
                                    }
                                })
                            }
                        }
                    },
                    objectMode: true,
                });

                let temp = new BasicRepresentation(transformedStream, INTERNAL_QUADS);
                return await this.converter.handle({
                    representation: temp,
                    identifier: {path: name},
                    preferences: prefs
                });
            }
    }

    /**
     * Creates a derived resource with a processor object for handling
     *
     * @param name - identifier of the newly created resource
     * @param originals - identifiers of the resources from which needs to be derived
     * @param processor - processor object
     */
    public addVirtualRouteStreamProcessor(name: string, originals: string[], processor: Processor): void {
        return this.addVirtualRouteStream(name, originals, processor.start, processor.process, processor.onClose);
    }

    /**
     * Create a derived resource for which the processing function works on a store of Quads.
     *
     * @param name - identifier of the newly created resource
     * @param originals - identifiers of the resources from which needs to be derived
     * @param deriveFunction - the function to convert the original to the resource you want.
     */
    public addVirtualRoute(name: string,
                           originals: string[],
                           deriveFunction: (arg0: N3.Store) => Quad[]): void {
        const sources = this.checkDependencies(name, originals);
        name = this.urlBuilder.resolve(name);
        if (sources.length === 0) {
            return;
        }
        // Construct a new function to use the original resource and pass on any preferences and/or conditions
        // @ts-expect-error indexing doesn't work for some reason when using strings
        this.virtualIdentifiers[name] =
            async (prefs: RepresentationPreferences, cond: Conditions): Promise<Representation> => {
                const store = new N3.Store();
                let data = []
                for (const source of sources) {
                    const input = await this.getRepresentation(source, quadPrefs)
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
                        const result = deriveFunction(store)
                        result.forEach(val => {
                            this.push(val)
                        });
                    },
                    objectMode: true,
                });
                const out = new BasicRepresentation(transformedStream, INTERNAL_QUADS);
                return await this.converter.handle({representation: out, identifier: {path: name}, preferences: prefs});
            }
    }

    // Below are modified versions of the corresponding method in PassthroughStore to deal with dependencies

    async getRepresentation(
        identifier: ResourceIdentifier,
        preferences: RepresentationPreferences,
        conditions?: Conditions,
    ): Promise<Representation> {
        if (identifier.path in this.virtualIdentifiers) {
            this.logger.info(`processing ${identifier.path} as derived document`);
            // @ts-expect-error The object returns an any type,
            // which the compiler can't work with because we need to return a Promise<Representation>
            return await this.virtualIdentifiers[identifier.path](preferences, conditions);
        }
        return this.source.getRepresentation(identifier, preferences, conditions)
    }

    setRepresentation(identifier: ResourceIdentifier, representation: Representation, conditions?: Conditions): Promise<ResourceIdentifier[]> {
        let deps: ResourceIdentifier[] = []
        if (identifier.path in this.virtualIdentifiers) {
            throw new MethodNotAllowedHttpError(["setRepresentation"]);
        } else if (identifier.path in this.dependencies) {
            // @ts-ignore
            this.dependencies[identifier.path].forEach((s: string) => {
                deps.push({
                    path: s
                })
            })
        }
        return this.source.setRepresentation(identifier, representation, conditions).then(value => {
            deps.forEach(val => {
                    if (value.includes(val)) {
                        value.push(val);
                    }
                }
            )
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
        let altered: ResourceIdentifier[] = []
        if (identifier.path in this.dependencies) {
            // @ts-ignore
            for (let p: string of this.dependencies[identifier.path]) {
                altered.push({path: p})
            }
            console.log(altered)
        }
        if (identifier.path in this.virtualIdentifiers) {
            const name = identifier.path
            // @ts-ignore problems with string indexing
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
