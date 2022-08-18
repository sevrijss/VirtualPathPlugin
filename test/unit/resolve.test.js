import {
    flat as flatten,
    map,
    resolve,
    resolveMap,
    tree as buildTree
} from '../../src/util/node-resolve-dependency/libs/resolve';

let dependencyMap = {
    a: ['b', 'c'],
    b: [],
    c: ['b'],
    d: ['b','e'],
    e: ['f'],
    f: []
}

const preResolved = [
    [ 'b', 'c', 'a' ],
    [ 'b' ],
    [ 'b', 'c' ],
    [ 'b', 'f', 'e', 'd' ],
    [ 'f', 'e' ],
    [ 'f' ]
];

const preFlattened = [ 'b', 'c', 'a', 'f', 'e', 'd' ];

const preMapped = {
    f: [ 'f' ],
    e: [ 'f', 'e' ],
    d: [ 'b', 'f', 'e', 'd' ],
    c: [ 'b', 'c' ],
    b: [ 'b' ],
    a: [ 'b', 'c', 'a' ]
};

const expectedTree = { f: null,
    e: { f: null },
    d: { b: { f: { e: null} } },
    c: { b: null },
    b: null,
    a: { b: { c: null } }
}


describe ('Resolve dependency maps', () => {
    it ('resolves a dependency map', () => {
        let resolved = resolve (dependencyMap);
        expect (resolved).toEqual (preResolved)
    })
    it ('flattens a dependency map', () => {
        let resolved = resolve (dependencyMap);
        let flattened = flatten (resolved);
        expect (flattened).toEqual (preFlattened)
    })
    it ('builds a map of resolved groups', () => {
        let resolved = resolve (dependencyMap);
        let mapped = map (resolved);
        expect (mapped).toEqual (preMapped)
    })
    it ('builds a tree of resolved groups', () => {
        let resolved = resolve (dependencyMap);
        let tree = buildTree (resolved);
        expect (tree).toEqual (expectedTree)
    })

    it ('aliases map(resolve())', () => {
        let resolved = resolve (dependencyMap);
        let mapped = map (resolved);
        let mapped2 = resolveMap (dependencyMap)
        expect (mapped).toEqual (mapped2)
    })
})
