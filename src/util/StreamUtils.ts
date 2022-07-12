import {
    AsyncTransformOptions,
    getLoggerFor,
    Guarded,
    guardStream,
    isHttpRequest,
    pipeSafely
} from "@solid/community-server";
import {Transform, Writable} from "stream";
import pump from 'pump';

/**
 * The streamingUtils in this file are base one the utils found in the
 * {@link https://github.com/CommunitySolidServer Community Solid Server} which have
 * been modified to work with multiple streams at once
 */

/**
 * list of errors
 */
const safeErrors = new Set([
    'Cannot call write after a stream was destroyed',
    'premature close',
]);

const logger = getLoggerFor('PrivateStreamUtil');

export function transformSafelySerial<T = any>(
    source: NodeJS.ReadableStream[],
    {
        transform = function (data): void {
            this.push(data);
        },
        flush = (): null => null,
        ...options
    }: AsyncTransformOptions<T> = {},
):
    Guarded<Transform> {
    return pipeSafelySerial(source, new Transform({
        ...options,
        async transform(data: T, encoding, callback): Promise<void> {
            let error: Error | null = null;
            try {
                await transform.call(this, data, encoding);
            } catch (err: unknown) {
                error = err as Error;
            }
            callback(error);
        },
        async flush(callback): Promise<void> {
            let error: Error | null = null;
            try {
                await flush.call(this);
            } catch (err: unknown) {
                error = err as Error;
            }
            callback(error);
        },
    }));
}

function pipeSafelySerial<T extends Writable>(readables: NodeJS.ReadableStream[], destination: T,
                                              mapError?: (error: Error) => Error): Guarded<T> {
    /*
        // We never want to closes the incoming HttpRequest if there is an error
        // since that also closes the outgoing HttpResponse.
        // Since `pump` sends stream errors both up and down the pipe chain,
        // in this case we need to make sure the error only goes down the chain.
        if (isHttpRequest(readable)) {
            readable.pipe(destination);
            readable.on('error', (error): void => {
                logger.warn(`HttpRequest errored with ${error.message}`);
                // From https://nodejs.org/api/stream.html#stream_readable_pipe_destination_options :
                // One important caveat is that if the Readable stream emits an error during processing,
                // the Writable destination is not closed automatically. If an error occurs,
                // it will be necessary to manually close each stream in order to prevent memory leaks.
                destination.destroy(mapError ? mapError(error) : error);
            });
        } else {
            // In case the input readable is guarded, it will no longer log errors since `pump` attaches a new error listener
            pump(readable, destination, (error): void => {
                if (error) {
                    const msg = `Piped stream errored with ${error.message}`;
                    logger.log(safeErrors.has(error.message) ? 'debug' : 'warn', msg);

                    // Make sure the final error can be handled in a normal streaming fashion
                    destination.emit('error', mapError ? mapError(error) : error);
                }
            });
        }
    */
    /*if (readables.length == 1) {
        readables[0].pipe(destination)
    } else {
        const first = readables[0]
        const rest = readables.slice(1, readables.length);
        first.pipe(destination, {end: false})
        first.on("close", () => {
            first.unpipe(destination);
            pipeSafelySerial(rest, destination, mapError)
        })
    }*/
    if(readables.length == 1){
        return pipeSafely(readables[0], destination, mapError);
    }
    const r = readables[0]
    if(isHttpRequest(r)){
        r.pipe(destination, {end: false});
        r.on("error", (error):void => {
            destination.destroy(mapError ? mapError(error) : error);
        })
        r.on("close", () : void => {
            pipeSafelySerial(readables.slice(1,readables.length), destination, mapError);
        })
    } else {
        r.pipe(destination, {end: false});
        r.on("error", (error):void => {
            if (error) {
                const msg = `Piped stream errored with ${error.message}`;
                logger.log(safeErrors.has(error.message) ? 'debug' : 'warn', msg);

                // Make sure the final error can be handled in a normal streaming fashion
                destination.emit('error', mapError ? mapError(error) : error);
                destination.destroy(mapError? mapError(error):error)
            }
        })
        r.on("close", ():void => {
            pipeSafelySerial(readables.slice(1, readables.length), destination, mapError);
        })
    }
    // Guarding the stream now means the internal error listeners of pump will be ignored
    // when checking if there is a valid error listener.
    return guardStream(destination);
}
