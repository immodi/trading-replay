import { useMemo, useState } from "react";

import type { PriceData } from "@/types/priceData";
import { analyzeFadeBars, type FadeCheckResult } from "@/utils/fadeCheck";
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
}: FadeCheckPanelProps) {
    const [riskBudget, setRiskBudget] = useState(800);
    const [maxContracts, setMaxContracts] = useState(20);

    const result = useMemo(() => {
        if (timeframeMinutes !== 5) return null;

        return analyzeFadeBars(bars, {
            pointValue,
            riskBudget,
            maxContracts,
            commissionRoundTrip,
        });
    }, [
        bars,
        timeframeMinutes,
        pointValue,
        riskBudget,
        maxContracts,
        commissionRoundTrip,
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

    if (timeframeMinutes !== 5) {
        return (
            <StrategyCheckPanel
                title="Fade Check"
                subtitle="Range-fade filter monitor"
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
                title="Fade Check"
                subtitle="Range-fade filter monitor"
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
            title="Fade Check"
            subtitle="Range-fade filter monitor"
            status={result.overall ? "pass" : "fail"}
            summary={
                result.overall
                    ? "All conditions pass."
                    : `Blocked by: ${result.reason}`
            }
            metrics={fadeMetrics(result)}
            conditions={fadeConditions(result)}
        >
            {sizing}
        </StrategyCheckPanel>
    );
}
