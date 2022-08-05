import * as $rdf from "rdflib";
import {Namespace} from "rdflib";
import ldfetch from "ldfetch";
import {Quad, Term} from "rdf-js";
import {Writer} from "n3";
import {Quad_Graph, Quad_Object, Quad_Predicate, Quad_Subject} from "rdflib/lib/tf-types";

const RDF = Namespace("http://www.w3.org/1999/02/22-rdf-syntax-ns#")

export type LocalValue = {
    type: "string" | "quads"
    contents: string | Quad[],
    contentType?: string
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
        const res = this._graph.match(s, p, o) as Quad[]
        if (res.length > 0) {
            console.log(res[0].object);
        }
        return res;
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
            const fetch = new ldfetch({});
            const triples = (await fetch.get(iri)).triples;
            const writer = new Writer({});
            writer.addQuads(triples);
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

    private async _updateGraph() {
        this._graph = $rdf.graph();
        for (const graphPartsKey in this._graphParts) {
            const graphPart = this._graphParts[graphPartsKey];
            if (graphPart.type === "quads") {
                for (const quad of graphPart.contents as Quad[]) {
                    this._graph.add(
                        quad.subject as Quad_Subject,
                        quad.predicate as Quad_Predicate,
                        $rdf.sym(quad.object.value),
                        quad.graph as Quad_Graph
                    )
                }
            } else {
                $rdf.parse(graphPart.contents as string, this._graph, graphPartsKey, graphPart.contentType)
            }
        }
    }

}
