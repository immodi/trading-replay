import { useSyncExternalStore } from "react";

import type { Store } from "@/store/store";

/**
 * Subscribe a component to a singleton store. Returns the cached state object,
 * so the snapshot is referentially stable until the store actually changes.
 */
export function useStore<T extends object>(store: Store<T>): T {
    return useSyncExternalStore(
        store.subscribe,
        store.getSnapshot,
        store.getSnapshot,
    );
}
