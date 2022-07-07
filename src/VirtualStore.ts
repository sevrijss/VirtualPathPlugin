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

const quadPrefs = {type: {'internal/quads': 1}};

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

    public addVirtualRouteStream(name: string,
                                 original: ResourceIdentifier,
                                 deriveFunction: (arg0: Quad) => Quad | undefined): void {
        if (name in this.virtualIdentifiers) {
            this.logger.error("duplicate routes in Virtual routers");
            return
        }
        if (original.path in this.dependencies) {
            // @ts-ignore
            this.dependencies[original.path] = this.dependencies[original.path] + name
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
                        const result = deriveFunction(data);
                        if (result) {
                            this.push(result)
                        }
                    },
                    objectMode: true,
                });
                const out = new BasicRepresentation(transformedStream, INTERNAL_QUADS);
                return await this.converter.handle({representation: out, identifier: original, preferences: prefs});
            }
    }

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
            this.dependencies[original.path] = this.dependencies[original.path] + name
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
        return this.source.getRepresentation(identifier, preferences, conditions)
    }

    setRepresentation(identifier: ResourceIdentifier, representation: Representation, conditions?: Conditions): Promise<ResourceIdentifier[]> {
        if (identifier.path in this.virtualIdentifiers) {
            throw new MethodNotAllowedHttpError();
        }
        return this.source.setRepresentation(identifier, representation, conditions);
    }

    async deleteResource(identifier: ResourceIdentifier, conditions?: Conditions): Promise<ResourceIdentifier[]> {
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
            const result = super.deleteResource(identifier, conditions)
            result.then(
                (a: ResourceIdentifier[]) => a.forEach((ident: ResourceIdentifier) => this.deleteResource(ident, conditions))
            );
            return result
        }
    }

    modifyResource(identifier: ResourceIdentifier, patch: Patch, conditions?: Conditions): Promise<ResourceIdentifier[]> {
        console.log(`Modify Resource on ${identifier.path}`)
        if (identifier.path in this.virtualIdentifiers) {
            throw new MethodNotAllowedHttpError();
        }
        return super.modifyResource(identifier, patch, conditions);
    }
}
