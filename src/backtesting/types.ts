/** Public, strategy-facing bar shape. Never includes replay implementation fields. */
export interface BacktestBar {
    time: number;
    timeISO: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export type StrategySide = "long" | "short";

export type ExitReason =
    | "stop_loss"
    | "take_profit"
    | "strategy_exit"
    | "exit_all"
    | "end_of_test";

export interface InstrumentContext {
    id: string;
    symbol: string;
    pointValue: number;
    commissionPerSide: number;
}

export interface AccountContext {
    startingCapital: number;
    realizedNetPnl: number;
    unrealizedPnlAtClose: number;
    equityAtClose: number;
    closedTrades: number;
    currentDrawdown: number;
    currentDrawdownPct: number | null;
}

export interface OpenPositionView {
    id: string;
    side: StrategySide;
    quantity: number;
    entryTime: number;
    entryPrice: number;
    stopLossPrice?: number;
    takeProfitPrice?: number;
}

export interface HistoryApi {
    readonly length: number;
    at(offset: number): BacktestBar | null;
    last(count: number): BacktestBar[];
}

export interface StrategyTimeContext {
    utcYear: number;
    utcMonth: number;
    utcDay: number;
    utcHour: number;
    utcMinute: number;
    utcDayOfWeek: number;
}

export interface BarContext {
    apiVersion: 1;
    index: number;
    isWarmup: boolean;
    bar: BacktestBar;
    history: HistoryApi;
    instrument: InstrumentContext;
    params: Readonly<Record<string, unknown>>;
    positions: OpenPositionView[];
    account: AccountContext;
    time: StrategyTimeContext;
}

export interface EnterAction {
    type: "enter";
    side: StrategySide;
    quantity?: number;
    stopLossPoints?: number;
    takeProfitPoints?: number;
    stopLossPrice?: number;
    takeProfitPrice?: number;
    tag?: string;
}

export interface ExitAction {
    type: "exit";
    positionId: string;
    reason?: string;
}

export interface ExitAllAction {
    type: "exitAll";
    reason?: string;
}

export type StrategyAction = EnterAction | ExitAction | ExitAllAction;

export interface StrategyInstance {
    onBar(context: BarContext): StrategyAction | StrategyAction[] | null | undefined;
}

export type StrategyParameter =
    | {
          key: string;
          label: string;
          type: "number";
          default: number;
          min?: number;
          max?: number;
          step?: number;
          advanced?: boolean;
      }
    | {
          key: string;
          label: string;
          type: "boolean";
          default: boolean;
          advanced?: boolean;
      }
    | {
          key: string;
          label: string;
          type: "string";
          default: string;
          advanced?: boolean;
      };

export interface StrategyMetadata {
    apiVersion: 1;
    id: string;
    name: string;
    version: string;
    description?: string;
    warmupBars: number;
    maxLookbackBars: number;
    parameters: StrategyParameter[];
}

export interface StrategyFactoryContext {
    params: Readonly<Record<string, unknown>>;
    instrument: InstrumentContext;
}

export interface StrategyModule {
    metadata: StrategyMetadata;
    createStrategy(context: StrategyFactoryContext): StrategyInstance;
}

export interface BacktestRunConfig {
    instrument: InstrumentContext;
    startDateUTC: string;
    endDateUTC: string;
    startTs: number;
    endTsExclusive: number;
    timeframeMinutes: number;
    startingCapital: number;
    slippagePointsPerSide: number;
    maxOpenPositions: number;
    warmupBars: number;
    maxLookbackBars: number;
    parameters: Record<string, unknown>;
}

export interface ClosedTrade {
    id: string;
    side: StrategySide;
    quantity: number;
    entryTime: number;
    entryTimeISO: string;
    entryPrice: number;
    exitTime: number;
    exitTimeISO: string;
    exitPrice: number;
    exitReason: ExitReason;
    exitNote?: string;
    stopLossPrice?: number;
    takeProfitPrice?: number;
    barsHeld: number;
    tag?: string;
    grossPnl: number;
    commissionCost: number;
    slippageCostEstimate: number;
    netPnl: number;
}

export interface SummaryMetrics {
    closedTrades: number;
    wins: number;
    losses: number;
    breakeven: number;
    winRatePct: number | null;
    netPnl: number;
    grossWinningPnl: number;
    grossLosingPnl: number;
    profitFactor: number | null;
    averageWin: number | null;
    averageLoss: number | null;
    expectancyPerTrade: number | null;
    largestWinner: number | null;
    largestLoser: number | null;
    maxDrawdown: number;
    maxDrawdownPct: number | null;
    startingEquity: number;
    endingEquity: number;
    rejectedActions: Record<string, number>;
    pendingActionsAtEnd: number;
}

export interface EquityPoint {
    time: number;
    timeISO: string;
    equity: number;
    realizedNetPnl: number;
    unrealizedPnlAtClose: number;
    drawdown: number;
    drawdownPct: number | null;
}

export interface DataQualityIssue {
    type: string;
    message: string;
    time?: number;
    timeISO?: string;
    samples?: Array<{ time: number; timeISO: string }>;
    count?: number;
}

export interface WarmupReport {
    requestedBars: number;
    availableBars: number;
    actualBars: number;
    insufficient: boolean;
}

export interface DataQualityReport {
    baseBarsInRange: number;
    baseBarsProcessed: number;
    strategyBarsProcessed: number;
    inRangeStrategyBars: number;
    warmup: WarmupReport;
    warnings: DataQualityIssue[];
    hardErrors: DataQualityIssue[];
}

export interface ExecutionAssumptions {
    marketFill: string;
    bothStopAndTargetTouched: string;
    stopGapFill: string;
    takeProfitFill: string;
    forcedClose: string;
    drawdown: string;
    positionSizing: string;
    openingGapPriority: string;
}

export interface BacktestResult {
    trades: ClosedTrade[];
    summary: SummaryMetrics;
    equityCurve: EquityPoint[];
    dataQuality: DataQualityReport;
    assumptions: ExecutionAssumptions;
}

export interface BacktestExport {
    schemaVersion: 1;
    application: "TradeReplay";
    exportedAt: string;
    strategy: {
        id: string;
        name: string;
        version: string;
        apiVersion: 1;
        fileName: string;
        source: string;
        parameters: Record<string, unknown>;
    };
    instrument: InstrumentContext;
    settings: {
        startDateUTC: string;
        endDateUTC: string;
        timeframeMinutes: number;
        startingCapital: number;
        slippagePointsPerSide: number;
        maxOpenPositions: number;
        maxContractsPerEntry: number;
        warmupBars: number;
        forcedCloseAtEnd: boolean;
        executionAssumptions: ExecutionAssumptions;
    };
    dataQuality: DataQualityReport;
    summary: SummaryMetrics;
    equityCurve: EquityPoint[];
    trades: ClosedTrade[];
}
