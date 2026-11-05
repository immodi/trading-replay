import { useMemo, useState } from "react";

import type { PriceData } from "@/types/priceData";
import {
    analyzeFadeBars,
    FADE_PROFILES,
    type FadeCheckResult,
    type FadeProfileId,
    type FadeSide,
} from "@/utils/fadeCheck";
import {
    StrategyCheckPanel,
    type StrategyCheckCondition,
    type StrategyCheckMetric,
} from "./StrategyCheckPanel";

type FadeCheckPanelProps = {
    bars: PriceData[];
    timeframeMinutes: number;
    pointValue: number;
    commissionRoundTrip: number;
    instrumentLabel: string;
    profile: FadeProfileId;
    canPlaceTrade?: boolean;
    onPlaceTrade?: (order: {
        side: FadeSide;
        quantity: number;
        stopLoss: number;
        takeProfit: number;
    }) => void;
};

function fadeMetrics(result: FadeCheckResult): StrategyCheckMetric[] {
    return [
        {
            label: "Range",
            value:
                result.rangeHigh !== null && result.rangeLow !== null
                    ? `${result.rangeLow.toFixed(2)} – ${result.rangeHigh.toFixed(2)}`
                    : "—",
        },
        {
            label: "Width / ATR",
            value:
                result.widthAtr === null
                    ? "—"
                    : `${result.widthAtr.toFixed(2)}×`,
        },
        {
            label: "Touches",
            value: `${result.highTouches}H / ${result.lowTouches}L`,
        },
        {
            label: "RSI",
            value:
                result.currentRsi === null
                    ? "—"
                    : result.currentRsi.toFixed(1),
        },
        {
            label: "Divergence",
            value:
                result.divergence === null
                    ? "—"
                    : `${result.divergence > 0 ? "+" : ""}${result.divergence.toFixed(1)}`,
        },
        {
            label: "Stop / ATR",
            value:
                result.stopAtr === null
                    ? "—"
                    : `${result.stopAtr.toFixed(2)}×`,
        },
        {
            label: "Stop pts",
            value:
                result.stopDistance === null
                    ? "—"
                    : result.stopDistance.toFixed(2),
        },
        {
            label: "Target",
            value:
                result.targetPrice === null
                    ? "—"
                    : result.targetPrice.toFixed(2),
        },
        {
            label: "Contracts",
            value: String(result.contracts),
        },
    ];
}

function fadeConditions(result: FadeCheckResult): StrategyCheckCondition[] {
    return result.conditions.map((condition) => ({
        key: condition.key,
        label: condition.label,
        pass: condition.pass,
        detail: condition.detail,
    }));
}

