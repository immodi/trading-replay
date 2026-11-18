export const MAX_STRATEGY_BYTES = 256 * 1024;
export const MAX_PARAMETERS = 30;
export const MAX_WARMUP_BARS = 10_000;
export const MAX_LOOKBACK_BARS = 10_000;
export const MAX_CONTRACTS_PER_ENTRY = 100;
export const MAX_SHARES_PER_ENTRY = 1_000_000;
export const MAX_ACTIONS_PER_BAR = 50;

/** Safety cap for one entry, in the instrument's natural quantity unit. */
export function maxUnitsPerEntry(assetClass: string | undefined): number {
    return assetClass === "stock"
        ? MAX_SHARES_PER_ENTRY
        : MAX_CONTRACTS_PER_ENTRY;
}
