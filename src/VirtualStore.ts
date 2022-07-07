import {Quad} from "rdf-js";
import {
    BasicRepresentation,
    Conditions,
    getLoggerFor,
    INTERNAL_QUADS,
    PassthroughStore,
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
    private topLvlStore: ResourceStore;
    private readonly converter: RepresentationConverter;
    private readonly logger = getLoggerFor(this);


    private virtualIdentifiers = {};

    public setTopStore(topStore: ResourceStore): void {
        this.topLvlStore = topStore;
        console.log(this.topLvlStore);
    }

    public constructor(source: T, topStore: ResourceStore, converter: RepresentationConverter) {
        super(source);
        this.source = source;
        console.log(topStore);
        this.converter = converter;
        this.topLvlStore = topStore;
    }

    public addVirtualRoute(name: string,
                           original: ResourceIdentifier,
                           deriveFunction: (arg0: Quad) => Quad | undefined): void {
        // Construct a new function to use the original resource and pass on any preferences and/or conditions
        // @ts-expect-error indexing doesn't work for some reason when using strings
        this.virtualIdentifiers[name] =
            async (prefs: RepresentationPreferences, cond: Conditions): Promise<Representation> => {
                // You will almost certainly never need `then`
                const result = await this.topLvlStore.getRepresentation(original, quadPrefs, cond);


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

    // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
    async getRepresentation(
        identifier: ResourceIdentifier,
        preferences: RepresentationPreferences,
        conditions?: Conditions,
    ): Promise<Representation> {
        // Src: https://stackoverflow.com/questions/27745/getting-parts-of-a-url-regex
        const regex = /^(([^#/:?]+):)?(\/\/([^#/?]*))?([^#?]*)(\?([^#]*))?(#(.*))?/gm;
        const parsed = regex.exec(identifier.path);
        let virtualIdentifier = '';
        if (parsed) {
            // Trim removes leading and trailing slashes
            virtualIdentifier = parsed[5].replace(/^\/+/gm, '').replace(/\/+$/gm, '');
        }

        if (parsed && virtualIdentifier in this.virtualIdentifiers) {
            this.logger.info(`[PROCESSING\t${virtualIdentifier}]\tVIRTUAL PATH`);
            // @ts-expect-error The object returns an any type,
            // which the compiler can't work with because we need to return a Promise<Representation>
            return this.virtualIdentifiers[virtualIdentifier](preferences, conditions);
        }
        return this.source.getRepresentation(identifier, preferences, conditions)
    }
}
