import type { ClosedTrade, SummaryMetrics } from "./types";

function finiteOrNull(value: number): number | null {
    return Number.isFinite(value) ? value : null;
}

export function computeSummary(
    trades: ClosedTrade[],
    startingEquity: number,
    endingEquity: number,
    maxDrawdown: number,
    maxDrawdownPct: number | null,
    rejectedActions: Record<string, number>,
    pendingActionsAtEnd: number,
): SummaryMetrics {
    const closedTrades = trades.length;
    const wins = trades.filter((trade) => trade.netPnl > 0).length;
    const losses = trades.filter((trade) => trade.netPnl < 0).length;
    const breakeven = closedTrades - wins - losses;

    const netPnl = trades.reduce((total, trade) => total + trade.netPnl, 0);
    const grossWinningPnl = trades.reduce(
        (total, trade) => total + Math.max(0, trade.grossPnl),
        0,
    );
    const grossLosingPnl = Math.abs(
        trades.reduce((total, trade) => total + Math.min(0, trade.grossPnl), 0),
    );
    const netWinningPnl = trades.reduce(
        (total, trade) => total + Math.max(0, trade.netPnl),
        0,
    );
    const netLosingPnl = Math.abs(
        trades.reduce((total, trade) => total + Math.min(0, trade.netPnl), 0),
    );

    const largestWinner = trades.reduce<number | null>(
        (largest, trade) =>
            trade.netPnl > 0 &&
            (largest === null || trade.netPnl > largest)
                ? trade.netPnl
                : largest,
        null,
    );
    const largestLoser = trades.reduce<number | null>(
        (largest, trade) =>
            trade.netPnl < 0 &&
            (largest === null || trade.netPnl < largest)
                ? trade.netPnl
                : largest,
        null,
    );

    return {
        closedTrades,
        wins,
        losses,
        breakeven,
        winRatePct:
            closedTrades === 0 ? null : finiteOrNull((wins / closedTrades) * 100),
        netPnl: finiteOrNull(netPnl) ?? 0,
        grossWinningPnl: finiteOrNull(grossWinningPnl) ?? 0,
        grossLosingPnl: finiteOrNull(grossLosingPnl) ?? 0,
        profitFactor:
            netLosingPnl > 0 ? finiteOrNull(netWinningPnl / netLosingPnl) : null,
        averageWin:
            wins > 0 ? finiteOrNull(netWinningPnl / wins) : null,
        averageLoss:
            losses > 0 ? finiteOrNull(netLosingPnl / losses) : null,
        expectancyPerTrade:
            closedTrades > 0 ? finiteOrNull(netPnl / closedTrades) : null,
        largestWinner: largestWinner === null ? null : finiteOrNull(largestWinner),
        largestLoser: largestLoser === null ? null : finiteOrNull(largestLoser),
        maxDrawdown: finiteOrNull(maxDrawdown) ?? 0,
        maxDrawdownPct,
        startingEquity: finiteOrNull(startingEquity) ?? 0,
        endingEquity: finiteOrNull(endingEquity) ?? 0,
        rejectedActions: { ...rejectedActions },
        pendingActionsAtEnd,
    };
}
