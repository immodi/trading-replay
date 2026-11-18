import fs from "node:fs";
import path from "node:path";

import {
    runPortfolioBacktest,
    type PortfolioBar,
    type PortfolioConfig,
    type PortfolioMetrics,
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

type TuneRun = {
    key: string;
    strategy: string;
    label: string;
    regime: boolean;
    riskPct: number;
    stop: string;
    metrics: PortfolioMetrics;
};

type WindowTuneRun = TuneRun & {
    window: string;
    windowStart: string;
    windowEnd: string;
};

function ensureDirectory(directory: string): void {
    fs.mkdirSync(directory, { recursive: true });
}

function csvValue(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "number") {
        return Number.isFinite(value) ? String(value) : "";
    }
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
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

function loadSymbols(): ResearchSymbol[] {
    return loadConstituents()
        .map((entry) => {
            const loaded = loadSymbol(entry);
            const ind = buildIndicators(loaded.bars);
            return {
                ...loaded,
                ind,
                specs: new Map(
                    buildStrategies(loaded.bars, ind).map((spec) => [
                        spec.key,
                        spec,
                    ]),
                ),
            };
        })
        .filter((symbol) => symbol.bars.length >= CONFIG.minHistoryBars);
}

function preparedFor(
    symbols: ResearchSymbol[],
    strategyKey: string,
    regime: boolean,
    startTs: number,
    endTs: number,
): PreparedSymbol[] {
    const prepared: PreparedSymbol[] = [];

    for (const symbol of symbols) {
        const spec = symbol.specs.get(strategyKey);
        if (spec === undefined) continue;
        const gate = regime ? regimeGate(spec.family, symbol.ind.adx) : null;
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

function configFor(
    riskPct: number,
    stop: (typeof CONFIG.tuningStops)[number],
): PortfolioConfig {
    return {
        initialCapital: CONFIG.initialCapital,
        monthlyTopUp: CONFIG.monthlyTopUp,
        maxOrderNotional: CONFIG.maxOrderNotional,
        riskPerTrade: Math.min(riskPct, CONFIG.maxRiskPerTrade),
        maxRiskPerTrade: CONFIG.maxRiskPerTrade,
        costPctPerSide: CONFIG.costPctPerSide,
        fixedFeePerOrder: CONFIG.fixedFeePerOrder,
        idleCashMonthlyRate: CONFIG.idleCashMonthlyRate,
        maxHoldBars: CONFIG.maxHoldBars,
        stopMode: stop.mode,
        atrMultiplier: stop.atrMultiplier,
        fixedStopPct: stop.fixedStopPct,
        personalProfitPct: CONFIG.personalProfitPct,
        personalProfitFixed: CONFIG.personalProfitFixed,
    };
}

function windows(
    symbols: ResearchSymbol[],
): Array<{ label: string; startTs: number; endTs: number }> {
    const firstTime = Math.min(...symbols.map((symbol) => symbol.bars[0].time));
    const lastTime = Math.max(
        ...symbols.map((symbol) => symbol.bars[symbol.bars.length - 1].time),
    );
    const firstYear = new Date(firstTime * 1000).getUTCFullYear();
    const output: Array<{ label: string; startTs: number; endTs: number }> = [];

    for (let year = firstYear; ; year += CONFIG.windowStepYears) {
        const startTs = Date.UTC(year, 0, 1) / 1000;
        const endTs = Date.UTC(year + CONFIG.windowYears, 0, 1) / 1000;
        if (endTs > lastTime + 86_400) break;
        output.push({
            label: `${year}–${year + CONFIG.windowYears - 1}`,
            startTs,
            endTs,
        });
    }

    return output;
}

function finiteMean(values: number[]): number {
    const finite = values.filter((value) => Number.isFinite(value));
    return finite.length === 0
        ? Number.NaN
        : finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function median(values: number[]): number {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (sorted.length === 0) return Number.NaN;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[middle - 1] + sorted[middle]) / 2
        : sorted[middle];
}

function fmtPct(value: number): string {
    return Number.isFinite(value) ? `${value.toFixed(2)}%` : "—";
}

function fmtNum(value: number, digits = 2): string {
    return Number.isFinite(value) ? value.toFixed(digits) : "—";
}

function main(): void {
    ensureDirectory(RESULTS_DIR);
    const symbols = loadSymbols();
    const startTs = Date.parse(`${CONFIG.startDate}T00:00:00Z`) / 1000;
    const endTs = Number.POSITIVE_INFINITY;
    const rolling = windows(symbols);
    const fullRuns: TuneRun[] = [];
    const windowRuns: WindowTuneRun[] = [];

    for (const strategyKey of CONFIG.tuningStrategies) {
        for (const regime of CONFIG.runRegimeVariants ? [false, true] : [false]) {
            for (const riskPct of CONFIG.tuningRisks) {
                for (const stop of CONFIG.tuningStops) {
                    const prepared = preparedFor(
                        symbols,
                        strategyKey,
                        regime,
                        startTs,
                        endTs,
                    );
                    if (prepared.length === 0) continue;
                    const result = runPortfolioBacktest(
                        prepared,
                        configFor(riskPct, stop),
                    );
                    const label = symbols[0].specs.get(strategyKey)?.label ?? strategyKey;
                    const key =
                        `${strategyKey}|${regime ? "regime" : "noregime"}|` +
                        `risk${(riskPct * 100).toFixed(1)}|${stop.key}`;
                    fullRuns.push({
                        key,
                        strategy: strategyKey,
                        label,
                        regime,
                        riskPct,
                        stop: stop.key,
                        metrics: result.metrics,
                    });

                    for (const window of rolling) {
                        const windowPrepared = preparedFor(
                            symbols,
                            strategyKey,
                            regime,
                            window.startTs,
                            window.endTs,
                        );
                        if (windowPrepared.length === 0) continue;
                        const windowResult = runPortfolioBacktest(
                            windowPrepared,
                            configFor(riskPct, stop),
                        );
                        windowRuns.push({
                            key,
                            strategy: strategyKey,
                            label,
                            regime,
                            riskPct,
                            stop: stop.key,
                            window: window.label,
                            windowStart: new Date(window.startTs * 1000)
                                .toISOString()
                                .slice(0, 10),
                            windowEnd: new Date((window.endTs - 86_400) * 1000)
                                .toISOString()
                                .slice(0, 10),
                            metrics: windowResult.metrics,
                        });
                    }
                }
            }
        }
    }

    writeCsv(
        path.join(RESULTS_DIR, "tuning_full.csv"),
        fullRuns.map((run) => ({
            key: run.key,
            strategy: run.strategy,
            label: run.label,
            regime: run.regime,
            risk_pct: run.riskPct * 100,
            stop: run.stop,
            cagr_pct: run.metrics.cagrPct,
            max_drawdown_pct: run.metrics.maxDrawdownPct,
            trades: run.metrics.trades,
            win_rate_pct: run.metrics.winRatePct,
            profit_factor: run.metrics.profitFactor,
            expectancy: run.metrics.expectancy,
            avg_holding_bars: run.metrics.avgHoldingBars,
        })),
        [
            "key",
            "strategy",
            "label",
            "regime",
            "risk_pct",
            "stop",
            "cagr_pct",
            "max_drawdown_pct",
            "trades",
            "win_rate_pct",
            "profit_factor",
            "expectancy",
            "avg_holding_bars",
        ],
    );

    const groups = new Map<string, WindowTuneRun[]>();
    for (const run of windowRuns) {
        const list = groups.get(run.key) ?? [];
        list.push(run);
        groups.set(run.key, list);
    }

    const averages = [...groups.entries()]
        .map(([key, list]) => ({
            key,
            strategy: list[0].strategy,
            label: list[0].label,
            regime: list[0].regime,
            risk_pct: list[0].riskPct * 100,
            stop: list[0].stop,
            windows: list.length,
            avg_cagr_pct: finiteMean(list.map((run) => run.metrics.cagrPct)),
            median_cagr_pct: median(list.map((run) => run.metrics.cagrPct)),
            avg_max_drawdown_pct: finiteMean(
                list.map((run) => run.metrics.maxDrawdownPct),
            ),
            avg_win_rate_pct: finiteMean(
                list.map((run) => run.metrics.winRatePct),
            ),
            avg_profit_factor: finiteMean(
                list.map((run) => run.metrics.profitFactor),
            ),
            avg_expectancy: finiteMean(list.map((run) => run.metrics.expectancy)),
            avg_holding_bars: finiteMean(
                list.map((run) => run.metrics.avgHoldingBars),
            ),
        }))
        .sort((left, right) => right.avg_cagr_pct - left.avg_cagr_pct);

    writeCsv(
        path.join(
            RESULTS_DIR,
            `tuning_${CONFIG.windowYears}_year_average.csv`,
        ),
        averages,
        [
            "key",
            "strategy",
            "label",
            "regime",
            "risk_pct",
            "stop",
            "windows",
            "avg_cagr_pct",
            "median_cagr_pct",
            "avg_max_drawdown_pct",
            "avg_win_rate_pct",
            "avg_profit_factor",
            "avg_expectancy",
            "avg_holding_bars",
        ],
    );

    writeCsv(
        path.join(
            RESULTS_DIR,
            `tuning_${CONFIG.windowYears}_year_windows.csv`,
        ),
        windowRuns.map((run) => ({
            key: run.key,
            window: run.window,
            window_start: run.windowStart,
            window_end: run.windowEnd,
            strategy: run.strategy,
            label: run.label,
            regime: run.regime,
            risk_pct: run.riskPct * 100,
            stop: run.stop,
            cagr_pct: run.metrics.cagrPct,
            max_drawdown_pct: run.metrics.maxDrawdownPct,
            trades: run.metrics.trades,
            win_rate_pct: run.metrics.winRatePct,
            profit_factor: run.metrics.profitFactor,
            expectancy: run.metrics.expectancy,
        })),
        [
            "key",
            "window",
            "window_start",
            "window_end",
            "strategy",
            "label",
            "regime",
            "risk_pct",
            "stop",
            "cagr_pct",
            "max_drawdown_pct",
            "trades",
            "win_rate_pct",
            "profit_factor",
            "expectancy",
        ],
    );

    const lines = [
        "# Stop & Risk Tuning",
        "",
        `- Account risk cap: **${(CONFIG.maxRiskPerTrade * 100).toFixed(2)}% per trade**`,
        `- Risk variants: ${CONFIG.tuningRisks.map((risk) => `${(risk * 100).toFixed(1)}%`).join(", ")}`,
        `- Stop variants: ${CONFIG.tuningStops.map((stop) => stop.key).join(", ")}`,
        `- Windows: ${rolling.length} × ${CONFIG.windowYears} years`,
        "",
        `## Best average ${CONFIG.windowYears}-year results`,
        "",
        "| Strategy | Regime | Risk | Stop | Avg CAGR | Median | Avg DD | Win | PF | Expectancy |",
        "| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ];

    for (const row of averages.slice(0, 30)) {
        lines.push(
            `| ${row.label} | ${row.regime ? "ADX" : "off"} | ${row.risk_pct.toFixed(1)}% | ${row.stop} | ` +
                `${fmtPct(row.avg_cagr_pct)} | ${fmtPct(row.median_cagr_pct)} | ` +
                `${fmtPct(row.avg_max_drawdown_pct)} | ${fmtPct(row.avg_win_rate_pct)} | ` +
                `${fmtNum(row.avg_profit_factor)} | ${fmtNum(row.avg_expectancy, 0)} |`,
        );
    }

    lines.push(
        "",
        "## Best full-period results",
        "",
        "| Strategy | Regime | Risk | Stop | CAGR | Max DD | Win | PF | Expectancy |",
        "| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |",
    );
    for (const run of [...fullRuns]
        .sort((left, right) => right.metrics.cagrPct - left.metrics.cagrPct)
        .slice(0, 30)) {
        lines.push(
            `| ${run.label} | ${run.regime ? "ADX" : "off"} | ${(run.riskPct * 100).toFixed(1)}% | ${run.stop} | ` +
                `${fmtPct(run.metrics.cagrPct)} | ${fmtPct(run.metrics.maxDrawdownPct)} | ` +
                `${fmtPct(run.metrics.winRatePct)} | ${fmtNum(run.metrics.profitFactor)} | ` +
                `${fmtNum(run.metrics.expectancy, 0)} |`,
        );
    }

    fs.writeFileSync(path.join(RESULTS_DIR, "tuning_summary.md"), `${lines.join("\n")}\n`);
    console.log(`Tuning report: ${path.join(RESULTS_DIR, "tuning_summary.md")}`);
}

main();
