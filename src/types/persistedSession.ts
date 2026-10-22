import type { IndicatorSettings } from "@/types/indicator";
import type { PositionParamters } from "@/types/positionParamters";
import type { PlayDirection } from "@/types/replay";
import type { SessionTrade } from "@/types/session";
import type { Position } from "@/types/position";

/** Replay position and transport state, persisted so a refresh resumes here. */
export type PersistedPlayback = {
    /** ISO 8601 timestamp of the UTC day being replayed, or `""` when unset. */
    date: string;
    /** Index into the raw 1‑minute candles of that day. */
    index: number;
    direction: PlayDirection;
    /**
     * Persisted for completeness, but playback is intentionally restored
     * paused: auto-playing on page load is surprising.
     */
    isPlaying: boolean;
};

/** Chart/trading preferences that belong to one source. */
export type PersistedView = {
    timeframeMinutes: number;
    speed: number;
    indicatorSettings: IndicatorSettings;
    positionParameters: PositionParamters;
};

/**
 * Everything stored for a single source. Trades and positions are kept
 * together so a refresh restores a consistent snapshot.
 */
export type PersistedSessionState = {
    instrument: string;
    trades: SessionTrade[];
    positions: Position[];
    /** Trades the user removed; their closed positions must not re-record. */
    removedTradeIds: string[];
    playback: PersistedPlayback;
    view: PersistedView;

    /**
     * When the trades list last changed. Kept separate from `updatedAt`
     * because playback/view writes must not mark the session as unexported.
     */
    tradesUpdatedAt: number;
    lastExportedAt: number | null;
    updatedAt: number;
};
