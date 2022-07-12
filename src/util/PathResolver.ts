import {joinUrl} from "@solid/community-server"

/**
 * Helper class to resolve relative URLs.
 */
export class UrlBuilder {
    private readonly baseUrl: string;

    constructor(url: string) {
        this.baseUrl = url;
    }

    /**
     * Resolves the path for the current baseUrl.
     * @param path - Relative path to resolve.
     *
     * @returns the resolved path.
     */
    resolve(path: string) {
        return joinUrl(this.baseUrl, path);
    }
}
