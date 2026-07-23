import type { UTCTimestamp } from "lightweight-charts";

export type PriceData = {
    Price: number;
    Time: UTCTimestamp;
    High: number;
    Low: number;
}
