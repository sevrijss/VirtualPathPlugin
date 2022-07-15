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
