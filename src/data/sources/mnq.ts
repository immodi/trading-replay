import { createCandleSource } from "@/data/sources/candleSource";
import type { CandleSourceConfig } from "@/types/candleSource";

/** MNQ — Micro E‑mini Nasdaq‑100, continuous 1‑minute dataset. */
export const MNQ_CONFIG: CandleSourceConfig = {
    id: "mnq",
    symbol: "MNQ",
    /** Dollar value of one index point, per contract. */
    pointValue: 2,
    fileName: "mnq-1m.json",
};

/** The app's default candle source. */
export const mnqSource = createCandleSource(MNQ_CONFIG);
