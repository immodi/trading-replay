import { STORAGE_SCHEMA_VERSION, sessionStoreKey } from "@/constants/storage";
import { createDefaultView } from "@/constants/workspace";
import { getStore, type Store } from "@/store/store";
import type { IndicatorSettings } from "@/types/indicator";
import type {
    PersistedPlayback,
    PersistedSessionState,
    PersistedView,
} from "@/types/persistedSession";
import type { Position } from "@/types/position";
import type { PositionParamters } from "@/types/positionParamters";
import type { SessionTrade } from "@/types/session";

export function createEmptySessionState(instrument = ""): PersistedSessionState {
    return {
        instrument,
        trades: [],
        positions: [],
        removedTradeIds: [],
        playback: {
            date: "",
            index: 0,
            direction: "forward",
            isPlaying: false,
        },
        view: createDefaultView(),
        tradesUpdatedAt: 0,
        lastExportedAt: null,
        updatedAt: 0,
    };
}

/* ------------------------------------------------------------------ */
/* Hydration                                                        */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isSessionTrade(value: unknown): value is SessionTrade {
    return (
        isRecord(value) &&
        typeof value.id === "string" &&
        typeof value.entryTime === "number" &&
        typeof value.exitTime === "number"
    );
}

function isPosition(value: unknown): value is Position {
    return (
        isRecord(value) &&
        typeof value.id === "string" &&
        typeof value.side === "string" &&
        typeof value.entryTime === "number"
    );
}

function normalisePlayback(
    value: unknown,
    fallback: PersistedPlayback,
): PersistedPlayback {
    if (!isRecord(value)) return fallback;

    return {
        date: typeof value.date === "string" ? value.date : fallback.date,
        index: Math.max(0, Math.floor(finiteNumber(value.index, fallback.index))),
        direction:
            value.direction === "forward" || value.direction === "backward"
                ? value.direction
                : fallback.direction,
        isPlaying:
            typeof value.isPlaying === "boolean"
                ? value.isPlaying
                : fallback.isPlaying,
    };
}

function normaliseIndicatorSettings(
    value: unknown,
    fallback: IndicatorSettings,
): IndicatorSettings {
    if (!isRecord(value)) return fallback;

    const vwap = isRecord(value.vwap) ? value.vwap : {};
    const ema = isRecord(value.ema) ? value.ema : {};
    const sma = isRecord(value.sma) ? value.sma : {};

    return {
        vwap: {
            enabled:
                typeof vwap.enabled === "boolean"
                    ? vwap.enabled
                    : fallback.vwap.enabled,
            color:
                typeof vwap.color === "string" ? vwap.color : fallback.vwap.color,
        },
        ema: {
            enabled:
                typeof ema.enabled === "boolean"
                    ? ema.enabled
                    : fallback.ema.enabled,
            color: typeof ema.color === "string" ? ema.color : fallback.ema.color,
            period: finiteNumber(ema.period, fallback.ema.period),
        },
        sma: {
            enabled:
                typeof sma.enabled === "boolean"
                    ? sma.enabled
                    : fallback.sma.enabled,
            color: typeof sma.color === "string" ? sma.color : fallback.sma.color,
            period: finiteNumber(sma.period, fallback.sma.period),
        },
    };
}

function normalisePositionParameters(
    value: unknown,
    fallback: PositionParamters,
): PositionParamters {
    if (!isRecord(value)) return fallback;

    return {
        stopLossPoints: finiteNumber(value.stopLossPoints, fallback.stopLossPoints),
        takeProfitPoints: finiteNumber(
            value.takeProfitPoints,
            fallback.takeProfitPoints,
        ),
        quantity: Math.max(1, finiteNumber(value.quantity, fallback.quantity)),
        bracket:
            typeof value.bracket === "boolean" ? value.bracket : fallback.bracket,
    };
}

function normaliseView(value: unknown, fallback: PersistedView): PersistedView {
    if (!isRecord(value)) return fallback;

    return {
        timeframeMinutes: Math.max(
            1,
            finiteNumber(value.timeframeMinutes, fallback.timeframeMinutes),
        ),
        speed: Math.max(1, finiteNumber(value.speed, fallback.speed)),
        indicatorSettings: normaliseIndicatorSettings(
            value.indicatorSettings,
            fallback.indicatorSettings,
        ),
        positionParameters: normalisePositionParameters(
            value.positionParameters,
            fallback.positionParameters,
        ),
    };
}

/** Validate and fill defaults for a stored session payload. */
export function normaliseSessionState(
    data: unknown,
    instrumentFallback: string,
): PersistedSessionState | null {
    if (!isRecord(data)) return null;

    const defaults = createEmptySessionState(
        typeof data.instrument === "string"
            ? data.instrument
            : instrumentFallback,
    );

    return {
        instrument: defaults.instrument,
        trades: Array.isArray(data.trades)
            ? data.trades.filter(isSessionTrade)
            : [],
        positions: Array.isArray(data.positions)
            ? data.positions.filter(isPosition)
            : [],
        removedTradeIds: Array.isArray(data.removedTradeIds)
            ? data.removedTradeIds.filter(
                  (id): id is string => typeof id === "string",
              )
            : [],
        playback: normalisePlayback(data.playback, defaults.playback),
        view: normaliseView(data.view, defaults.view),
        tradesUpdatedAt: Math.max(
            0,
            finiteNumber(data.tradesUpdatedAt, defaults.tradesUpdatedAt),
        ),
        lastExportedAt:
            typeof data.lastExportedAt === "number"
                ? data.lastExportedAt
                : null,
        updatedAt: Math.max(0, finiteNumber(data.updatedAt, defaults.updatedAt)),
    };
}

/* ------------------------------------------------------------------ */
/* Store                                                             */
/* ------------------------------------------------------------------ */

/**
 * Singleton store for one source. The key is derived from the source id, so
 * swapping sources (or refreshing) yields an independent, restorable session.
 */
export function getSessionStore(
    sourceId: string,
    instrument: string,
): Store<PersistedSessionState> {
    return getStore<PersistedSessionState>({
        key: sessionStoreKey(sourceId),
        initial: () => createEmptySessionState(instrument),
        version: STORAGE_SCHEMA_VERSION,
        migrate: (data) => normaliseSessionState(data, instrument),
        // Playback writes on every tick; trade/position writes flush promptly
        // enough with this throttle.
        debounceMs: 250,
    });
}
