import { useEffect, useMemo, useState } from "react";

import {
    evaluateManualFade,
    FADE_PROFILES,
    isFadeTimeWindow,
    type FadeCheckResult,
    type FadeProfileId,
    type FadeSide,
    type FadeTrend,
} from "@/utils/fadeCheck";

type Instrument = "MES" | "MNQ";

const POINT_VALUES: Record<Instrument, number> = {
    MES: 5,
    MNQ: 2,
};

const STORAGE_KEY = "fade-calculator-settings";

function NumberField({
    label,
    hint,
    value,
    onChange,
}: {
    label: string;
    hint?: string;
    value: string;
    onChange: (value: string) => void;
}) {
    return (
        <label className="block">
            <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-semibold text-ink">
                    {label}
                </span>
                {hint ? (
                    <span className="text-[9px] text-faint">{hint}</span>
                ) : null}
            </div>
            <input
                type="number"
                inputMode="decimal"
                step="any"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                onFocus={(event) => event.currentTarget.select()}
                className="mt-1 w-full rounded-lg border border-edge bg-canvas px-3 py-2 font-mono text-sm text-ink outline-none transition focus:border-accent/60"
            />
        </label>
    );
}

function SegmentButton({
    active,
    label,
    onClick,
}: {
    active: boolean;
    label: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition ${
                active
                    ? "border-accent bg-accent text-white"
                    : "border-edge bg-canvas text-sub hover:border-edge-strong hover:text-ink"
            }`}
        >
            {label}
        </button>
    );
}

function ResultBadge({ pass }: { pass: boolean }) {
    return (
        <span
            className={`rounded-full border px-2 py-1 text-[10px] font-bold ${
                pass
                    ? "border-bull/40 bg-bull/15 text-bull"
                    : "border-bear/30 bg-bear/10 text-bear"
            }`}
        >
            {pass ? "PASS" : "FAIL"}
        </span>
    );
}

function Metric({ label, value }: { label: string; value: string }) {
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

function ResultPanel({
    result,
    instrument,
    entryPrice,
}: {
    result: FadeCheckResult | null;
    instrument: Instrument;
    entryPrice: string;
}) {
    if (result === null) {
        return (
            <div className="rounded-xl border border-dashed border-edge bg-surface p-6 text-center text-sm text-faint">
                Enter the seven chart values to see PASS/FAIL.
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div
                className={`rounded-xl border p-4 ${
                    result.overall
                        ? "border-bull/30 bg-bull/10"
                        : "border-bear/25 bg-bear/5"
                }`}
            >
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-faint">
                            Setup
                        </div>
                        <div className="mt-0.5 text-lg font-bold text-ink">
                            {result.side
                                ? `${result.side.toUpperCase()} ${instrument}`
                                : "No failed breakout"}
                        </div>
                    </div>
                    <ResultBadge pass={result.overall} />
                </div>
                <div className="mt-2 text-xs text-sub">
                    {result.overall
                        ? "All mechanical conditions pass. Check execution and sizing before entering."
                        : `Blocked by: ${result.reason}`}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
                <Metric
                    label="Range"
                    value={
                        result.rangeHigh !== null && result.rangeLow !== null
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
                    label="RSI boundary / now"
                    value={
                        result.boundaryRsi === null ||
                        result.currentRsi === null
                            ? "—"
                            : `${result.boundaryRsi.toFixed(1)} / ${result.currentRsi.toFixed(1)}`
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
                    label="Stop pts"
                    value={
                        result.stopDistance === null
                            ? "—"
                            : result.stopDistance.toFixed(2)
                    }
                />
                <Metric
                    label="Stop price"
                    value={
                        result.stopPrice === null
                            ? "—"
                            : result.stopPrice.toFixed(2)
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
                    label="R:R"
                    value={result.rr === null ? "—" : result.rr.toFixed(2)}
                />
                <Metric label="Contracts" value={String(result.contracts)} />
            </div>

            <div className="rounded-xl border border-edge bg-surface p-3">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-faint">
                    Checks
                </div>
                <div className="space-y-1.5">
                    {result.conditions.map((condition) => (
                        <div
                            key={condition.key}
                            className="flex items-start gap-2"
                        >
                            <span
                                className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                                    condition.pass ? "bg-bull" : "bg-bear"
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
                                        {condition.pass ? "PASS" : "FAIL"}
                                    </span>
                                </div>
                                <div className="truncate text-[10px] text-faint">
                                    {condition.detail}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="rounded-lg border border-edge bg-canvas/60 px-3 py-2 font-mono text-[11px] text-sub">
                {result.side
                    ? `${result.side.toUpperCase()} ${instrument} · entry ${Number(entryPrice).toFixed(2)} · stop ${result.stopPrice?.toFixed(2) ?? "—"} · target ${result.targetPrice?.toFixed(2) ?? "—"} · qty ${result.contracts}`
                    : "No order ticket"}
            </div>
        </div>
    );
}

export function FadeCalculatorPage() {
    const [instrument, setInstrument] = useState<Instrument>("MES");
    const [profile, setProfile] = useState<FadeProfileId>("relaxed");
    const [side, setSide] = useState<FadeSide>("short");
    const [trend, setTrend] = useState<FadeTrend>("bearish");
    const [rangeHigh, setRangeHigh] = useState("");
    const [rangeLow, setRangeLow] = useState("");
    const [atr, setAtr] = useState("");
    const [boundaryRsi, setBoundaryRsi] = useState("");
    const [currentRsi, setCurrentRsi] = useState("");
    const [stopExtreme, setStopExtreme] = useState("");
    const [entryPrice, setEntryPrice] = useState("");
    const [touchesOk, setTouchesOk] = useState(false);
    const [failedBreakout, setFailedBreakout] = useState(false);
    const [riskBudget, setRiskBudget] = useState(800);
    const [maxContracts, setMaxContracts] = useState(20);
    const [commission, setCommission] = useState(2.5);
    const [now, setNow] = useState(() => Date.now());
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), 15_000);
        return () => window.clearInterval(id);
    }, []);

    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (!stored) return;
            const parsed = JSON.parse(stored) as Partial<{
                instrument: Instrument;
                profile: FadeProfileId;
                riskBudget: number;
                maxContracts: number;
                commission: number;
            }>;
            if (parsed.instrument === "MES" || parsed.instrument === "MNQ") {
                setInstrument(parsed.instrument);
            }
            if (parsed.profile === "base" || parsed.profile === "relaxed") {
                setProfile(parsed.profile);
            }
            if (Number.isFinite(parsed.riskBudget)) {
                setRiskBudget(Number(parsed.riskBudget));
            }
            if (Number.isFinite(parsed.maxContracts)) {
                setMaxContracts(Number(parsed.maxContracts));
            }
            if (Number.isFinite(parsed.commission)) {
                setCommission(Number(parsed.commission));
            }
        } catch {
            // Ignore malformed local settings.
        }
    }, []);

    useEffect(() => {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                instrument,
                profile,
                riskBudget,
                maxContracts,
                commission,
            }),
        );
    }, [instrument, profile, riskBudget, maxContracts, commission]);

    const profileConfig = FADE_PROFILES[profile];
    const withinTimeWindow = isFadeTimeWindow(
        Math.floor(now / 1000),
        profileConfig,
    );
    const values = useMemo(
        () => ({
            rangeHigh: Number(rangeHigh),
            rangeLow: Number(rangeLow),
            atr: Number(atr),
            boundaryRsi: Number(boundaryRsi),
            currentRsi: Number(currentRsi),
            stopExtreme: Number(stopExtreme),
            entryPrice: Number(entryPrice),
        }),
        [
            rangeHigh,
            rangeLow,
            atr,
            boundaryRsi,
            currentRsi,
            stopExtreme,
            entryPrice,
        ],
    );

    const valuesComplete = Object.values(values).every(
        (value) => Number.isFinite(value) && value !== 0,
    );
    const result = valuesComplete
        ? evaluateManualFade(
              {
                  side,
                  trend,
                  rangeHigh: values.rangeHigh,
                  rangeLow: values.rangeLow,
                  atr: values.atr,
                  boundaryRsi: values.boundaryRsi,
                  currentRsi: values.currentRsi,
                  stopExtreme: values.stopExtreme,
                  entryPrice: values.entryPrice,
                  touchesOk,
                  failedBreakout,
              },
              {
                  pointValue: POINT_VALUES[instrument],
                  riskBudget,
                  maxContracts,
                  commissionRoundTrip: commission,
                  profile: profileConfig,
              },
              withinTimeWindow,
          )
        : null;

    const copyTicket = async () => {
        if (!result?.side) return;
        const text = `${result.side.toUpperCase()} ${instrument} | entry ${values.entryPrice.toFixed(2)} | stop ${result.stopPrice?.toFixed(2) ?? "—"} | target ${result.targetPrice?.toFixed(2) ?? "—"} | qty ${result.contracts}`;
        await navigator.clipboard.writeText(text);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
    };

    const reset = () => {
        setRangeHigh("");
        setRangeLow("");
        setAtr("");
        setBoundaryRsi("");
        setCurrentRsi("");
        setStopExtreme("");
        setEntryPrice("");
        setTouchesOk(false);
        setFailedBreakout(false);
    };

    return (
        <div className="min-h-dvh bg-canvas text-ink">
            <header className="flex h-12 items-center gap-3 border-b border-edge bg-surface px-4">
                <a
                    href="/"
                    className="text-xs font-semibold text-sub transition hover:text-ink"
                >
                    ← Back to replay
                </a>
                <div className="h-5 w-px bg-edge" />
                <div>
                    <div className="text-sm font-bold">Fade Calculator</div>
                    <div className="text-[10px] text-faint">
                        {profileConfig.label} profile · minimal inputs · range fade pass/fail
                    </div>
                </div>
                <div className="ml-auto flex items-center gap-2 text-[10px]">
                    <span
                        className={`rounded-full border px-2 py-1 font-semibold ${
                            withinTimeWindow
                                ? "border-bull/40 bg-bull/10 text-bull"
                                : "border-bear/30 bg-bear/10 text-bear"
                        }`}
                    >
                        {withinTimeWindow
                            ? "Inside 13:00–14:20 ET"
                            : "Outside 13:00–14:20 ET"}
                    </span>
                </div>
            </header>

            <main className="mx-auto grid w-full max-w-6xl gap-4 p-4 lg:grid-cols-[1fr_1fr]">
                <section className="rounded-2xl border border-edge bg-surface p-4 shadow-xl shadow-black/20">
                    <div className="mb-4 flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">
                            Instrument
                        </span>
                        {(["MES", "MNQ"] as const).map((value) => (
                            <SegmentButton
                                key={value}
                                active={instrument === value}
                                label={value}
                                onClick={() => setInstrument(value)}
                            />
                        ))}
                    </div>

                    <div className="mb-4 flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">
                            Profile
                        </span>
                        <SegmentButton
                            active={profile === "base"}
                            label="Base"
                            onClick={() => setProfile("base")}
                        />
                        <SegmentButton
                            active={profile === "relaxed"}
                            label="Relaxed"
                            onClick={() => setProfile("relaxed")}
                        />
                        <span className="text-[10px] text-faint">
                            {profileConfig.timeLabel} · stop ≤{" "}
                            {profileConfig.maxStopAtr} ATR · buffer{" "}
                            {profileConfig.stopBufferPoints} pt
                        </span>
                    </div>

                    <div className="mb-4 flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">
                            Side
                        </span>
                        <SegmentButton
                            active={side === "short"}
                            label="Short"
                            onClick={() => {
                                setSide("short");
                                setTrend("bearish");
                            }}
                        />
                        <SegmentButton
                            active={side === "long"}
                            label="Long"
                            onClick={() => {
                                setSide("long");
                                setTrend("bullish");
                            }}
                        />
                    </div>

                    <div className="mb-4 flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">
                            Trend
                        </span>
                        <SegmentButton
                            active={trend === "bearish"}
                            label="Below 200 EMA"
                            onClick={() => setTrend("bearish")}
                        />
                        <SegmentButton
                            active={trend === "bullish"}
                            label="Above 200 EMA"
                            onClick={() => setTrend("bullish")}
                        />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <NumberField
                            label="Range high"
                            value={rangeHigh}
                            onChange={setRangeHigh}
                        />
                        <NumberField
                            label="Range low"
                            value={rangeLow}
                            onChange={setRangeLow}
                        />
                        <NumberField
                            label="ATR(14)"
                            hint="5m RTH"
                            value={atr}
                            onChange={setAtr}
                        />
                        <NumberField
                            label={side === "short" ? "Range-high RSI" : "Range-low RSI"}
                            hint="boundary RSI"
                            value={boundaryRsi}
                            onChange={setBoundaryRsi}
                        />
                        <NumberField
                            label="Current RSI"
                            value={currentRsi}
                            onChange={setCurrentRsi}
                        />
                        <NumberField
                            label={
                                side === "short"
                                    ? "Signal candle high"
                                    : "Signal candle low"
                            }
                            hint="false-breakout extreme"
                            value={stopExtreme}
                            onChange={setStopExtreme}
                        />
                        <NumberField
                            label="Entry / current price"
                            value={entryPrice}
                            onChange={setEntryPrice}
                        />
                    </div>

                    <div className="mt-4 space-y-2">
                        <label className="flex items-center gap-2 text-xs text-sub">
                            <input
                                type="checkbox"
                                checked={touchesOk}
                                onChange={(event) =>
                                    setTouchesOk(event.target.checked)
                                }
                                className="h-4 w-4 accent-accent"
                            />
                            Each boundary touched at least twice
                        </label>
                        <label className="flex items-center gap-2 text-xs text-sub">
                            <input
                                type="checkbox"
                                checked={failedBreakout}
                                onChange={(event) =>
                                    setFailedBreakout(event.target.checked)
                                }
                                className="h-4 w-4 accent-accent"
                            />
                            Signal candle poked outside and closed back inside
                        </label>
                    </div>

                    <details className="mt-4 rounded-lg border border-edge bg-canvas/50 p-3">
                        <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wider text-faint">
                            Sizing settings
                        </summary>
                        <div className="mt-3 grid grid-cols-3 gap-2">
                            <label className="text-[10px] text-faint">
                                Risk $
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
                                Max qty
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
                                                    Number(event.target.value) ||
                                                        1,
                                                ),
                                            ),
                                        )
                                    }
                                    className="mt-1 w-full rounded-md border border-edge bg-canvas px-2 py-1 font-mono text-[11px] text-ink outline-none focus:border-accent/60"
                                />
                            </label>
                            <label className="text-[10px] text-faint">
                                Round-trip comm.
                                <input
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    value={commission}
                                    onChange={(event) =>
                                        setCommission(
                                            Math.max(
                                                0,
                                                Number(event.target.value) || 0,
                                            ),
                                        )
                                    }
                                    className="mt-1 w-full rounded-md border border-edge bg-canvas px-2 py-1 font-mono text-[11px] text-ink outline-none focus:border-accent/60"
                                />
                            </label>
                        </div>
                    </details>

                    <div className="mt-4 flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={copyTicket}
                            disabled={!result?.side}
                            className="rounded-md bg-accent px-3 py-2 text-xs font-semibold text-white transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            {copied ? "Copied" : "Copy order ticket"}
                        </button>
                        <button
                            type="button"
                            onClick={reset}
                            className="rounded-md border border-edge px-3 py-2 text-xs font-semibold text-sub transition hover:border-edge-strong hover:text-ink"
                        >
                            Clear
                        </button>
                    </div>
                    <p className="mt-2 text-[10px] text-faint">
                        Place Trade is available inside Manual Replay, where the replay trade engine is connected.
                    </p>
                </section>

                <section>
                    <ResultPanel
                        result={result}
                        instrument={instrument}
                        entryPrice={entryPrice}
                    />
                </section>
            </main>
        </div>
    );
}
