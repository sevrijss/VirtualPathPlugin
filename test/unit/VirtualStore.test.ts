import {VirtualStore} from '../../src/util/VirtualStore';
import {
    BasicRepresentation,
    Conditions,
    MethodNotAllowedHttpError,
    Patch,
    Representation,
    RepresentationConverter,
    RepresentationConverterArgs,
    RepresentationPreferences,
    ResourceIdentifier,
    ResourceStore
} from "@solid/community-server";
import {UrlBuilder} from "../../src/util/PathResolver";
import N3, {DataFactory} from 'n3'
import {Quad} from "rdf-js";
import arrayifyStream from "arrayify-stream";

const {namedNode, literal, defaultGraph, quad} = DataFactory;

const quadPrefs = {type: {'internal/quads': 1}};

describe('A VirtualStore', (): void => {
    let store: VirtualStore
    let source: ResourceStore

    let baseRep: Representation
    let baseData: Quad[];

    const q = quad(
        namedNode("http://localhost:3000/seppevr"),
        namedNode("http://dbpedia.org/ontology/age"),
        literal(20),
        defaultGraph()
    )

    beforeEach(async (): Promise<void> => {
        // basic ResourceStore
        source = {
            getRepresentation: jest.fn().mockResolvedValue(baseRep),
            addResource: jest.fn(async (): Promise<any> => 'add'),
            setRepresentation: jest.fn(async (): Promise<any> => 'set'),
            deleteResource: jest.fn(async (identifier: ResourceIdentifier): Promise<any> => [identifier]),
            modifyResource: jest.fn(async (): Promise<any> => 'modify'),
            hasResource: jest.fn(async (): Promise<any> => 'exists'),
        };

        // converter & url builder
        const converter: RepresentationConverter = {
            handleSafe: jest.fn().mockResolvedValue({out: true}),
            handle: (i: RepresentationConverterArgs) => i.representation
        } as any;
        const urlbuilder: UrlBuilder = {resolve: jest.fn((name: string): string => `http://localhost:3000${name}`)} as any;

        // VirtualStore
        store = new VirtualStore(source, converter, urlbuilder)

        baseRep = new BasicRepresentation([], {
            contentType: 'internal/quads'
        })
        baseRep.data.push(q)
        baseData = [q]


    })

    it("construct a streaming virtual route with a single dependency", async (): Promise<void> => {
        // route for testing
        store.addVirtualRouteStream("/derivedResource",
            ["/base"],
            () => {
            },
            (q) => [q],
            () => [])
        expect(store.isVirtual("/derivedResource")).toBeTruthy();
        expect(store.getDependants("/base")).toStrictEqual(["http://localhost:3000/derivedResource"])
    })

    it("[streamVirtualRoute]\tcalls getRepresentation from the source with the base url if the resource is derived", async (): Promise<void> => {
        const start = jest.fn()
        const deriveFunction = jest.fn((q: Quad) => [q])
        const endFunction = jest.fn(() => []);
        // route for testing
        store.addVirtualRouteStream("/derivedResource",
            ["/base"],
            start,
            deriveFunction,
            endFunction)
        const representation = await store.getRepresentation(
            {path: 'http://localhost:3000/derivedResource'},
            {}
        )
        // await expect(representation.data).toBe(baseRep.data)
        const data: Quad[] = await arrayifyStream(representation.data)
        expect(data).toStrictEqual(baseData)
        expect(start).toHaveBeenCalledTimes(1);
        expect(deriveFunction).toHaveBeenCalledTimes(data.length);
        expect(endFunction).toHaveBeenCalledTimes(1);
        expect(source.getRepresentation).toHaveBeenCalledTimes(1);
        expect(source.getRepresentation).toHaveBeenCalledWith({path: 'http://localhost:3000/base'}, quadPrefs, undefined);
    });

    it("[virtualRoute]\tcalls getRepresentation from the source with the base url if the resource is derived", async (): Promise<void> => {
        const deriveFunction = jest.fn((store: N3.Store) => store.getQuads(null, null, null, defaultGraph()))
        // route for testing
        store.addVirtualRoute("/derivedResource",
            ["/base"],
            deriveFunction
        )
        // this will reject, since the "/base" resource does not exist
        const representation = await store.getRepresentation(
            {path: 'http://localhost:3000/derivedResource'},
            {} as RepresentationPreferences,
            {} as Conditions)
        const data = await arrayifyStream(representation.data);
        expect(data).toStrictEqual(baseData)
        expect(deriveFunction).toHaveBeenCalledTimes(1);
        expect(source.getRepresentation).toHaveBeenCalledTimes(1);
        expect(source.getRepresentation).toHaveBeenCalledWith({path: 'http://localhost:3000/base'}, quadPrefs, undefined);
    });

    it("calls getRepresentation directly from the source if it is not a derive resource", async (): Promise<void> => {
        const rep = await store.getRepresentation(
            {path: 'http://localhost:3000/notADerivedResource'},
            {} as RepresentationPreferences,
            {} as Conditions)
        const d = await arrayifyStream(rep.data);
        expect(d).toStrictEqual(baseData)
        expect(source.getRepresentation).toHaveBeenCalledTimes(1);
        expect(source.getRepresentation).toHaveBeenLastCalledWith({path: 'http://localhost:3000/notADerivedResource'}, {}, {});
    });


    it("calls addResource directly from the source if it is not a derive resource", async (): Promise<void> => {
        await expect(store.addResource({path: 'http://localhost:3000/notADerivedResource'},
            {} as Representation,
            {} as Conditions)).resolves.toBe("add");
        expect(source.addResource).toHaveBeenCalledTimes(1);
        expect(source.addResource).toHaveBeenLastCalledWith({path: 'http://localhost:3000/notADerivedResource'}, {}, {});
    });

    it("should error when trying to set a representation for a derived resource", async (): Promise<void> => {
        const deriveFunction = jest.fn((store: N3.Store) => store.getQuads(null, null, null, defaultGraph()))
        // route for testing
        store.addVirtualRoute("/derivedResource",
            ["/base"],
            deriveFunction
        )
        const result = () => store.setRepresentation({path: "http://localhost:3000/derivedResource"}, {data: 'test'} as any)
        expect(result).toThrow(MethodNotAllowedHttpError)
        expect(result).toThrow("setRepresentation are not allowed.")
    });

    it("calls setRepresentation directly from the source if it is not a derive resource", async (): Promise<void> => {
        await expect(store.setRepresentation({path: 'http://localhost:3000/notADerivedResource'},
            {} as Representation,
            {} as Conditions)).resolves.toBe("set");
        expect(source.setRepresentation).toHaveBeenCalledTimes(1);
        expect(source.setRepresentation).toHaveBeenLastCalledWith({path: 'http://localhost:3000/notADerivedResource'}, {}, {});
    });


    it("calls deleteResource directly from the source if it is not a derive resource", async (): Promise<void> => {
        await expect(store.deleteResource({path: 'http://localhost:3000/notADerivedResource'}, {} as Conditions)).resolves.toStrictEqual([{path: "http://localhost:3000/notADerivedResource"}]);
        expect(source.deleteResource).toHaveBeenCalledTimes(1);
        expect(source.deleteResource).toHaveBeenLastCalledWith({path: 'http://localhost:3000/notADerivedResource'}, {});
    });

    it("calling deleteResource on a derived resouce should result that resource not being virtual", async (): Promise<void> => {
        const deriveFunction = jest.fn((store: N3.Store) => store.getQuads(null, null, null, defaultGraph()))
        // route for testing
        store.addVirtualRoute("/derivedResource",
            ["/base"],
            deriveFunction
        )
        const result = await store.deleteResource({path: "http://localhost:3000/derivedResource"})
        expect(result).toStrictEqual([{path: "http://localhost:3000/derivedResource"}])
        expect(store.isVirtual("/derivedResource")).toBeFalsy()
    });

    it("calling deleteResource on the base resource should result in the derived resource not being virtual", async (): Promise<void> => {
        const deriveFunction = jest.fn((store: N3.Store) => store.getQuads(null, null, null, defaultGraph()))
        // route for testing
        store.addVirtualRoute("/derivedResource",
            ["/base"],
            deriveFunction
        )
        const result = await store.deleteResource({path: "http://localhost:3000/base"})
        expect(result).toStrictEqual([
            {path: "http://localhost:3000/base"},
            {path: "http://localhost:3000/derivedResource"}
        ])
        expect(store.isVirtual("/derivedResource")).toBeFalsy()
    });

    it("calls modifyResource directly from the source if it is not a derive resource", async (): Promise<void> => {
        await expect(store.modifyResource({path: 'http://localhost:3000/notADerivedResource'}, {} as Patch)).resolves.toBe("modify");
        expect(source.modifyResource).toHaveBeenCalledTimes(1);
        expect(source.modifyResource).toHaveBeenLastCalledWith({path: 'http://localhost:3000/notADerivedResource'}, {}, undefined);
    });

    it("calls hasResource directly from the source if it is not a derive resource", async (): Promise<void> => {
        await expect(store.hasResource({path: 'http://localhost:3000/notADerivedResource'})).resolves.toBe("exists");
        expect(source.hasResource).toHaveBeenCalledTimes(1);
        expect(source.hasResource).toHaveBeenLastCalledWith({path: 'http://localhost:3000/notADerivedResource'});
    });

})
