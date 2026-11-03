export const metadata = {
    apiVersion: 1,
    id: "sma-cross",
    name: "SMA Cross (example)",
    version: "1.0.0",
    description:
        "Simple SMA crossover example. Signals are evaluated after a bar closes and fill at the next bar open. It is not a recommended or profitable strategy.",
    warmupBars: 50,
    maxLookbackBars: 1001,
    parameters: [
        {
            key: "period",
            label: "SMA period",
            type: "number",
            default: 20,
            min: 2,
            max: 500,
            step: 1,
        },
        {
            key: "riskDollars",
            label: "Risk per trade ($)",
            type: "number",
            default: 100,
            min: 1,
            max: 100000,
            step: 1,
        },
        {
            key: "stopLossPoints",
            label: "Stop loss (points)",
            type: "number",
            default: 20,
            min: 0.25,
            max: 1000,
            step: 0.25,
        },
        {
            key: "takeProfitPoints",
            label: "Take profit (points)",
            type: "number",
            default: 40,
            min: 0.25,
            max: 2000,
            step: 0.25,
        },
    ],
};

function average(values) {
    if (values.length === 0) return null;
    return values.reduce((total, value) => total + value, 0) / values.length;
}

export function createStrategy({ params, instrument }) {
    return {
        onBar(context) {
            const bars = context.history.last(params.period + 1);

            if (bars.length < params.period + 1) return null;

            const currentSma = average(bars.slice(1).map((bar) => bar.close));
            const previousSma = average(
                bars.slice(0, -1).map((bar) => bar.close),
            );

            if (currentSma === null || previousSma === null) return null;

            const currentClose = bars[bars.length - 1].close;
            const previousClose = bars[bars.length - 2].close;

            const crossedUp =
                previousClose <= previousSma && currentClose > currentSma;
            const crossedDown =
                previousClose >= previousSma && currentClose < currentSma;

            if (!crossedUp && !crossedDown) return null;

            // Strategy-controlled position sizing: fixed dollar risk divided by
            // the stop distance and the instrument's dollar value per point.
            const riskPerContract = params.stopLossPoints * instrument.pointValue;
            const rawQuantity = Math.floor(params.riskDollars / riskPerContract);

            if (!Number.isFinite(rawQuantity) || rawQuantity < 1) return null;

            const quantity = Math.min(100, rawQuantity);
            const side = crossedUp ? "long" : "short";
            const existing = context.positions;

            if (existing.length > 0) {
                const alreadySameDirection = existing.some(
                    (position) => position.side === side,
                );

                if (alreadySameDirection) return null;

                return [
                    { type: "exitAll", reason: "sma cross reversed" },
                    {
                        type: "enter",
                        side,
                        quantity,
                        stopLossPoints: params.stopLossPoints,
                        takeProfitPoints: params.takeProfitPoints,
                        tag: "sma-cross",
                    },
                ];
            }

            return {
                type: "enter",
                side,
                quantity,
                stopLossPoints: params.stopLossPoints,
                takeProfitPoints: params.takeProfitPoints,
                tag: "sma-cross",
            };
        },
    };
}
