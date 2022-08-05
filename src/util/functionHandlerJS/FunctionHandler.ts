import {Composition, Function, Implementation, Mapping} from './models';
import {GraphHandler, LocalValue} from './GraphHandler';
import {ArgumentMap, ReturnMap} from './handlers/Handler';
import * as $rdf from 'rdflib';
import {Collection} from 'rdflib';
import {flat as flatten, resolve} from 'node-resolve-dependency-graph/lib';

import prefixes from './prefixes';
import {Quad, Term} from 'rdf-js';
import {ImplementationHandler} from './handlers/ImplementationHandler';
import {Quad_Object, Quad_Predicate, Quad_Subject} from "rdflib/lib/tf-types";

type DependencyInputs = {
    type: "inputs",
}

type DependencyOutputs = {
    type: "outputs",
}

type DependencyFunction = {
    type: "function",
    fn: Function
    inputs: {
        [predicate: string]: string[]
    },
    outputs: {
        [predicate: string]: string[]
    }
}

export class FunctionHandler {
    private graphHandler: GraphHandler;
    implementationHandler: ImplementationHandler;

    constructor() {
        this.graphHandler = new GraphHandler();
        this.implementationHandler = new ImplementationHandler();
    }

    async addFunctionResource(iri: string, localValue: LocalValue | null = null) {
        await this.graphHandler.addGraph(iri, localValue);
    }

    async getFunction(iri: string): Promise<Function> {
        const term = this.graphHandler.getSubjectOfType(iri, `${prefixes.fno}Function`);
        if (!term) {
            throw new Error(`Cannot find function for iri: ${iri}`)
        }
        return new Function(term);
    }

    async executeFunction(fn: Function, args: ArgumentMap) {
        let handler = this.getImplementationViaMappings(fn);

        if (handler) {
            return this.implementationHandler.executeImplementation(handler.id, args);
        }
        handler = this.getHandlerViaCompositions(fn);
        if (handler) {
            return this.implementationHandler.executeImplementation(handler.id, args);
        }

        throw new Error(`Could not find any relevant implementation or composition to execute ${fn.id}`);
    }

    private linkMappedImplementations(fn: Function) {
        const mappings: Mapping[] = this.getMappingsFromFunction(fn);
        if (mappings.length === 0) {
            console.warn(`Could not find any relevant mapping for function ${fn.id}`);
        }
        const loaded: Record<string, any> = {};
        for (const mapping of mappings) {
            const implementations = this.getImplementationsFromMapping(mapping);
            const loadedImplementations = implementations.filter((implementation) => {
                const implementationLinked = this.implementationHandler.linkImplementationToFunction(implementation.id, fn.id);
                const optionsAreSet = this.implementationHandler.setOptions(implementation.id, {
                    args: this.getArgsFromMapping(mapping),
                    returns: this.getReturnsFromMapping(mapping),
                });
                return implementationLinked && optionsAreSet;
            });
            if (loadedImplementations.length > 0) {
                loaded[mapping.id] = {
                    mapping,
                    loadedImplementations,
                };
            }
        }
        return loaded;
    }

    private getImplementationViaMappings(fn: Function): Implementation | null {
        const mappedImplementations = this.linkMappedImplementations(fn);
        if (Object.keys(mappedImplementations).length === 0) {
            console.warn(`Could not find any relevant mapping for function ${fn.id}`);
        }
        for (const mappingId in mappedImplementations) {
            return mappedImplementations[mappingId].loadedImplementations[0];
        }
        return null;
    }

    getHandlerViaCompositions(fn: Function): Composition | null {
        const compositions: Composition[] = this.getCompositionsFromFunction(fn);
        if (compositions.length === 0) {
            console.warn(`Could not find any relevant composition for function ${fn.id}`);
        }
        for (const composition of compositions) {
            if (this.tryToLoadComposition(composition)) {
                return composition;
            }
        }
        return null;
    }

    private getObjects(subject: Quad_Subject, predicate: Quad_Predicate): Quad_Object[] {
        return this.graphHandler.match(subject, predicate, null).map((s: Quad) => s.object as Quad_Object);
    }

    private getSingleObject(subject: Quad_Subject, predicate: Quad_Predicate): Quad_Object {
        const objects = this.getObjects(subject, predicate);
        if (objects.length === 0) {
            throw Error(`Subject ${subject.value} without ${predicate.value} defined!`);
        }
        if (objects.length > 1) {
            console.warn(`Too many objects for ${predicate.value} found for ${subject.value}, just picking one at random`);
        }
        return objects[0];
    }

