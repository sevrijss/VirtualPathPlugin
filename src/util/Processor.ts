import {Quad} from "rdf-js";

/**
 * Processor object for processing streaming Quads.
 */
export class Processor {

    constructor() {
    }

    /**
     * Is called before any Quads are processed.
     */
    start(): void {
        return;
    }

    /**
     * Is called for each Quad in the stream.
     * @param data - Quad from the stream.
     *
     * @returns Quads derive from data (default []).
     */
    process(data: Quad): Quad[] {
        return [];
    }

    /**
     * Is called after all quads are processed.
     *
     * @returns Quads derive from all the data.
     */
    onClose(): Quad[] {
        return [];
    }
}
