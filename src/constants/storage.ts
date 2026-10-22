/** Namespace for every localStorage key owned by the app. */
export const STORAGE_PREFIX = "tradereplay";

/** Version of the persisted store envelope written to localStorage. */
export const STORAGE_SCHEMA_VERSION = 1;

/** Key for the persisted session/workspace of one stored source. */
export function sessionStoreKey(sourceId: string): string {
    return `${STORAGE_PREFIX}:session:${sourceId}`;
}
