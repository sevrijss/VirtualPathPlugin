export class Cache<K extends string | number | symbol, V> {

    private readonly keys: K[];
    private readonly values: V[]

    private readonly size: number;
    private counter: number;

    constructor(size: number) {
        if (size < 1) {
            throw new Error("cannot create empty cache");
        }
        this.counter = 0;
        this.size = size;
        this.keys = new Array<K>(size);
        this.values = new Array<V>(size);
    }

    getSize(): number {
        return this.size;
    }

    add(key: K, value: V): Cache<K, V> {
        let index;
        if (this.has(key)) {
            index = this.keys.indexOf(key);
        } else {
            index = this.counter;
            this.counter = (this.counter + 1) % this.size;
        }
        this.keys[index] = key;
        this.values[index] = value;
        return this;
    }

    has(key: K): boolean {
        return this.keys.includes(key);
    }

    /**
     * Gets a value associated to a key.
     * Does not check if key is present, please check with {@link Cache.has}
     * @param key
     */
    get(key: K): V {
        const index = this.keys.indexOf(key);
        return this.values[index];
    }
}
