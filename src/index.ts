import {VirtualStore} from "./util/VirtualStore";
import {Quad} from "rdf-js";
import N3, {DataFactory, NamedNode} from "n3";
import {Processor} from "./util/Processor";

import {key} from "./config";
import fetch from "node-fetch";
import {BasicRepresentation, getLoggerFor, Representation} from "@solid/community-server";

const {namedNode, literal, defaultGraph, quad} = DataFactory;

export * from "./util/VirtualStore";
export * from "./util/PathResolver";
const quadPrefs = {type: {'internal/quads': 1}};

/**
 * Example of an extended processor object
 */
class Age extends Processor {
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

    static yearsPassed(date: Date) {
        const now = new Date().getTime()
        const then = date.getTime();
        const diff = now - then;
        return Math.floor(diff / (1000 * 60 * 60 * 24 * 365))
    }

}

/**
 * Class used to build relative paths for the {@link VirtualStore}
 */
export class PathBuilder {
    private readonly virtualStore: VirtualStore;

    public constructor(vStore: VirtualStore) {
        this.virtualStore = vStore;
        const age = new Age()
        this.virtualStore.addVirtualRouteStream('/age', ['/card.ttl'], age.start, age.process, age.onClose);
        this.virtualStore.addVirtualRouteStreamProcessor('/age2', ['/card.ttl'], age);
        this.virtualStore.addVirtualRouteStream('/ageAndKnows', ["/knows.ttl", '/card.ttl'], undefined, this.composite, () => []);
        this.virtualStore.addVirtualRoute('/ageAndKnows2', ["/knows.ttl", '/card.ttl'], this.composite2);
        this.virtualStore.addVirtualRouteStream('/birthYear', ['/age'], undefined, this.getBirthYear, () => []);
        this.virtualStore.addVirtualRouteStream('/friends', ['/knows.ttl'], undefined, this.getFriends, () => []);
        this.virtualStore.addVirtualRouteRemoteSource('/weather', () => this.getWeather(), (q) => q.getQuads(null, null, null, defaultGraph()))
    }

    private readonly logger = getLoggerFor("pathBuilder");

    async getWeather(): Promise<Representation> {
        const dest = `https://api.openweathermap.org/data/2.5/weather?lat=35&lon=139&appid=${key}`
        const result = await fetch(dest);
        let out = await result.json();
        out = {"weatherResponse": out}
        out["@context"] = "https://schema.org";
        out["@id"] = Date.now().toString();
        return await this.virtualStore.converter.handle({
            representation: new BasicRepresentation(
                JSON.stringify(out)
                    .replace(RegExp("id", "g"), "weatherId")
                    .replace(RegExp("type", "g"), "weatherType"),
                "application/ld+json"),
            identifier: {path: this.virtualStore.urlBuilder.resolve("WeatherCall")},
            preferences: quadPrefs
        })
    }

    private getAge = (data: Quad): Quad[] => {
        const out = []
        if (data.predicate.equals(new NamedNode('http://dbpedia.org/ontology/birthDate'))) {
            out.push(quad(
                data.subject,
                namedNode("http://dbpedia.org/ontology/age"),
                literal(Age.yearsPassed(new Date(data.object.value))),
                defaultGraph()
            ));
        }
        return out;
    };

    private composite = (data: Quad): Quad[] => {
        let out: Quad[] = []
        const resultAge = this.getAge(data);
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
