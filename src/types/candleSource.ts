import type { Candle } from "@/types/candle";
import type { DataRange } from "@/types/dateRange";

/**
 * Declarative description of a candle dataset. Everything that differs
 * between instruments/sources lives here, so the loader itself can stay
 * generic.
 */
export interface CandleSourceConfig {
    /** Stable identifier, e.g. "mnq". */
    id: string;
    /** Human‑readable instrument/symbol, e.g. "MNQ". */
    symbol: string;
    /** Dollar value of a single point, used for P/L. */
    pointValue: number;
    /** URL the raw candle JSON is fetched from. */
    url: string;
}

/**
 * A loaded, queryable candle dataset. Consumers depend on this interface
 * instead of a concrete instrument, so new sources can be added without
 * touching them.
 *
 * Loaded candles use the `Candle` shape with empty history arrays; the
 * `highHistory`/`lowHistory` are populated as candles are aggregated.
 */
export interface CandleSource {
    id: string;
    symbol: string;
    pointValue: number;

    /** Raw 1‑minute candles for a given UTC date. */
    loadDay(date: Date): Promise<Candle[]>;

    /**
     * Candles aggregated to `timeframe` minutes, from the start of the
     * dataset up to (but not including) the given UTC date.
     */
    getHistory(date: Date, timeframe: number, maxCandles?: number): Promise<Candle[]>;

    /** UTC‑aligned date range covered by the whole dataset. */
    getRange(): Promise<DataRange>;
}
