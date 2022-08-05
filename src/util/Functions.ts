import {Quad} from "rdf-js";
import N3, {DataFactory, NamedNode} from "n3";
import {DBP, FOAF} from "./Vocabulary";
import {Age} from "../example/Age";

const {namedNode, literal, quad} = DataFactory;

function yearsPassed(date: Date) {
    const now = new Date().getFullYear()
    const then = date.getFullYear();
    return now - then;
}

export const Functions: Record<string, Function> = {
    "Age_Start": () => {
    },
    "Age_Process": (data: Quad): Quad[] => {
        const out = []
        if (data.predicate.equals(new NamedNode('http://dbpedia.org/ontology/birthDate'))) {
            out.push(quad(
                data.subject,
                namedNode("http://dbpedia.org/ontology/age"),
                literal(yearsPassed(new Date(data.object.value))),
            ));
        }
        return out
    },
    "Age_End": () => [],
    "AgeAndKnows2": (store: N3.Store): Quad[] => {
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
}

