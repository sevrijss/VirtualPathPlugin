import {VirtualStore} from "./VirtualStore";
import {Quad} from "rdf-js";
import {DataFactory, NamedNode} from "n3";
import N3 from 'n3';

const {namedNode, literal, defaultGraph, quad} = DataFactory;

export * from "./VirtualStore";

export class PathBuilder {
    private readonly virtualStore: VirtualStore;

    public constructor(vStore: VirtualStore) {
        this.virtualStore = vStore;
        this.virtualStore.addVirtualRouteStream('http://localhost:3000/age', {path: 'http://localhost:3000/card.ttl'}, this.getAge);
        this.virtualStore.addVirtualRoute('http://localhost:3000/age2', {path: 'http://localhost:3000/card.ttl'}, this.getAge2);
        this.virtualStore.addVirtualRouteStream('http://localhost:3000/birthYear', {path: 'http://localhost:3000/age'}, this.getBirthYear);
        this.virtualStore.addVirtualRouteStream('http://localhost:3000/friends', {path: 'http://localhost:3000/card.ttl'}, this.getFriends);
    }

    private getAge = (data: Quad): Quad | undefined => {
        if (data.predicate.equals(new NamedNode('http://dbpedia.org/ontology/birthDate'))) {
            return quad(
                data.subject,
                namedNode("http://dbpedia.org/ontology/age"),
                literal(yearsPassed(new Date(data.object.value))),
                defaultGraph()
            );
        }
    };

    private getAge2 = (store: N3.Store): Quad[] => {
        let out:Quad[] = []
        for( const temp of store.match(null, namedNode('http://example.com/ontology/bornOn'), null)){
            console.log(temp);
        }
        for (const data of store.match(null, namedNode('http://dbpedia.org/ontology/birthDate'), null)){
            out.push(quad(
                data.subject,
                namedNode("http://dbpedia.org/ontology/age"),
                literal(yearsPassed(new Date(data.object.value))),
                defaultGraph()
            ));
        }
        return out
    }

    private getBirthYear = (data: Quad): Quad | undefined => {
        if (data.predicate.equals(new NamedNode("http://dbpedia.org/ontology/age"))) {
            return quad(
                data.subject,
                namedNode("http://dbpedia.org/ontology/birthYear"),
                literal(new Date().getFullYear() - parseInt(data.object.value)),
                defaultGraph()
            )
        }
    }

    private getFriends = (data: Quad): Quad | undefined => {
        if (data.predicate.equals(new NamedNode("http://xmlns.com/foaf/0.1/knows"))) {
            return data;
        }
    }
}

function yearsPassed(date: Date) {
    const now = new Date().getTime()
    const then = date.getTime();
    const diff = now - then;
    return Math.floor(diff / (1000 * 60 * 60 * 24 * 365))
}
