import type {
    Conditions,
    Representation,
    RepresentationPreferences,
    ResourceIdentifier,
    ResourceStore
} from "@solid/community-server";
import {getLoggerFor, PassthroughStore} from "@solid/community-server";


export class VirtualStore<T extends ResourceStore = ResourceStore> extends PassthroughStore<T> {
    protected readonly source: T;
    private readonly logger = getLoggerFor(this);


    private virtualIdentifiers = {};

    public constructor(source: T) {
        super(source);
        this.source = source;
    }

    public addVirtualRoute(name: string,
                           original: ResourceIdentifier,
                           deriveFunction: (arg0: ResourceIdentifier, arg1: RepresentationPreferences, arg3: Conditions)
                               => Promise<Representation>): void {
        // Construct a new function to use the original resource and pass on any preferences and/or conditions
        // @ts-expect-error indexing doesn't work for some reason when using strings
        this.virtualIdentifiers[name] = (prefs: RepresentationPreferences, cond: Conditions): Promise<Representation> => deriveFunction(original, prefs, cond);
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
            return this.virtualIdentifiers[virtualIdentifier](preferences, conditions)
        }
        return this.source.getRepresentation(identifier, preferences, conditions)
    }
}
