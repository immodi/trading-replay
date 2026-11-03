import type { Candle } from "@/types/candle";
import { bucketStart } from "@/utils/candleBucket";
import { formatUtcDateTime } from "./range";
import type { DataQualityIssue, DataQualityReport } from "./types";

const DISCONTINUITY_PCT = 5;
const SAMPLE_LIMIT = 20;

interface IssueCounter {
    count: number;
    samples: number[];
}

function bump(counter: IssueCounter, time: number): void {
    counter.count += 1;

    if (Number.isFinite(time) && counter.samples.length < SAMPLE_LIMIT) {
        counter.samples.push(time);
    }
}

function toIssue(
    type: string,
    message: string,
    counter: IssueCounter,
): DataQualityIssue | null {
    if (counter.count === 0) return null;

    const first = counter.samples[0];
    const samples = counter.samples.slice(0, 5).map((time) => ({
        time,
        timeISO: formatUtcDateTime(time),
    }));

    return {
        type,
        message:
            counter.count === 1
                ? message
                : `${message} (${counter.count} occurrences)`,
        ...(first === undefined
            ? {}
            : { time: first, timeISO: formatUtcDateTime(first) }),
        ...(samples.length === 0 ? {} : { samples }),
        count: counter.count,
    };
}

export function analyzeDataQuality(
    candles: Candle[],
    startTs: number,
    endTsExclusive: number,
    timeframeMinutes: number,
): DataQualityReport {
    const nonFinite: IssueCounter = { count: 0, samples: [] };
    const invalidOhlc: IssueCounter = { count: 0, samples: [] };
    const nonIncreasing: IssueCounter = { count: 0, samples: [] };
    const gaps: IssueCounter = { count: 0, samples: [] };
    const discontinuities: IssueCounter = { count: 0, samples: [] };
    const partialBuckets: IssueCounter = { count: 0, samples: [] };

    let baseBarsInRange = 0;
    let previous: Candle | null = null;
    let firstDiscontinuityDetail: string | null = null;
    const bucketCounts = new Map<number, number>();

    for (const candle of candles) {
        const values = [
            candle.time,
            candle.open,
            candle.high,
            candle.low,
            candle.close,
            candle.volume,
        ];

        if (!values.every((value) => Number.isFinite(value))) {
            bump(
                nonFinite,
                Number.isFinite(candle.time) ? candle.time : Number.NaN,
            );
            previous = candle;
            continue;
        }

        if (candle.time >= startTs && candle.time < endTsExclusive) {
            baseBarsInRange += 1;
        }

        if (
            candle.high < Math.max(candle.open, candle.close) ||
            candle.low > Math.min(candle.open, candle.close) ||
            candle.high < candle.low
        ) {
            bump(invalidOhlc, candle.time);
        }

        if (timeframeMinutes > 1) {
            const bucket = bucketStart(candle.time, timeframeMinutes);
            bucketCounts.set(bucket, (bucketCounts.get(bucket) ?? 0) + 1);
        }

        if (previous) {
            if (candle.time <= previous.time) {
                bump(nonIncreasing, candle.time);
            } else if (candle.time - previous.time > 60) {
                bump(gaps, candle.time);
            }

            if (previous.close !== 0) {
                const changePct =
                    Math.abs((candle.close - previous.close) / previous.close) *
                    100;

                if (changePct > DISCONTINUITY_PCT) {
                    bump(discontinuities, candle.time);

                    if (firstDiscontinuityDetail === null) {
                        firstDiscontinuityDetail = `previous close ${previous.close}, current open ${candle.open}, current close ${candle.close}, change ${changePct.toFixed(2)}%`;
                    }
                }
            }
        }

        previous = candle;
    }

    if (timeframeMinutes > 1) {
        for (const [bucket, count] of bucketCounts) {
            if (count < timeframeMinutes) {
                bump(partialBuckets, bucket);
            }
        }
    }

    const hardErrors = [
        toIssue(
            "non_finite_values",
            "Candle contains a non-finite timestamp or OHLCV value.",
            nonFinite,
        ),
        toIssue(
            "invalid_ohlc",
            "Candle violates high/low OHLC bounds.",
            invalidOhlc,
        ),
        toIssue(
            "non_increasing_timestamps",
            "Candle timestamps are duplicate or not increasing.",
            nonIncreasing,
        ),
    ].filter((issue): issue is DataQualityIssue => issue !== null);

    const discontinuityIssue = toIssue(
        "price_discontinuity",
        `Adjacent close changed by more than ${DISCONTINUITY_PCT}%.`,
        discontinuities,
    );

    if (discontinuityIssue && firstDiscontinuityDetail !== null) {
        discontinuityIssue.message += ` Example: ${firstDiscontinuityDetail}.`;
    }

    const warnings = [
        toIssue(
            "timestamp_gap",
            "Timestamp gap between adjacent base candles.",
            gaps,
        ),
        discontinuityIssue,
        toIssue(
            "partial_aggregate",
            "Higher-timeframe bucket has fewer than the expected number of base bars.",
            partialBuckets,
        ),
    ].filter((issue): issue is DataQualityIssue => issue !== null);

    return {
        baseBarsInRange,
        baseBarsProcessed: candles.length,
        strategyBarsProcessed: 0,
        inRangeStrategyBars: 0,
        warnings,
        hardErrors,
    };
}
