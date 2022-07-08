import {Quad} from "rdf-js";
import N3 from 'n3';
import {
    BasicRepresentation,
    Conditions,
    getLoggerFor,
    INTERNAL_QUADS,
    MethodNotAllowedHttpError,
    PassthroughStore,
    Patch,
    Representation,
    RepresentationConverter,
    RepresentationPreferences,
    ResourceIdentifier,
    ResourceStore,
    transformSafely
} from "@solid/community-server";
import {transformSafelySerial} from "./Util";

const quadPrefs = {type: {'internal/quads': 1}};

/**
 * Allow containers to have derived resources.
 * Derived resources can be defined by creating a new route via
 * {@link addVirtualRouteStream} or {@link addVirtualRoute}.
 * Both functions require a new identifier for the derived resource,
 * the identifier of the original resource, and a function to
 * perform the conversion from the original to the derived resource.
 */
export class VirtualStore<T extends ResourceStore = ResourceStore> extends PassthroughStore<T> {
    protected readonly source: T;
    private readonly converter: RepresentationConverter;
    private readonly logger = getLoggerFor(this);


    private virtualIdentifiers = {};

    private dependencies = {};

    public constructor(source: T, converter: RepresentationConverter) {
        super(source);
        this.source = source;
        this.converter = converter;
    }

    /**
     * Create a derived resource for which the processing function works on single Quads.
     *
     * e.g. you want to derive the age from the quad with the birthdate.
     * @param name - identifier of the newly created resource
     * @param originals - identifiers of the resources from which needs to be derived
     * @param deriveFunction - the function to convert the original to the resource you want.
     */
    public addVirtualRouteStream(name: string,
                                 originals: string[],
                                 deriveFunction: (arg0: Quad) => Quad[]): void {
        if (name in this.virtualIdentifiers) {
            this.logger.error("duplicate routes in Virtual routers");
            return
        }
        const sources: ResourceIdentifier[] = originals.map((val: string) => {
            return {path: val}
        })
        sources.forEach((source: ResourceIdentifier) => {
            if (source.path in this.dependencies) {
                // @ts-ignore
                this.dependencies[source.path].push(name)
            } else {
                // @ts-ignore
                this.dependencies[source.path] = [name]
            }
        })
        // Construct a new function to use the original resource and pass on any preferences and/or conditions
        // @ts-expect-error indexing doesn't work for some reason when using strings
        this.virtualIdentifiers[name] =
            async (prefs: RepresentationPreferences, cond: Conditions): Promise<Representation> => {
                let data = []
                let dupes:N3.Store = new N3.Store()
                for (const source of sources) {
                    this.logger.info(`processing source: ${source.path}`)
                    const input = await this.getRepresentation(source, quadPrefs)
                    data.push(input.data)
                }
                // Utility function derived from CSS, will make your life much easier
                const transformedStream = transformSafelySerial(data, {
                    transform(data: Quad): void {
                        const arr = deriveFunction(data)
                        const result = arr.filter((item, index) => arr.indexOf(item) === index);
                        if (result.length !== 0) {
                            result.forEach(r => {
                                if (!dupes.has(r)) {
                                    dupes.add(r)
                                    this.push(r);
                                }
                            })
                        }
                    },
                    objectMode: true,
                });

                let temp = new BasicRepresentation(transformedStream, INTERNAL_QUADS);
                return await this.converter.handle({
                    representation: temp,
                    identifier: {path: `${name}`},
                    preferences: prefs
                });
            }
    }

