# VirtualPathPlugin
Plugin for [Community Solid Server](https://github.com/CommunitySolidServer/CommunitySolidServer.git) to support virtual paths for derived data.

The user can define new virtual routes using a variety of methods given by the newly created VirtualStore.

* Streaming mode (with Processor mode)
* Store mode
* External mode (experimental)

Each mode has it's own properties:
1. Streaming mode

The user can provide 3 functions. The first function will be called before any data arrives, this may serve the purpose of setting up your processing environment.
The second function is the processor on a `Quad` level. This function will take a quad and may return an array of `Quad`s, so you can derive more than 1 `Quad` from the given datapoint.
The last function will be called after all the data has been processed. This function can be used to derive `Quad`s from an internal state of your processor (e.g. number of `Quad`s processed).

The user can also define a derived resource with a Processor object. The inner logic is the same, because the Processor (src/util/Processor.ts) object also has 3 functions.

2. Store mode

The user provides 1 function which will receive an entire `Store` of `Quad`s and returns an array of `Quad`s. This might be the preferred method when the user wants do draw conclusions from the data as a whole.

3. External mode (experimental)

The user can provide an api url and a function to convert the api-json data to `Quad`s. After the convertion, the processor function will be called to process the data.
The processor function is of the same type as the one in Store mode.