export function FadeCheckPanel({
    bars,
    timeframeMinutes,
    pointValue,
    commissionRoundTrip,
    instrumentLabel,
    profile,
    canPlaceTrade = true,
    onPlaceTrade,
}: FadeCheckPanelProps) {
    const [riskBudget, setRiskBudget] = useState(800);
    const [maxContracts, setMaxContracts] = useState(20);
    const profileConfig = FADE_PROFILES[profile];

    const result = useMemo(() => {
        if (timeframeMinutes !== 5) return null;

        return analyzeFadeBars(bars, {
            pointValue,
            riskBudget,
            maxContracts,
            commissionRoundTrip,
            profile: profileConfig,
        });
    }, [
        bars,
        timeframeMinutes,
        pointValue,
        riskBudget,
        maxContracts,
        commissionRoundTrip,
        profileConfig,
    ]);

    const sizing = (
        <details className="mt-3 border-t border-edge pt-2">
            <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wider text-faint">
                Sizing
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="text-[10px] text-faint">
                    Risk budget
                    <input
                        type="number"
                        min={1}
                        step={5}
                        value={riskBudget}
                        onChange={(event) =>
                            setRiskBudget(
                                Math.max(
                                    1,
                                    Number(event.target.value) || 1,
                                ),
                            )
                        }
                        className="mt-1 w-full rounded-md border border-edge bg-canvas px-2 py-1 font-mono text-[11px] text-ink outline-none focus:border-accent/60"
                    />
                </label>
                <label className="text-[10px] text-faint">
                    Max contracts
                    <input
                        type="number"
                        min={1}
                        step={1}
                        value={maxContracts}
                        onChange={(event) =>
                            setMaxContracts(
                                Math.max(
                                    1,
                                    Math.floor(
                                        Number(event.target.value) || 1,
                                    ),
                                ),
                            )
                        }
                        className="mt-1 w-full rounded-md border border-edge bg-canvas px-2 py-1 font-mono text-[11px] text-ink outline-none focus:border-accent/60"
                    />
                </label>
            </div>
        </details>
    );

    const title = profile === "relaxed" ? "Fade Relaxed" : "Fade Check";
    const subtitle =
        profile === "relaxed"
            ? "Relaxed range-fade monitor"
            : "Range-fade filter monitor";

    const canPlace =
        result !== null &&
        result.overall &&
        result.side !== null &&
        result.stopPrice !== null &&
        result.targetPrice !== null &&
        result.contracts >= 1 &&
        canPlaceTrade;

    const actions =
        result === null ? undefined : (
            <div className="mt-3 space-y-2 border-t border-edge pt-3">
                <div className="flex items-center justify-between gap-2 text-[10px] text-faint">
                    <span>
                        SL{" "}
                        <strong className="font-mono text-ink">
                            {result.stopPrice?.toFixed(2) ?? "—"}
                        </strong>
                    </span>
                    <span>
                        TP{" "}
                        <strong className="font-mono text-ink">
                            {result.targetPrice?.toFixed(2) ?? "—"}
                        </strong>
                    </span>
                </div>
                <button
                    type="button"
                    onClick={() => {
                        if (
                            !canPlace ||
                            !onPlaceTrade ||
                            result.side === null ||
                            result.stopPrice === null ||
                            result.targetPrice === null
                        ) {
                            return;
                        }

                        onPlaceTrade({
                            side: result.side,
                            quantity: result.contracts,
                            stopLoss: result.stopPrice,
                            takeProfit: result.targetPrice,
                        });
                    }}
                    disabled={!canPlace || onPlaceTrade === undefined}
                    className={`
                        w-full
                        rounded-md
                        px-3
                        py-2
                        text-xs
                        font-bold
                        text-white
                        transition
                        disabled:cursor-not-allowed
                        disabled:opacity-40
                        ${
                            result.side === "long"
                                ? "bg-bull hover:bg-bull/90"
                                : "bg-bear hover:bg-bear/90"
                        }
                    `}
                >
                    {result.side
                        ? `Place ${result.side.toUpperCase()} ${result.contracts} ${instrumentLabel}`
                        : "Place trade"}
                </button>
                {!canPlaceTrade ? (
                    <div className="text-center text-[10px] text-faint">
                        Close the open position first.
                    </div>
                ) : null}
            </div>
        );

    if (timeframeMinutes !== 5) {
        return (
            <StrategyCheckPanel
                title={title}
                subtitle={subtitle}
                status="waiting"
                summary="Set the chart timeframe to 5m."
                metrics={[]}
                conditions={[]}
                placeholder={
                    <div className="rounded-lg border border-dashed border-edge px-3 py-4 text-center text-[11px] text-faint">
                        Set the chart timeframe to{" "}
                        <strong className="text-ink">5m</strong> to run the
                        Fade Check.
                    </div>
                }
            />
        );
    }

    if (result === null) {
        return (
            <StrategyCheckPanel
                title={title}
                subtitle={subtitle}
                status="waiting"
                summary="Need more candles."
                metrics={[]}
                conditions={[]}
                placeholder={
                    <div className="rounded-lg border border-dashed border-edge px-3 py-4 text-center text-[11px] text-faint">
                        Need more candles to calculate the range, ATR, and RSI.
                    </div>
                }
            />
        );
    }

    return (
        <StrategyCheckPanel
            title={title}
            subtitle={subtitle}
            status={result.overall ? "pass" : "fail"}
            summary={
                result.overall
                    ? "All conditions pass."
                    : `Blocked by: ${result.reason}`
            }
            metrics={fadeMetrics(result)}
            conditions={fadeConditions(result)}
            actions={actions}
        >
            {sizing}
        </StrategyCheckPanel>
    );
}
