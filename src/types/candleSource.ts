import type { AssetClass } from "@/constants/assetClass";
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
    /** Market family: futures contracts or cash stocks. */
    assetClass: AssetClass;
    /** Reporting currency for point value, commission and P/L. */
    currency: string;
    /** Currency value of a single point, used for P/L. */
    pointValue: number;
    /**
     * Flat commission charged per side. Stocks charge it once per order;
     * futures charge it per contract.
     */
    commission: number;
    /** Percentage of order notional charged per side, added to `commission`. */
    commissionPercent: number;
    /**
     * Resolution of the stored raw candles, in minutes. 1 = one-minute bars,
     * 1440 = one daily bar per trading day.
     */
    baseTimeframeMinutes: number;
    /** URL the raw candle JSON is fetched from. */
    fileName: string;
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
    assetClass: AssetClass;
    currency: string;
    pointValue: number;
    /** Flat commission per side (per order for stocks, per contract for futures). */
    commission: number;
    /** Percentage of order notional charged per side. */
    commissionPercent: number;
    /** Resolution of the raw dataset, in minutes (1 or 1440 today). */
    baseTimeframeMinutes: number;

    /** Raw base-timeframe candles for a given UTC date. */
    loadDay(date: Date): Promise<Candle[]>;

    /**
     * Candles a replay session should start with for the selected date.
     * Intraday sources return that UTC day; daily sources return the selected
     * day and the following bars (up to a safe window) so playback can move
     * forward across trading days.
     */
    loadReplayWindow(date: Date): Promise<Candle[]>;

    /** The entire ordered base-timeframe dataset, including history fields. */
    loadAll(): Promise<Candle[]>;

    /**
     * Candles aggregated to `timeframe` minutes, from the start of the
     * dataset up to (but not including) the given UTC date.
     */
    getHistory(date: Date, timeframe: number, maxCandles?: number): Promise<Candle[]>;

    /** UTC‑aligned date range covered by the whole dataset. */
    getRange(): Promise<DataRange>;
}
