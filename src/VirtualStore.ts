import type {
    Representation,
    RepresentationPreferences,
    ResourceIdentifier,
    Conditions,
    ResourceStore
} from "@solid/community-server";
import {
    PassthroughStore,
    BasicRepresentation
} from "@solid/community-server";
import type {Quad} from 'rdf-js';
import {NamedNode} from "n3";

const quadPrefs = {type: {'internal/quads': 1}};

export class VirtualStore<T extends ResourceStore = ResourceStore> extends PassthroughStore<T> {
    protected readonly source: T;

    private readonly getAge = (cardUrl: ResourceIdentifier, prefs: RepresentationPreferences, cond: Conditions) => {
        console.log(cardUrl);
        return this.getRepresentation(cardUrl, quadPrefs, cond).then((result: Representation): Representation => {
            if (result.isEmpty) {
                return result;
            }
            const out = new BasicRepresentation();
            console.log('[AGE DATA]');
            console.log(result);
            console.log(result.data.on('data', (chunk: Quad) => {
                console.log(chunk.predicate.value);
                if (chunk.predicate.equals(new NamedNode('http://dbpedia.org/ontology/birthDate'))) {
                    console.log(chunk);
                    out.data.push(chunk);
                }
            }));
            // Dummy return
            console.log('[END AGE]');
            return out;
        });
    };

    private readonly getName = (cardUrl: ResourceIdentifier, prefs: RepresentationPreferences, cond: Conditions) => {
        console.log(cardUrl);
        return this.getRepresentation(cardUrl, prefs, cond);
    };

    private virtualIdentifiers = {};

    public constructor(source: T) {
        super(source);
        this.source = source;
        this.addVirtualRoute('age', {path: 'http://localhost:3000/card.ttl'}, this.getAge);
        this.addVirtualRoute('name', {path: 'http://localhost:3000/card.ttl'}, this.getName);
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
            console.log(`[PROCESSING\t${virtualIdentifier}]\tVIRTUAL PATH`);
            console.log(preferences)
            console.log(conditions);
            // @ts-expect-error The object returns an any type,
            // which the compiler can't work with because we need to return a Promise<Representation>
            return this.virtualIdentifiers[virtualIdentifier](preferences, conditions);
        }
        const result = this.source.getRepresentation(identifier, preferences, conditions);
        if (virtualIdentifier === '.acl' || virtualIdentifier === 'card.ttl') {
            console.log('getting acl');
            console.log(preferences);
            console.log(conditions);
            result.then(r => console.log(r));
        }
        return result
    }
}
