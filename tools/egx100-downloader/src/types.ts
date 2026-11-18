export type DailyBar = {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
};

export type ComponentStock = {
    name: string;
    slug: string;
    url: string;
};

export type StockMetadata = {
    slug: string;
    name: string;
    ticker: string;
    firstDate: string | null;
    lastDate: string | null;
    rows: number;
};

export type ManifestEntry = {
    symbol: string;
    name: string;
    slug: string;
    fileName: string;
    assetClass: "stock";
    currency: string;
    pointValue: number;
    commission: number;
    baseTimeframeMinutes: number;
    rows: number;
    firstDate: string | null;
    lastDate: string | null;
    updatedAt: string;
};

export type Manifest = {
    app: "TradeReplay EGX100 downloader";
    schemaVersion: 1;
    generatedAt: string;
    source: string;
    stocks: ManifestEntry[];
    lastRun?: {
        mode: "full" | "append";
        startedAt: string;
        finishedAt: string;
        failures: Array<{ symbol: string; message: string }>;
    };
};
