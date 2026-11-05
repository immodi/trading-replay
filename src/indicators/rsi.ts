import type { LineData, UTCTimestamp } from "lightweight-charts";
import type { PriceData } from "@/types/priceData";

/**
 * Wilder RSI. The replay engine feeds candles incrementally, so the class keeps
 * the previous close and the smoothed average gain/loss between updates.
 */
export class RSIIndicator {
    private readonly period: number;
    private previousClose?: number;

    private averageGain = 0;
    private averageLoss = 0;
    private seedGain = 0;
    private seedLoss = 0;
    private seedCount = 0;
    private initialized = false;

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

        const change = candle.Price - this.previousClose;
        this.previousClose = candle.Price;

        const gain = change > 0 ? change : 0;
        const loss = change < 0 ? -change : 0;

        if (!this.initialized) {
            this.seedGain += gain;
            this.seedLoss += loss;
            this.seedCount += 1;

            if (this.seedCount < this.period) {
                return null;
            }

            this.averageGain = this.seedGain / this.period;
            this.averageLoss = this.seedLoss / this.period;
            this.initialized = true;
        } else {
            this.averageGain =
                (this.averageGain * (this.period - 1) + gain) / this.period;
            this.averageLoss =
                (this.averageLoss * (this.period - 1) + loss) / this.period;
        }

        const value =
            this.averageLoss === 0
                ? this.averageGain === 0
                    ? 50
                    : 100
                : 100 - 100 / (1 + this.averageGain / this.averageLoss);

        const point: LineData<UTCTimestamp> = {
            time: candle.Time,
            value,
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
        this.averageGain = 0;
        this.averageLoss = 0;
        this.seedGain = 0;
        this.seedLoss = 0;
        this.seedCount = 0;
        this.initialized = false;
        this.data.length = 0;

        for (const candle of initialData) {
            this.update(candle);
        }
    }
}
