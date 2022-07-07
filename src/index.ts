import {VirtualStore} from "./VirtualStore";
import {Quad} from "rdf-js";
import {DataFactory, NamedNode} from "n3";
import {ResourceStore} from "@solid/community-server";

const {namedNode, literal, defaultGraph, quad} = DataFactory;

export * from "./VirtualStore";

export class PathBuilder {
    private readonly virtualStore: VirtualStore;

    public constructor(vStore: VirtualStore, topStore: ResourceStore) {
        this.virtualStore = vStore;
        this.virtualStore.setTopStore(topStore);
        this.virtualStore.addVirtualRoute('age', {path: 'http://localhost:3000/card.ttl'}, this.getAge);
    }

    private getAge = (data: Quad): Quad | undefined => {
        if (data.predicate.equals(new NamedNode('http://dbpedia.org/ontology/birthDate'))) {
            return quad(
                data.subject,
                namedNode("https://dbpedia.org/ontology/age"),
                literal(yearsPassed(new Date(data.object.value))),
                defaultGraph()
            );
        }
        return undefined;
    };

}

function yearsPassed(date: Date) {
    const now = new Date().getTime()
    const then = date.getTime();
    const diff = now - then;
    return Math.floor(diff / (1000 * 60 * 60 * 24 * 365))
}
