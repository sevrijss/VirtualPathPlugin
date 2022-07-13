import {UrlBuilder} from "../../src";

describe('A PathResolver', (): void => {
    let pathbuiler: UrlBuilder

    beforeEach(async (): Promise<void> => {
        // PathBuilder
        pathbuiler = new UrlBuilder("http://localhost:3000")

        /*// route for testing
        store.addVirtualRouteStream("/derivedResourceFromMultiple",
            ["/base1", "/base2", "/base3"],
            () => {
            },
            (q) => [q],
            () => [],)*/
    })
    it('should resolve the url correctly', function () {
        expect(pathbuiler.resolve("/name")).toBe("http://localhost:3000/name")
    });
})
