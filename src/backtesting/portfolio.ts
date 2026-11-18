/**
 * Daily portfolio backtest used by the stock research runner.
 *
 * The portfolio is shared across a universe of symbols: one position per
 * symbol, no cap on concurrent symbols, shared cash, monthly contributions,
 * percentage costs, and optional withdrawal of a slice of each winning trade.
 */

export type PortfolioBar = {
    symbol: string;
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
};

export type PreparedSymbol = {
    symbol: string;
    bars: PortfolioBar[];
    /** Entry signal at this bar's close. */
    entry: boolean[];
    /** Strategy exit signal at this bar's close. */
    exit: boolean[];
    /** ATR(14) aligned with bars. */
    atr: number[];
};

export type PortfolioConfig = {
    initialCapital: number;
    /** Added at the first trading day of every new calendar month. */
    monthlyTopUp: number;
    maxOrderNotional: number;
    riskPerTrade: number;
    /** Hard cap on account risk per trade (e.g. 0.02 = 2%). */
    maxRiskPerTrade: number;
    costPctPerSide: number;
    fixedFeePerOrder: number;
    /** Monthly effective interest earned on uninvested cash. */
    idleCashMonthlyRate: number;
    maxHoldBars: number;
    stopMode: "atr" | "percent";
    atrMultiplier: number;
    fixedStopPct: number;
    /** Withdraw this fraction of each winning trade's net profit. */
    personalProfitPct: number;
    /** Optional fixed EGP amount withdrawn from each winning trade. */
    personalProfitFixed: number;
};

export type PortfolioTrade = {
    symbol: string;
    entryTime: number;
    exitTime: number;
    entryPrice: number;
    exitPrice: number;
    quantity: number;
    grossPnl: number;
    fees: number;
    netPnl: number;
    personalWithdrawal: number;
    holdingBars: number;
    exitReason: string;
};

export type PortfolioEquityPoint = {
    time: number;
    equity: number;
    cash: number;
    invested: number;
    deposit: number;
    /** Cash interest credited at the start of this date. */
    interest: number;
    personalCash: number;
    personalWithdrawn: number;
    contributions: number;
};

export type PortfolioMetrics = {
    finalEquity: number;
    totalContributions: number;
    netTradingProfit: number;
    grossTradingProfit: number;
    personalWithdrawals: number;
    idleCashInterest: number;
    totalReturnPct: number;
    timeWeightedReturnPct: number;
    cagrPct: number;
    maxDrawdownPct: number;
    trades: number;
    winRatePct: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number;
    expectancy: number;
    avgHoldingBars: number;
};

export type PortfolioResult = {
    equityCurve: PortfolioEquityPoint[];
    trades: PortfolioTrade[];
    metrics: PortfolioMetrics;
};

type Position = {
    symbol: string;
    entryBarIndex: number;
    entryTime: number;
    entryPrice: number;
    quantity: number;
    stopPrice: number;
    entryFee: number;
};

function fee(notional: number, config: PortfolioConfig): number {
    return (
        Math.abs(notional) * config.costPctPerSide +
        config.fixedFeePerOrder
    );
}

