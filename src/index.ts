import {VirtualStore} from "./VirtualStore";
import {Quad} from "rdf-js";
import N3, {DataFactory, NamedNode} from "n3";

const {namedNode, literal, defaultGraph, quad} = DataFactory;

export * from "./VirtualStore";

class Age {

    constructor() {
    }

    start(): void {
        console.log("starting processor");
    }

    process(data: Quad): Quad[] {
        let out = []
        if (data.predicate.equals(new NamedNode('http://dbpedia.org/ontology/birthDate'))) {
            out.push(quad(
                data.subject,
                namedNode("http://dbpedia.org/ontology/age"),
                literal(Age.yearsPassed(new Date(data.object.value))),
                defaultGraph()
            ));
        }
        return out
    }

    onClose(): Quad[] {
        return [];
    }


    static yearsPassed(date: Date) {
        const now = new Date().getTime()
        const then = date.getTime();
        const diff = now - then;
        return Math.floor(diff / (1000 * 60 * 60 * 24 * 365))
    }

}

export class PathBuilder {
    private readonly virtualStore: VirtualStore;

    public constructor(vStore: VirtualStore) {
        this.virtualStore = vStore;
        const age = new Age()
        this.virtualStore.addVirtualRouteStream('http://localhost:3000/age', ['http://localhost:3000/card.ttl'], age.start, age.process, age.onClose);
        //this.virtualStore.addVirtualRoute('http://localhost:3000/ageAndKnows', {path: 'http://localhost:3000/card.ttl'}, this.composite);
        //this.virtualStore.addVirtualRouteStream('http://localhost:3000/ageAndKnows', ["http://localhost:3000/knows.ttl", 'http://localhost:3000/card.ttl'], undefined, this.composite, undefined);
        this.virtualStore.addVirtualRoute('http://localhost:3000/ageAndKnows2', ["http://localhost:3000/knows.ttl", 'http://localhost:3000/card.ttl'], this.composite2);
        //this.virtualStore.addVirtualRouteStream('http://localhost:3000/birthYear', {path: 'http://localhost:3000/age'}, this.getBirthYear);
        //this.virtualStore.addVirtualRouteStream('http://localhost:3000/friends', ['http://localhost:3000/knows.ttl'], undefined, this.getFriends, undefined);
    }

    private out: Quad[] = [];
    private getAge = (data: Quad): void => {
        if (data.predicate.equals(new NamedNode('http://dbpedia.org/ontology/birthDate'))) {
            this.out.push(quad(
                data.subject,
                namedNode("http://dbpedia.org/ontology/age"),
                literal(Age.yearsPassed(new Date(data.object.value))),
                defaultGraph()
            ));
        }
    };

    private composite = (data: Quad): Quad[] => {
        let out: Quad[] = []
        this.out = []
        this.getAge(data);
        const resultAge = this.out
        const resultKnows = this.getFriends(data);
        if (resultAge.length > 0) {
            resultAge.forEach(value => out.push(value));
        }
        if (resultKnows.length > 0) {
            resultKnows.forEach(value => out.push(value));
        }
        return out
    }

    private composite2 = (store: N3.Store): Quad[] => {
        let out: Quad[] = []
        for (const data of store.match(null, namedNode('http://dbpedia.org/ontology/birthDate'), null)) {
            out.push(quad(
                data.subject,
                namedNode("http://dbpedia.org/ontology/age"),
                literal(Age.yearsPassed(new Date(data.object.value))),
                defaultGraph()
            ));
        }
        for (const data of store.match(null, namedNode("http://xmlns.com/foaf/0.1/knows"), null)) {
            out.push(data);
        }
        return out
    }

    private getBirthYear = (data: Quad): Quad[] => {
        let out: Quad[] = [];
        if (data.predicate.equals(new NamedNode("http://dbpedia.org/ontology/age"))) {
            out.push(quad(
                data.subject,
                namedNode("http://dbpedia.org/ontology/birthYear"),
                literal(new Date().getFullYear() - parseInt(data.object.value)),
                defaultGraph()
            ))
        }
        return out;
    }

    private getFriends = (data: Quad): Quad[] => {
        let out: Quad[] = [];
        if (data.predicate.equals(new NamedNode("http://xmlns.com/foaf/0.1/knows"))) {
            out.push(data);
        }
        return out;
    }
}
