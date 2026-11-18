import fs from "node:fs";
import path from "node:path";

import {
    runPortfolioBacktest,
    type PortfolioBar,
    type PortfolioConfig,
    type PortfolioMetrics,
    type PortfolioTrade,
    type PreparedSymbol,
} from "../../src/backtesting/portfolio.ts";
import { CONFIG, RESULTS_DIR } from "./config.ts";
import { loadConstituents, loadSymbol, type LoadedSymbol } from "./data.ts";
import { buildIndicators, type IndicatorSet } from "./indicators.ts";
import {
    buildStrategies,
    regimeGate,
    type StrategySpec,
} from "./strategies.ts";

type ResearchSymbol = LoadedSymbol & {
    ind: IndicatorSet;
    specs: Map<string, StrategySpec>;
};

type RunResult = {
    key: string;
    strategy: string;
    label: string;
    family: string;
    regime: boolean;
    stop: string;
    metrics: PortfolioMetrics;
    trades: PortfolioTrade[];
    equityCurve: ReturnType<typeof runPortfolioBacktest>["equityCurve"];
};

type WindowRun = Omit<RunResult, "trades" | "equityCurve"> & {
    window: string;
    windowStart: string;
    windowEnd: string;
    benchmarkCagrPct: number;
    beatBenchmark: boolean;
};

type WindowAggregate = {
    key: string;
    strategy: string;
    label: string;
    family: string;
    regime: boolean;
    stop: string;
    windows: number;
    avgCagrPct: number;
    medianCagrPct: number;
    avgMaxDrawdownPct: number;
    avgWinRatePct: number;
    avgProfitFactor: number;
    avgExpectancy: number;
    avgHoldingBars: number;
    avgIdleCashInterest: number;
    beatBenchmarkPct: number;
};

type WindowBenchmark = {
    window: string;
    windowStart: string;
    windowEnd: string;
    metrics: ReturnType<typeof buyAndHoldBenchmark>["metrics"];
};

function stopLabel(stopMode: "atr" | "percent"): string {
    return stopMode === "atr"
        ? `atr${CONFIG.atrMultiplier}`
        : `fixed${CONFIG.fixedStopPct * 100}%`;
}

