import {namedNode} from "rdflib";

export class Return {
    private readonly _predicate: string
    private readonly _value: any

    constructor(predicate: string, value?: any) {
        this._predicate = predicate;
        this._value = value || null;
    }

    get term() {
        return namedNode(this._predicate)
    }

    get value() {
        return this._value
    }

}
