import {joinUrl} from "@solid/community-server"
export class UrlBuilder {
    private readonly baseUrl: string;

    constructor(url: string) {
        this.baseUrl = url;
    }

    resolve(path:string){
        return joinUrl(this.baseUrl, path);
    }
}
