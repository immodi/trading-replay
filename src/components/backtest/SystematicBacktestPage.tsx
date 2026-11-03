import {
    useEffect,
    useMemo,
    useRef,
    useState,
    type ChangeEvent,
    type ReactNode,
} from "react";

import { analyzeDataQuality } from "@/backtesting/dataQuality";
import {
    downloadBacktestExport,
    type BuildBacktestExportInput,
} from "@/backtesting/buildExport";
import {
    formatUtcDate,
    packCandles,
    parseUtcDate,
    selectBaseRange,
} from "@/backtesting/range";
import {
    MAX_CONTRACTS_PER_ENTRY,
    MAX_STRATEGY_BYTES,
    MAX_WARMUP_BARS,
} from "@/backtesting/constants";
import type {
    BacktestResult,
    BacktestRunConfig,
    DataQualityIssue,
    DataQualityReport,
    InstrumentContext,
    StrategyMetadata,
    StrategyParameter,
} from "@/backtesting/types";
import type {
    BacktestWorkerRequest,
    BacktestWorkerResponse,
} from "@/backtesting/workerProtocol";
import {
    validateParameterValues,
} from "@/backtesting/validateStrategy";
import { createCandleSource } from "@/data/sources/candleSource";
import type { Candle } from "@/types/candle";
import type { CandleSourceConfig } from "@/types/candleSource";
import { EquityCurve } from "./EquityCurve";
import {
    formatBytes,
    formatDateTime,
    formatMoney,
    formatMoneyPlain,
    formatNumber,
    formatPct,
} from "./format";

const inputClass =
    "w-full rounded-lg border border-edge bg-canvas px-3 py-2 text-sm text-ink outline-none transition hover:border-edge-strong focus:border-accent focus:ring-1 focus:ring-accent/30 disabled:opacity-50";
const secondaryButton =
    "rounded-lg border border-edge-strong bg-raised px-3 py-2 text-xs font-medium text-ink transition hover:border-accent/60 hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-40";
const primaryButton =
    "rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white transition hover:bg-accent/85 focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:cursor-not-allowed disabled:opacity-40";

interface StrategyFile {
    name: string;
    size: number;
    text: string;
}

interface RunSnapshot {
    metadata: StrategyMetadata;
    fileName: string;
    source: string;
    parameters: Record<string, unknown>;
    instrument: InstrumentContext;
    config: BacktestRunConfig;
}

interface SelectedRange {
    startTs: number;
    endTsExclusive: number;
    from: number;
    to: number;
    dropFirstAggregate: boolean;
    quality: DataQualityReport;
}

function createWorker(): Worker {
    return new Worker(
        new URL("../../backtesting/backtest.worker.ts", import.meta.url),
        { type: "module" },
    );
}

function issueTimes(issue: DataQualityIssue): string {
    const sampled = issue.samples?.map((sample) => sample.timeISO) ?? [];
    const times =
        sampled.length > 0
            ? sampled
            : issue.timeISO
              ? [issue.timeISO]
              : [];

    return times.length > 0 ? ` Times: ${times.join(", ")}` : "";
}

function Panel({
    title,
    children,
    action,
}: {
    title: string;
    children: ReactNode;
    action?: ReactNode;
}) {
    return (
        <section className="rounded-xl border border-edge bg-surface p-4 shadow-lg shadow-black/10">
            <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold tracking-wide text-ink">
                    {title}
                </h2>
                {action}
            </div>
            {children}
        </section>
    );
}

function Field({
    label,
    hint,
    children,
}: {
    label: string;
    hint?: string;
    children: ReactNode;
}) {
    return (
        <label className="block space-y-1.5 text-xs text-sub">
            <span className="font-medium text-ink">{label}</span>
            {children}
            {hint ? <span className="block text-[11px] text-faint">{hint}</span> : null}
        </label>
    );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg border border-edge bg-raised p-3">
            <div className="text-[11px] uppercase tracking-wide text-faint">
                {label}
            </div>
            <div className="mt-1 text-lg font-semibold text-ink">{value}</div>
        </div>
    );
}

function ParameterInput({
    parameter,
    value,
    onChange,
}: {
    parameter: StrategyParameter;
    value: unknown;
    onChange: (value: unknown) => void;
}) {
    return (
        <Field label={parameter.label}>
            {parameter.type === "number" ? (
                <input
                    className={inputClass}
                    type="number"
                    min={parameter.min}
                    max={parameter.max}
                    step={parameter.step}
                    value={
                        typeof value === "number" ? value : parameter.default
                    }
                    onChange={(event) => onChange(Number(event.target.value))}
                />
            ) : parameter.type === "boolean" ? (
                <input
                    type="checkbox"
                    checked={Boolean(value ?? parameter.default)}
                    onChange={(event) => onChange(event.target.checked)}
                />
            ) : (
                <input
                    className={inputClass}
                    type="text"
                    value={typeof value === "string" ? value : parameter.default}
                    onChange={(event) => onChange(event.target.value)}
                />
            )}
        </Field>
    );
}

