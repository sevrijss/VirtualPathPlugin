# VirtualPathPlugin
Plugin for [Community Solid Server](https://github.com/CommunitySolidServer/CommunitySolidServer.git) to support virtual paths for derived data.

The user can define new virtual routes by PATCHing the metadata of a given resource.

Say the user want to derive the age of a birthdate in a given card.ttl:
```turtle
<https://example.com/johnDoe/profile/card#me>
        foaf:name         "John Doe" ;
        rdf:type          foaf:Person ;
		dbpedia-owl:birthDate "1945-01-15"^^xsd:date .
```

We can create a virtual resource called `age` by making a request. 
```curl
curl --location --request PUT 'http://localhost:3000/age' --header 'Content-Type: text/n3'
```

Now the server will have an empty resource on `/age`. 

Now we can use a `HEAD` request to determing the metadata file:
```curl
curl --location --head 'http://localhost:3000/age'
```
One of the response headers is a link header which points to the metadata file:
```http request
Link: <http://localhost:3000/age.meta>; rel="describedby"
```

Now that we have the location of the metadata file, we can begin PATCHing new metadata information to construct the derived resource.

```curl
curl --location --request PATCH "http://localhost:3000/age.meta" --header "Content-Type: text/n3" --data-raw "@prefix solid: <http://www.w3.org/ns/solid/terms#>.
@prefix svr: <https://example.com/ns/SolidVirtualResource#> .
@prefix fns: <https://example.com/functions#> .
@prefix fno: <https://w3id.org/function/ontology#> .
@prefix fnoi: <https://w3id.org/function/vocabulary/implementation#> .
@prefix doap: <http://usefulinc.com/ns/doap#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix fnom: <https://w3id.org/function/vocabulary/mapping#> .

<> a solid:InsertDeletePatch;
solid:inserts { 

<http://localhost:3000/age> a svr:VirtualSolidResource ;
  svr:fromResources </card.ttl> ;
  svr:usesFunction fns:age ;
  svr:takesOutput fns:quadList .

# Below is identical to /age
fns:age a fno:Function ;
  fno:expects ();
  fno:returns fns:list.

fns:list rdf:first fns:quadList.

fns:quadList a fno:Output;
  fno:predicate fns:quadOut.

fns:age_mapping a fno:Mapping;
  fno:function fns:age;
  fno:returnMapping fns:age_returnMapping;
  fno:implementation fns:age_implementation.

fns:age_returnMapping a fno:ReturnMapping, fnom:DefaultReturnMapping ;
  fnom:functionOutput fns:quadList.

fns:age_implementation a fno:Implementation, fnoi:JavaScriptImplementation, svr:internalImplementation;
  doap:name \"age\".
}."
```

The contents of the `solid:InsertDeletePatch` consists of information for the plugin to detect the derived resource (e.g. `svr:VirtualSolidResource`)
and the rest is [The Function Ontology](https://fno.io/). Here the implementation is an internal one in the server of the name `age` (`doap:name "age"`).

You can also provide a literal implementation:
```rdf
fns:age_implementation a fno:Implementation, fnoi:JavaScriptImplementation; 
  svr:literalImplementation """(store, modules)=>{
                                     // code
                                 } """ .
```
`store` contains a `N3.Store` with all the `Quad` objects gathered over the resources.
`modules` is a js object which contains major modules for quad handling:
* [N3](http://rdf.js.org/N3.js/)
* [Community Solid Server](https://github.com/CommunitySolidServer/CommunitySolidServer.git)
* [Vocabulary](src/util/Vocabulary.ts)