    private exists(subject: Quad_Subject, predicate: Quad_Predicate, object: Quad_Object) {
        return this.graphHandler.match(subject, predicate, object).length > 0;
    }

    private getMappingsFromFunction(fn: Function) {

        const mappings = this.graphHandler.match(null, $rdf.sym(`${prefixes.fno}function`), fn.term as Quad_Object);
        if (mappings.length === 0) {
            return [];
        }
        return mappings.map(m => new Mapping(m.subject));
    }

    private getImplementationsFromMapping(mapping: Mapping): Implementation[] {
        const implementations = this.getObjects(mapping.term as Quad_Subject, $rdf.sym(`${prefixes.fno}implementation`));
        if (implementations.length === 0) {
            return [];
        }
        return implementations.map((o: Quad_Object) => new Implementation(o as Term));
    }

    private getArgsFromMapping(mapping: Mapping): ArgumentMap {
        const parameterMappings = this.getObjects(mapping.term as Quad_Subject, $rdf.sym(`${prefixes.fno}parameterMapping`));
        const positionArgs = {};
        parameterMappings.forEach((pMapping) => {
            let parameters = this.getObjects(pMapping as Quad_Subject, $rdf.sym(`${prefixes.fnom}functionParameter`));
            if (parameters.length === 0) {
                console.warn(`Could not find parameter assigned to ${pMapping.value}`);
                return;
            }
            if (parameters.length > 1) {
                console.warn(`More parameters for ${pMapping.value} than expected (1). Picking one at random.`);
            }
            let parameter = parameters[0];
            let types = this.getObjects(parameter as Quad_Subject, $rdf.sym(`${prefixes.fno}type`));
            const predicate = this.getSingleObject(parameter as Quad_Subject, $rdf.sym(`${prefixes.fno}predicate`));
            if (types.length === 0) {
                console.warn(`No type information for parameter ${parameter.value} found`);
            }
            if (types.length > 1) {
                console.warn(`More types for ${parameter.value} than expected (1). Picking one at random.`);
            }
            let type = types[0] || null;
            if (this.graphHandler.match(pMapping as Quad_Subject, $rdf.sym(`${prefixes.rdf}type`), $rdf.sym(`${prefixes.fnom}PositionParameterMapping`)).length > 0) {
                const positions = this.getObjects(pMapping as Quad_Subject, $rdf.sym(`${prefixes.fnom}implementationParameterPosition`)).map(o => o.value);
                positions.forEach((position) => {
                    addToResult(positionArgs, position, predicate.value, type);
                });
            } else {
                throw new Error('Unsupported if not positionparametermapping');
            }
        });

        return {
            positionArgs,
        };

        function addToResult(result: Record<string, string[] | string>, key: string, value: string, type: Quad_Object) {
            if (type?.value === `${prefixes.rdf}List`) {
                if (!result[key]) {
                    result[key] = [];
                }
                (result[key] as string[]).push(value);
            } else {
                if (!result[key]) {
                    result[key] = value;
                } else {
                    console.warn(`Multiple values found for argument ${key}. Keeping a random one.`);
                }
            }
        }
    }

    private getReturnsFromMapping(mapping: Mapping): ReturnMap {
        const result: Record<string, string[] | string> = {};
        const returnMappings = this.getObjects(mapping.term as Quad_Subject, $rdf.sym(`${prefixes.fno}returnMapping`));
        returnMappings.forEach((rMapping) => {
            let outputs = this.getObjects(rMapping as Quad_Subject, $rdf.sym(`${prefixes.fnom}functionOutput`));
            if (outputs.length === 0) {
                console.warn(`Could not find output assigned to ${rMapping.value}`);
                return;
            }
            if (outputs.length > 1) {
                console.warn(`More outputs for ${rMapping.value} than expected (1).
         Picking one at random.`);
            }
            let output = outputs[0] as Quad_Subject;
            let predicates = this.getObjects(output, $rdf.sym(`${prefixes.fno}predicate`));
            if (predicates.length === 0) {
                console.warn(`Could not find predicate of ${output.value}`);
                return;
            }
            // no idea what this should do. In the original code output was converterd from a list to a single object
            // also a duplicate from 10 lines above

            /*
            if (output.length > 1) {
                console.warn(`More predicates for ${output.value} than expected (1).
            Picking one at random.`);
            }
            */

            let predicate = predicates[0];

            let types = this.getObjects(output, $rdf.sym(`${prefixes.fno}type`));
            if (types.length === 0) {
                console.warn(`No type information for parameter ${output.value} found`);
            }
            if (types.length > 1) {
                console.warn(`More types for ${output.value} than expected (1). Picking one at random.`);
            }
            let type = types[0] || null;
            if (this.graphHandler.match(rMapping as Quad_Subject, $rdf.sym(`${prefixes.rdf}type`), $rdf.sym(`${prefixes.fnom}DefaultReturnMapping`)).length > 0) {
                addToResult('_default', predicate.value, type);
            } else {
                throw new Error('Unsupported if not defaultReturnMapping');
            }
        });

        return result;

        function addToResult(key: string, value: string, type: Quad_Object) {
            if (type?.value === `${prefixes.rdf}List`) {
                if (!result[key]) {
                    result[key] = [];
                }
                (result[key] as string[]).push(value);
            } else {
                if (!result[key]) {
                    result[key] = value;
                } else {
                    console.warn(`Multiple values found for argument ${key}. Keeping a random one.`);
                }
            }
        }
    }

