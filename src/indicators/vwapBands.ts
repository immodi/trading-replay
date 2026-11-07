import type { LineData, UTCTimestamp } from "lightweight-charts";
import type { PriceData } from "@/types/priceData";

/** Standard VWAP band widths: one, two, and three standard deviations. */
export const VWAP_BAND_MULTIPLIERS = [1, 2, 3] as const;

export type VWAPBandLine = {
    multiplier: number;
    upper: LineData<UTCTimestamp>[];
    lower: LineData<UTCTimestamp>[];
};

export type VWAPBandsData = {
    vwap: LineData<UTCTimestamp>[];
    bands: VWAPBandLine[];
};

export type VWAPBandPoint = {
    time: UTCTimestamp;
    vwap: number;
    standardDeviation: number;
    bands: Array<{
        multiplier: number;
        upper: number;
        lower: number;
    }>;
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
    private cumulativePV = 0;
    private cumulativePV2 = 0;
    private cumulativeVolume = 0;
    private lastContribution?: Contribution;

    private readonly data: VWAPBandsData = {
        vwap: [],
        bands: VWAP_BAND_MULTIPLIERS.map((multiplier) => ({
            multiplier,
            upper: [],
            lower: [],
        })),
    };

    constructor(initialData: PriceData[] = []) {
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
        const bands = this.data.bands.map((band) => {
            const upper =
                vwap + standardDeviation * band.multiplier;
            const lower =
                vwap - standardDeviation * band.multiplier;

            upsert(band.upper, { time: candle.Time, value: upper });
            upsert(band.lower, { time: candle.Time, value: lower });

            return {
                multiplier: band.multiplier,
                upper,
                lower,
            };
        });
        const point: VWAPBandPoint = {
            time: candle.Time,
            vwap,
            standardDeviation,
            bands,
        };

        upsert(this.data.vwap, { time: candle.Time, value: vwap });

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

        for (const band of this.data.bands) {
            band.upper.length = 0;
            band.lower.length = 0;
        }

        for (const candle of initialData) {
            this.update(candle);
        }
    }
}
