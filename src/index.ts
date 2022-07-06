import {
    BasicRepresentation,
    Conditions,
    getLoggerFor,
    INTERNAL_QUADS,
    Representation,
    RepresentationConverter,
    RepresentationMetadata,
    RepresentationPreferences,
    ResourceIdentifier,
    ResourceStore,
    transformSafely
} from '@solid/community-server';
import {VirtualStore} from "./VirtualStore";
import {Quad} from "rdf-js";
import N3, {NamedNode, DataFactory} from "n3";
const { namedNode, literal, defaultGraph, quad } = DataFactory;

export * from "./VirtualStore";

const quadPrefs = {type: {'internal/quads': 1}};

export class PathBuilder {
    private readonly logger = getLoggerFor(this);
    private readonly virtualStore: VirtualStore;
    private readonly converter: RepresentationConverter;
    private readonly toplvlStore: ResourceStore;

    public constructor(vStore: VirtualStore, converter: RepresentationConverter, toplvlStore: ResourceStore) {
        this.virtualStore = vStore;
        this.converter = converter;
        this.toplvlStore = toplvlStore;
        this.virtualStore.addVirtualRoute('age', {path: 'http://localhost:3000/card.ttl'}, this.getAge);
        this.virtualStore.addVirtualRoute('name', {path: 'http://localhost:3000/card.ttl'}, this.getName);
    }

    private getAge = async (cardUrl: ResourceIdentifier, prefs: RepresentationPreferences, cond: Conditions): Promise<Representation> => {
        // You will almost certainly never need `then`
        const result = await this.toplvlStore.getRepresentation(cardUrl, quadPrefs, cond)

        // Utility function from CSS, will make your life much easier
        const transformedStream = transformSafely(result.data, {
            transform(data: Quad): void {
                if (data.predicate.equals(new NamedNode('http://dbpedia.org/ontology/birthDate'))) {
                    this.push(quad(
                        data.subject,
                        namedNode("https://dbpedia.org/ontology/age"),
                        literal(yearsPassed(new Date(data.object.value))),
                        defaultGraph()
                    ));
                }
            },
            objectMode: true
        });
        const out = new BasicRepresentation(transformedStream, INTERNAL_QUADS);
        return await this.converter.handle({representation: out, identifier: cardUrl, preferences: prefs});
    };

    private getName = (cardUrl: ResourceIdentifier, prefs: RepresentationPreferences, cond: Conditions) => {
        console.log(cardUrl);
        return this.toplvlStore.getRepresentation(cardUrl, prefs, cond);
    };

}

function yearsPassed(date:Date){
    const now = new Date().getTime()
    const then = date.getTime();
    const diff = now - then;
    return Math.floor(diff / (1000*60*60*24*365))
}
