import {Processor} from "../util/Processor";
import {Quad} from "rdf-js";
import {DataFactory, NamedNode} from "n3";

const {namedNode, literal, quad} = DataFactory;

/**
 * Example of a processor object
 */
export class Age extends Processor {
    process(data: Quad): Quad[] {
        const out = []
        if (data.predicate.equals(new NamedNode('http://dbpedia.org/ontology/birthDate'))) {
            out.push(quad(
                data.subject,
                namedNode("http://dbpedia.org/ontology/age"),
                literal(Age.yearsPassed(new Date(data.object.value))),
            ));
        }
        return out
    }

    static yearsPassed(date: Date) {
        const now = new Date().getFullYear()
        const then = date.getFullYear();
        return now - then;
    }

}