function monthIndex(time: number): number {
    const date = new Date(time * 1000);
    return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

function ensureDirectory(directory: string): void {
    fs.mkdirSync(directory, { recursive: true });
}

function csvValue(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "number") {
        return Number.isFinite(value) ? String(value) : "";
    }
    const text = String(value);
    return /[",\n]/.test(text)
        ? `"${text.replaceAll('"', '""')}"`
        : text;
}

function writeCsv(
    fileName: string,
    rows: Array<Record<string, unknown>>,
    columns: string[],
): void {
    const lines = [
        columns.join(","),
        ...rows.map((row) =>
            columns.map((column) => csvValue(row[column])).join(","),
        ),
    ];
    fs.writeFileSync(fileName, `${lines.join("\n")}\n`);
}

function loadResearchSymbols(): ResearchSymbol[] {
    const symbols: ResearchSymbol[] = [];

    for (const entry of loadConstituents()) {
        const loaded = loadSymbol(entry);
        if (loaded.bars.length < CONFIG.minHistoryBars) continue;

        const ind = buildIndicators(loaded.bars);
        const specs = new Map(
            buildStrategies(loaded.bars, ind).map((spec) => [spec.key, spec]),
        );
        symbols.push({ ...loaded, ind, specs });
    }

    return symbols;
}

function buildPreparedSymbols(
    symbols: ResearchSymbol[],
    strategyKey: string,
    useRegime: boolean,
    startTs: number,
    endTs: number,
): PreparedSymbol[] {
    const prepared: PreparedSymbol[] = [];

    for (const symbol of symbols) {
        const spec = symbol.specs.get(strategyKey);
        if (spec === undefined) {
            throw new Error(`Missing strategy ${strategyKey} for ${symbol.symbol}`);
        }

        const gate = useRegime
            ? regimeGate(spec.family, symbol.ind.adx)
            : null;
        const bars: PortfolioBar[] = [];
        const entry: boolean[] = [];
        const exit: boolean[] = [];
        const atr: number[] = [];

        for (let index = 0; index < symbol.bars.length; index += 1) {
            const bar = symbol.bars[index];
            if (bar.time < startTs || bar.time >= endTs) continue;

            bars.push(bar);
            entry.push(
                gate ? spec.entry[index] && gate[index] : spec.entry[index],
            );
            exit.push(spec.exit[index]);
            atr.push(symbol.ind.atr[index]);
        }

        if (bars.length < CONFIG.minHistoryBars) continue;
        prepared.push({ symbol: symbol.symbol, bars, entry, exit, atr });
    }

    return prepared;
}

function sliceSymbolsForRange(
    symbols: ResearchSymbol[],
    startTs: number,
    endTs: number,
): Array<{ symbol: string; bars: PortfolioBar[] }> {
    return symbols
        .map((symbol) => ({
            symbol: symbol.symbol,
            bars: symbol.bars.filter(
                (bar) => bar.time >= startTs && bar.time < endTs,
            ),
        }))
        .filter((symbol) => symbol.bars.length > 0);
}

function portfolioConfig(stopMode: "atr" | "percent"): PortfolioConfig {
    return {
        initialCapital: CONFIG.initialCapital,
        monthlyTopUp: CONFIG.monthlyTopUp,
        maxOrderNotional: CONFIG.maxOrderNotional,
        riskPerTrade: CONFIG.riskPerTrade,
        maxRiskPerTrade: CONFIG.maxRiskPerTrade,
        costPctPerSide: CONFIG.costPctPerSide,
        fixedFeePerOrder: CONFIG.fixedFeePerOrder,
        idleCashMonthlyRate: CONFIG.idleCashMonthlyRate,
        maxHoldBars: CONFIG.maxHoldBars,
        stopMode,
        atrMultiplier: CONFIG.atrMultiplier,
        fixedStopPct: CONFIG.fixedStopPct,
        personalProfitPct: CONFIG.personalProfitPct,
        personalProfitFixed: CONFIG.personalProfitFixed,
    };
}

function buyAndHoldBenchmark(
    symbols: Array<{ symbol: string; bars: PortfolioBar[] }>,
    config: PortfolioConfig,
): {
    equityCurve: Array<{
        time: number;
        equity: number;
        deposit: number;
        interest: number;
    }>;
    metrics: {
        finalEquity: number;
        contributions: number;
        idleCashInterest: number;
        twrPct: number;
        cagrPct: number;
        maxDrawdownPct: number;
    };
} {
    const barsByDate = new Map<
        number,
        Array<{ symbol: string; open: number; close: number }>
    >();
    const lastClose = new Map<string, number>();

    for (const symbol of symbols) {
        for (const bar of symbol.bars) {
            lastClose.set(symbol.symbol, bar.close);
            const rows = barsByDate.get(bar.time);
            const row = { symbol: symbol.symbol, open: bar.open, close: bar.close };
            if (rows) rows.push(row);
            else barsByDate.set(bar.time, [row]);
        }
    }

    const calendar = [...barsByDate.keys()].sort((a, b) => a - b);
    const shares = new Map<string, number>();
    let cash = config.initialCapital;
    let contributions = config.initialCapital;
    let lastMonthIndex = calendar.length > 0 ? monthIndex(calendar[0]) : -1;
    let interestEarned = 0;
    const curve: Array<{
        time: number;
        equity: number;
        deposit: number;
        interest: number;
    }> = [];

    for (const time of calendar) {
        const rows = barsByDate.get(time) ?? [];
        let deposit = 0;
        let interest = 0;

        while (lastMonthIndex >= 0 && lastMonthIndex < monthIndex(time)) {
            lastMonthIndex += 1;
            if (cash > 0 && config.idleCashMonthlyRate > 0) {
                const monthlyInterest = cash * config.idleCashMonthlyRate;
                cash += monthlyInterest;
                interestEarned += monthlyInterest;
                interest += monthlyInterest;
            }
            cash += config.monthlyTopUp;
            contributions += config.monthlyTopUp;
            deposit += config.monthlyTopUp;
        }
        if (lastMonthIndex < 0) lastMonthIndex = monthIndex(time);

        if (cash > 0 && rows.length > 0) {
            const allocation = cash / rows.length;
            for (const row of rows) {
                const quantity =
                    allocation / (row.open * (1 + config.costPctPerSide));
                shares.set(
                    row.symbol,
                    (shares.get(row.symbol) ?? 0) + quantity,
                );
            }
            cash = 0;
        }

        for (const row of rows) lastClose.set(row.symbol, row.close);

        let invested = 0;
        for (const [symbol, quantity] of shares) {
            invested += quantity * (lastClose.get(symbol) ?? 0);
        }
        curve.push({ time, equity: cash + invested, deposit, interest });
    }

    let invested = 0;
    for (const [symbol, quantity] of shares) {
        invested += quantity * (lastClose.get(symbol) ?? 0);
    }
    if (curve.length > 0) {
        curve[curve.length - 1].equity -=
            invested * config.costPctPerSide +
            config.fixedFeePerOrder * shares.size;
    }

    let twr = 1;
    for (let index = 1; index < curve.length; index += 1) {
        const previous = curve[index - 1];
        const current = curve[index];
        if (previous.equity > 0) {
            twr *= (current.equity - current.deposit) / previous.equity;
        }
    }

    const firstTime = curve[0]?.time ?? 0;
    const lastTime = curve[curve.length - 1]?.time ?? firstTime;
    const years = Math.max(1, (lastTime - firstTime) / (365.25 * 86_400));
    let peak = 0;
    let maxDd = 0;
    for (const point of curve) {
        if (point.equity > peak) peak = point.equity;
        if (peak > 0) maxDd = Math.max(maxDd, ((peak - point.equity) / peak) * 100);
    }

    return {
        equityCurve: curve,
        metrics: {
            finalEquity: curve[curve.length - 1]?.equity ?? config.initialCapital,
            contributions,
            idleCashInterest: interestEarned,
            twrPct: (twr - 1) * 100,
            cagrPct:
                twr > 0 ? (Math.pow(twr, 1 / years) - 1) * 100 : Number.NaN,
            maxDrawdownPct: maxDd,
        },
    };
}

function buildWindows(
    symbols: ResearchSymbol[],
): Array<{ label: string; startTs: number; endTs: number }> {
    const firstTime = Math.min(...symbols.map((symbol) => symbol.bars[0].time));
    const lastTime = Math.max(
        ...symbols.map((symbol) => symbol.bars[symbol.bars.length - 1].time),
    );
    const firstYear = new Date(firstTime * 1000).getUTCFullYear();
    const windows: Array<{ label: string; startTs: number; endTs: number }> = [];

    for (
        let year = firstYear;
        ;
        year += CONFIG.windowStepYears
    ) {
        const startTs = Date.UTC(year, 0, 1) / 1000;
        const endTs = Date.UTC(year + CONFIG.windowYears, 0, 1) / 1000;
        if (endTs > lastTime + 86_400) break;
        windows.push({
            label: `${year}–${year + CONFIG.windowYears - 1}`,
            startTs,
            endTs,
        });
    }

    return windows;
}

function strategyVariants(
    symbols: ResearchSymbol[],
): Array<{
    key: string;
    spec: StrategySpec;
    regime: boolean;
    stop: string;
}> {
    const variants: Array<{
        key: string;
        spec: StrategySpec;
        regime: boolean;
        stop: string;
    }> = [];
    const specKeys = [...symbols[0].specs.keys()];
    const regimeModes = CONFIG.runRegimeVariants ? [false, true] : [false];

    for (const strategyKey of specKeys) {
        const spec = symbols[0].specs.get(strategyKey);
        if (spec === undefined) continue;
        for (const regime of regimeModes) {
            for (const stopMode of CONFIG.stopModes) {
                variants.push({
                    key:
                        `${strategyKey}|` +
                        `${regime ? "regime" : "noregime"}|` +
                        `${stopLabel(stopMode)}`,
                    spec,
                    regime,
                    stop: stopLabel(stopMode),
                });
            }
        }
    }

    return variants;
}

function runFullPeriod(
    symbols: ResearchSymbol[],
    startTs: number,
    endTs: number,
): RunResult[] {
    const results: RunResult[] = [];

    for (const variant of strategyVariants(symbols)) {
        const prepared = buildPreparedSymbols(
            symbols,
            variant.spec.key,
            variant.regime,
            startTs,
            endTs,
        );
        const stopMode = variant.stop.startsWith("atr") ? "atr" : "percent";
        const result = runPortfolioBacktest(
            prepared,
            portfolioConfig(stopMode),
        );
        results.push({
            key: variant.key,
            strategy: variant.spec.key,
            label: variant.spec.label,
            family: variant.spec.family,
            regime: variant.regime,
            stop: variant.stop,
            metrics: result.metrics,
            trades: result.trades,
            equityCurve: result.equityCurve,
        });
        process.stdout.write(
            `  full ${variant.key} → ${result.metrics.cagrPct.toFixed(2)}% CAGR\n`,
        );
    }

    return results;
}

function runWindows(
    symbols: ResearchSymbol[],
    windows: Array<{ label: string; startTs: number; endTs: number }>,
): { runs: WindowRun[]; benchmarks: WindowBenchmark[] } {
    const runs: WindowRun[] = [];
    const benchmarks: WindowBenchmark[] = [];

    for (const window of windows) {
        const slicedForBenchmark = sliceSymbolsForRange(
            symbols,
            window.startTs,
            window.endTs,
        );
        const benchmark = buyAndHoldBenchmark(
            slicedForBenchmark,
            portfolioConfig(CONFIG.stopModes[0]),
        );
        benchmarks.push({
            window: window.label,
            windowStart: new Date(window.startTs * 1000)
                .toISOString()
                .slice(0, 10),
            windowEnd: new Date((window.endTs - 86_400) * 1000)
                .toISOString()
                .slice(0, 10),
            metrics: benchmark.metrics,
        });
        process.stdout.write(
            `[window ${window.label}] benchmark CAGR ${benchmark.metrics.cagrPct.toFixed(2)}%\n`,
        );

        for (const variant of strategyVariants(symbols)) {
            const prepared = buildPreparedSymbols(
                symbols,
                variant.spec.key,
                variant.regime,
                window.startTs,
                window.endTs,
            );
            if (prepared.length === 0) continue;
            const stopMode = variant.stop.startsWith("atr") ? "atr" : "percent";
            const result = runPortfolioBacktest(
                prepared,
                portfolioConfig(stopMode),
            );
            runs.push({
                key: variant.key,
                strategy: variant.spec.key,
                label: variant.spec.label,
                family: variant.spec.family,
                regime: variant.regime,
                stop: variant.stop,
                window: window.label,
                windowStart: new Date(window.startTs * 1000)
                    .toISOString()
                    .slice(0, 10),
                windowEnd: new Date((window.endTs - 86_400) * 1000)
                    .toISOString()
                    .slice(0, 10),
                metrics: result.metrics,
                benchmarkCagrPct: benchmark.metrics.cagrPct,
                beatBenchmark:
                    result.metrics.cagrPct > benchmark.metrics.cagrPct,
            });
        }
    }

    return { runs, benchmarks };
}

function median(values: number[]): number {
    if (values.length === 0) return Number.NaN;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle];
}

