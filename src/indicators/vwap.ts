import type { LineData, UTCTimestamp } from "lightweight-charts";
import type { PriceData } from "@/types/priceData";

export class VWAPIndicator {
    private cumulativePV = 0;
    private cumulativeVolume = 0;
    private readonly data: LineData<UTCTimestamp>[] = [];

    constructor(initialData: PriceData[] = []) {
        for (const candle of initialData) {
            this.update(candle);
        }
    }

    update(candle: PriceData): LineData<UTCTimestamp> {
        const typicalPrice =
            (candle.High + candle.Low + candle.Price) / 3;

        this.cumulativePV += typicalPrice * candle.Volume;
        this.cumulativeVolume += candle.Volume;

        const point: LineData<UTCTimestamp> = {
            time: candle.Time,
            value: this.cumulativePV / this.cumulativeVolume,
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
        this.cumulativePV = 0;
        this.cumulativeVolume = 0;
        this.data.length = 0;

        for (const candle of initialData) {
            this.update(candle);
        }
    }
}
