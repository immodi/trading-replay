import { useMemo, useState } from "react";

import type { PriceData } from "@/types/priceData";
import {
    analyzeFadeBars,
    type FadeCheckCondition,
} from "@/utils/fadeCheck";

type FadeCheckPanelProps = {
    bars: PriceData[];
    timeframeMinutes: number;
    pointValue: number;
    commissionRoundTrip: number;
};

function StatusDot({ pass }: { pass: boolean }) {
    return (
        <span
            className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                pass ? "bg-bull" : "bg-bear"
            }`}
        />
    );
}

function ConditionRow({ condition }: { condition: FadeCheckCondition }) {
    return (
        <div className="flex items-start gap-2 py-1">
            <StatusDot pass={condition.pass} />
            <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11px] font-medium text-ink">
                        {condition.label}
                    </span>
                    <span
                        className={`text-[10px] font-semibold ${
                            condition.pass ? "text-bull" : "text-bear"
                        }`}
                    >
                        {condition.pass ? "PASS" : "FAIL"}
                    </span>
                </div>
                <div className="truncate text-[10px] text-faint">
                    {condition.detail}
                </div>
            </div>
        </div>
    );
}

function Metric({
    label,
    value,
}: {
    label: string;
    value: string;
}) {
    return (
        <div className="rounded-md border border-edge bg-canvas/60 px-2 py-1.5">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-faint">
                {label}
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-ink">
                {value}
            </div>
        </div>
    );
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

    return (
        <aside className="flex w-80 shrink-0 flex-col border-l border-edge bg-surface">
            <div className="border-b border-edge px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                    <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">
                            Fade Check
                        </div>
                        <div className="mt-0.5 text-[11px] text-sub">
                            Range-fade filter monitor
                        </div>
                    </div>
                    <span
                        className={`rounded-full border px-2 py-1 text-[10px] font-bold ${
                            result?.overall
                                ? "border-bull/40 bg-bull/15 text-bull"
                                : "border-bear/30 bg-bear/10 text-bear"
                        }`}
                    >
                        {result?.overall ? "PASS" : "FAIL"}
                    </span>
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                {timeframeMinutes !== 5 ? (
                    <div className="rounded-lg border border-dashed border-edge px-3 py-4 text-center text-[11px] text-faint">
                        Set the chart timeframe to <strong className="text-ink">5m</strong> to run the Fade Check.
                    </div>
                ) : result === null ? (
                    <div className="rounded-lg border border-dashed border-edge px-3 py-4 text-center text-[11px] text-faint">
                        Need more candles to calculate the range, ATR, and RSI.
                    </div>
                ) : (
                    <>
                        <div
                            className={`mb-3 rounded-lg border px-3 py-2 ${
                                result.overall
                                    ? "border-bull/30 bg-bull/10"
                                    : "border-bear/20 bg-bear/5"
                            }`}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] font-semibold text-ink">
                                    {result.side
                                        ? `${result.side.toUpperCase()} setup`
                                        : "No failed breakout"}
                                </span>
                                <span className="text-[10px] text-faint">
                                    {result.withinTimeWindow
                                        ? "13:00–14:20 ET"
                                        : "Outside window"}
                                </span>
                            </div>
                            <div className="mt-1 text-[10px] text-sub">
                                {result.overall
                                    ? "All conditions pass."
                                    : `Blocked by: ${result.reason}`}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5">
                            <Metric
                                label="Range"
                                value={
                                    result.rangeHigh !== null &&
                                    result.rangeLow !== null
                                        ? `${result.rangeLow.toFixed(2)} – ${result.rangeHigh.toFixed(2)}`
                                        : "—"
                                }
                            />
                            <Metric
                                label="Width / ATR"
                                value={
                                    result.widthAtr === null
                                        ? "—"
                                        : `${result.widthAtr.toFixed(2)}×`
                                }
                            />
                            <Metric
                                label="Touches"
                                value={`${result.highTouches}H / ${result.lowTouches}L`}
                            />
                            <Metric
                                label="RSI"
                                value={
                                    result.currentRsi === null
                                        ? "—"
                                        : result.currentRsi.toFixed(1)
                                }
                            />
                            <Metric
                                label="Divergence"
                                value={
                                    result.divergence === null
                                        ? "—"
                                        : `${result.divergence > 0 ? "+" : ""}${result.divergence.toFixed(1)}`
                                }
                            />
                            <Metric
                                label="Stop / ATR"
                                value={
                                    result.stopAtr === null
                                        ? "—"
                                        : `${result.stopAtr.toFixed(2)}×`
                                }
                            />
                            <Metric
                                label="Target"
                                value={
                                    result.targetPrice === null
                                        ? "—"
                                        : result.targetPrice.toFixed(2)
                                }
                            />
                            <Metric
                                label="Contracts"
                                value={String(result.contracts)}
                            />
                        </div>

                        <div className="mt-3 border-t border-edge pt-2">
                            {result.conditions.map((condition) => (
                                <ConditionRow
                                    key={condition.key}
                                    condition={condition}
                                />
                            ))}
                        </div>

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
                                                    Number(event.target.value) ||
                                                        1,
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
                                                        Number(
                                                            event.target.value,
                                                        ) || 1,
                                                    ),
                                                ),
                                            )
                                        }
                                        className="mt-1 w-full rounded-md border border-edge bg-canvas px-2 py-1 font-mono text-[11px] text-ink outline-none focus:border-accent/60"
                                    />
                                </label>
                            </div>
                        </details>
                    </>
                )}
            </div>
        </aside>
    );
}
