import { STORAGE_SCHEMA_VERSION } from "@/constants/storage";
import { localStorageClient, type StorageClient } from "@/data/storage";

type Listener = () => void;

type Envelope = {
    version: number;
    savedAt: number;
    data: unknown;
};

export type StoreOptions<T extends object> = {
    /** localStorage key, usually namespaced via `src/constants/storage.ts`. */
    key: string;
    /** Factory so every caller gets its own (non-shared) default object. */
    initial: () => T;
    /** Envelope version. Defaults to `STORAGE_SCHEMA_VERSION`. */
    version?: number;
    /**
     * Convert stored data into the current shape. Called for every stored
     * version when provided; return `null` to discard unreadable data.
     */
    migrate?: (data: unknown, fromVersion: number) => T | null;
    /** Storage backend. Pass `null` for an in-memory-only store. */
    client?: StorageClient | null;
    /**
     * Throttle writes. `0` (default) writes synchronously. Playback state uses
     * a small delay because it changes on every replay tick.
     */
    debounceMs?: number;
    /** Called when hydrating or persisting fails. */
    onError?: (error: unknown) => void;
};

function isEnvelope(value: unknown): value is Envelope {
    return (
        typeof value === "object" &&
        value !== null &&
        "data" in value &&
        typeof (value as { version?: unknown }).version === "number"
    );
}

/**
 * Shape-agnostic observable state container with optional localStorage
 * persistence and versioned hydration.
 *
 * Instances are meant to be created through `getStore`, which guarantees that
 * one key maps to exactly one live instance.
 */
export class Store<T extends object> {
    readonly key: string;

    private readonly options: StoreOptions<T>;
    private state: T;
    private readonly listeners = new Set<Listener>();

    private saveTimer: ReturnType<typeof setTimeout> | null = null;
    private pendingWrite = false;
    private writeFailed = false;

    constructor(options: StoreOptions<T>) {
        this.key = options.key;
        this.options = options;
        this.state = options.initial();

        this.hydrate();
        this.attachLifecycleFlush();
    }

    readonly getSnapshot = (): T => this.state;

    readonly get = (): T => this.state;

    readonly subscribe = (listener: Listener): (() => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };

    readonly set = (next: T): void => {
        if (Object.is(next, this.state)) return;

        this.state = next;
        this.emit();
        this.schedulePersist();
    };

    readonly update = (fn: (current: T) => T): void => {
        this.set(fn(this.state));
    };

    readonly patch = (partial: Partial<T>): void => {
        this.set({ ...this.state, ...partial });
    };

    readonly reset = (): void => {
        this.set(this.options.initial());
    };

    /** Write any pending debounced change immediately. */
    readonly flush = (): void => {
        if (this.saveTimer !== null) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }

        if (!this.pendingWrite) return;

        this.pendingWrite = false;
        this.write();
    };

    /**
     * Write the current state immediately, even if nothing is pending. Used
     * for user-facing changes that must not wait for the write throttle.
     */
    readonly save = (): void => {
        if (this.options.client === null) return;

        if (this.saveTimer !== null) {
            clearTimeout(this.saveTimer);
            this.saveTimer = null;
        }

        this.pendingWrite = false;
        this.write();
    };

    private emit(): void {
        for (const listener of this.listeners) listener();
    }

    private hydrate(): void {
        const client = this.options.client ?? localStorageClient;

        let raw: string | null;
        try {
            raw = client.read(this.key);
        } catch (error) {
            this.report(error);
            return;
        }

        if (!raw) return;

        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch (error) {
            this.report(error);
            return;
        }

        if (!isEnvelope(parsed)) return;

        const expected = this.options.version ?? STORAGE_SCHEMA_VERSION;

        // A payload from a newer app version may have an incompatible shape.
        if (parsed.version > expected) return;

        try {
            if (this.options.migrate) {
                const migrated = this.options.migrate(parsed.data, parsed.version);
                if (migrated !== null) this.state = migrated;
                return;
            }

            if (parsed.version === expected) {
                this.state = parsed.data as T;
            }
        } catch (error) {
            this.report(error);
        }
    }

    private schedulePersist(): void {
        if (this.options.client === null) return;

        this.pendingWrite = true;

        const delay = this.options.debounceMs ?? 0;
        if (delay <= 0) {
            this.flush();
            return;
        }

        // Throttle rather than debounce: during continuous playback a
        // reset-on-every-tick timer would never fire.
        if (this.saveTimer !== null) return;

        this.saveTimer = setTimeout(() => {
            this.saveTimer = null;
            this.flush();
        }, delay);
    }

    private write(): void {
        const client = this.options.client ?? localStorageClient;
        const envelope: Envelope = {
            version: this.options.version ?? STORAGE_SCHEMA_VERSION,
            savedAt: Date.now(),
            data: this.state,
        };

        try {
            client.write(this.key, JSON.stringify(envelope));
            this.writeFailed = false;
        } catch (error) {
            // Log once per failure streak so quota errors don't flood the
            // console during playback.
            if (!this.writeFailed) this.report(error);
            this.writeFailed = true;
        }
    }

    private report(error: unknown): void {
        if (this.options.onError) {
            this.options.onError(error);
            return;
        }

        console.warn(`[store:${this.key}]`, error);
    }

    private attachLifecycleFlush(): void {
        if (typeof window === "undefined") return;

        window.addEventListener("pagehide", this.flush);
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "hidden") this.flush();
        });
    }
}

const registry = new Map<string, Store<object>>();

/**
 * Return the singleton store for `options.key`, creating it on first use.
 * Later calls ignore the factory options, so all modules observe the same
 * state instance.
 */
export function getStore<T extends object>(options: StoreOptions<T>): Store<T> {
    const existing = registry.get(options.key);
    if (existing) return existing as unknown as Store<T>;

    const store = new Store<T>(options);
    registry.set(options.key, store as unknown as Store<object>);
    return store;
}

/** Exposed for tests/tools that need to start from a clean registry. */
export function resetStoreRegistry(): void {
    for (const store of registry.values()) store.flush();
    registry.clear();
}
