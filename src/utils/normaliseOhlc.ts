export type OhlcBounds = {
    open: number;
    high: number;
    low: number;
    close: number;
};

/**
 * Investing.com daily rows occasionally put open/close a cent outside the
 * reported high/low. Expand the bounds so the candle is internally consistent
 * without changing any observed prices.
 */
export function normaliseOhlc<T extends OhlcBounds>(candle: T): T {
    const high = Math.max(
        candle.open,
        candle.high,
        candle.low,
        candle.close,
    );
    const low = Math.min(
        candle.open,
        candle.high,
        candle.low,
        candle.close,
    );

    if (high === candle.high && low === candle.low) {
        return candle;
    }

    return { ...candle, high, low };
}
