import type { LineData, UTCTimestamp } from "lightweight-charts";
import type { PriceData } from "@/types/priceData";

export class EMAIndicator {
    private readonly period: number;
    private readonly multiplier: number;

    private ema?: number;
    private readonly seedPrices: number[] = [];
    private readonly data: LineData<UTCTimestamp>[] = [];

    constructor(period: number, initialData: PriceData[] = []) {
        this.period = period;
        this.multiplier = 2 / (period + 1);

        for (const candle of initialData) {
            this.update(candle);
        }
    }

    update(candle: PriceData): LineData<UTCTimestamp> | null {
        if (this.ema === undefined) {
            this.seedPrices.push(candle.Price);

            if (this.seedPrices.length < this.period) {
                return null;
            }

            this.ema =
                this.seedPrices.reduce((sum, price) => sum + price, 0) /
                this.period;
        } else {
            this.ema += (candle.Price - this.ema) * this.multiplier;
        }

        const point: LineData<UTCTimestamp> = {
            time: candle.Time,
            value: this.ema,
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
        this.ema = undefined;
        this.seedPrices.length = 0;
        this.data.length = 0;

        for (const candle of initialData) {
            this.update(candle);
        }
    }
}
