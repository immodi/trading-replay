import type { LineData, UTCTimestamp } from "lightweight-charts";
import type { PriceData } from "@/types/priceData";

export type VWAPBandsData = {
    vwap: LineData<UTCTimestamp>[];
    upper: LineData<UTCTimestamp>[];
    lower: LineData<UTCTimestamp>[];
};

export type VWAPBandPoint = {
    time: UTCTimestamp;
    vwap: number;
    upper: number;
    lower: number;
    standardDeviation: number;
};

type Contribution = {
    time: UTCTimestamp;
    pv: number;
    pv2: number;
    volume: number;
};

function upsert(
    data: LineData<UTCTimestamp>[],
    point: LineData<UTCTimestamp>,
): void {
    const last = data.at(-1);

    if (last?.time === point.time) {
        data[data.length - 1] = point;
    } else {
        data.push(point);
    }
}

/**
 * Session-anchored VWAP with volume-weighted standard deviation bands.
 *
 * Both the VWAP and the variance are accumulated online, so the indicator can
 * be fed candles one at a time while replaying. Typical price is used for each
 * candle, matching the plain VWAP indicator.
 */
export class VWAPBandsIndicator {
    private readonly multiplier: number;
    private cumulativePV = 0;
    private cumulativePV2 = 0;
    private cumulativeVolume = 0;
    private lastContribution?: Contribution;

    private readonly data: VWAPBandsData = {
        vwap: [],
        upper: [],
        lower: [],
    };

    constructor(multiplier = 2, initialData: PriceData[] = []) {
        this.multiplier =
            Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 2;

        for (const candle of initialData) {
            this.update(candle);
        }
    }

    update(candle: PriceData): VWAPBandPoint {
        // Replay can revise the most recent candle. Remove its old contribution
        // first so the cumulative sums never count the same bar twice.
        const previous = this.lastContribution;

        if (previous?.time === candle.Time) {
            this.cumulativePV -= previous.pv;
            this.cumulativePV2 -= previous.pv2;
            this.cumulativeVolume -= previous.volume;
        }

        const typicalPrice =
            (candle.High + candle.Low + candle.Price) / 3;
        const volume = candle.Volume;
        const pv = typicalPrice * volume;
        const pv2 = typicalPrice * typicalPrice * volume;

        this.cumulativePV += pv;
        this.cumulativePV2 += pv2;
        this.cumulativeVolume += volume;
        this.lastContribution = {
            time: candle.Time,
            pv,
            pv2,
            volume,
        };

        const vwap =
            this.cumulativeVolume > 0
                ? this.cumulativePV / this.cumulativeVolume
                : typicalPrice;
        const variance =
            this.cumulativeVolume > 0
                ? Math.max(
                      0,
                      this.cumulativePV2 / this.cumulativeVolume -
                          vwap * vwap,
                  )
                : 0;
        const standardDeviation = Math.sqrt(variance);
        const point: VWAPBandPoint = {
            time: candle.Time,
            vwap,
            upper: vwap + standardDeviation * this.multiplier,
            lower: vwap - standardDeviation * this.multiplier,
            standardDeviation,
        };

        upsert(this.data.vwap, { time: point.time, value: point.vwap });
        upsert(this.data.upper, { time: point.time, value: point.upper });
        upsert(this.data.lower, { time: point.time, value: point.lower });

        return point;
    }

    getData(): VWAPBandsData {
        return this.data;
    }

    reset(initialData: PriceData[] = []) {
        this.cumulativePV = 0;
        this.cumulativePV2 = 0;
        this.cumulativeVolume = 0;
        this.lastContribution = undefined;
        this.data.vwap.length = 0;
        this.data.upper.length = 0;
        this.data.lower.length = 0;

        for (const candle of initialData) {
            this.update(candle);
        }
    }
}
