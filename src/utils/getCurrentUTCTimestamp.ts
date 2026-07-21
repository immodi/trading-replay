import type { UTCTimestamp } from "lightweight-charts";

export function getCurrentUTCTimestamp(): UTCTimestamp {
    return Math.floor(Date.now() / 1000) as UTCTimestamp;
}
