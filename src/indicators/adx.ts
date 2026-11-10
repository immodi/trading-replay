import type { LineData, UTCTimestamp } from "lightweight-charts";

import type { PriceData } from "@/types/priceData";

/**
 * Wilder ADX. The replay engine feeds candles incrementally, so the class keeps
 * the previous high/low/close plus the smoothed directional movement.
 */
export class ADXIndicator {
    private readonly period: number;
    private previousHigh?: number;
    private previousLow?: number;
    private previousClose?: number;

    private trueRangeSum = 0;
    private plusDmSum = 0;
    private minusDmSum = 0;
    private seedCount = 0;

    private smoothedTrueRange: number | null = null;
    private smoothedPlusDm: number | null = null;
    private smoothedMinusDm: number | null = null;

    private dxSeedSum = 0;
    private dxSeedCount = 0;
    private adx: number | null = null;

    private readonly data: LineData<UTCTimestamp>[] = [];

    constructor(period: number, initialData: PriceData[] = []) {
        this.period = Math.max(2, Math.floor(period));

        for (const candle of initialData) {
            this.update(candle);
        }
    }

    update(candle: PriceData): LineData<UTCTimestamp> | null {
        const previousHigh = this.previousHigh;
        const previousLow = this.previousLow;
        const previousClose = this.previousClose;

        if (
            previousHigh === undefined ||
            previousLow === undefined ||
            previousClose === undefined
        ) {
            this.previousHigh = candle.High;
            this.previousLow = candle.Low;
            this.previousClose = candle.Price;
            return null;
        }

        const trueRange = Math.max(
            candle.High - candle.Low,
            Math.abs(candle.High - previousClose),
            Math.abs(candle.Low - previousClose),
        );
        const upMove = candle.High - previousHigh;
        const downMove = previousLow - candle.Low;
        const plusDm = upMove > downMove && upMove > 0 ? upMove : 0;
        const minusDm = downMove > upMove && downMove > 0 ? downMove : 0;

        if (this.smoothedTrueRange === null) {
            this.trueRangeSum += trueRange;
            this.plusDmSum += plusDm;
            this.minusDmSum += minusDm;
            this.seedCount += 1;

            if (this.seedCount === this.period) {
                this.smoothedTrueRange = this.trueRangeSum;
                this.smoothedPlusDm = this.plusDmSum;
                this.smoothedMinusDm = this.minusDmSum;
            }
        } else {
            this.smoothedTrueRange =
                this.smoothedTrueRange -
                this.smoothedTrueRange / this.period +
                trueRange;
            this.smoothedPlusDm =
                this.smoothedPlusDm! -
                this.smoothedPlusDm! / this.period +
                plusDm;
            this.smoothedMinusDm =
                this.smoothedMinusDm! -
                this.smoothedMinusDm! / this.period +
                minusDm;
        }

        this.previousHigh = candle.High;
        this.previousLow = candle.Low;
        this.previousClose = candle.Price;

        if (this.smoothedTrueRange === null || this.smoothedTrueRange === 0) {
            return null;
        }

        const plusDi =
            (100 * this.smoothedPlusDm!) / this.smoothedTrueRange;
        const minusDi =
            (100 * this.smoothedMinusDm!) / this.smoothedTrueRange;
        const diSum = plusDi + minusDi;
        const dx =
            diSum === 0
                ? 0
                : (100 * Math.abs(plusDi - minusDi)) / diSum;

        if (this.adx === null) {
            this.dxSeedSum += dx;
            this.dxSeedCount += 1;

            if (this.dxSeedCount === this.period) {
                this.adx = this.dxSeedSum / this.period;
            }
        } else {
            this.adx = (this.adx * (this.period - 1) + dx) / this.period;
        }

        if (this.adx === null) return null;

        const point: LineData<UTCTimestamp> = {
            time: candle.Time,
            value: this.adx,
        };

        const last = this.data.at(-1);

        if (last?.time === point.time) {
            this.data[this.data.length - 1] = point;
        } else {
            this.data.push(point);
        }

        return point;
    }

    getData(): LineData<UTCTimestamp>[] {
        return this.data;
    }

    reset(initialData: PriceData[] = []) {
        this.previousHigh = undefined;
        this.previousLow = undefined;
        this.previousClose = undefined;
        this.trueRangeSum = 0;
        this.plusDmSum = 0;
        this.minusDmSum = 0;
        this.seedCount = 0;
        this.smoothedTrueRange = null;
        this.smoothedPlusDm = null;
        this.smoothedMinusDm = null;
        this.dxSeedSum = 0;
        this.dxSeedCount = 0;
        this.adx = null;
        this.data.length = 0;

        for (const candle of initialData) {
            this.update(candle);
        }
    }
}
