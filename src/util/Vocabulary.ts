import {createUriAndTermNamespace} from "@solid/community-server";

export const DBP = createUriAndTermNamespace("http://dbpedia.org/ontology/",
    "birthDate",
    "age",
    "birthYear",
);

export const FOAF = createUriAndTermNamespace('http://xmlns.com/foaf/0.1/',
    "knows"
);

export const BIMERR = createUriAndTermNamespace("https://bimerr.iot.linkeddata.es/def/weather#",
    "WeatherProperty",
    "Temperature",
    "Pressure",
    "Humidity",
    "wind_deg",
    "windSpeed"
);

export const RS_TDWG = createUriAndTermNamespace("http://rs.tdwg.org/dwc/terms/",
    "decimalLatitude",
    "decimalLongitude"
);

export const SVR = createUriAndTermNamespace("https://example.com/ns/SolidVirtualResource#",
    "VirtualSolidResource",
    "internalImplementation",
    "streaming",
    "fromResources",
    "usesFunction",
    "takesOutput"
);

export const FNO = createUriAndTermNamespace("https://w3id.org/function/ontology#",
    "Function",
    "expects",
    "returns",
    "Output",
    "Mapping",
    "function",
    "implementation",
    "Implementation",
);

export const XMLSchema = createUriAndTermNamespace("http://www.w3.org/2001/XMLSchema#",
    "boolean",
);

export const DOAP = createUriAndTermNamespace("http://usefulinc.com/ns/doap#",
    "name",
);