    /**
     * Create a derived resource for which the processing function works on a store of Quads.
     *
     * Used for more complex conversions.
     * @param name - identifier of the newly created resource
     * @param original - identifier of the resource from which needs to be derived
     * @param deriveFunction - the function to convert the original to the resource you want.
     */
    public addVirtualRoute(name: string,
                           original: ResourceIdentifier,
                           deriveFunction: (arg0: N3.Store) => Quad[]): void {
        const store = new N3.Store();
        if (name in this.virtualIdentifiers) {
            this.logger.error("duplicate routes in Virtual routers");
            return
        }
        if (original.path in this.dependencies) {
            // @ts-ignore
            this.dependencies[original.path].push(name)
        } else {
            // @ts-ignore
            this.dependencies[original.path] = [name]
        }
        // Construct a new function to use the original resource and pass on any preferences and/or conditions
        // @ts-expect-error indexing doesn't work for some reason when using strings
        this.virtualIdentifiers[name] =
            async (prefs: RepresentationPreferences, cond: Conditions): Promise<Representation> => {
                // You will almost certainly never need `then`
                const result = await this.getRepresentation(original, quadPrefs, cond);


                // Utility function from CSS, will make your life much easier
                const transformedStream = transformSafely(result.data, {
                    transform(data: Quad): void {
                        store.add(data)
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
                return await this.converter.handle({representation: out, identifier: original, preferences: prefs});
            }
    }

    // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
    async getRepresentation(
        identifier: ResourceIdentifier,
        preferences: RepresentationPreferences,
        conditions?: Conditions,
    ): Promise<Representation> {
        if (identifier.path in this.virtualIdentifiers) {
            this.logger.info(`[PROCESSING\t${identifier.path}]\tVIRTUAL PATH`);
            // @ts-expect-error The object returns an any type,
            // which the compiler can't work with because we need to return a Promise<Representation>
            return this.virtualIdentifiers[identifier.path](preferences, conditions);
        }
        this.logger.info(`No virtual route: ${identifier.path}`)
        return this.source.getRepresentation(identifier, preferences, conditions)
    }

    setRepresentation(identifier: ResourceIdentifier, representation: Representation, conditions?: Conditions): Promise<ResourceIdentifier[]> {
        this.logger.info("in setRepresentations");
        let deps: ResourceIdentifier[] = []
        if (identifier.path in this.virtualIdentifiers) {
            throw new MethodNotAllowedHttpError();
        } else if (identifier.path in this.dependencies) {
            // @ts-ignore
            console.log(this.dependencies[identifier.path]);
            // @ts-ignore
            this.dependencies[identifier.path].forEach((s: string) => {
                deps.push({
                    path: s
                })
            })
            console.log(deps);
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


    addResource(container: ResourceIdentifier, representation: Representation, conditions?: Conditions): Promise<ResourceIdentifier> {
        this.logger.info("in addResource");
        return super.addResource(container, representation, conditions);
    }

    hasResource(identifier: ResourceIdentifier): Promise<boolean> {
        this.logger.info("in hasResource");
        return super.hasResource(identifier);
    }

    async deleteResource(identifier: ResourceIdentifier, conditions ?: Conditions): Promise<ResourceIdentifier[]> {
        this.logger.info("in deleteResource");
        let altered: ResourceIdentifier[] = []
        if (identifier.path in this.dependencies) {
            // @ts-ignore
            console.log(this.dependencies[identifier.path]);
            // @ts-ignore
            for (let p: string of this.dependencies[identifier.path]) {
                altered.push({path: p})
            }
            console.log(altered);
        }
        if (identifier.path in this.virtualIdentifiers) {
            const name = identifier.path
            // @ts-ignore problems with string indexing
            delete this.virtualIdentifiers[name]

            console.log(altered);

            altered.forEach((ident: ResourceIdentifier) => this.deleteResource(ident, conditions))
            return new Promise((resolve, reject) => {
                resolve(altered);
            })
        } else {
            console.log("here");
            const result = super.deleteResource(identifier, conditions)
            result.then(
                (a: ResourceIdentifier[]) => a.forEach((ident: ResourceIdentifier) => this.deleteResource(ident, conditions))
            );
            return result
        }
    }

    modifyResource(identifier: ResourceIdentifier, patch: Patch, conditions ?: Conditions): Promise<ResourceIdentifier[]> {
        this.logger.info("in modifyResource");
        console.log(`Modify Resource on ${identifier.path}`)
        if (identifier.path in this.virtualIdentifiers
        ) {
            throw new MethodNotAllowedHttpError();
        }
        return super.modifyResource(identifier, patch, conditions);
    }
}
