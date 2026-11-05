import type { LineData, UTCTimestamp } from "lightweight-charts";
import type { PriceData } from "@/types/priceData";

/**
 * Simple average true range, matching the backtest helpers. Most charting
 * platforms call the Wilder-smoothed version "ATR", but the strategies use a
 * plain average of the last `period` true ranges.
 */
export class ATRIndicator {
    private readonly period: number;
    private previousClose?: number;
    private readonly trueRanges: number[] = [];
    private sum = 0;

    private readonly data: LineData<UTCTimestamp>[] = [];

    constructor(period: number, initialData: PriceData[] = []) {
        this.period = Math.max(2, Math.floor(period));

        for (const candle of initialData) {
            this.update(candle);
        }
    }

    update(candle: PriceData): LineData<UTCTimestamp> | null {
        if (this.previousClose === undefined) {
            this.previousClose = candle.Price;
            return null;
        }

        const trueRange = Math.max(
            candle.High - candle.Low,
            Math.abs(candle.High - this.previousClose),
            Math.abs(candle.Low - this.previousClose),
        );

        this.previousClose = candle.Price;
        this.trueRanges.push(trueRange);
        this.sum += trueRange;

        if (this.trueRanges.length > this.period) {
            this.sum -= this.trueRanges.shift()!;
        }

        if (this.trueRanges.length < this.period) {
            return null;
        }

        const point: LineData<UTCTimestamp> = {
            time: candle.Time,
            value: this.sum / this.period,
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
        this.previousClose = undefined;
        this.trueRanges.length = 0;
        this.sum = 0;
        this.data.length = 0;

        for (const candle of initialData) {
            this.update(candle);
        }
    }
}