    private getCompositionsFromFunction(fn: Function): Composition[] {
        const outputArray = this.getSingleObject(fn.term as Quad_Subject, $rdf.sym(`${prefixes.fno}returns`)) as Collection;
        console.log(outputArray);
        const outHash = outputArray.elements.map(o => o.value).sort().join("_");
        console.log(outHash);
        return this.graphHandler.match(
            null,
            $rdf.sym(`${prefixes.rdf}type`),
            $rdf.sym(`${prefixes.fnoc}Composition`)
        )
            .map(s => s.subject)
            .filter(
                (composition) => {
                    const outputs: Term[] = [];
                    this.getObjects(composition as Quad_Subject, $rdf.sym(`${prefixes.fnoc}composedOf`))
                        .forEach(
                            (compositionMapping) => {
                                const mapTos = this.getSingleObject(compositionMapping as Quad_Subject,
                                    $rdf.sym(`${prefixes.fnoc}mapTo`));


                                const result = this.exists(mapTos as Quad_Subject,
                                    $rdf.sym(`${prefixes.fnoc}constituentFunction`), fn.term as Quad_Object)

                                if (result) {
                                    outputs.push(this.getSingleObject(mapTos as Quad_Subject,
                                        $rdf.sym(`${prefixes.fnoc}functionOutput`)) as Term);
                                }
                            }
                        );
                    console.log(outputs);
                    console.log(`outHash:\t${outHash}`);
                    console.log(outputs.map(o => o.value).sort().join('_'));
                    return outputs.map(o => o.value).sort().join('_') === outHash;
                }
            )
            .map(c => new Composition(c));
    }

