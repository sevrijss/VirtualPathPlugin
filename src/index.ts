import {
    BasicRepresentation,
    Conditions,
    getLoggerFor,
    Representation,
    RepresentationConverter,
    RepresentationPreferences,
    ResourceIdentifier
} from '@solid/community-server';
import {VirtualStore} from "./VirtualStore";
import {Quad} from "rdf-js";
import N3, {NamedNode} from "n3";

export * from "./VirtualStore";

const quadPrefs = {type: {'internal/quads': 1}};

export class PathBuilder {
    private readonly logger = getLoggerFor(this);
    private readonly store: VirtualStore;
    private readonly converter: RepresentationConverter;

    public constructor(store: VirtualStore, converter: RepresentationConverter) {
        this.store = store;
        this.converter = converter;
        console.log(this.converter);
        store.addVirtualRoute('age', {path: 'http://localhost:3000/card.ttl'}, this.getAge);
        store.addVirtualRoute('name', {path: 'http://localhost:3000/card.ttl'}, this.getName);
    }

    private getAge = async (store: VirtualStore, cardUrl: ResourceIdentifier, prefs: RepresentationPreferences, cond: Conditions): Promise<Representation> => {
        const writer = new N3.Writer();

        return store.getRepresentation(cardUrl, quadPrefs, cond).then(async (result: Representation): Promise<Representation> => {
            if (result.isEmpty) {
                return result;
            }
            console.log(result.metadata);
            const out = new BasicRepresentation();
            result.data.on('data', (chunk: Quad) => {
                if (chunk.predicate.equals(new NamedNode('http://dbpedia.org/ontology/birthDate'))) {
                    writer.addQuad(chunk);
                }
            }).on('close', () => {
                console.log("STREAM CLOSED");
                writer.end((error, result: string) => {
                    console.log(result);
                    out.data.push(result);
                });
            })
            await this.converter.canHandle({representation: out, identifier: cardUrl, preferences: prefs});
            return await this.converter.handle({representation: out, identifier: cardUrl, preferences: prefs});
        });
    };

    private getName = (store: VirtualStore, cardUrl: ResourceIdentifier, prefs: RepresentationPreferences, cond: Conditions) => {
        console.log(cardUrl);
        return store.getRepresentation(cardUrl, prefs, cond);
    };

}
