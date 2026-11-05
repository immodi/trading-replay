import type { ReactNode } from "react";

export type StrategyCheckStatus = "pass" | "fail" | "waiting";

export type StrategyCheckMetric = {
    label: string;
    value: string;
};

export type StrategyCheckCondition = {
    key: string;
    label: string;
    pass: boolean;
    detail: string;
};

type StrategyCheckPanelProps = {
    title: string;
    subtitle: string;
    status: StrategyCheckStatus;
    summary: string;
    metrics: StrategyCheckMetric[];
    conditions: StrategyCheckCondition[];
    placeholder?: ReactNode;
    children?: ReactNode;
    widthClass?: string;
};

const STATUS_STYLES: Record<StrategyCheckStatus, string> = {
    pass: "border-bull/40 bg-bull/15 text-bull",
    fail: "border-bear/30 bg-bear/10 text-bear",
    waiting: "border-edge-strong bg-raised text-faint",
};

const STATUS_LABELS: Record<StrategyCheckStatus, string> = {
    pass: "PASS",
    fail: "FAIL",
    waiting: "WAIT",
};

export function StrategyCheckPanel({
    title,
    subtitle,
    status,
    summary,
    metrics,
    conditions,
    placeholder,
    children,
    widthClass = "w-80",
}: StrategyCheckPanelProps) {
    return (
        <aside
            className={`flex ${widthClass} shrink-0 flex-col border-l border-edge bg-surface`}
        >
            <div className="border-b border-edge px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                    <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">
                            {title}
                        </div>
                        <div className="mt-0.5 text-[11px] text-sub">
                            {subtitle}
                        </div>
                    </div>
                    <span
                        className={`rounded-full border px-2 py-1 text-[10px] font-bold ${STATUS_STYLES[status]}`}
                    >
                        {STATUS_LABELS[status]}
                    </span>
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                {placeholder !== undefined ? (
                    placeholder
                ) : (
                    <>
                        <div
                            className={`mb-3 rounded-lg border px-3 py-2 ${
                                status === "pass"
                                    ? "border-bull/30 bg-bull/10"
                                    : status === "fail"
                                      ? "border-bear/20 bg-bear/5"
                                      : "border-edge bg-canvas/50"
                            }`}
                        >
                            <div className="text-[11px] font-semibold text-ink">
                                {summary}
                            </div>
                        </div>

                        {metrics.length > 0 ? (
                            <div className="grid grid-cols-2 gap-1.5">
                                {metrics.map((metric) => (
                                    <div
                                        key={metric.label}
                                        className="rounded-md border border-edge bg-canvas/60 px-2 py-1.5"
                                    >
                                        <div className="text-[9px] font-semibold uppercase tracking-wider text-faint">
                                            {metric.label}
                                        </div>
                                        <div className="mt-0.5 font-mono text-[11px] text-ink">
                                            {metric.value}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : null}

                        {conditions.length > 0 ? (
                            <div className="mt-3 border-t border-edge pt-2">
                                {conditions.map((condition) => (
                                    <div
                                        key={condition.key}
                                        className="flex items-start gap-2 py-1"
                                    >
                                        <span
                                            className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                                                condition.pass
                                                    ? "bg-bull"
                                                    : "bg-bear"
                                            }`}
                                        />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-baseline justify-between gap-2">
                                                <span className="text-[11px] font-medium text-ink">
                                                    {condition.label}
                                                </span>
                                                <span
                                                    className={`text-[10px] font-semibold ${
                                                        condition.pass
                                                            ? "text-bull"
                                                            : "text-bear"
                                                    }`}
                                                >
                                                    {condition.pass
                                                        ? "PASS"
                                                        : "FAIL"}
                                                </span>
                                            </div>
                                            <div className="truncate text-[10px] text-faint">
                                                {condition.detail}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : null}
                    </>
                )}

                {children}
            </div>
        </aside>
    );
}
