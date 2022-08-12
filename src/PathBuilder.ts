import {VirtualStore} from "./util/VirtualStore";
import {getLoggerFor} from "@solid/community-server";
import {Quad} from "rdf-js";
import N3, {DataFactory, NamedNode} from "n3";
import {Age} from "./example/Age"
import {BIMERR, DBP, FOAF, RS_TDWG} from "./util/Vocabulary";

const {namedNode, literal, defaultGraph, quad} = DataFactory;

/**
 * Class used to build relative paths for the {@link VirtualStore}
 */
export class PathBuilder {
    private readonly virtualStore: VirtualStore;

    public constructor(vStore: VirtualStore) {
        this.virtualStore = vStore;
        const age = new Age()
        //this.virtualStore.addVirtualRouteStream('/age', ['/card.ttl'], age.start, age.process, age.onClose);
        //this.virtualStore.addVirtualRouteStream('/age3', ['/doesntExist.ttl'], age.start, age.process, age.onClose);
        //this.virtualStore.addVirtualRouteStreamProcessor('/age3', ['/card.ttl'], age);
        //this.virtualStore.addVirtualRouteStream('/ageAndKnows', ["/knows.ttl", '/card.ttl'], undefined, this.composite, () => []);
        //this.virtualStore.addVirtualRoute('/ageAndKnows2', ["/knows.ttl", '/card.ttl'], this.composite2);
        //this.virtualStore.addVirtualRouteStream('/birthYear', ['/age'], undefined, this.getBirthYear, () => []);
        //this.virtualStore.addVirtualRouteStream('/friends', ['/knows.ttl'], undefined, this.getFriends, () => []);
        /*this.virtualStore.addVirtualRouteRemoteSource(
            '/weather',
            `https://api.openweathermap.org/data/2.5/weather?lat=35&lon=139&appid=${key}`,
            (data) => this.getWeather(data),
            (q) => q.getQuads(null, null, null, defaultGraph()))
         */
    }

    private readonly logger = getLoggerFor("pathBuilder");

    async getWeather(jsonObject: any): Promise<Quad[]> {
        const responseID = namedNode(this.virtualStore.resolve(`weather_${Date.now()}`))
        const weatherReportID = namedNode(this.virtualStore.resolve(`weather_${Date.now()}_weatherProp`))

        const outputArray: Quad[] = []

        outputArray.push(quad(
            responseID,
            namedNode(BIMERR.WeatherProperty),
            weatherReportID
        ))

        outputArray.push(quad(
            weatherReportID,
            namedNode(RS_TDWG.decimalLatitude),
            literal(jsonObject.coord.lat)
        ))

        outputArray.push(quad(
            weatherReportID,
            namedNode(RS_TDWG.decimalLongitude),
            literal(jsonObject.coord.lon)
        ))

        outputArray.push(quad(
            weatherReportID,
            namedNode(BIMERR.Temperature),
            literal(jsonObject.main.temp)
        ))

        outputArray.push(quad(
            weatherReportID,
            namedNode(BIMERR.Pressure),
            literal(jsonObject.main.pressure)
        ))

        outputArray.push(quad(
            weatherReportID,
            namedNode(BIMERR.Humidity),
            literal(jsonObject.main.humidity)
        ))

        outputArray.push(quad(
            weatherReportID,
            namedNode(BIMERR.wind_deg),
            literal(jsonObject.main.pressure)
        ))

        outputArray.push(quad(
            weatherReportID,
            namedNode(BIMERR.windSpeed),
            literal(jsonObject.main.humidity)
        ))

        return outputArray;
    }

    private getAge = (data: Quad): Quad[] => {
        const out = []
        if (data.predicate.equals(new NamedNode(DBP.birthDate))) {
            out.push(quad(
                data.subject,
                namedNode(DBP.age),
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
        for (const data of store.match(null, namedNode(DBP.birthDate), null)) {
            out.push(quad(
                data.subject,
                namedNode(DBP.age),
                literal(Age.yearsPassed(new Date(data.object.value)))
            ));
        }
        for (const data of store.match(null, namedNode(FOAF.knows), null)) {
            out.push(data);
        }
        return out
    }

    private getBirthYear = (data: Quad): Quad[] => {
        const out: Quad[] = [];
        if (data.predicate.equals(new NamedNode(DBP.age))) {
            out.push(quad(
                data.subject,
                namedNode(DBP.birthYear),
                literal(new Date().getFullYear() - parseInt(data.object.value))
            ))
        }
        return out;
    }

    private getFriends = (data: Quad): Quad[] => {
        const out: Quad[] = [];
        if (data.predicate.equals(new NamedNode(FOAF.knows))) {
            out.push(data);
        }
        return out;
    }
}
