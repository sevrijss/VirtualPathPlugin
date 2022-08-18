import {Term} from 'rdf-js';

export class TermClass {


    private _pref: number;
    _iri: Term

    constructor(iri: Term, pref: number = 0) {
        this._iri = iri;
        this._pref = pref;
    }

    get pref(): number {
        return this._pref;
    }

    set pref(value: number) {
        this._pref = value;
    }

    get id() {
        return this._iri.value
    }

    get term() {
        return this._iri
    }
}
