import {VirtualStore} from "./util/VirtualStore";
import {key} from "./config";
import {getLoggerFor} from "@solid/community-server";
import {Quad} from "rdf-js";
import N3, {DataFactory, NamedNode} from "n3";
import {Age} from "./example/Age"

const {namedNode, literal, defaultGraph, quad} = DataFactory;

/**
 * Class used to build relative paths for the {@link VirtualStore}
 */
export class PathBuilder {
    private readonly virtualStore: VirtualStore;

    public constructor(vStore: VirtualStore) {
        this.virtualStore = vStore;
        const age = new Age()
        this.virtualStore.addVirtualRouteStream('/age', ['/card.ttl'], age.start, age.process, age.onClose);
        this.virtualStore.addVirtualRouteStream('/age3', ['/doesntExist.ttl'], age.start, age.process, age.onClose);
        this.virtualStore.addVirtualRouteStreamProcessor('/age2', ['/card.ttl'], age);
        this.virtualStore.addVirtualRouteStream('/ageAndKnows', ["/knows.ttl", '/card.ttl'], undefined, this.composite, () => []);
        this.virtualStore.addVirtualRoute('/ageAndKnows2', ["/knows.ttl", '/card.ttl'], this.composite2);
        this.virtualStore.addVirtualRouteStream('/birthYear', ['/age'], undefined, this.getBirthYear, () => []);
        this.virtualStore.addVirtualRouteStream('/friends', ['/knows.ttl'], undefined, this.getFriends, () => []);
        this.virtualStore.addVirtualRouteRemoteSource(
            '/weather',
            `https://api.openweathermap.org/data/2.5/weather?lat=35&lon=139&appid=${key}`,
            (data) => this.getWeather(data),
            (q) => q.getQuads(null, null, null, defaultGraph()))
    }

    private readonly logger = getLoggerFor("pathBuilder");

    async getWeather(jsonObject: any): Promise<Quad[]> {
        const responseID = namedNode(this.virtualStore.resolve(`weather_${Date.now()}`))
        const weatherReportID = namedNode(this.virtualStore.resolve(`weather_${Date.now()}_weatherProp`))

        const outputArray: Quad[] = []

        outputArray.push(quad(
            responseID,
            namedNode("https://bimerr.iot.linkeddata.es/def/weather#WeatherProperty"),
            weatherReportID
        ))

        outputArray.push(quad(
            weatherReportID,
            namedNode("http://rs.tdwg.org/dwc/terms/decimalLatitude"),
            literal(jsonObject.coord.lat)
        ))

        outputArray.push(quad(
            weatherReportID,
            namedNode("http://rs.tdwg.org/dwc/terms/decimalLongitude"),
            literal(jsonObject.coord.lon)
        ))

        outputArray.push(quad(
            weatherReportID,
            namedNode("https://bimerr.iot.linkeddata.es/def/weather#Temperature"),
            literal(jsonObject.main.temp)
        ))

        outputArray.push(quad(
            weatherReportID,
            namedNode("https://bimerr.iot.linkeddata.es/def/weather#Pressure"),
            literal(jsonObject.main.pressure)
        ))

        outputArray.push(quad(
            weatherReportID,
            namedNode("https://bimerr.iot.linkeddata.es/def/weather#Humidity"),
            literal(jsonObject.main.humidity)
        ))

        outputArray.push(quad(
            weatherReportID,
            namedNode("https://bimerr.iot.linkeddata.es/def/weather#wind_deg"),
            literal(jsonObject.main.pressure)
        ))

        outputArray.push(quad(
            weatherReportID,
            namedNode("https://bimerr.iot.linkeddata.es/def/weather#WindSpeed"),
            literal(jsonObject.main.humidity)
        ))

        return outputArray;
    }

    private getAge = (data: Quad): Quad[] => {
        const out = []
        if (data.predicate.equals(new NamedNode('http://dbpedia.org/ontology/birthDate'))) {
            out.push(quad(
                data.subject,
                namedNode("http://dbpedia.org/ontology/age"),
                literal(Age.yearsPassed(new Date(data.object.value)))
            ));
        }
        return out;
    };

    private composite = (data: Quad): Quad[] => {
        const out: Quad[] = []
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
        const out: Quad[] = []
        for (const data of store.match(null, namedNode('http://dbpedia.org/ontology/birthDate'), null)) {
            out.push(quad(
                data.subject,
                namedNode("http://dbpedia.org/ontology/age"),
                literal(Age.yearsPassed(new Date(data.object.value)))
            ));
        }
        for (const data of store.match(null, namedNode("http://xmlns.com/foaf/0.1/knows"), null)) {
            out.push(data);
        }
        return out
    }

    private getBirthYear = (data: Quad): Quad[] => {
        const out: Quad[] = [];
        if (data.predicate.equals(new NamedNode("http://dbpedia.org/ontology/age"))) {
            out.push(quad(
                data.subject,
                namedNode("http://dbpedia.org/ontology/birthYear"),
                literal(new Date().getFullYear() - parseInt(data.object.value))
            ))
        }
        return out;
    }

    private getFriends = (data: Quad): Quad[] => {
        const out: Quad[] = [];
        if (data.predicate.equals(new NamedNode("http://xmlns.com/foaf/0.1/knows"))) {
            out.push(data);
        }
        return out;
    }
}
