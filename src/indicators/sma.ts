import type { LineData, UTCTimestamp } from "lightweight-charts";
import type { PriceData } from "@/types/priceData";

export class SMAIndicator {
    private readonly period: number;
    private readonly prices: number[] = [];
    private readonly data: LineData<UTCTimestamp>[] = [];
    private sum = 0;

    constructor(period: number, initialData: PriceData[] = []) {
        this.period = period;

        for (const candle of initialData) {
            this.update(candle);
        }
    }

    update(candle: PriceData): LineData<UTCTimestamp> | null {
        this.prices.push(candle.Price);
        this.sum += candle.Price;

        if (this.prices.length > this.period) {
            this.sum -= this.prices.shift()!;
        }

        if (this.prices.length < this.period) {
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
        this.prices.length = 0;
        this.data.length = 0;
        this.sum = 0;

        for (const candle of initialData) {
            this.update(candle);
        }
    }
}
