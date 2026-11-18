import { createCandleSource } from "@/data/sources/candleSource";
import type { CandleSourceConfig } from "@/types/candleSource";

/** MNQ — Micro E‑mini Nasdaq‑100, continuous 1‑minute dataset. */
export const MNQ_CONFIG: CandleSourceConfig = {
    id: "mnq",
    symbol: "MNQ",
    assetClass: "futures",
    currency: "USD",
    /** Dollar value of one index point, per contract. */
    pointValue: 2,
    /** Commission in dollars per contract, per side. */
    commission: 0,
    commissionPercent: 0,
    /** Raw dataset holds one-minute bars. */
    baseTimeframeMinutes: 1,
    fileName: "mnq-1m.json",
};

/** The app's default candle source. */
export const mnqSource = createCandleSource(MNQ_CONFIG);
