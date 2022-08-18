import * as $rdf from "rdflib";
import {Namespace} from "rdflib";
//import ldfetch from "ldfetch";
import rdfDereferencer from "rdf-dereference";
import {Quad, Term} from "rdf-js";
import {Writer} from "n3";
import {Quad_Graph, Quad_Object, Quad_Predicate, Quad_Subject, Term as rdflibTerm} from "rdflib/lib/tf-types";
import RDFlibDataFactory from "rdflib/lib/factories/rdflib-data-factory";
import arrayifyStream from "arrayify-stream";

const RDF = Namespace("http://www.w3.org/1999/02/22-rdf-syntax-ns#")

export type LocalValue = {
    type: "string" | "quads"
    contents: string | Quad[],
    contentType?: string
}
const base = "http://example.com#"

function time() {
    return Date.now();
}

export class GraphHandler {
    getSubjectOfType(iri: string, type?: string): Term | null {
        let result = $rdf.sym(iri);
        let q;
        if (type) {
            q = this._graph.match(result, RDF('type'), $rdf.sym(type));

        } else {
            q = this._graph.match(result);
        }
        if (q.length > 0) {
            return q[0].subject as Term;
        }
        return null;
    }

    match(s: Quad_Subject | null | undefined,
          p: Quad_Predicate | null | undefined,
          o: Quad_Object | null | undefined): Quad[] {
        return this._graph.match(s, p, o) as Quad[];
    }

    get graph(): $rdf.Store {
        return this._graph;
    }

    private _graph: $rdf.Store
    private readonly _graphParts: {
        [iri: string]: LocalValue
    }

    constructor() {
        this._graphParts = {};
        this._graph = this._graph = $rdf.graph();
    }

    async addGraph(iri: string, localValue: LocalValue | null = null) {
        if (!localValue) {
            const data :Quad[] = await arrayifyStream((await rdfDereferencer.dereference(iri)).data)

            const writer = new Writer({});
            writer.addQuads(data);
            const writerPromise = new Promise<string>((resolve, reject) => {
                writer.end((error, result) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(result);
                    }
                });
            });
            localValue = {
                type: "string",
                contents: await writerPromise,
                contentType: "text/turtle"
            }
        }
        this._graphParts[iri] = localValue;

        await this._updateGraph();
    }

    async addGraphQuads(prefix: string, quads: Quad[], localValue: LocalValue | null = null) {
        if (!localValue) {
            localValue = {
                type: "quads",
                contents: quads,
                contentType: "text/turtle"
            }
        }
        this._graphParts[prefix] = localValue;

        await this._updateGraph();
    }

    private async _updateGraph() {
        this._graph = $rdf.graph();
        for (const graphPartsKey in this._graphParts) {
            const graphPart = this._graphParts[graphPartsKey];
            if (graphPart.type === "quads") {
                for (const quad of graphPart.contents as Quad[]) {
                    let obj: rdflibTerm //NamedNode | BlankNode | Literal | Variable | DefaultGraph | BaseQuad;
                    switch (quad.object.termType) {
                        case "NamedNode":
                            obj = RDFlibDataFactory.namedNode(quad.object.value)
                            break;
                        case "BlankNode":
                            obj = RDFlibDataFactory.blankNode(quad.object.value)
                            break;
                        case "Literal":
                            obj = RDFlibDataFactory.lit(quad.object.value, quad.object.language, RDFlibDataFactory.namedNode(quad.object.datatype.value))
                            break;
                        case "Variable":
                            obj = RDFlibDataFactory.variable(quad.object.value);
                            break;
                        default:
                            throw new Error(`Term Type not recognized for canonization: ${quad.object.termType}`)
                    }
                    this._graph.add(
                        quad.subject as Quad_Subject,
                        quad.predicate as Quad_Predicate,
                        obj,
                        quad.graph as Quad_Graph
                    )
                }
            } else {
                $rdf.parse(graphPart.contents as string, this._graph, graphPartsKey, graphPart.contentType)
            }
        }
    }
}