export function SystematicBacktestPage({ config }: { config: CandleSourceConfig }) {
    const source = useMemo(() => createCandleSource(config), [config]);

    const [candles, setCandles] = useState<Candle[] | null>(null);
    const [dataRange, setDataRange] = useState<{ start: Date; end: Date } | null>(
        null,
    );
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [timeframeMinutes, setTimeframeMinutes] = useState(1);
    const [commissionPerSide, setCommissionPerSide] = useState(
        config.commission ?? 0,
    );
    const [slippagePointsPerSide, setSlippagePointsPerSide] = useState(0);
    const [startingCapital, setStartingCapital] = useState(10_000);
    const [maxOpenPositions, setMaxOpenPositions] = useState(1);
    const [warmupBars, setWarmupBars] = useState<number | null>(null);

    const [strategyFile, setStrategyFile] = useState<StrategyFile | null>(null);
    const [metadata, setMetadata] = useState<StrategyMetadata | null>(null);
    const [params, setParams] = useState<Record<string, unknown>>({});
    const [validationError, setValidationError] = useState<string | null>(null);
    const [isValidating, setIsValidating] = useState(false);
    const [warningsAcknowledged, setWarningsAcknowledged] = useState(false);

    const [runState, setRunState] = useState<
        "idle" | "running" | "completed" | "failed" | "cancelled"
    >("idle");
    const [progress, setProgress] = useState<{
        processed: number;
        total: number;
    } | null>(null);
    const [runError, setRunError] = useState<string | null>(null);
    const [result, setResult] = useState<BacktestResult | null>(null);
    const [snapshot, setSnapshot] = useState<RunSnapshot | null>(null);

    const workerRef = useRef<Worker | null>(null);
    const watchdogRef = useRef<number | null>(null);

    const stopWorker = () => {
        workerRef.current?.terminate();
        workerRef.current = null;
    };

    const clearWatchdog = () => {
        if (watchdogRef.current !== null) {
            window.clearTimeout(watchdogRef.current);
            watchdogRef.current = null;
        }
    };

    useEffect(() => {
        let cancelled = false;

        setIsLoadingData(true);
        setLoadError(null);
        setCandles(null);
        setDataRange(null);
        setMetadata(null);
        setParams({});
        setStrategyFile(null);
        setValidationError(null);
        setResult(null);
        setSnapshot(null);
        setRunState("idle");
        setProgress(null);
        setRunError(null);
        setWarmupBars(null);
        setCommissionPerSide(config.commission ?? 0);

        Promise.all([source.loadAll(), source.getRange()])
            .then(([loaded, range]) => {
                if (cancelled) return;

                setCandles(loaded);
                setDataRange(range);
                setStartDate(formatUtcDate(range.start));
                setEndDate(formatUtcDate(range.end));
                setIsLoadingData(false);
            })
            .catch((error: unknown) => {
                if (cancelled) return;

                setLoadError(
                    error instanceof Error
                        ? error.message
                        : "Could not load the selected candle dataset.",
                );
                setIsLoadingData(false);
            });

        return () => {
            cancelled = true;
            stopWorker();
            clearWatchdog();
        };
        // Config fields are stable per stored source.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config.fileName, config.id, source]);

    const basicParameters =
        metadata?.parameters.filter((parameter) => !parameter.advanced) ?? [];
    const advancedParameters =
        metadata?.parameters.filter((parameter) => parameter.advanced) ?? [];

    const normalizedParameters = useMemo(() => {
        if (!metadata) {
            return { values: null, error: null as string | null };
        }

        try {
            return {
                values: validateParameterValues(metadata, params),
                error: null as string | null,
            };
        } catch (error) {
            return {
                values: null,
                error:
                    error instanceof Error
                        ? error.message
                        : "Invalid parameter values.",
            };
        }
    }, [metadata, params]);

    const selectedRange = useMemo((): {
        range: SelectedRange | null;
        error: string | null;
    } => {
        if (!candles || !startDate || !endDate) {
            return { range: null, error: "Select a start and end date." };
        }

        try {
            const startTs = parseUtcDate(startDate);
            const endDateTs = parseUtcDate(endDate);
            const endTsExclusive = endDateTs + 86_400;

            if (endTsExclusive <= startTs) {
                return {
                    range: null,
                    error: "Start date must not be after end date.",
                };
            }

            const effectiveWarmup = metadata
                ? (warmupBars ?? metadata.warmupBars)
                : 0;
            const maxLookback = metadata?.maxLookbackBars ?? 500;

            const selection = selectBaseRange(
                candles,
                startTs,
                endTsExclusive,
                timeframeMinutes,
                effectiveWarmup,
                maxLookback,
            );

            if (selection.empty) {
                return {
                    range: null,
                    error: "No candles exist in the selected date range.",
                };
            }

            const quality = analyzeDataQuality(
                candles.slice(selection.from, selection.to),
                startTs,
                endTsExclusive,
                timeframeMinutes,
            );

            return {
                range: {
                    startTs,
                    endTsExclusive,
                    from: selection.from,
                    to: selection.to,
                    dropFirstAggregate: selection.dropFirstAggregate,
                    quality,
                },
                error: null,
            };
        } catch (error) {
            return {
                range: null,
                error:
                    error instanceof Error
                        ? error.message
                        : "Invalid date range.",
            };
        }
    }, [
        candles,
        startDate,
        endDate,
        timeframeMinutes,
        warmupBars,
        metadata,
    ]);

    const qualitySignature = selectedRange.range
        ? JSON.stringify(selectedRange.range.quality)
        : "";

    useEffect(() => {
        setWarningsAcknowledged(false);
    }, [qualitySignature]);

    const quality = selectedRange.range?.quality ?? null;
    const hardErrors = quality?.hardErrors ?? [];
    const warnings = quality?.warnings ?? [];
    const hardErrorCount = hardErrors.reduce(
        (total, issue) => total + (issue.count ?? 1),
        0,
    );
    const warningCount = warnings.reduce(
        (total, issue) => total + (issue.count ?? 1),
        0,
    );
    const hasUnacknowledgedWarnings =
        warnings.length > 0 && !warningsAcknowledged;

    const dateBoundsError = useMemo(() => {
        if (dataRange && startDate && endDate) {
            const start = formatUtcDate(dataRange.start);
            const end = formatUtcDate(dataRange.end);

            if (startDate < start || startDate > end) {
                return "Start date is outside the dataset range.";
            }

            if (endDate < start || endDate > end) {
                return "End date is outside the dataset range.";
            }
        }

        return null;
    }, [dataRange, startDate, endDate]);

    const canRun =
        !isLoadingData &&
        !loadError &&
        !!candles &&
        !!strategyFile &&
        !!metadata &&
        !validationError &&
        !!normalizedParameters.values &&
        !normalizedParameters.error &&
        !!selectedRange.range &&
        !selectedRange.error &&
        !dateBoundsError &&
        hardErrors.length === 0 &&
        !hasUnacknowledgedWarnings &&
        !isValidating &&
        runState !== "running";

    const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!/\.m?js$/i.test(file.name)) {
            setValidationError("Choose a .js or .mjs strategy file.");
            event.target.value = "";
            return;
        }

        if (file.size > MAX_STRATEGY_BYTES) {
            setValidationError(
                `Strategy file exceeds the ${Math.floor(MAX_STRATEGY_BYTES / 1024)} KiB limit.`,
            );
            event.target.value = "";
            return;
        }

        const text = await file.text();

        setStrategyFile({ name: file.name, size: file.size, text });
        setMetadata(null);
        setParams({});
        setWarmupBars(null);
        setValidationError(null);
        setResult(null);
        setSnapshot(null);
        setRunState("idle");
        event.target.value = "";
    };

    const effectiveCommission = Number.isFinite(commissionPerSide)
        ? Math.max(0, commissionPerSide)
        : 0;
    const instrument: InstrumentContext = {
        id: config.id,
        symbol: config.symbol,
        pointValue: config.pointValue,
        commissionPerSide: effectiveCommission,
    };

    const handleValidate = () => {
        if (!strategyFile) return;

        stopWorker();
        setIsValidating(true);
        setValidationError(null);
        setResult(null);
        setSnapshot(null);
        setRunState("idle");
        setRunError(null);
        setProgress(null);

        const worker = createWorker();
        workerRef.current = worker;
        clearWatchdog();
        watchdogRef.current = window.setTimeout(() => {
            stopWorker();
            setIsValidating(false);
            setValidationError(
                "Strategy validation timed out. Check the module for a top-level infinite loop or a hanging import.",
            );
        }, 30_000);

        worker.onmessage = (event: MessageEvent<BacktestWorkerResponse>) => {
            const message = event.data;

            if (message.type === "validation-success") {
                clearWatchdog();
                setMetadata(message.metadata);
                setParams(message.parameterValues);
                setWarmupBars(message.metadata.warmupBars);
                setIsValidating(false);
                setValidationError(null);
                stopWorker();
                return;
            }

            if (message.type === "failed") {
                clearWatchdog();
                setValidationError(message.error);
                setIsValidating(false);
                stopWorker();
            }
        };

        worker.onerror = (event) => {
            clearWatchdog();
            setValidationError(event.message || "Strategy validation failed.");
            setIsValidating(false);
            stopWorker();
        };

        const request: BacktestWorkerRequest = {
            type: "validate",
            source: strategyFile.text,
            instrument,
            parameterValues: params,
        };

        worker.postMessage(request);
    };

    const armWatchdog = () => {
        clearWatchdog();
        watchdogRef.current = window.setTimeout(() => {
            stopWorker();
            setRunState("failed");
            setProgress(null);
            setRunError(
                "The run was stopped because the strategy worker stopped reporting progress.",
            );
        }, 60_000);
    };

    const handleRun = () => {
        if (
            !canRun ||
            !candles ||
            !selectedRange.range ||
            !strategyFile ||
            !metadata ||
            !normalizedParameters.values
        ) {
            return;
        }

        stopWorker();
        clearWatchdog();

        const safeStartingCapital =
            Number.isFinite(startingCapital) && startingCapital > 0
                ? startingCapital
                : 10_000;
        const safeSlippage = Number.isFinite(slippagePointsPerSide)
            ? Math.max(0, slippagePointsPerSide)
            : 0;
        const safeMaxOpenPositions = Number.isInteger(maxOpenPositions)
            ? Math.max(1, Math.min(20, maxOpenPositions))
            : 1;
        const safeWarmup = Math.max(
            0,
            Math.min(
                MAX_WARMUP_BARS,
                Math.floor(warmupBars ?? metadata.warmupBars),
            ),
        );

        const runConfig: BacktestRunConfig = {
            instrument,
            startDateUTC: startDate,
            endDateUTC: endDate,
            startTs: selectedRange.range.startTs,
            endTsExclusive: selectedRange.range.endTsExclusive,
            timeframeMinutes,
            startingCapital: safeStartingCapital,
            slippagePointsPerSide: safeSlippage,
            maxOpenPositions: safeMaxOpenPositions,
            warmupBars: safeWarmup,
            maxLookbackBars: metadata.maxLookbackBars,
            parameters: normalizedParameters.values,
        };

        const packed = packCandles(
            candles,
            selectedRange.range.from,
            selectedRange.range.to,
        );
        const buffer = packed.buffer as ArrayBuffer;
        const worker = createWorker();
        workerRef.current = worker;

        setRunState("running");
        setProgress(null);
        setRunError(null);
        setResult(null);
        setSnapshot(null);
        armWatchdog();

        worker.onmessage = (event: MessageEvent<BacktestWorkerResponse>) => {
            const message = event.data;

            if (message.type === "progress") {
                setProgress({
                    processed: message.processed,
                    total: message.total,
                });
                armWatchdog();
                return;
            }

            if (message.type === "completed") {
                clearWatchdog();
                setResult(message.result);
                setSnapshot({
                    metadata,
                    fileName: strategyFile.name,
                    source: strategyFile.text,
                    parameters: normalizedParameters.values ?? {},
                    instrument,
                    config: runConfig,
                });
                setRunState("completed");
                setProgress(null);
                stopWorker();
                return;
            }

            if (message.type === "failed") {
                clearWatchdog();
                setRunState("failed");
                setProgress(null);
                setRunError(message.error);
                stopWorker();
            }
        };

        worker.onerror = (event) => {
            clearWatchdog();
            setRunState("failed");
            setProgress(null);
            setRunError(event.message || "The backtest worker failed.");
            stopWorker();
        };

        const request: BacktestWorkerRequest = {
            type: "run",
            source: strategyFile.text,
            config: runConfig,
            bars: buffer,
            dropFirstAggregate: selectedRange.range.dropFirstAggregate,
            dataQuality: selectedRange.range.quality,
        };

        worker.postMessage(request, [buffer]);
    };

    const handleCancel = () => {
        stopWorker();
        clearWatchdog();
        setRunState("cancelled");
        setProgress(null);
        setResult(null);
        setSnapshot(null);
    };

    const handleExport = () => {
        if (!result || !snapshot) return;

        const input: BuildBacktestExportInput = {
            result,
            metadata: snapshot.metadata,
            fileName: snapshot.fileName,
            source: snapshot.source,
            parameters: snapshot.parameters,
            instrument: snapshot.instrument,
            config: snapshot.config,
        };

        downloadBacktestExport(input);
    };

    const setParam = (key: string, value: unknown) => {
        setParams((current) => ({ ...current, [key]: value }));
        setRunError(null);
    };

    const progressPct =
        progress && progress.total > 0
            ? Math.min(100, (progress.processed / progress.total) * 100)
            : 0;

    if (isLoadingData) {
        return (
            <div className="flex h-full items-center justify-center bg-canvas text-xs text-sub">
                Loading candle dataset…
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="flex h-full items-center justify-center bg-canvas p-6 text-center text-sm text-bear">
                {loadError}
            </div>
        );
    }

    return (
        <div className="h-full overflow-auto bg-canvas p-4">
            <div className="mx-auto flex max-w-7xl flex-col gap-4">
                <header className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-semibold text-ink">
                            Systematic Backtest
                        </h1>
                        <p className="mt-1 text-xs text-sub">
                            {config.symbol} · {config.fileName} · $
                            {formatNumber(config.pointValue)}/point ·{" "}
                            {config.commission ?? 0}/side commission
                        </p>
                    </div>
                    <a
                        className={secondaryButton}
                        href="/examples/strategies/sma-cross.js"
                        download
                    >
                        Download example strategy
                    </a>
                </header>

                <Panel title="Source">
                    <div className="grid gap-3 text-xs text-sub sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                            <div className="text-faint">Symbol</div>
                            <div className="mt-1 text-sm text-ink">{config.symbol}</div>
                        </div>
                        <div>
                            <div className="text-faint">Point value</div>
                            <div className="mt-1 text-sm text-ink">
                                ${formatNumber(config.pointValue)} / point / contract
                            </div>
                        </div>
                        <div>
                            <div className="text-faint">Dataset range</div>
                            <div className="mt-1 text-sm text-ink">
                                {dataRange
                                    ? `${formatUtcDate(dataRange.start)} → ${formatUtcDate(dataRange.end)}`
                                    : "—"}
                            </div>
                        </div>
                        <div>
                            <div className="text-faint">Base candles</div>
                            <div className="mt-1 text-sm text-ink">
                                {candles ? candles.length.toLocaleString() : "—"}
                            </div>
                        </div>
                    </div>
                </Panel>

                <div className="grid gap-4 xl:grid-cols-2">
                    <Panel title="Run settings">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Field label="Start date (UTC)">
                                <input
                                    className={inputClass}
                                    type="date"
                                    value={startDate}
                                    min={
                                        dataRange
                                            ? formatUtcDate(dataRange.start)
                                            : undefined
                                    }
                                    max={
                                        dataRange
                                            ? formatUtcDate(dataRange.end)
                                            : undefined
                                    }
                                    onChange={(event) =>
                                        setStartDate(event.target.value)
                                    }
                                />
                            </Field>
                            <Field label="End date (UTC)">
                                <input
                                    className={inputClass}
                                    type="date"
                                    value={endDate}
                                    min={
                                        dataRange
                                            ? formatUtcDate(dataRange.start)
                                            : undefined
                                    }
                                    max={
                                        dataRange
                                            ? formatUtcDate(dataRange.end)
                                            : undefined
                                    }
                                    onChange={(event) =>
                                        setEndDate(event.target.value)
                                    }
                                />
                            </Field>
                            <Field label="Timeframe">
                                <select
                                    className={inputClass}
                                    value={timeframeMinutes}
                                    onChange={(event) =>
                                        setTimeframeMinutes(
                                            Number(event.target.value),
                                        )
                                    }
                                >
                                    {[1, 5, 15, 30, 60].map((minutes) => (
                                        <option key={minutes} value={minutes}>
                                            {minutes} minute
                                            {minutes === 1 ? "" : "s"}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                            <Field
                                label="Commission / contract / side"
                                hint="Run-only override; does not change the saved source."
                            >
                                <input
                                    className={inputClass}
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    value={commissionPerSide}
                                    onChange={(event) =>
                                        setCommissionPerSide(
                                            Math.max(
                                                0,
                                                Number(event.target.value),
                                            ),
                                        )
                                    }
                                />
                            </Field>
                            <Field label="Slippage (points / side)">
                                <input
                                    className={inputClass}
                                    type="number"
                                    min={0}
                                    step={0.25}
                                    value={slippagePointsPerSide}
                                    onChange={(event) =>
                                        setSlippagePointsPerSide(
                                            Math.max(
                                                0,
                                                Number(event.target.value),
                                            ),
                                        )
                                    }
                                />
                            </Field>
                            <Field label="Starting capital ($)">
                                <input
                                    className={inputClass}
                                    type="number"
                                    min={1}
                                    step={100}
                                    value={startingCapital}
                                    onChange={(event) =>
                                        setStartingCapital(
                                            Math.max(
                                                1,
                                                Number(event.target.value),
                                            ),
                                        )
                                    }
                                />
                            </Field>
                            <Field label="Maximum open positions">
                                <input
                                    className={inputClass}
                                    type="number"
                                    min={1}
                                    max={20}
                                    step={1}
                                    value={maxOpenPositions}
                                    onChange={(event) =>
                                        setMaxOpenPositions(
                                            Math.max(
                                                1,
                                                Math.min(
                                                    20,
                                                    Math.floor(
                                                        Number(event.target.value),
                                                    ),
                                                ),
                                            ),
                                        )
                                    }
                                />
                            </Field>
                            <Field
                                label="Warm-up bars"
                                hint={
                                    metadata
                                        ? `Strategy default: ${metadata.warmupBars}; counted in ${timeframeMinutes}-minute strategy bars.`
                                        : "Validate a strategy to load its default."
                                }
                            >
                                <input
                                    className={inputClass}
                                    type="number"
                                    min={0}
                                    max={MAX_WARMUP_BARS}
                                    step={1}
                                    disabled={!metadata}
                                    value={warmupBars ?? metadata?.warmupBars ?? 0}
                                    onChange={(event) =>
                                        setWarmupBars(
                                            Math.max(
                                                0,
                                                Math.min(
                                                    MAX_WARMUP_BARS,
                                                    Math.floor(
                                                        Number(event.target.value),
                                                    ),
                                                ),
                                            ),
                                        )
                                    }
                                />
                            </Field>
                        </div>
                        <p className="mt-3 text-[11px] leading-relaxed text-faint">
                            Contract quantity is chosen by the strategy on every
                            entry. The engine does not add automatic position
                            sizing, and it caps a single entry at{" "}
                            {MAX_CONTRACTS_PER_ENTRY} contracts.
                        </p>
                        {dateBoundsError ? (
                            <p className="mt-2 text-xs text-bear">{dateBoundsError}</p>
                        ) : null}
                        {selectedRange.error ? (
                            <p className="mt-2 text-xs text-bear">
                                {selectedRange.error}
                            </p>
                        ) : null}
                    </Panel>

                    <Panel title="Strategy">
                        <div className="space-y-3">
                            <Field
                                label="Strategy file"
                                hint="Single self-contained .js or .mjs ES module. Uploaded code is trusted code."
                            >
                                <input
                                    className={inputClass}
                                    type="file"
                                    accept=".js,.mjs,text/javascript"
                                    disabled={
                                        runState === "running" || isValidating
                                    }
                                    onChange={(event) => {
                                        void handleFileChange(event);
                                    }}
                                />
                            </Field>

                            {strategyFile ? (
                                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-edge bg-raised px-3 py-2 text-xs text-sub">
                                    <span className="truncate text-ink">
                                        {strategyFile.name}
                                    </span>
                                    <span>{formatBytes(strategyFile.size)}</span>
                                </div>
                            ) : (
                                <p className="text-xs text-faint">
                                    Choose a strategy file to validate it.
                                </p>
                            )}

                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    className={secondaryButton}
                                    disabled={
                                        !strategyFile ||
                                        isValidating ||
                                        runState === "running"
                                    }
                                    onClick={handleValidate}
                                >
                                    {isValidating ? "Validating…" : "Validate Strategy"}
                                </button>
                                {metadata ? (
                                    <span className="rounded-full border border-bull/40 bg-bull/10 px-2.5 py-1 text-[11px] text-bull">
                                        {metadata.name} v{metadata.version}
                                    </span>
                                ) : null}
                            </div>

                            {validationError ? (
                                <p className="rounded-lg border border-bear/40 bg-bear/10 p-3 text-xs text-bear">
                                    {validationError}
                                </p>
                            ) : null}

                            {metadata ? (
                                <div className="space-y-3">
                                    <div className="text-xs text-sub">
                                        API v{metadata.apiVersion} · ID{" "}
                                        <span className="text-ink">{metadata.id}</span>{" "}
                                        · max lookback{" "}
                                        {metadata.maxLookbackBars} bars
                                        {metadata.description ? (
                                            <p className="mt-1 text-faint">
                                                {metadata.description}
                                            </p>
                                        ) : null}
                                    </div>

                                    {metadata.parameters.length > 0 ? (
                                        <div className="space-y-3">
                                            {basicParameters.length > 0 ? (
                                                <div className="grid gap-3 sm:grid-cols-2">
                                                    {basicParameters.map(
                                                        (parameter) => (
                                                            <ParameterInput
                                                                key={parameter.key}
                                                                parameter={parameter}
                                                                value={params[parameter.key]}
                                                                onChange={(value) =>
                                                                    setParam(
                                                                        parameter.key,
                                                                        value,
                                                                    )
                                                                }
                                                            />
                                                        ),
                                                    )}
                                                </div>
                                            ) : null}

                                            {advancedParameters.length > 0 ? (
                                                <details className="rounded-lg border border-edge bg-raised/40 p-3">
                                                    <summary className="cursor-pointer text-xs font-medium text-sub">
                                                        Advanced parameters (
                                                        {advancedParameters.length})
                                                    </summary>
                                                    <p className="mt-2 text-[11px] text-faint">
                                                        Internal range and filter
                                                        controls. The defaults are
                                                        usually fine.
                                                    </p>
                                                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                                        {advancedParameters.map(
                                                            (parameter) => (
                                                                <ParameterInput
                                                                    key={parameter.key}
                                                                    parameter={parameter}
                                                                    value={params[parameter.key]}
                                                                    onChange={(value) =>
                                                                        setParam(
                                                                            parameter.key,
                                                                            value,
                                                                        )
                                                                    }
                                                                />
                                                            ),
                                                        )}
                                                    </div>
                                                </details>
                                            ) : null}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-faint">
                                            This strategy has no parameters.
                                        </p>
                                    )}

                                    {normalizedParameters.error ? (
                                        <p className="text-xs text-bear">
                                            {normalizedParameters.error}
                                        </p>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>
                    </Panel>
                </div>

                <Panel
                    title="Data quality preflight"
                    action={
                        quality ? (
                            <span className="text-[11px] text-faint">
                                {quality.baseBarsProcessed.toLocaleString()} base bars
                                inspected
                            </span>
                        ) : null
                    }
                >
                    {!quality ? (
                        <p className="text-xs text-faint">
                            Choose a valid date range to inspect the data.
                        </p>
                    ) : (
                        <div className="space-y-3">
                            <div className="flex flex-wrap gap-2 text-[11px]">
                                <span className="rounded-full border border-edge-strong px-2 py-1 text-sub">
                                    {quality.baseBarsInRange.toLocaleString()} bars in range
                                </span>
                                <span className="rounded-full border border-edge-strong px-2 py-1 text-sub">
                                    {hardErrorCount} hard errors
                                </span>
                                <span className="rounded-full border border-edge-strong px-2 py-1 text-sub">
                                    {warningCount} warnings
                                </span>
                            </div>

                            {hardErrors.length > 0 ? (
                                <div className="rounded-lg border border-bear/40 bg-bear/10 p-3">
                                    <div className="text-xs font-semibold text-bear">
                                        Hard data errors block the run
                                    </div>
                                    <ul className="mt-2 space-y-1 text-[11px] text-bear/90">
                                        {hardErrors.map((issue) => (
                                            <li key={issue.type}>
                                                {issue.message}
                                                {issueTimes(issue)}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : null}

                            {warnings.length > 0 ? (
                                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                                    <div className="text-xs font-semibold text-amber-300">
                                        Warnings
                                    </div>
                                    <ul className="mt-2 space-y-1 text-[11px] text-amber-100/90">
                                        {warnings.map((issue) => (
                                            <li key={issue.type}>
                                                {issue.message}
                                                {issueTimes(issue)}
                                            </li>
                                        ))}
                                    </ul>
                                    <label className="mt-3 flex items-center gap-2 text-[11px] text-amber-100">
                                        <input
                                            type="checkbox"
                                            checked={warningsAcknowledged}
                                            onChange={(event) =>
                                                setWarningsAcknowledged(
                                                    event.target.checked,
                                                )
                                            }
                                        />
                                        I understand these warnings and want to run
                                        anyway.
                                    </label>
                                </div>
                            ) : null}

                            {hardErrors.length === 0 && warnings.length === 0 ? (
                                <p className="rounded-lg border border-bull/40 bg-bull/10 p-3 text-xs text-bull">
                                    No data-quality issues detected by the
                                    preflight checks.
                                </p>
                            ) : null}
                        </div>
                    )}
                </Panel>

                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        className={primaryButton}
                        disabled={!canRun}
                        onClick={handleRun}
                    >
                        Run Backtest
                    </button>
                    {runState === "running" ? (
                        <button
                            type="button"
                            className={secondaryButton}
                            onClick={handleCancel}
                        >
                            Cancel Run
                        </button>
                    ) : null}
                    <button
                        type="button"
                        className={secondaryButton}
                        disabled={!result || !snapshot}
                        onClick={handleExport}
                    >
                        Export JSON
                    </button>
                    {runState === "completed" ? (
                        <span className="text-xs text-bull">Run completed.</span>
                    ) : null}
                    {runState === "cancelled" ? (
                        <span className="text-xs text-sub">Run cancelled.</span>
                    ) : null}
                </div>

                {runState === "running" ? (
                    <div className="rounded-xl border border-accent/30 bg-accent/5 p-3">
                        <div className="mb-2 flex items-center justify-between text-xs text-sub">
                            <span>Processing…</span>
                            <span>
                                {progress
                                    ? `${progress.processed.toLocaleString()} / ${progress.total.toLocaleString()} bars`
                                    : "Starting worker…"}
                            </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-edge">
                            <div
                                className="h-full rounded-full bg-accent transition-[width]"
                                style={{ width: `${progressPct}%` }}
                            />
                        </div>
                    </div>
                ) : null}

                {runError ? (
                    <div className="rounded-xl border border-bear/40 bg-bear/10 p-3 text-xs text-bear">
                        {runError}
                    </div>
                ) : null}

                {result ? (
                    <div className="space-y-4">
                        <Panel title="Summary">
                            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                                <SummaryCard
                                    label="Net P&L"
                                    value={formatMoney(result.summary.netPnl)}
                                />
                                <SummaryCard
                                    label="Closed trades"
                                    value={result.summary.closedTrades.toLocaleString()}
                                />
                                <SummaryCard
                                    label="Win rate"
                                    value={formatPct(result.summary.winRatePct)}
                                />
                                <SummaryCard
                                    label="Profit factor"
                                    value={formatNumber(result.summary.profitFactor)}
                                />
                                <SummaryCard
                                    label="Max drawdown"
                                    value={`${formatMoneyPlain(result.summary.maxDrawdown)} (${formatPct(result.summary.maxDrawdownPct)})`}
                                />
                                <SummaryCard
                                    label="Expectancy / trade"
                                    value={formatMoney(result.summary.expectancyPerTrade)}
                                />
                            </div>
                            <div className="mt-3 grid gap-2 text-[11px] text-sub sm:grid-cols-3">
                                <div>
                                    Starting equity:{" "}
                                    <span className="text-ink">
                                        {formatMoneyPlain(
                                            result.summary.startingEquity,
                                        )}
                                    </span>
                                </div>
                                <div>
                                    Ending equity:{" "}
                                    <span className="text-ink">
                                        {formatMoneyPlain(
                                            result.summary.endingEquity,
                                        )}
                                    </span>
                                </div>
                                <div>
                                    Pending actions at end:{" "}
                                    <span className="text-ink">
                                        {result.summary.pendingActionsAtEnd}
                                    </span>
                                </div>
                            </div>
                            {Object.keys(result.summary.rejectedActions).length >
                            0 ? (
                                <p className="mt-2 text-[11px] text-amber-300">
                                    Rejected actions:{" "}
                                    {Object.entries(
                                        result.summary.rejectedActions,
                                    )
                                        .map(
                                            ([reason, count]) =>
                                                `${reason} (${count})`,
                                        )
                                        .join(", ")}
                                </p>
                            ) : null}
                        </Panel>

                        <Panel title="Equity curve">
                            <EquityCurve points={result.equityCurve} />
                            <p className="mt-2 text-[11px] text-faint">
                                Daily UTC close points. Drawdown uses bar-close
                                marked-to-market equity, not tick-by-tick equity.
                            </p>
                        </Panel>

                        <Panel title="Trades">
                            <p className="mb-2 text-[11px] text-faint">
                                Slippage est. is informational; net P&L uses
                                simulated fills that already include slippage.
                            </p>
                            {result.trades.length === 0 ? (
                                <p className="text-xs text-faint">
                                    No closed trades in this run.
                                </p>
                            ) : (
                                <div className="max-h-[32rem] overflow-auto rounded-lg border border-edge">
                                    <table className="min-w-full text-left text-[11px]">
                                        <thead className="sticky top-0 bg-raised text-faint">
                                            <tr>
                                                {[
                                                    "Side",
                                                    "Qty",
                                                    "Entry",
                                                    "Entry price",
                                                    "Exit",
                                                    "Exit price",
                                                    "Reason",
                                                    "Gross",
                                                    "Commission",
                                                    "Slippage est.",
                                                    "Net",
                                                    "Bars",
                                                ].map((label) => (
                                                    <th
                                                        key={label}
                                                        className="whitespace-nowrap px-2 py-2 font-medium"
                                                    >
                                                        {label}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {result.trades.map((trade) => (
                                                <tr
                                                    key={trade.id}
                                                    className="border-t border-edge/70 text-sub"
                                                >
                                                    <td className="px-2 py-1.5">
                                                        <span
                                                            className={
                                                                trade.side === "long"
                                                                    ? "text-bull"
                                                                    : "text-bear"
                                                            }
                                                        >
                                                            {trade.side}
                                                        </span>
                                                    </td>
                                                    <td className="px-2 py-1.5 text-ink">
                                                        {trade.quantity}
                                                    </td>
                                                    <td className="whitespace-nowrap px-2 py-1.5">
                                                        {formatDateTime(trade.entryTime)}
                                                    </td>
                                                    <td className="px-2 py-1.5 text-ink">
                                                        {formatNumber(trade.entryPrice)}
                                                    </td>
                                                    <td className="whitespace-nowrap px-2 py-1.5">
                                                        {formatDateTime(trade.exitTime)}
                                                    </td>
                                                    <td className="px-2 py-1.5 text-ink">
                                                        {formatNumber(trade.exitPrice)}
                                                    </td>
                                                    <td className="px-2 py-1.5">
                                                        {trade.exitReason}
                                                    </td>
                                                    <td className="px-2 py-1.5">
                                                        {formatMoney(trade.grossPnl)}
                                                    </td>
                                                    <td className="px-2 py-1.5">
                                                        {formatMoney(
                                                            -trade.commissionCost,
                                                        )}
                                                    </td>
                                                    <td className="px-2 py-1.5">
                                                        {formatMoneyPlain(
                                                            trade.slippageCostEstimate,
                                                        )}
                                                    </td>
                                                    <td
                                                        className={`px-2 py-1.5 font-semibold ${
                                                            trade.netPnl >= 0
                                                                ? "text-bull"
                                                                : "text-bear"
                                                        }`}
                                                    >
                                                        {formatMoney(trade.netPnl)}
                                                    </td>
                                                    <td className="px-2 py-1.5">
                                                        {trade.barsHeld}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </Panel>

                        <Panel title="Warnings and assumptions">
                            {result.dataQuality.warnings.length > 0 ? (
                                <ul className="mb-3 space-y-1 text-[11px] text-amber-200">
                                    {result.dataQuality.warnings.map((issue) => (
                                        <li key={issue.type}>
                                            {issue.message}
                                            {issueTimes(issue)}
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="mb-3 text-[11px] text-sub">
                                    No run warnings.
                                </p>
                            )}
                            <details className="rounded-lg border border-edge bg-raised p-3 text-[11px] text-sub">
                                <summary className="cursor-pointer font-medium text-ink">
                                    Execution assumptions
                                </summary>
                                <dl className="mt-2 grid gap-1.5 sm:grid-cols-2">
                                    {Object.entries(result.assumptions).map(
                                        ([key, value]) => (
                                            <div key={key}>
                                                <dt className="text-faint">{key}</dt>
                                                <dd className="text-ink">{value}</dd>
                                            </div>
                                        ),
                                    )}
                                </dl>
                            </details>
                        </Panel>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