function finiteMean(values: number[]): number {
    const finite = values.filter((value) => Number.isFinite(value));
    return finite.length === 0
        ? Number.NaN
        : finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function aggregateWindows(runs: WindowRun[]): WindowAggregate[] {
    const groups = new Map<string, WindowRun[]>();
    for (const run of runs) {
        const list = groups.get(run.key) ?? [];
        list.push(run);
        groups.set(run.key, list);
    }

    const aggregates: WindowAggregate[] = [];
    for (const [key, list] of groups) {
        const first = list[0];
        aggregates.push({
            key,
            strategy: first.strategy,
            label: first.label,
            family: first.family,
            regime: first.regime,
            stop: first.stop,
            windows: list.length,
            avgCagrPct: finiteMean(list.map((run) => run.metrics.cagrPct)),
            medianCagrPct: median(
                list
                    .map((run) => run.metrics.cagrPct)
                    .filter((value) => Number.isFinite(value)),
            ),
            avgMaxDrawdownPct: finiteMean(
                list.map((run) => run.metrics.maxDrawdownPct),
            ),
            avgWinRatePct: finiteMean(
                list.map((run) => run.metrics.winRatePct),
            ),
            avgProfitFactor: finiteMean(
                list.map((run) => run.metrics.profitFactor),
            ),
            avgExpectancy: finiteMean(
                list.map((run) => run.metrics.expectancy),
            ),
            avgHoldingBars: finiteMean(
                list.map((run) => run.metrics.avgHoldingBars),
            ),
            avgIdleCashInterest: finiteMean(
                list.map((run) => run.metrics.idleCashInterest),
            ),
            beatBenchmarkPct:
                (list.filter((run) => run.beatBenchmark).length / list.length) *
                100,
        });
    }

    return aggregates.sort(
        (left, right) => right.avgCagrPct - left.avgCagrPct,
    );
}

function formatPct(value: number): string {
    return Number.isFinite(value) ? `${value.toFixed(2)}%` : "—";
}

function formatMoney(value: number): string {
    return Number.isFinite(value)
        ? value.toLocaleString("en-US", { maximumFractionDigits: 0 })
        : "—";
}

function formatNumber(value: number, digits = 2): string {
    return Number.isFinite(value) ? value.toFixed(digits) : "—";
}

function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

function svgChart(
    runs: RunResult[],
    benchmark: ReturnType<typeof buyAndHoldBenchmark>,
): string {
    const colors = [
        "#3D7EFF",
        "#26A69A",
        "#FFB74D",
        "#AB47BC",
        "#EF5350",
        "#29B6F6",
    ];
    const width = 1200;
    const height = 620;
    const padding = 55;
    const allTimes = runs[0]?.equityCurve.map((point) => point.time) ?? [];
    const allEquities = runs.flatMap((run) =>
        run.equityCurve.map((point) => point.equity),
    );
    allEquities.push(...benchmark.equityCurve.map((point) => point.equity));

    const minTime = allTimes[0] ?? 0;
    const maxTime = allTimes[allTimes.length - 1] ?? 1;
    const minEquity = Math.min(...allEquities);
    const maxEquity = Math.max(...allEquities);
    const x = (time: number) =>
        padding +
        ((time - minTime) / Math.max(1, maxTime - minTime)) *
            (width - padding * 2);
    const y = (equity: number) =>
        height -
        padding -
        ((equity - minEquity) / Math.max(1, maxEquity - minEquity)) *
            (height - padding * 2);

    const paths = runs
        .map((run, index) => {
            const d = run.equityCurve
                .map(
                    (point, pointIndex) =>
                        `${pointIndex === 0 ? "M" : "L"}${x(point.time).toFixed(1)},${y(point.equity).toFixed(1)}`,
                )
                .join(" ");
            return `<path d="${d}" fill="none" stroke="${colors[index % colors.length]}" stroke-width="1.7" />`;
        })
        .join("\n");
    const benchmarkPath = benchmark.equityCurve
        .map(
            (point, index) =>
                `${index === 0 ? "M" : "L"}${x(point.time).toFixed(1)},${y(point.equity).toFixed(1)}`,
        )
        .join(" ");
    const legend = runs
        .map(
            (run, index) =>
                `<div><span class="dot" style="background:${colors[index % colors.length]}"></span>${escapeHtml(run.key)}</div>`,
        )
        .join("");

    return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Equity curves">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#0B0E14"/>
      <line x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" stroke="#232B3A"/>
      <line x1="${padding}" y1="${padding}" x2="${padding}" y2="${height - padding}" stroke="#232B3A"/>
      ${paths}
      <path d="${benchmarkPath}" fill="none" stroke="#93A0B4" stroke-dasharray="6 5" stroke-width="1.6" />
      <text x="${padding}" y="26" fill="#E6EAF2" font-size="14">Full-period equity (EGP) — dashed = buy &amp; hold DCA</text>
    </svg>
    <div class="legend">${legend}<div><span class="dot" style="background:#93A0B4"></span>buy &amp; hold DCA</div></div>`;
}

function writeSummary(
    fullRuns: RunResult[],
    fullBenchmark: ReturnType<typeof buyAndHoldBenchmark>,
    windowRuns: WindowRun[],
    windowBenchmarks: WindowBenchmark[],
    windowAggregates: WindowAggregate[],
    symbols: ResearchSymbol[],
    windows: Array<{ label: string; startTs: number; endTs: number }>,
): void {
    const fullSorted = [...fullRuns].sort(
        (left, right) => right.metrics.cagrPct - left.metrics.cagrPct,
    );
    const topFull = fullSorted.slice(0, CONFIG.topStrategyCount);
    const topWindow = windowAggregates.slice(0, CONFIG.topStrategyCount);
    const averageWindowBenchmarkCagr = finiteMean(
        windowBenchmarks.map((benchmark) => benchmark.metrics.cagrPct),
    );
    const averageWindowBenchmarkDd = finiteMean(
        windowBenchmarks.map((benchmark) => benchmark.metrics.maxDrawdownPct),
    );

    const lines = [
        `# EGX30 Portfolio Swing Research — Full History + Rolling ${CONFIG.windowYears}-Year Windows`,
        "",
        `- Stocks: **${symbols.length}**`,
        `- Starting capital: **${formatMoney(CONFIG.initialCapital)} EGP**`,
        `- Monthly top-up: **${formatMoney(CONFIG.monthlyTopUp)} EGP**`,
        `- Max order notional: **${formatMoney(CONFIG.maxOrderNotional)} EGP**`,
        `- Risk per trade: **${(CONFIG.riskPerTrade * 100).toFixed(2)}%**`,
        `- Costs: **${(CONFIG.costPctPerSide * 100).toFixed(2)}% per side**`,
        `- Max hold: **${CONFIG.maxHoldBars} sessions**`,
        `- Personal withdrawal: **${(CONFIG.personalProfitPct * 100).toFixed(2)}% of each winning trade**`,
        `- Idle cash: **${(CONFIG.idleCashMonthlyRate * 100).toFixed(2)}% monthly**, compounded`,
        `- Full data window: **2010 → latest available**`,
        `- Rolling window: **${CONFIG.windowYears} years**, annual starts (${windows.length} windows)`,
        "",
        "## Full-period benchmark",
        "",
        `- Final equity: **${formatMoney(fullBenchmark.metrics.finalEquity)} EGP**`,
        `- Contributions: **${formatMoney(fullBenchmark.metrics.contributions)} EGP**`,
        `- Idle-cash interest: **${formatMoney(fullBenchmark.metrics.idleCashInterest)} EGP**`,
        `- TWR: **${formatPct(fullBenchmark.metrics.twrPct)}**`,
        `- CAGR: **${formatPct(fullBenchmark.metrics.cagrPct)}**`,
        `- Max drawdown: **${formatPct(fullBenchmark.metrics.maxDrawdownPct)}**`,
        "",
        "## Full-period strategy portfolios",
        "",
        "| Rank | Strategy | Regime | Stop | Final equity | Personal | Interest | TWR | CAGR | Max DD | Trades | Win rate | PF | Expectancy |",
        "| ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ];

    for (const [index, run] of topFull.entries()) {
        const metrics = run.metrics;
        lines.push(
            `| ${index + 1} | ${run.label} | ${run.regime ? "ADX" : "off"} | ${run.stop} | ` +
                `${formatMoney(metrics.finalEquity)} | ${formatMoney(metrics.personalWithdrawals)} | ` +
                `${formatMoney(metrics.idleCashInterest)} | ${formatPct(metrics.timeWeightedReturnPct)} | ` +
                `${formatPct(metrics.cagrPct)} | ${formatPct(metrics.maxDrawdownPct)} | ${metrics.trades} | ` +
                `${formatPct(metrics.winRatePct)} | ${formatNumber(metrics.profitFactor)} | ` +
                `${formatMoney(metrics.expectancy)} |`,
        );
    }

    lines.push(
        "",
        `## Average ${CONFIG.windowYears}-year window`,
        "",
        `- Average benchmark CAGR: **${formatPct(averageWindowBenchmarkCagr)}**`,
        `- Average benchmark max drawdown: **${formatPct(averageWindowBenchmarkDd)}**`,
        "",
        "| Rank | Strategy | Regime | Stop | Windows | Avg CAGR | Median CAGR | Avg Max DD | Avg Win rate | Avg PF | Avg Expectancy | Beat B&H |",
        "| ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    );

    for (const [index, aggregate] of topWindow.entries()) {
        lines.push(
            `| ${index + 1} | ${aggregate.label} | ${aggregate.regime ? "ADX" : "off"} | ${aggregate.stop} | ` +
                `${aggregate.windows} | ${formatPct(aggregate.avgCagrPct)} | ${formatPct(aggregate.medianCagrPct)} | ` +
                `${formatPct(aggregate.avgMaxDrawdownPct)} | ${formatPct(aggregate.avgWinRatePct)} | ` +
                `${formatNumber(aggregate.avgProfitFactor)} | ${formatMoney(aggregate.avgExpectancy)} | ` +
                `${formatPct(aggregate.beatBenchmarkPct)} |`,
        );
    }

    lines.push(
        "",
        "## Window detail",
        "",
        "| Window | Benchmark CAGR | Best strategy | Best CAGR |",
        "| --- | ---: | --- | ---: |",
    );

    for (const benchmark of windowBenchmarks) {
        const runsInWindow = windowRuns
            .filter((run) => run.window === benchmark.window)
            .sort((left, right) => right.metrics.cagrPct - left.metrics.cagrPct);
        const best = runsInWindow[0];
        lines.push(
            `| ${benchmark.window} | ${formatPct(benchmark.metrics.cagrPct)} | ` +
                `${best ? best.label + " / " + best.stop : "—"} | ` +
                `${best ? formatPct(best.metrics.cagrPct) : "—"} |`,
        );
    }

    lines.push(
        "",
        "## Files",
        "",
        "- `full_period_per_strategy.csv` — full-history portfolio metrics",
        `- \`${CONFIG.windowYears}_year_windows.csv\` — metrics for every strategy × window`,
        `- \`${CONFIG.windowYears}_year_average.csv\` — average across windows`,
        "- `per_stock.csv` — full-period trade breakdown by strategy and symbol",
        "- `trades.csv` — full-period trades",
        "- `equity_curves/` — full-period portfolio curves",
        "- `summary.html`",
        "",
        "## Assumptions",
        "",
        "- Long-only, one position per stock, unlimited concurrent stocks within EGX30.",
        `- Orders are sized at ${(CONFIG.riskPerTrade * 100).toFixed(2)}% equity risk, capped by cash and ${formatMoney(CONFIG.maxOrderNotional)} EGP notional.`,
        `- Monthly ${formatMoney(CONFIG.monthlyTopUp)} EGP top-ups happen at the first session of each new month.`,
        `- ${(CONFIG.personalProfitPct * 100).toFixed(2)}% of each winning trade's net profit is withdrawn to personal cash.`,
        `- Uninvested cash earns ${(CONFIG.idleCashMonthlyRate * 100).toFixed(2)}% monthly, credited before each top-up.`,
        "- Rolling windows use full pre-window history for indicators; only trading is constrained to the window.",
        "- Current-day EGX30 membership creates survivorship bias.",
    );

    fs.writeFileSync(path.join(RESULTS_DIR, "summary.md"), `${lines.join("\n")}\n`);

    const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>EGX30 Portfolio Swing Research</title>
<style>
body{background:#0B0E14;color:#E6EAF2;font:14px/1.5 ui-sans-serif,system-ui,sans-serif;margin:0;padding:28px}
h1,h2{font-weight:600}table{border-collapse:collapse;width:100%;font-size:12px;margin:12px 0 24px}
th,td{border-bottom:1px solid #232B3A;padding:7px 8px;text-align:right;white-space:nowrap}
th{color:#93A0B4;text-align:right}td:first-child,th:first-child,td:nth-child(2),th:nth-child(2){text-align:left}
.card{border:1px solid #232B3A;border-radius:10px;padding:16px;margin:12px 0;background:#121722}
.legend{display:flex;flex-wrap:wrap;gap:16px;font-size:11px;color:#93A0B4;margin-top:8px}
.dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px}
.muted{color:#93A0B4} .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
</style></head><body>
<h1>EGX30 Portfolio Swing Research</h1>
<div class="grid">
<div class="card"><div class="muted">Stocks</div><strong>${symbols.length}</strong></div>
<div class="card"><div class="muted">Starting capital</div><strong>${formatMoney(CONFIG.initialCapital)} EGP</strong></div>
<div class="card"><div class="muted">Monthly top-up</div><strong>${formatMoney(CONFIG.monthlyTopUp)} EGP</strong></div>
<div class="card"><div class="muted">Max order</div><strong>${formatMoney(CONFIG.maxOrderNotional)} EGP</strong></div>
<div class="card"><div class="muted">Costs</div><strong>${(CONFIG.costPctPerSide * 100).toFixed(2)}% / side</strong></div>
<div class="card"><div class="muted">Idle cash</div><strong>${(CONFIG.idleCashMonthlyRate * 100).toFixed(2)}% / month</strong></div>
</div>
<div class="card">${svgChart(topFull.slice(0, CONFIG.chartTopCount), fullBenchmark)}</div>
<div class="card"><h2>Full-period benchmark</h2>
<p>Final: <strong>${formatMoney(fullBenchmark.metrics.finalEquity)} EGP</strong> · Contributions: ${formatMoney(fullBenchmark.metrics.contributions)} EGP · Interest: ${formatMoney(fullBenchmark.metrics.idleCashInterest)} EGP · TWR ${formatPct(fullBenchmark.metrics.twrPct)} · CAGR ${formatPct(fullBenchmark.metrics.cagrPct)} · Max DD ${formatPct(fullBenchmark.metrics.maxDrawdownPct)}</p>
</div>
<div class="card"><h2>Average ${CONFIG.windowYears}-year window</h2>
<p>Average benchmark CAGR: <strong>${formatPct(averageWindowBenchmarkCagr)}</strong> · Average benchmark max DD: ${formatPct(averageWindowBenchmarkDd)}</p>
<table><thead><tr><th>#</th><th>Strategy</th><th>Regime</th><th>Stop</th><th>Avg CAGR</th><th>Median</th><th>Avg DD</th><th>Win</th><th>PF</th><th>Beat B&amp;H</th></tr></thead>
<tbody>${topWindow
        .map(
            (aggregate, index) =>
                `<tr><td>${index + 1}</td><td>${escapeHtml(aggregate.label)}</td><td>${aggregate.regime ? "ADX" : "off"}</td><td>${aggregate.stop}</td><td>${formatPct(aggregate.avgCagrPct)}</td><td>${formatPct(aggregate.medianCagrPct)}</td><td>${formatPct(aggregate.avgMaxDrawdownPct)}</td><td>${formatPct(aggregate.avgWinRatePct)}</td><td>${formatNumber(aggregate.avgProfitFactor)}</td><td>${formatPct(aggregate.beatBenchmarkPct)}</td></tr>`,
        )
        .join("")}</tbody></table></div>
</body></html>`;
    fs.writeFileSync(path.join(RESULTS_DIR, "summary.html"), html);
}

function main(): void {
    ensureDirectory(RESULTS_DIR);
    ensureDirectory(path.join(RESULTS_DIR, "equity_curves"));

    const symbols = loadResearchSymbols();
    const startTs = CONFIG.startDate
        ? Date.parse(`${CONFIG.startDate}T00:00:00Z`) / 1000
        : Number.NEGATIVE_INFINITY;
    const endTs = Number.POSITIVE_INFINITY;

    console.log(`Full period: ${CONFIG.startDate} → latest (${symbols.length} stocks)`);
    const fullRuns = runFullPeriod(symbols, startTs, endTs);
    const fullBenchmark = buyAndHoldBenchmark(
        symbols,
        portfolioConfig(CONFIG.stopModes[0]),
    );

    const windows = buildWindows(symbols);
    console.log(`\nRolling ${CONFIG.windowYears}-year windows: ${windows.length}`);
    const { runs: windowRuns, benchmarks: windowBenchmarks } = runWindows(
        symbols,
        windows,
    );
    const windowAggregates = aggregateWindows(windowRuns);

    const fullRows = fullRuns.map((run) => ({
        strategy_key: run.key,
        strategy: run.strategy,
        strategy_label: run.label,
        family: run.family,
        regime_filter: run.regime,
        stop_mode: run.stop,
        ...run.metrics,
    }));
    const metricColumns = [
        "strategy_key",
        "strategy",
        "strategy_label",
        "family",
        "regime_filter",
        "stop_mode",
        "finalEquity",
        "totalContributions",
        "netTradingProfit",
        "grossTradingProfit",
        "personalWithdrawals",
        "idleCashInterest",
        "totalReturnPct",
        "timeWeightedReturnPct",
        "cagrPct",
        "maxDrawdownPct",
        "trades",
        "winRatePct",
        "avgWin",
        "avgLoss",
        "profitFactor",
        "expectancy",
        "avgHoldingBars",
    ];
    writeCsv(
        path.join(RESULTS_DIR, "full_period_per_strategy.csv"),
        fullRows,
        metricColumns,
    );
    writeCsv(
        path.join(RESULTS_DIR, "per_strategy.csv"),
        fullRows,
        metricColumns,
    );

    const windowRows = windowRuns.map((run) => ({
        window: run.window,
        window_start: run.windowStart,
        window_end: run.windowEnd,
        strategy_key: run.key,
        strategy: run.strategy,
        strategy_label: run.label,
        family: run.family,
        regime_filter: run.regime,
        stop_mode: run.stop,
        benchmark_cagr_pct: run.benchmarkCagrPct,
        beat_benchmark: run.beatBenchmark,
        ...run.metrics,
    }));
    writeCsv(path.join(
            RESULTS_DIR,
            `${CONFIG.windowYears}_year_windows.csv`,
        ), windowRows, [
        "window",
        "window_start",
        "window_end",
        "strategy_key",
        "strategy",
        "strategy_label",
        "family",
        "regime_filter",
        "stop_mode",
        "benchmark_cagr_pct",
        "beat_benchmark",
        "finalEquity",
        "totalContributions",
        "netTradingProfit",
        "personalWithdrawals",
        "idleCashInterest",
        "timeWeightedReturnPct",
        "cagrPct",
        "maxDrawdownPct",
        "trades",
        "winRatePct",
        "profitFactor",
        "expectancy",
        "avgHoldingBars",
    ]);

    writeCsv(
        path.join(
            RESULTS_DIR,
            `${CONFIG.windowYears}_year_average.csv`,
        ),
        windowAggregates.map((aggregate) => ({
            strategy_key: aggregate.key,
            strategy: aggregate.strategy,
            strategy_label: aggregate.label,
            family: aggregate.family,
            regime_filter: aggregate.regime,
            stop_mode: aggregate.stop,
            windows: aggregate.windows,
            avg_cagr_pct: aggregate.avgCagrPct,
            median_cagr_pct: aggregate.medianCagrPct,
            avg_max_drawdown_pct: aggregate.avgMaxDrawdownPct,
            avg_win_rate_pct: aggregate.avgWinRatePct,
            avg_profit_factor: aggregate.avgProfitFactor,
            avg_expectancy: aggregate.avgExpectancy,
            avg_holding_bars: aggregate.avgHoldingBars,
            avg_idle_cash_interest: aggregate.avgIdleCashInterest,
            beat_buy_hold_pct: aggregate.beatBenchmarkPct,
        })),
        [
            "strategy_key",
            "strategy",
            "strategy_label",
            "family",
            "regime_filter",
            "stop_mode",
            "windows",
            "avg_cagr_pct",
            "median_cagr_pct",
            "avg_max_drawdown_pct",
            "avg_win_rate_pct",
            "avg_profit_factor",
            "avg_expectancy",
            "avg_holding_bars",
            "avg_idle_cash_interest",
            "beat_buy_hold_pct",
        ],
    );

    const tradeRows = fullRuns.flatMap((run) =>
        run.trades.map((trade) => ({
            strategy_key: run.key,
            ...trade,
            entryDate: new Date(trade.entryTime * 1000).toISOString().slice(0, 10),
            exitDate: new Date(trade.exitTime * 1000).toISOString().slice(0, 10),
        })),
    );
    writeCsv(path.join(RESULTS_DIR, "trades.csv"), tradeRows, [
        "strategy_key",
        "symbol",
        "entryDate",
        "exitDate",
        "entryPrice",
        "exitPrice",
        "quantity",
        "grossPnl",
        "fees",
        "netPnl",
        "personalWithdrawal",
        "holdingBars",
        "exitReason",
    ]);

    const perStockRows: Array<Record<string, unknown>> = [];
    for (const run of fullRuns) {
        const bySymbol = new Map<string, PortfolioTrade[]>();
        for (const trade of run.trades) {
            const list = bySymbol.get(trade.symbol) ?? [];
            list.push(trade);
            bySymbol.set(trade.symbol, list);
        }
        for (const [symbol, trades] of bySymbol) {
            const net = trades.reduce((sum, trade) => sum + trade.netPnl, 0);
            const wins = trades.filter((trade) => trade.netPnl > 0).length;
            perStockRows.push({
                strategy_key: run.key,
                strategy_label: run.label,
                symbol,
                trades: trades.length,
                win_rate_pct: (wins / trades.length) * 100,
                net_pnl: net,
                personal_withdrawn: trades.reduce(
                    (sum, trade) => sum + trade.personalWithdrawal,
                    0,
                ),
                avg_holding_bars:
                    trades.reduce((sum, trade) => sum + trade.holdingBars, 0) /
                    trades.length,
            });
        }
    }
    writeCsv(path.join(RESULTS_DIR, "per_stock.csv"), perStockRows, [
        "strategy_key",
        "strategy_label",
        "symbol",
        "trades",
        "win_rate_pct",
        "net_pnl",
        "personal_withdrawn",
        "avg_holding_bars",
    ]);

    for (const run of fullRuns) {
        const safe = run.key.replaceAll("|", "__");
        const lines = [
            "date,equity,cash,invested,deposit,interest,personal_cash,personal_withdrawn,contributions",
            ...run.equityCurve.map((point) =>
                [
                    new Date(point.time * 1000).toISOString().slice(0, 10),
                    point.equity,
                    point.cash,
                    point.invested,
                    point.deposit,
                    point.interest,
                    point.personalCash,
                    point.personalWithdrawn,
                    point.contributions,
                ].join(","),
            ),
        ];
        fs.writeFileSync(
            path.join(RESULTS_DIR, "equity_curves", `${safe}.csv`),
            `${lines.join("\n")}\n`,
        );
    }

    const benchmarkCurve = [
        "date,equity,deposit,interest",
        ...fullBenchmark.equityCurve.map((point) =>
            [
                new Date(point.time * 1000).toISOString().slice(0, 10),
                point.equity,
                point.deposit,
                point.interest,
            ].join(","),
        ),
    ];
    fs.writeFileSync(
        path.join(RESULTS_DIR, "equity_curves", "buy_and_hold_dca.csv"),
        `${benchmarkCurve.join("\n")}\n`,
    );

    writeSummary(
        fullRuns,
        fullBenchmark,
        windowRuns,
        windowBenchmarks,
        windowAggregates,
        symbols,
        windows,
    );

    console.log("\nTop full-period portfolios:");
    for (const run of [...fullRuns]
        .sort((left, right) => right.metrics.cagrPct - left.metrics.cagrPct)
        .slice(0, 8)) {
        console.log(
            `  ${run.key}: CAGR ${run.metrics.cagrPct.toFixed(2)}%, final ${Math.round(run.metrics.finalEquity).toLocaleString()} EGP`,
        );
    }
    console.log(`\nFull benchmark CAGR: ${fullBenchmark.metrics.cagrPct.toFixed(2)}%`);
    console.log(
        `\nTop average ${CONFIG.windowYears}-year windows:`,
    );
    for (const aggregate of windowAggregates.slice(0, 8)) {
        console.log(
            `  ${aggregate.key}: avg ${aggregate.avgCagrPct.toFixed(2)}%, median ${aggregate.medianCagrPct.toFixed(2)}%, beat ${aggregate.beatBenchmarkPct.toFixed(1)}%`,
        );
    }
    console.log(`\nReport: ${path.join(RESULTS_DIR, "summary.html")}`);
}

main();
