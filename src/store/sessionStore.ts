import { STORAGE_SCHEMA_VERSION, sessionStoreKey } from "@/constants/storage";
import {
    DEFAULT_INDICATOR_LINE_STYLE,
    DEFAULT_INDICATOR_LINE_WIDTH,
    INDICATOR_COLORS,
    indicatorCatalogEntry,
} from "@/constants/indicators";
import { isChartTimezone } from "@/constants/timezone";
import { createDefaultView } from "@/constants/workspace";
import { getStore, type Store } from "@/store/store";
import type { IndicatorConfig, IndicatorType } from "@/types/indicator";
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

const LEGACY_INDICATOR_TYPES: IndicatorType[] = ["vwap", "ema", "sma"];
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function normaliseColor(value: unknown, fallback: string): string {
    return typeof value === "string" && HEX_COLOR.test(value)
        ? value
        : fallback;
}

function normaliseIndicator(
    value: unknown,
    index: number,
): IndicatorConfig | null {
    if (!isRecord(value)) return null;

    const type = value.type;
    if (
        type !== "vwap" &&
        type !== "vwap-bands" &&
        type !== "ema" &&
        type !== "sma" &&
        type !== "rsi" &&
        type !== "atr"
    ) {
        return null;
    }

    const entry = indicatorCatalogEntry(type);
    const minimumPeriod =
        type === "vwap" || type === "vwap-bands" ? 0 : 1;

    return {
        id:
            typeof value.id === "string" && value.id.length > 0
                ? value.id
                : `${type}-${index + 1}`,
        type,
        enabled:
            typeof value.enabled === "boolean" ? value.enabled : true,
        color: normaliseColor(
            value.color,
            INDICATOR_COLORS[index % INDICATOR_COLORS.length],
        ),
        period: Math.max(
            minimumPeriod,
            Math.floor(finiteNumber(value.period, entry.defaultPeriod)),
        ),
        lineWidth:
            value.lineWidth === 1 ||
            value.lineWidth === 2 ||
            value.lineWidth === 3 ||
            value.lineWidth === 4
                ? value.lineWidth
                : DEFAULT_INDICATOR_LINE_WIDTH,
        lineStyle:
            value.lineStyle === "solid" ||
            value.lineStyle === "dashed" ||
            value.lineStyle === "dotted"
                ? value.lineStyle
                : DEFAULT_INDICATOR_LINE_STYLE,
    };
}

/** Upgrade the one-instance-per-type object into the current array model. */
function normaliseLegacyIndicators(
    value: Record<string, unknown>,
): IndicatorConfig[] {
    return LEGACY_INDICATOR_TYPES.flatMap((type) => {
        const stored = value[type];
        if (!isRecord(stored)) return [];

        const indicator = normaliseIndicator({ ...stored, type }, 0);
        return indicator ? [{ ...indicator, id: type }] : [];
    });
}

function normaliseIndicators(
    value: unknown,
    fallback: IndicatorConfig[],
): IndicatorConfig[] {
    // Current shape: an ordered list of indicator instances.
    if (Array.isArray(value)) {
        const seen = new Set<string>();
        const indicators: IndicatorConfig[] = [];

        value.forEach((stored, index) => {
            const indicator = normaliseIndicator(stored, index);
            if (!indicator) return;

            let id = indicator.id;
            let duplicate = 2;
            while (seen.has(id)) {
                id = `${indicator.id}-${duplicate}`;
                duplicate += 1;
            }

            seen.add(id);
            indicators.push(id === indicator.id ? indicator : { ...indicator, id });
        });

        return indicators;
    }

    // Previous shape: one object with `vwap`/`ema`/`sma` entries.
    if (isRecord(value)) return normaliseLegacyIndicators(value);

    return fallback;
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
        chartTimezone: isChartTimezone(value.chartTimezone)
            ? value.chartTimezone
            : fallback.chartTimezone,
        activeStrategyPanel:
            value.activeStrategyPanel === null ||
            typeof value.activeStrategyPanel === "string"
                ? value.activeStrategyPanel
                : fallback.activeStrategyPanel,
        indicators: normaliseIndicators(
            value.indicators !== undefined
                ? value.indicators
                : value.indicatorSettings,
            fallback.indicators,
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