function monthIndex(time: number): number {
    const date = new Date(time * 1000);
    return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

function maxDrawdownPct(equity: number[]): number {
    let peak = 0;
    let worst = 0;

    for (const value of equity) {
        if (value > peak) peak = value;
        if (peak > 0) {
            worst = Math.max(worst, (peak - value) / peak);
        }
    }

    return worst * 100;
}

export function runPortfolioBacktest(
    symbols: PreparedSymbol[],
    config: PortfolioConfig,
): PortfolioResult {
    type BarAtDate = {
        symbol: PreparedSymbol;
        bar: PortfolioBar;
        barIndex: number;
    };

    const barsByDate = new Map<number, BarAtDate[]>();
    const lastClose = new Map<string, number>();
    const barIndexByTime = new Map<string, Map<number, number>>();

    for (const series of symbols) {
        const indexMap = new Map<number, number>();
        series.bars.forEach((bar, barIndex) => {
            indexMap.set(bar.time, barIndex);
            lastClose.set(series.symbol, bar.close);

            const existing = barsByDate.get(bar.time);
            if (existing) {
                existing.push({ symbol: series, bar, barIndex });
            } else {
                barsByDate.set(bar.time, [{ symbol: series, bar, barIndex }]);
            }
        });
        barIndexByTime.set(series.symbol, indexMap);
    }

    const calendar = [...barsByDate.keys()].sort((a, b) => a - b);
    const positions = new Map<string, Position>();
    const pendingEntries = new Map<string, { atr: number }>();
    const pendingExits = new Map<string, string>();
    const equityCurve: PortfolioEquityPoint[] = [];
    const trades: PortfolioTrade[] = [];

    let cash = config.initialCapital;
    let contributions = config.initialCapital;
    let personalCash = 0;
    let personalWithdrawn = 0;
    let interestEarned = 0;
    let lastTopUpMonthIndex =
        calendar.length > 0 ? monthIndex(calendar[0]) : -1;

    function portfolioEquity(): number {
        let invested = 0;
        for (const position of positions.values()) {
            invested +=
                position.quantity *
                (lastClose.get(position.symbol) ?? position.entryPrice);
        }
        return cash + invested;
    }

    function closePosition(
        position: Position,
        exitTime: number,
        exitPrice: number,
        reason: string,
        exitBarIndex: number,
    ): void {
        const notional = position.quantity * exitPrice;
        const exitFee = fee(notional, config);
        cash += notional - exitFee;
        const gross = (exitPrice - position.entryPrice) * position.quantity;
        const net = gross - position.entryFee - exitFee;
        let withdrawal = 0;

        if (net > 0) {
            withdrawal = Math.min(
                net,
                net * config.personalProfitPct + config.personalProfitFixed,
            );
            cash -= withdrawal;
            personalCash += withdrawal;
            personalWithdrawn += withdrawal;
        }

        trades.push({
            symbol: position.symbol,
            entryTime: position.entryTime,
            exitTime,
            entryPrice: position.entryPrice,
            exitPrice,
            quantity: position.quantity,
            grossPnl: gross,
            fees: position.entryFee + exitFee,
            netPnl: net,
            personalWithdrawal: withdrawal,
            holdingBars: Math.max(0, exitBarIndex - position.entryBarIndex),
            exitReason: reason,
        });

        positions.delete(position.symbol);
    }

    for (const time of calendar) {
        const barsToday = (barsByDate.get(time) ?? []).slice().sort((left, right) =>
            left.symbol.symbol.localeCompare(right.symbol.symbol),
        );

        // Month boundary: credit idle-cash interest, then add the contribution.
        // If a month had no sessions, both are caught up month by month.
        const currentMonth = monthIndex(time);
        let deposit = 0;
        let interest = 0;

        while (
            lastTopUpMonthIndex >= 0 &&
            lastTopUpMonthIndex < currentMonth
        ) {
            lastTopUpMonthIndex += 1;
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

        if (lastTopUpMonthIndex < 0) {
            lastTopUpMonthIndex = currentMonth;
        }

        // Fill exits decided at the previous close.
        for (const { symbol, bar, barIndex } of barsToday) {
            const reason = pendingExits.get(symbol.symbol);
            const position = positions.get(symbol.symbol);
            if (reason !== undefined && position !== undefined) {
                pendingExits.delete(symbol.symbol);
                closePosition(position, time, bar.open, reason, barIndex);
            }
        }

        // Fill entries decided at the previous close.
        for (const { symbol, bar, barIndex } of barsToday) {
            const pending = pendingEntries.get(symbol.symbol);
            if (pending === undefined || positions.has(symbol.symbol)) continue;
            pendingEntries.delete(symbol.symbol);

            const stopDistance =
                config.stopMode === "atr"
                    ? pending.atr * config.atrMultiplier
                    : bar.open * config.fixedStopPct;

            if (!Number.isFinite(stopDistance) || stopDistance <= 0) {
                continue;
            }

            const equity = portfolioEquity();
            const riskPerTrade = Math.min(
                config.riskPerTrade,
                config.maxRiskPerTrade,
            );
            const riskBudget = equity * riskPerTrade;
            const riskQuantity = Math.floor(riskBudget / stopDistance);
            const maxOrderQuantity = Math.floor(
                config.maxOrderNotional / bar.open,
            );
            const maxCashQuantity = Math.floor(
                Math.max(0, cash - config.fixedFeePerOrder) /
                    (bar.open * (1 + config.costPctPerSide)),
            );
            const quantity = Math.min(
                riskQuantity,
                maxOrderQuantity,
                maxCashQuantity,
            );

            if (quantity < 1) continue;

            const notional = quantity * bar.open;
            const entryFee = fee(notional, config);
            if (notional + entryFee > cash) continue;

            cash -= notional + entryFee;
            positions.set(symbol.symbol, {
                symbol: symbol.symbol,
                entryBarIndex: barIndex,
                entryTime: time,
                entryPrice: bar.open,
                quantity,
                stopPrice: bar.open - stopDistance,
                entryFee,
            });
        }

        // Intraday protective stops (including the entry bar).
        for (const { symbol, bar, barIndex } of barsToday) {
            const position = positions.get(symbol.symbol);
            if (position === undefined) continue;

            if (bar.open <= position.stopPrice) {
                closePosition(
                    position,
                    time,
                    bar.open,
                    "stop_gap",
                    barIndex,
                );
            } else if (bar.low <= position.stopPrice) {
                closePosition(
                    position,
                    time,
                    position.stopPrice,
                    "stop",
                    barIndex,
                );
            }
        }

        // Mark closes before computing equity.
        for (const { symbol, bar } of barsToday) {
            lastClose.set(symbol.symbol, bar.close);
        }

        let invested = 0;
        for (const position of positions.values()) {
            invested +=
                position.quantity *
                (lastClose.get(position.symbol) ?? position.entryPrice);
        }

        equityCurve.push({
            time,
            equity: cash + invested,
            cash,
            invested,
            deposit,
            interest,
            personalCash,
            personalWithdrawn,
            contributions,
        });

        const isLastDate = time === calendar[calendar.length - 1];

        // Decide next-open exits / entries from this close.
        for (const { symbol, barIndex } of barsToday) {
            const position = positions.get(symbol.symbol);

            if (position !== undefined) {
                const held = barIndex - position.entryBarIndex + 1;
                if (held >= config.maxHoldBars) {
                    pendingExits.set(symbol.symbol, "time_stop");
                } else if (symbol.exit[barIndex]) {
                    pendingExits.set(symbol.symbol, "strategy_exit");
                }
                continue;
            }

            if (
                !isLastDate &&
                symbol.entry[barIndex] &&
                !pendingEntries.has(symbol.symbol)
            ) {
                const atr = symbol.atr[barIndex];
                if (config.stopMode === "atr" && !Number.isFinite(atr)) {
                    continue;
                }
                pendingEntries.set(symbol.symbol, { atr });
            }
        }
    }

    // Close anything still open at its last available close.
    for (const position of [...positions.values()]) {
        const series = symbols.find(
            (candidate) => candidate.symbol === position.symbol,
        );
        if (series === undefined || series.bars.length === 0) continue;
        const lastBar = series.bars[series.bars.length - 1];
        const indexMap = barIndexByTime.get(position.symbol);
        closePosition(
            position,
            lastBar.time,
            lastBar.close,
            "end_of_data",
            indexMap?.get(lastBar.time) ?? series.bars.length - 1,
        );
    }

    if (equityCurve.length > 0) {
        const last = equityCurve[equityCurve.length - 1];
        last.cash = cash;
        last.equity = cash;
        last.invested = 0;
        last.personalCash = personalCash;
        last.personalWithdrawn = personalWithdrawn;
    }

    // Time-weighted return from the external cash flows (deposits/withdrawals).
    let twr = 1;
    for (let index = 1; index < equityCurve.length; index += 1) {
        const previous = equityCurve[index - 1];
        const current = equityCurve[index];
        const externalFlow =
            current.deposit -
            (current.personalWithdrawn - previous.personalWithdrawn);
        if (previous.equity > 0) {
            twr *= (current.equity - externalFlow) / previous.equity;
        }
    }

    const firstTime = equityCurve[0]?.time ?? 0;
    const lastTime = equityCurve[equityCurve.length - 1]?.time ?? firstTime;
    const years = Math.max(1, (lastTime - firstTime) / (365.25 * 86_400));
    const finalEquity = cash;
    const totalReturnPct = (twr - 1) * 100;
    const cagrPct =
        twr > 0 ? (Math.pow(twr, 1 / years) - 1) * 100 : Number.NaN;
    const equityValues = equityCurve.map((point) => point.equity);
    const netPnl = trades.map((trade) => trade.netPnl);
    const wins = netPnl.filter((value) => value > 0);
    const losses = netPnl.filter((value) => value < 0);
    const grossProfit = wins.reduce((sum, value) => sum + value, 0);
    const grossLoss = Math.abs(losses.reduce((sum, value) => sum + value, 0));

    return {
        equityCurve,
        trades,
        metrics: {
            finalEquity,
            totalContributions: contributions,
            netTradingProfit: finalEquity - contributions,
            grossTradingProfit:
                finalEquity + personalWithdrawn - contributions,
            personalWithdrawals: personalWithdrawn,
            idleCashInterest: interestEarned,
            totalReturnPct,
            timeWeightedReturnPct: totalReturnPct,
            cagrPct,
            maxDrawdownPct: maxDrawdownPct(equityValues),
            trades: trades.length,
            winRatePct:
                netPnl.length === 0
                    ? Number.NaN
                    : (wins.length / netPnl.length) * 100,
            avgWin:
                wins.length === 0
                    ? Number.NaN
                    : wins.reduce((sum, value) => sum + value, 0) /
                      wins.length,
            avgLoss:
                losses.length === 0
                    ? Number.NaN
                    : losses.reduce((sum, value) => sum + value, 0) /
                      losses.length,
            profitFactor:
                grossLoss === 0
                    ? grossProfit > 0
                        ? Number.POSITIVE_INFINITY
                        : Number.NaN
                    : grossProfit / grossLoss,
            expectancy:
                netPnl.length === 0
                    ? Number.NaN
                    : netPnl.reduce((sum, value) => sum + value, 0) /
                      netPnl.length,
            avgHoldingBars:
                trades.length === 0
                    ? Number.NaN
                    : trades.reduce(
                          (sum, trade) => sum + trade.holdingBars,
                          0,
                      ) / trades.length,
        },
    };
}
