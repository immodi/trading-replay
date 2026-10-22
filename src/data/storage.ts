/**
 * Small synchronous storage abstraction. The store layer depends on this
 * interface rather than `window.localStorage` directly, so the backend can be
 * swapped (IndexedDB, OPFS, a memory stub in tests) without touching callers.
 */
export type StorageClient = {
    read(key: string): string | null;
    write(key: string, value: string): void;
    remove(key: string): void;
};

export class StorageError extends Error {
    constructor(message: string, cause?: unknown) {
        super(message, { cause });
        this.name = "StorageError";
    }
}

function getLocalStorage(): Storage | null {
    if (typeof window === "undefined") return null;

    try {
        return window.localStorage;
    } catch {
        // Access can throw in hardened/private browsing modes.
        return null;
    }
}

export const localStorageClient: StorageClient = {
    read(key) {
        const storage = getLocalStorage();
        if (!storage) return null;

        try {
            return storage.getItem(key);
        } catch {
            return null;
        }
    },

    write(key, value) {
        const storage = getLocalStorage();
        if (!storage) {
            throw new StorageError("localStorage is not available");
        }

        try {
            storage.setItem(key, value);
        } catch (error) {
            throw new StorageError(`Failed to write "${key}" to localStorage`, error);
        }
    },

    remove(key) {
        const storage = getLocalStorage();
        if (!storage) return;

        try {
            storage.removeItem(key);
        } catch (error) {
            throw new StorageError(`Failed to remove "${key}" from localStorage`, error);
        }
    },
};
