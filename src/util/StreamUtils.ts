import {
    AsyncTransformOptions,
    getLoggerFor,
    Guarded,
    guardStream,
    isHttpRequest,
    pipeSafely,
    transformSafely
} from "@solid/community-server";
import {Transform, Writable} from "stream";

/**
 * The streamingUtils in this file are base on the
 * {@link https://github.com/CommunitySolidServer/CommunitySolidServer/blob/31cdb20bcebb8176eab69fc7c54f5f3dcbfa0b03/src/util/StreamUtil.ts Community Solid Server Streaming utils} which have
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

/**
 * passes all the source readables to {@link pipeSafelyMultiple}.
 * for more information visit {@link transformSafely}.
 *
 * @param sources - The streams to be transformed.
 * @param options - The transformation options.
 */
export function transformSafelyMultiple<T = any>(
    sources: NodeJS.ReadableStream[],
    {
        transform = function (data): void {
            this.push(data);
        },
        flush = (): null => null,
        ...options
    }: AsyncTransformOptions<T> = {},
):
    Guarded<Transform> {
    return pipeSafelyMultiple(sources, new Transform({
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

/**
 * Pipes all the sources to the given destination.
 * For more information visit {@link pipeSafely}.
 *
 * @param readables - source streams
 * @param destination - destination of the source streams
 * @param mapError - Optional function that takes the error and converts it to a new error.
 */
function pipeSafelyMultiple<T extends Writable>(readables: NodeJS.ReadableStream[], destination: T,
                                                mapError?: (error: Error) => Error): Guarded<T> {
    // If there is 1
    if (readables.length == 1) {
        return pipeSafely(readables[0], destination, mapError);
    }
    // if there is more
    else if (readables.length > 1) {
        const r = readables[0]
        if (isHttpRequest(r)) {
            r.pipe(destination, {end: false});
            r.on("error", (error): void => {
                r.unpipe(destination);
                destination.destroy(mapError ? mapError(error) : error);
            })
            r.on("close", (): void => {
                r.unpipe(destination);
                pipeSafelyMultiple(readables.slice(1, readables.length), destination, mapError);
            })
        } else {
            r.pipe(destination, {end: false});
            r.on("error", (error): void => {
                if (error) {
                    const msg = `Piped stream errored with ${error.message}`;
                    logger.log(safeErrors.has(error.message) ? 'debug' : 'warn', msg);
                    r.unpipe(destination);
                    // Make sure the final error can be handled in a normal streaming fashion
                    destination.emit('error', mapError ? mapError(error) : error);
                    destination.destroy(mapError ? mapError(error) : error)
                }
            })
            r.on("close", (): void => {
                r.unpipe();
                pipeSafelyMultiple(readables.slice(1, readables.length), destination, mapError);
            })
        }
    }
    // Guarding the stream now means the internal error listeners of pump will be ignored
    // when checking if there is a valid error listener.
    return guardStream(destination);
}
