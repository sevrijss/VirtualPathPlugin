import {VirtualStore} from '../../src/util/VirtualStore';
import {
    Conditions,
    Patch,
    Representation,
    RepresentationConverter,
    RepresentationPreferences,
    ResourceStore
} from "@solid/community-server";
import {UrlBuilder} from "../../src/util/PathResolver";


const quadPrefs = {type: {'internal/quads': 1}};

describe('A VirtualStore', (): void => {
    let store: VirtualStore
    let source: ResourceStore

    beforeEach(async (): Promise<void> => {
        // basic ResourceStore
        source = {
            getRepresentation: jest.fn(async (): Promise<any> => 'get'),
            addResource: jest.fn(async (): Promise<any> => 'add'),
            setRepresentation: jest.fn(async (): Promise<any> => 'set'),
            deleteResource: jest.fn(async (): Promise<any> => 'delete'),
            modifyResource: jest.fn(async (): Promise<any> => 'modify'),
            hasResource: jest.fn(async (): Promise<any> => 'exists'),
        };

        // converter & url builder
        const converter: RepresentationConverter = {handleSafe: jest.fn().mockResolvedValue({out: true})} as any;
        const urlbuilder: UrlBuilder = {resolve: jest.fn((name:string):string => `http://localhost:3000${name}`)} as any;

        // VirtualStore
        store = new VirtualStore(source, converter, urlbuilder)


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
        expect(store.getDependants("/base")).toStrictEqual(["/derivedResource"])
    })

    it("calls getRepresentation from the source with the base url if the resource is derived", async (): Promise<void> => {
        // route for testing
        store.addVirtualRouteStream("/derivedResource",
            ["/base"],
            () => {
            },
            (q) => [q],
            () => [])
        // this will reject, since the "/base" resource does not exist
        await expect(store.getRepresentation(
            {path: 'http://localhost:3000/derivedResource'},
            {} as RepresentationPreferences,
            {} as Conditions)
        ).rejects
        expect(source.getRepresentation).toHaveBeenCalledTimes(1);
        expect(source.getRepresentation).toHaveBeenCalledWith({path: 'http://localhost:3000/base'}, quadPrefs, undefined);
    });

    it("calls getRepresentation directly from the source if it is not a derive resource", async (): Promise<void> => {
        await expect(store.getRepresentation(
            {path: 'notADerivedResource'},
            {} as RepresentationPreferences,
            {} as Conditions)
        ).resolves.toBe("get");
        expect(source.getRepresentation).toHaveBeenCalledTimes(1);
        expect(source.getRepresentation).toHaveBeenLastCalledWith({path: 'notADerivedResource'}, {}, {});
    });

    it("calls addResource directly from the source if it is not a derive resource", async (): Promise<void> => {
        await expect(store.addResource({path: 'notADerivedResource'},
            {} as Representation,
            {} as Conditions)).resolves.toBe("add");
        expect(source.addResource).toHaveBeenCalledTimes(1);
        expect(source.addResource).toHaveBeenLastCalledWith({path: 'notADerivedResource'}, {}, {});
    });

    it("calls setRepresentation directly from the source if it is not a derive resource", async (): Promise<void> => {
        await expect(store.setRepresentation({path: 'notADerivedResource'},
            {} as Representation,
            {} as Conditions)).resolves.toBe("set");
        expect(source.setRepresentation).toHaveBeenCalledTimes(1);
        expect(source.setRepresentation).toHaveBeenLastCalledWith({path: 'notADerivedResource'}, {}, {});
    });

    it("calls deleteResource directly from the source if it is not a derive resource", async (): Promise<void> => {
        await expect(store.deleteResource({path: 'notADerivedResource'}, {} as Conditions)).resolves.toBe("delete");
        expect(source.deleteResource).toHaveBeenCalledTimes(1);
        expect(source.deleteResource).toHaveBeenLastCalledWith({path: 'notADerivedResource'}, {});
    });

    it("calls modifyResource directly from the source if it is not a derive resource", async (): Promise<void> => {
        await expect(store.modifyResource({path: 'notADerivedResource'}, {} as Patch)).resolves.toBe("modify");
        expect(source.modifyResource).toHaveBeenCalledTimes(1);
        expect(source.modifyResource).toHaveBeenLastCalledWith({path: 'notADerivedResource'}, {}, undefined);
    });

    it("calls hasResource directly from the source if it is not a derive resource", async (): Promise<void> => {
        await expect(store.hasResource({path: 'notADerivedResource'})).resolves.toBe("exists");
        expect(source.hasResource).toHaveBeenCalledTimes(1);
        expect(source.hasResource).toHaveBeenLastCalledWith({path: 'notADerivedResource'});
    });

})