    private tryToLoadComposition(composition: Composition) {
        const addFullFunctionToDependency = (compositionMap: Term, composedOfTerm: Term) => {
            const fn = this.getSingleObject(compositionMap as Quad_Subject,
                $rdf.sym(`${prefixes.fnoc}constituentFunction`));
            let rootFn = fn;
            try {
                rootFn = this.getSingleObject(fn as Quad_Subject, $rdf.sym(`${prefixes.fnoc}applies`));
            } catch (e) {
                // no problem
            }
            tryAddFunctionToDependency(fn as Term, rootFn as Term);
            try {
                const param = this.getSingleObject(compositionMap as Quad_Subject,
                    $rdf.sym(`${prefixes.fnoc}functionParameter`));
                const predicate = this.getSingleObject(param as Quad_Subject, $rdf.sym(`${prefixes.fno}predicate`));
                addFunctionParameterToDependency(dependencyMeta[fn.value] as DependencyFunction, predicate as Term, composedOfTerm);
                return `${fn.value}_inputs`;
            } catch (e) {
                // no problem
            }
            try {
                const output = this.getSingleObject(compositionMap as Quad_Subject,
                    $rdf.sym(`${prefixes.fnoc}functionOutput`));
                const predicate = this.getSingleObject(output as Quad_Subject, $rdf.sym(`${prefixes.fno}predicate`));
                addFunctionOutputToDependency(dependencyMeta[fn.value] as DependencyFunction, predicate as Term, composedOfTerm);
                return `${fn.value}_outputs`;
            } catch (e) {
                // no problem
            }
            return fn.value;
        };
        const composedOfValueMap: Record<string, any> = {};
        const dependencyMeta: {
            [key: string]: DependencyInputs | DependencyOutputs | DependencyFunction
        } = {};
        const dependencyMap: Record<string, string[]> = {};
        const composedOfTerms = this.getObjects(composition.term as Quad_Subject,
            $rdf.sym(`${prefixes.fnoc}composedOf`));
        composedOfTerms.forEach((composedOfTerm) => {
            // - make composedOfMap
            // composedOf1: a
            // composedOf2: b
            // composedOf3: null
            // composedOf4: c
            // composedOf5: null
            composedOfValueMap[composedOfTerm.value] = null;
            // sum31:
            //   inputs:
            //     a: [composedOf1]
            //     b: [composedOf2]
            //   outputs:
            //     o: [composedOf3]
            // sum32:
            //   inputs:
            //     a: [composedOf3]
            //     b: [composedOf4]
            //   outputs:
            //     o: [composedOf5]
            const mapFrom = this.getSingleObject(composedOfTerm as Quad_Subject,
                $rdf.sym(`${prefixes.fnoc}mapFrom`));
            // - make functionMaps for all functions
            const depFrom = addFullFunctionToDependency(mapFrom as Term, composedOfTerm as Term);
            const mapTo = this.getSingleObject(composedOfTerm as Quad_Subject, $rdf.sym(`${prefixes.fnoc}mapTo`));
            const depTo = addFullFunctionToDependency(mapTo as Term, composedOfTerm as Term);
            // - make full dependency graph
            // let dependencyMap = {
            //     sum3i: [],
            //     sum3: ['sum3i'],
            //     sum3o: ['sum3', 'sum32o'],
            //     sum31i: ['sum3i'],
            //     sum31: ['sum31i'],
            //     sum31o: ['sum31'],
            //     sum32i: ['sum31o', 'sum3i'],
            //     sum32: ['sum32i'],
            //     sum32o: ['sum32'],
            // }
            dependencyMap[depTo].push(depFrom);
        });
        const dependencyList: string[] = flatten(resolve(dependencyMap));
        // - first and last must refer to same function === composed function
        const compositionFn = dependencyList[0].slice(0, -7);
        if (dependencyList[0].slice(0, -7) !== dependencyList[dependencyList.length - 1].slice(0, -8)) {
            throw new Error(`No unique composed function detected: found ${dependencyList[0]} and ${dependencyList[dependencyList.length - 1]}`);
        }
        if (this.implementationHandler.hasImplementation(compositionFn)) {
            return true;
        }

        const otherFn = dependencyList.filter((resolvedId: string) => dependencyMeta[resolvedId].type === 'function' && resolvedId !== compositionFn);
        for (const fnId of otherFn) {
            const mappedImplementations = this.linkMappedImplementations((dependencyMeta[fnId] as DependencyFunction).fn);
            if (Object.keys(mappedImplementations).length === 0) {
                console.warn(`Couldn't link implementation of ${(dependencyMeta[fnId] as DependencyFunction).fn.id}`);
                return false;
            }
        }
        const implementationOptions = {
            compositionFn,
            composedOfValueMap,
            dependencyMeta,
            dependencyList,
            implementationHandler: this.implementationHandler,
        };
        this.implementationHandler.loadComposition(composition.id, implementationOptions);

        return true;

        function addFunctionParameterToDependency(dependencyFunction: DependencyFunction, predicate: Term, composedOf: Term) {
            if (!dependencyFunction.inputs[predicate.value]) {
                dependencyFunction.inputs[predicate.value] = [];
            }
            dependencyFunction.inputs[predicate.value].push(composedOf.value);
        }

        function addFunctionOutputToDependency(dependencyFunction: DependencyFunction, predicate: Term, composedOf: Term,) {
            if (!dependencyFunction.outputs[predicate.value]) {
                dependencyFunction.outputs[predicate.value] = [];
            }
            dependencyFunction.outputs[predicate.value].push(composedOf.value);
        }

        function tryAddFunctionToDependency(fn: Term, rootFn: Term) {
            if (!dependencyMap[fn.value]) {
                dependencyMap[`${fn.value}_inputs`] = [];
                dependencyMeta[`${fn.value}_inputs`] = {
                    type: 'inputs',
                };
                dependencyMap[fn.value] = [`${fn.value}_inputs`];
                dependencyMeta[fn.value] = {
                    type: 'function',
                    fn: new Function(rootFn),
                    inputs: {},
                    outputs: {},
                };
                dependencyMap[`${fn.value}_outputs`] = [fn.value];
                dependencyMeta[`${fn.value}_outputs`] = {
                    type: 'outputs',
                };
            }
        }
    }
}
