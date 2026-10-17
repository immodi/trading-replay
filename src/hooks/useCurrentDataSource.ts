import { mnqSource } from "@/data/sources/mnq";
import type { Candle } from "@/types/candle";
import type { CandleSource } from "@/types/candleSource";
import type { DataRange } from "@/types/dateRange";
import { useEffect, useState } from "react";

function toError(err: unknown): Error {
    return err instanceof Error ? err : new Error(String(err));
}

/** Loads the active candle source and exposes its data for the replay engine. */
export function useCurrentDataSource(
    timeFrameMinutes: number,
    source: CandleSource = mnqSource,
) {
    const [currentDate, setCurrentDate] = useState<Date | null>(null);
    const [dataRange, setDataRange] = useState<DataRange | null>(null);
    const [candleData, setCandleData] = useState<Candle[] | null>(null);
    const [aggregatedCandleHistory, setAggregatedCandleHistory] = useState<Candle[]>([]);
    const [error, setError] = useState<Error | null>(null);

    // Resolve the dataset's date range once per source
    useEffect(() => {
        let cancelled = false;

        async function load() {
            try {
                const range = await source.getRange();
                if (cancelled) return;

                setError(null);
                setDataRange(range);
                setCurrentDate(range.start);
            } catch (err) {
                if (!cancelled) setError(toError(err));
            }
        }

        load();
        return () => {
            cancelled = true;
        };
    }, [source]);

    // Raw 1‑minute candles for the selected date
    useEffect(() => {
        if (!dataRange || !currentDate) return;
        const date = currentDate;
        let cancelled = false;

        async function load() {
            try {
                const raw = await source.loadDay(date);
                if (cancelled) return;

                setError(null);
                setCandleData(raw);
            } catch (err) {
                if (!cancelled) setError(toError(err));
            }
        }

        load();
        return () => {
            cancelled = true;
        };
    }, [currentDate, dataRange, source]);

    // Aggregated history: candles before the selected date
    useEffect(() => {
        if (!dataRange || !currentDate) return;
        const date = currentDate;
        let cancelled = false;

        async function load() {
            try {
                const history = await source.getHistory(date, timeFrameMinutes, 2000);
                if (cancelled) return;

                setError(null);
                setAggregatedCandleHistory(history);
            } catch (err) {
                if (!cancelled) setError(toError(err));
            }
        }

        load();
        return () => {
            cancelled = true;
        };
    }, [currentDate, timeFrameMinutes, dataRange, source]);

    return {
        setCurrentDate,
        dataRange,
        candleData,
        aggregatedCandleHistory,
        pointValue: source.pointValue,
        commission: source.commission ?? 0,
        error,
    };
}
