# TradeReplay — Systematic Backtesting Tab

**Status:** Implementation specification for OpenCode  
**Scope:** First usable MVP; browser-only, no application persistence  
**Primary goal:** Run a user-supplied JavaScript strategy against a large historical candle range automatically, display reproducible results, and let the user export those results as JSON.

---

## 1. Product goal

Add a new **Systematic Backtest** page/tab to TradeReplay alongside the existing **Manual Replay** experience.

Manual Replay must continue to work as it does today. Systematic Backtest is a separate mode: instead of a person advancing through candles and manually placing trades, a JavaScript strategy is called for each completed historical bar. The simulation engine executes the strategy's requested actions under documented fill rules, records trades, calculates performance metrics, and displays the result.

The user will write or generate the strategy source outside TradeReplay (for example, with an editor or coding agent), save it as a single `.js` file, and upload it. **Do not build an in-app code editor or scripting language.**

### In scope

- A new tab/page named **Systematic Backtest**.
- Reuse the currently selected/imported candle source, including the source's `pointValue` and default commission.
- Select an inclusive UTC date range and simulation timeframe.
- Upload and validate a single JavaScript strategy module.
- Render strategy parameters described by the module's metadata.
- Run the simulation chronologically over all candles in the requested range, not one day at a time.
- Let the strategy choose the contract size for every position via the `enter` action's `quantity`; there is no automatic or UI-level position sizing.
- Run computation in a Web Worker so the UI remains responsive, with progress and cancellation.
- Produce a trade list, summary statistics, and an equity curve.
- Export the completed run as a `.json` file using an explicit user action.
- Keep the strategy, parameters, run state, and results in memory only.
- Add deterministic tests for the backtest engine and order-fill rules.

### Explicitly out of scope for this MVP

- No in-app strategy editor, JavaScript syntax highlighting, or AI strategy generation.
- No automatic optimization, parameter sweeps, walk-forward optimizer, Monte Carlo analysis, or portfolio/multi-symbol runs.
- No live trading, broker connection, paper trading, or network API integration.
- No auto-saving strategies/results to localStorage, OPFS, IndexedDB, server storage, or a database.
- No chart overlay of all trades or click-a-trade-to-jump-to-Manual-Replay integration yet.
- No limit/stop entry orders, partial fills, scaling out, spread modeling, or multi-leg strategies in the first version.
- No promise that a backtest predicts real execution or future profitability.

---

## 2. Current project constraints and integration points

The project is a React + TypeScript + Vite application. Relevant current code includes:

- `src/App.tsx`: chooses between the data-source screen and `ChartComponent`.
- `src/components/source/SourceSelect.tsx` and `SourceView.tsx`: import/list/select candle datasets.
- `src/components/chart/Chart.tsx`: existing Manual Replay screen.
- `src/types/candle.ts`: `RawCandle` and `Candle` OHLCV types.
- `src/types/candleSource.ts`: `CandleSourceConfig` and `CandleSource` interfaces.
- `src/data/sources/candleSource.ts`: loads and caches an entire JSON dataset internally, but currently exposes only `loadDay`, limited `getHistory`, and `getRange`.
- `src/data/opfs.ts`: loads imported source files from Origin Private File System (OPFS).
- `src/utils/aggregateCandle.ts`: current candle aggregation helper.
- `src/utils/calculatePositionPL.ts`: existing commission/P&L conventions.

**Do not implement systematic backtesting by driving `useReplay`, `useTrade`, or the manual replay timer.** Those hooks model an interactive session and persisted positions. Create a pure, deterministic batch simulation engine with its own order/trade state. Share small pure utilities only where the semantics are genuinely identical.

### 2.1 Navigation

Refactor `App.tsx` into an app shell that can select among:

- **Data Sources** — the existing add/list/select source screen.
- **Manual Replay** — the existing `ChartComponent`.
- **Systematic Backtest** — the new page.

Keep the selected `CandleSourceConfig` in `App` state. Add a visible top-level tab/navigation bar that remains available in Manual Replay and Systematic Backtest. Selecting a source should make it the active source and continue to make Manual Replay the default destination, preserving current user expectations.

Manual Replay and Systematic Backtest tabs must be disabled until a valid active source exists. The Data Sources tab must remain accessible after selecting a source; users need a way to return to the source manager without reloading the page. Changing tabs must not change or delete the active source.

Keep the loaded strategy text, parameter values, and completed results in React/in-memory state while the app remains open, even if the user switches to another tab and back. They may be lost on full page reload. Do not serialize them to any persistence layer. In the recommended implementation, keep the backtest page mounted (hidden when inactive) or lift its workspace state to `App`; otherwise unmounting the page will discard this state. Switching tabs does not cancel a running backtest; full app unmount or an explicit Cancel Run terminates the worker.

### 2.2 Load all dataset candles

Add an explicit `loadAll(): Promise<Candle[]>` (or an equivalently named method) to `CandleSource` and implement it in `createCandleSource` by using the existing `getData(config.fileName)` cache. This should return the entire ordered base-timeframe dataset with the existing `Candle` shape.

- The batch engine must not use `getHistory`, because it defaults to only 200 candles.
- It must not loop over `loadDay` for each day.
- Do not copy or rewrite the dataset to OPFS for this feature.
- Avoid making several independent full copies of a large dataset.
- Before handing bars to strategy code, normalize them to the public backtest bar shape described below; do not expose `highHistory` or `lowHistory` implementation details.

If the selected source file cannot be loaded or contains no candles, show a readable error and do not start a run.

---

## 3. User experience and page layout

Use the existing dark theme and component styling conventions. The page should be understandable to someone who has never used a systematic tester.

### 3.1 Configuration panel

At the top, show the active source:

- Symbol and source name/file.
- Source point value in dollars per point per contract (read-only in the MVP).
- Source commission per contract per side, editable as a **run-only override**.
- Dataset first/last UTC date and number of base candles after loading.

Then provide:

1. **Strategy file** — file picker accepting `.js` (also accept `.mjs` if implementation makes it straightforward); show filename, size, strategy name/version after successful validation, and validation/runtime errors.
2. **Date range** — Start date and End date, inclusive, using UTC calendar dates. Default to the first and last date available in the dataset. Prevent Start > End and dates outside the dataset range.
3. **Timeframe** — 1, 5, 15, 30, or 60 minutes. Default to 1 minute. The strategy is called once per completed bar at this timeframe.
4. **Commission / contract / side** — default to `CandleSourceConfig.commission`; changing it must not mutate the saved source configuration.
5. **Slippage (points per side)** — non-negative decimal, default `0`. This is an adverse per-fill adjustment. It must be reflected in simulated fills and exported settings.
6. **Starting capital** — default `$10,000`; used for equity and drawdown percentages. It is not used for automatic position sizing. The strategy controls the contract size for each position by returning `quantity` on every `enter` action; there is no global "contracts per trade" setting.
7. **Maximum open positions** — integer, default `1`, capped at a reasonable value (for example, 20). This limits the number of separate open positions, not the number of contracts in a position; contract size remains strategy-controlled. Entry signals are ignored and counted as rejected when this limit has already been reached. Do not allow pyramiding accidentally just because a strategy keeps returning entry signals.
8. **Warm-up bars** — display the strategy's metadata default and allow override within `0..10,000`. Warm-up bars are counted in **generated strategy bars after timeframe aggregation**, not raw 1-minute bars. They initialize strategy state but cannot create orders or directly contribute to metrics. The same unit is used for `index`, `history`, progress totals, and data-quality counts.
9. A **data quality report** generated for the chosen range before running.

Buttons:

- **Validate Strategy** — loads and checks the selected module in the strategy worker without running historical bars.
- **Run Backtest** — enabled only when source, dates, settings, and strategy pass validation.
- **Cancel Run** — visible during a run; terminates the worker and marks the run cancelled. Do not expose partial results as a completed backtest.
- **Export JSON** — available only after a successful completed run.

During execution show progress, e.g. `Processing 125,000 / 480,000 bars (26%)`. Progress messages must be batched, not sent for every single candle.

### 3.2 Results panel

On successful completion show summary cards for:

- Net P&L.
- Number of closed trades.
- Win rate.
- Profit factor.
- Maximum drawdown ($ and %).
- Expectancy per trade.

Also show:

- Equity curve (daily UTC close/equity points; no need to render one chart point per minute).
- Trade table in chronological order with at least: side, quantity (contracts), entry time/price, exit time/price, exit reason, gross P&L, commission, slippage estimate, net P&L, duration in bars.
- Run warnings, including data-quality warnings and any rejected strategy actions.
- Explicitly state whether drawdown is measured on bar-close marked-to-market equity and show the simulation execution rules in a collapsible “Execution assumptions” section.

For no trades, show zero closed trades and display undefined metrics (such as profit factor) as `—`, not misleading zeroes or `Infinity`.

---

## 4. JavaScript strategy module contract (API version 1)

A strategy is a **single self-contained ES module**. It must not rely on local npm packages, relative file imports, or a bundler. It may use normal JavaScript language features and standard built-in APIs. All required logic must be inside the uploaded file.

Expected exports:

```js
export const metadata = {
  apiVersion: 1,
  id: "sma-breakout",
  name: "SMA Breakout",
  version: "1.0.0",
  description: "Example strategy description",
  warmupBars: 20,
  maxLookbackBars: 500,
  parameters: [
    {
      key: "period",
      label: "SMA period",
      type: "number",
      default: 20,
      min: 2,
      max: 500,
      step: 1
    },
    {
      key: "stopLossPoints",
      label: "Stop loss (points)",
      type: "number",
      default: 20,
      min: 0.25,
      max: 1000,
      step: 0.25
    },
    {
      key: "takeProfitPoints",
      label: "Take profit (points)",
      type: "number",
      default: 40,
      min: 0.25,
      max: 2000,
      step: 0.25
    }
  ]
};

export function createStrategy({ params, instrument }) {
  // This function is called once per run. Keep strategy state in this closure.
  return {
    onBar(context) {
      // Called exactly once for each bar, in chronological order.
      // Return null, one action, or an array of actions.
      return null;
    }
  };
}
```

The file picker may accept `.js` and `.mjs`. `metadata` and `createStrategy` are required. Reject malformed modules with readable errors before starting a simulation.

### 4.1 Metadata validation

Validate at least:

- `metadata.apiVersion === 1`.
- `id`, `name`, and `version` are non-empty strings and within reasonable length limits.
- `parameters` is an array of supported parameter declarations (empty is allowed; omitting it is treated as an empty array).
- Parameter keys are unique and use a safe identifier format.
- Parameter types are only `number`, `boolean`, or `string` in the MVP.
- A parameter may set `advanced: true`. The UI must render normal parameters in the main form and advanced parameters inside a collapsed “Advanced parameters” section. Omitting the flag means the parameter is normal. The flag controls presentation only; the value is still validated, passed to `createStrategy`, and exported.
- Numeric defaults/min/max/step are finite and valid; defaults must lie in their declared range when bounds are present. Each parameter has a default of the matching type.
- Warm-up count and `maxLookbackBars` are finite integers within the configured maximum (both capped at 10,000). If `warmupBars` is omitted, default it to `0`. If `maxLookbackBars` is omitted, default it to `500`.
- A fresh instance from `createStrategy` returns an object with a synchronous `onBar` function.

Place reasonable caps on uploaded script size (e.g. 256 KiB), parameter count (e.g. 30), warm-up bars (10,000), and actions returned per bar (e.g. 50). These are guards against accidental runaway input, not a guarantee that arbitrary JavaScript is safe.

### 4.2 Strategy parameter form

Build the form from `metadata.parameters`. Parameter values are passed to `createStrategy({ params, instrument })` as one validated object. Changing a parameter must create a fresh strategy instance on the next run; do not reuse the previous run's closure/state.

Support simple `number`, `boolean`, and `string` inputs only. For number inputs apply metadata bounds and step. If any value is invalid, block validation/run and show the affected parameter. Split parameters into a normal group and a collapsed advanced group using the metadata `advanced` flag; advanced values are still part of the validated parameter object.

### 4.3 Instrument context

The `instrument` object passed to `createStrategy` is read-only data:

```js
{
  id: "mnq",
  symbol: "MNQ",
  pointValue: 2,
  commissionPerSide: 0
}
```

Values must come from the active `CandleSourceConfig` plus the commission override for this run. Do not hard-code MNQ into the simulation engine.

The strategy can combine `pointValue`, its stop distance, and `account.equityAtClose` to calculate its own contract quantity for each entry. The engine does not perform that calculation for it.

### 4.4 Bar and context passed to `onBar`

Each `onBar(context)` call receives data for the current completed bar only, never future candles:

```js
{
  apiVersion: 1,
  index: 12345,             // sequential simulation-stream index, including warm-up bars
  isWarmup: false,          // true before the selected start date's first bar
  bar: {
    time: 1790000000,       // Unix epoch seconds, consistent with RawCandle/Candle
    timeISO: "2026-09-24T...Z",
    open: 20000.0,
    high: 20010.0,
    low: 19995.0,
    close: 20005.0,
    volume: 1234
  },
  history: {
    length: 200,            // number of past/current bars accessible, capped by maxLookbackBars
    at: (offset) => barOrNull,
    last: (count) => barArray
  },
  instrument: { /* same values as above */ },
  params: { /* validated values */ },
  positions: [ /* currently open positions owned by this strategy */ ],
  account: {
    startingCapital: 10000,
    realizedNetPnl: 120,
    unrealizedPnlAtClose: -20,
    equityAtClose: 10100,
    closedTrades: 8,
    currentDrawdown: 50,
    currentDrawdownPct: 0.49
  },
  time: {
    utcYear: 2026,
    utcMonth: 9,             // 1..12
    utcDay: 24,
    utcHour: 14,
    utcMinute: 30,
    utcDayOfWeek: 4          // 0 Sunday .. 6 Saturday
  }
}
```

Contract details:

- `bar.time` is the existing dataset's Unix timestamp in **seconds**, not milliseconds.
- Bars are completed before `onBar` runs.
- `history` contains **generated strategy bars at the selected timeframe**, not raw 1-minute bars. Its accessors return read-only/frozen bar views so strategy code cannot mutate engine data.
- `history.at(0)` returns the current bar; `history.at(-1)` returns the preceding bar; increasingly negative offsets look further back. Positive offsets must return `null`/`undefined`, never future data.
- `history.last(n)` returns up to `n` bars ending at the current bar, in chronological order, and must never include future data. If `n` exceeds `metadata.maxLookbackBars`, clamp to the cap rather than throwing.
- `metadata.maxLookbackBars` caps the number of bars accessible to one `history` request (default 500, maximum 10,000). `history.at(-n)` outside that window returns `null`/`undefined`; `history.last(n)` must enforce the same cap.
- Implement history as a read-only accessor into the engine data up to the current index, not as a copy of the full dataset per bar. Prior bars before the selected start date may be available through negative offsets for indicator calculations; no future bar may be returned.
- `warmupBars` is separate from `maxLookbackBars`: call `onBar` for the selected number of **generated strategy bars** immediately before the start date so stateful indicators can initialize. During those callbacks, set `isWarmup: true` and ignore all actions. Available past bars remain readable through `history` regardless of whether every such bar received a warm-up callback.
- `context.index` is the zero-based index in the simulated call stream (warm-up calls first, then in-range calls). It is not the index into the full dataset.
- `positions` includes only open positions, with engine-generated `id`, `side`, `quantity`, `entryTime`, `entryPrice`, and any stop/target prices. `quantity` is the contract count the strategy requested for that entry. Return copies/read-only views so the strategy cannot mutate the engine's live state.
- `account` is informational; strategy code cannot directly edit capital, realized P&L, or open positions.
- The context does not promise an exchange session calendar. Use `bar.time` or the supplied UTC fields. Strategies needing New York or another timezone must convert the timestamp using standard `Intl.DateTimeFormat` with an explicitly chosen IANA timezone.
- `onBar` must be synchronous. If it returns a Promise or throws, fail the run with the error and bar timestamp; do not silently continue with partial results.

### 4.5 Strategy action contract

`onBar` may return `null`/`undefined`, one action, or an array of actions. API version 1 supports only market entries and strategy-driven exits:

```js
// Market entry. Signal is created after this bar closes and fills at the next bar's open.
{
  type: "enter",
  side: "long",            // "long" or "short"
  quantity: 2,              // contract size for this position; positive integer; defaults to 1
  stopLossPoints: 20,       // optional distance from actual entry fill
  takeProfitPoints: 40,     // optional distance from actual entry fill
  tag: "breakout"           // optional short label for analysis
}

// Alternatively use exact absolute price levels derived from current/past bars:
{
  type: "enter",
  side: "short",
  quantity: 1,
  stopLossPrice: 20100.0,
  takeProfitPrice: 19900.0,
  tag: "failed-breakout"
}

// Close one open position at the next bar's open:
{ type: "exit", positionId: "engine-generated-id", reason: "trend reversed" }

// Close all open positions belonging to this strategy at the next bar's open:
{ type: "exitAll", reason: "end of session" }
```

Rules:

- `stopLossPoints`/`takeProfitPoints` are positive point distances measured from the **actual simulated entry fill**. The engine places levels on the correct side for long/short entries.
- `stopLossPrice`/`takeProfitPrice` are absolute levels. Do not set both a points-based and price-based value for the same bracket side. Reject conflicting or non-finite values. Validate absolute levels against the actual next-bar entry fill: a long stop must be below the fill and its target above; a short stop must be above the fill and its target below. Wrong-side levels reject the entry action (and are counted) rather than creating an immediately-triggered bracket.
- Stop-loss and take-profit are optional. A trade without either can remain open until a strategy exit or end of test.
- `quantity` must be a positive integer within a safe per-entry maximum (for example 100 contracts). Invalid quantities are rejected and counted, with a warning, and are never silently coerced to `1` or clamped to the cap. Do not crash the entire browser for a malformed action.
- An `exit` must reference an ID in `context.positions`; unknown or already-closed IDs are rejected and counted. `exitAll` closes all open strategy positions.
- New entries are ignored and counted if adding one would exceed the configured maximum-open-position count. Do not silently raise the limit.
- An entry and/or exit requested by `onBar` is a signal after the current candle closes, so a market action is queued for the **next bar's open**. No fill is possible after the last bar; pending actions at the end are not executed and must be counted/reported.
- Multiple actions returned from one callback are validated individually. An invalid action is rejected and counted; valid actions in the same callback still run. If more than the per-bar cap are returned, process the first actions up to the cap and count the remainder as rejected.
- After validation, process actions in a stable partition: all `exit`/`exitAll` actions first, then all `enter` actions. Within each group, preserve the array order returned by the strategy. This avoids accidental blocking by the max-position cap when a script exits and re-enters on the same bar.
- No strategy API may access or mutate the engine's raw future candles, result array, fill engine, or other global app state.

#### Strategy-controlled position sizing

The contract size of every position comes from the strategy, not from the engine or a global form field:

- `quantity` on an `enter` action is the number of contracts for that position. Omitting it means `1` as a convenience for simple examples; scripts that need meaningful sizing should set it explicitly on every entry.
- A strategy may calculate `quantity` per signal from its parameters, `instrument.pointValue`, `instrument.commissionPerSide`, `account.equityAtClose` / `currentDrawdown`, the proposed stop distance, its own indicator state, or any combination of those. This supports fixed-contract, fixed-dollar-risk, fixed-fractional, volatility-scaled, and other deterministic sizing rules.
- There is no automatic, fixed, or capital-based position sizing in the engine. `startingCapital` is not used to choose contracts, and the UI does not provide a contracts-per-position input. The engine must not substitute a default size, reuse the previous position's size, or override a valid strategy-supplied size.
- Return `null`/no entry when the sizing calculation says not to trade. A non-positive, non-integer, non-finite, or above-cap `quantity` rejects the entire entry action and increments the rejected-action count. A strategy may clamp its own calculation before returning an action; the engine itself never clamps or substitutes a value.
- The engine does not model margin or buying power. The only size guards in the MVP are the per-entry contract cap (for example, 100 contracts) and the maximum-open-position count, which limits the number of positions rather than contracts. Strategies sizing against `account.equityAtClose` must clamp their own quantity and decide how to behave when it would exceed the cap.
- Each entry opens one position with that quantity. Exits close the position's full quantity; API version 1 has no partial exits, scaling in, or scaling out.
- P&L and commission scale with the script-supplied quantity: `grossPnl = priceMove * pointValue * quantity`, and a completed round trip costs `commissionPerSide * 2 * quantity`. The trade record and export must preserve the quantity actually filled.

Example fixed-dollar-risk sizing inside `onBar`, assuming metadata declares `riskDollars` and `stopLossPoints` number parameters:

```js
const riskPerContract = params.stopLossPoints * instrument.pointValue;
const rawQuantity = Math.floor(params.riskDollars / riskPerContract);

if (!Number.isFinite(rawQuantity) || rawQuantity < 1) return null;

return {
  type: "enter",
  side: "long",
  quantity: Math.min(100, rawQuantity),
  stopLossPoints: params.stopLossPoints
};
```

### 4.6 Starter template for users

Include a downloadable or copyable example `.js` strategy file inside the repository (for example, `public/examples/strategies/sma-cross.js`) and link to it from the page. This is documentation/example code, not a built-in scripting editor. It must use the actual API above and include comments explaining that signals fill at the following bar's open.

The example should be intentionally simple (e.g. an SMA crossover with configurable period, stop-loss points, take-profit points, and a strategy-controlled contract quantity—ideally a fixed-dollar-risk calculation), not presented as a profitable or recommended trading strategy. Include comments explaining that `quantity` is the contract size for that position and may vary from entry to entry.

---

## 5. Simulation engine

Implement the engine in a separate, testable module, for example:

- `src/backtesting/types.ts`
- `src/backtesting/validateStrategy.ts`
- `src/backtesting/aggregateBars.ts`
- `src/backtesting/runBacktest.ts`
- `src/backtesting/metrics.ts`
- `src/backtesting/backtest.worker.ts`
- `src/components/backtest/SystematicBacktestPage.tsx`
- Additional focused components/hooks as needed.

Names can be adjusted to match project conventions. Keep engine logic out of React components.

### 5.1 Input

A run configuration must be fully explicit and serializable:

- normalized source identity/symbol;
- `pointValue`;
- `commissionPerSide` (resolved override);
- date start/end as UTC date-only strings;
- timeframe minutes;
- starting capital;
- slippage points per side;
- max open positions;
- per-entry contract cap (fixed engine safety guard, `100`; not user-editable and not a position-sizing strategy);
- warm-up bar count;
- parameter values;
- strategy source text and validated metadata.

The engine receives normalized, chronologically ordered 1-minute bars and config. It should have no dependency on React, DOM, localStorage, OPFS, or the chart API.

### 5.2 Date filtering and warm-up

- Treat selected dates as inclusive **UTC calendar dates**. Avoid browser-local timezone conversions when filtering.
- Use up to the configured number of generated strategy bars immediately preceding the selected start to warm up the strategy, if available. Warm-up bars are generated with the same timeframe aggregation as in-range bars.
- Call `onBar` during warm-up with `isWarmup: true`, allowing strategy closure state and indicators to initialize, but ignore all returned actions during warm-up.
- Only bars whose UTC date is within the selected date range can create trades or directly contribute to trade metrics. Warm-up and pre-start history bars may initialize strategy state and therefore influence later decisions.
- If no in-range bars exist, show an error instead of returning a successful zero-trade run.

### 5.3 Timeframe aggregation

The source data resolution is 1 minute. For timeframes larger than one minute:

- Aggregate OHLCV from raw candles by timestamp-based timeframe buckets, not by blindly grouping every N array rows.
- Open = first constituent open; high = maximum high; low = minimum low; close = last constituent close; volume = sum.
- Use the bucket duration in seconds and a consistent documented alignment (UTC epoch-aligned buckets are acceptable for MVP).
- Do not fabricate missing bars.
- Aggregate every candle that falls inside the same timestamp bucket. A timestamp gap does not split a bucket: it makes that bucket a partial aggregate. Start a new bar only when a candle belongs to a later bucket. Never merge candles from different buckets and never emit duplicate bucket timestamps.
- Keep resulting bar timestamps strictly increasing and unique. Flag incomplete/partial aggregates or gaps in the data quality summary.
- Strategies are called for each generated timeframe bar after that bar closes. If the dataset ends inside a bucket, process that final partial bucket as a closed-at-end bar and flag it as incomplete; do not fabricate the missing minutes.

### 5.4 Data quality preflight (required)

Because bad candles can make automated results meaningless, run a validation pass over the selected/warm-up range before simulation. Display the results and include them in exported JSON.

Hard errors that block a run:

- non-finite timestamp or OHLCV values;
- non-finite or invalid price fields;
- `high < max(open, close)`;
- `low > min(open, close)`;
- `high < low`;
- duplicate or non-increasing timestamps that would make ordering ambiguous.

Warnings that allow the user to proceed after acknowledgment:

- timestamp gaps (do not assume that every gap is erroneous; markets have overnight/session/weekend gaps);
- suspicious price discontinuities between bars, using a clearly described heuristic (e.g. configurable percentage change threshold), with timestamp, previous close, current open/close, and percentage change;
- incomplete higher-timeframe aggregates;
- unusual repeated price jumps or discontinuities detected by simple heuristic checks.

Do not claim that the heuristic can identify every corrupted candle. Do not silently repair, sort, interpolate, or delete bad records. A user must be able to see warnings before running, and the exported result must record them. For a hard validation error, display the first several offending timestamps plus the total count and explain that the data should be corrected or re-imported.

### 5.5 Exact execution semantics (must be documented and tested)

Strategy evaluation happens after each bar has closed. Market actions are queued for the **next bar open** to avoid using the same candle's closing information for an impossible same-close entry.

For each simulation bar in chronological order:

1. Process previously queued strategy exits and entries at the current bar's open. Where actions conflict, process exits before new entries.
2. Market entry/exit reference fill price is the current bar open. Apply configured slippage adversely to every market fill: higher price for long entries/short exits, lower price for short entries/long exits.
3. For a newly opened or already open position, evaluate attached stop-loss and take-profit levels against this bar's OHLC. This includes the entry bar because the position was open from its open.
4. If a stop and target are both touched in one candle, assume **stop-loss first** (conservative OHLC-only assumption). Record this in the trade's fill/exit metadata and result warnings/assumptions.
5. For a stop gap through the stop level, use the bar open if it is worse than the stop level, then apply adverse slippage. Otherwise use the stop level, with adverse slippage applied.
6. Treat take-profit as a limit fill: when the target is reached, fill at the target price without adverse slippage (a limit order should not fill worse than its limit). If the bar opens beyond the target in a favorable direction, do not award price improvement; fill at the target. Apply configured slippage to market orders and stop-market fills, not to limit take-profit fills.
7. After intrabar stop/target checks, mark remaining open positions to the bar close to calculate unrealized P&L/equity/drawdown.
8. Call `onBar` with the current completed bar and the resulting state; validate the returned action(s) and queue eligible actions for the next bar open. During warm-up, ignore actions.

Important: stop/target checks must use the simulation bar's high/low, not only its close. A candle that touches both levels cannot reveal the actual tick sequence; the conservative stop-first rule is intentional and must be visible to the user.

At the final in-range bar:

- Call `onBar` for the final bar with positions that survived intrabar stop/target checks. Actions it returns are not executed; record them as unfilled-at-end/cancelled pending actions.
- Do not execute actions queued for a nonexistent next bar; record them as unfilled-at-end/cancelled pending actions.
- After the final `onBar` call, force-close any remaining open position at the last bar's close by default, applying adverse slippage and exit commission, with exit reason `end_of_test`. This ensures all reported trades have a final realized result. If a toggle to leave positions open is added, show unrealized P&L separately and never mix it into closed-trade statistics; for MVP, default forced close is sufficient.

Use the existing P&L convention: price movement × point value × quantity, with commission charged per contract per side on both entry and exit. The source's commission is a per-side amount. A completed round-trip's total commission is `commissionPerSide * 2 * quantity`. Because `quantity` comes from the strategy for each entry, a single run may contain positions with different contract sizes.

### 5.6 State management and determinism

- The strategy instance is created once at the start of each run with its validated parameters.
- Invoke `onBar` serially in chronological order. A strategy must not be able to inspect future bars.
- The engine is deterministic for deterministic strategy code: the same bars, source, parameters, settings, and strategy behavior produce the same actions, trades, and metrics. Arbitrary user code can be nondeterministic (`Math.random`, `Date.now`, `performance.now`, `crypto.getRandomValues`); the spec does not promise reproducibility for strategies that use those APIs. Document this limitation.
- Generate IDs inside the engine deterministically for a run (for example, `trade-000001`) rather than relying on random UUIDs. This makes exported results easier to compare.
- Catch strategy errors with the bar timestamp/index and terminate the run as failed; do not display partial results as complete.
- Count invalid/rejected actions by reason, and cap actions returned per bar.
- Treat the strategy-supplied `quantity` as an input: validate it, record it, and never replace it with an engine-chosen size. The same strategy and bars must produce the same per-position contract sizes.
- Do not reuse `useTrade` state or current manual-session trades.

---

## 6. Metrics and results schema

### 6.1 Closed trade object

Each completed trade should contain at least:

```json
{
  "id": "trade-000001",
  "side": "long",
  "quantity": 1,
  "entryTime": 1790000000,
  "entryTimeISO": "2026-09-24T14:30:00.000Z",
  "entryPrice": 20005.25,
  "exitTime": 1790000900,
  "exitTimeISO": "2026-09-24T14:45:00.000Z",
  "exitPrice": 20025.25,
  "exitReason": "take_profit",
  "exitNote": "optional strategy note",
  "stopLossPrice": 19985.25,
  "takeProfitPrice": 20025.25,
  "barsHeld": 3,
  "tag": "breakout",
  "grossPnl": 40.00,
  "commissionCost": 0.00,
  "slippageCostEstimate": 0.00,
  "netPnl": 40.00
}
```

Values above are illustrative only. Define calculations carefully:

- `quantity` is the strategy-supplied contract count for that position; copy it into the trade record and use it for P&L, commission, and slippage calculations.
- Entry/exit prices are the actual simulated fills after configured slippage.
- `grossPnl` is P&L using simulated fill prices before commission; slippage is already reflected in those prices.
- `commissionCost` is the sum of entry and exit commissions.
- `slippageCostEstimate` is informational (difference from the reference fills before configured slippage); it must **not** be subtracted a second time if the simulated fill prices already include it.
- `netPnl = grossPnl - commissionCost`.
- Include all exit reasons: `stop_loss`, `take_profit`, `strategy_exit`, `exit_all`, and `end_of_test`.
- `barsHeld` is the number of generated strategy bars between entry and exit (exit bar index minus entry bar index); a same-bar round trip is `0`. Keep the strategy's free-text `reason` separately as `exitNote` when useful; `exitReason` remains the machine-readable enum.
- If no bracket was provided, the stop/target fields may be absent.

### 6.2 Summary metrics

Calculate and define:

- total closed trades;
- wins (net P&L > 0), losses (net P&L < 0), and breakeven trades (net P&L = 0);
- win rate = wins / closed trades × 100;
- gross winning P&L and gross losing P&L (using trade net P&L or gross P&L consistently and label it; recommended profit factor uses net winning/losing P&L after fees);
- profit factor = sum of positive trade net P&L / absolute sum of negative trade net P&L; if there are no losing trades, represent as `null` and display `—`;
- net P&L after commission;
- average win, average loss, and expectancy (total net P&L / closed trades);
- largest winner and largest loser;
- maximum drawdown in dollars and percentage based on bar-close marked-to-market equity, including unrealized P&L at each completed bar close;
- starting and ending equity;
- number of invalid/rejected/pending-at-end strategy actions;
- number of source bars processed and number of strategy bars after timeframe aggregation.

No-trade edge case: return a valid completed result with `closedTrades: []`; show total trades as 0 and metrics whose denominator is zero as `null` (UI shows `—`). Never produce `NaN` or `Infinity` in exported JSON.

### 6.3 Equity curve

Calculate equity on every simulation bar for drawdown accuracy:

`equity = startingCapital + realizedNetPnl + unrealizedPnlAtBarClose - openEntryCommission`

- `realizedNetPnl` is the sum of closed-trade net P&L (both entry and exit commissions already deducted).
- `unrealizedPnlAtBarClose` is gross mark-to-market P&L of open positions at the bar close, using their actual entry fills after slippage.
- `openEntryCommission` is the entry commission already accrued on open positions. Estimated exit commission is not deducted before the exit occurs.
- Track peak equity starting from `startingCapital` before the first in-range bar. Maximum drawdown percentage is `(peakEquity - equity) / peakEquity * 100`, using the peak equity at the start of the drawdown. If peak equity is not positive, percentage metrics are `null`.
- Capture equity on every completed in-range bar. The initial equity point is `startingCapital`; the final point is after the final forced close.
- Store/export a downsampled daily UTC equity curve (the last completed equity point for each UTC date, plus the initial point) to keep large exports manageable. Each point includes time/timeISO, equity, realized P&L, unrealized P&L, and drawdown in dollars/percentage.

Clearly label that drawdown uses bar-close marks, not tick-by-tick intrabar equity; OHLC-only data cannot provide exact intrabar account-equity sequencing.

### 6.4 Exported JSON schema

Export a versioned object resembling:

```json
{
  "schemaVersion": 1,
  "application": "TradeReplay",
  "exportedAt": "2026-11-03T13:00:00.000Z",
  "strategy": {
    "id": "sma-breakout",
    "name": "SMA Breakout",
    "version": "1.0.0",
    "apiVersion": 1,
    "fileName": "sma-breakout.js",
    "source": "... exact uploaded source text ...",
    "parameters": { "period": 20 }
  },
  "instrument": {
    "id": "mnq",
    "symbol": "MNQ",
    "pointValue": 2,
    "commissionPerSide": 0
  },
  "settings": {
    "startDateUTC": "2025-01-01",
    "endDateUTC": "2025-12-31",
    "timeframeMinutes": 1,
    "startingCapital": 10000,
    "slippagePointsPerSide": 0,
    "maxOpenPositions": 1,
    "maxContractsPerEntry": 100,
    "warmupBars": 20,
    "forcedCloseAtEnd": true,
    "executionAssumptions": {
      "marketFill": "next bar open",
      "bothStopAndTargetTouched": "stop first",
      "stopGapFill": "bar open when worse than stop, otherwise stop level",
      "drawdown": "bar-close mark-to-market",
      "positionSizing": "strategy-supplied quantity per entry (contracts)"
    }
  },
  "dataQuality": {
    "baseBarsInRange": 100000,
    "strategyBarsProcessed": 100000,
    "warnings": [],
    "hardErrors": []
  },
  "summary": {
    "closedTrades": 123,
    "wins": 60,
    "losses": 55,
    "breakeven": 8,
    "winRatePct": 48.78,
    "netPnl": 1200.00,
    "grossWinningPnl": 4300.00,
    "grossLosingPnl": 3100.00,
    "profitFactor": 1.15,
    "averageWin": 71.67,
    "averageLoss": 56.36,
    "expectancyPerTrade": 9.76,
    "largestWinner": 500.00,
    "largestLoser": -300.00,
    "maxDrawdown": 450.00,
    "maxDrawdownPct": 4.5,
    "startingEquity": 10000,
    "endingEquity": 11200,
    "rejectedActions": {},
    "pendingActionsAtEnd": 0
  },
  "equityCurve": [],
  "trades": []
}
```

Numbers above are examples, not expected results. Ensure missing/undefined metrics are represented as `null`, because JSON does not support `NaN` or `Infinity`.

Include the exact uploaded strategy source text for reproducibility. Do not include the raw candle dataset in the export. Include all relevant settings, versions, warnings, execution assumptions, metrics, and closed trades.

### 6.5 Download behavior

The user-facing **Export JSON** action should construct a JSON `Blob`, create an object URL, trigger a browser download, then release the URL. Use a filename such as:

`tradereplay-backtest_<strategy-id>_<start-date>_<end-date>.json`

This explicit user-requested download is the only persistence/export behavior added by this feature. Do not auto-save results or script files anywhere in the app.

---

## 7. Worker, execution, and failure handling

Run strategy loading, validation, and the simulation in a dedicated Web Worker. The main thread should be responsible for UI state, progress display, cancellation, and the explicit JSON download only.

For large datasets, do not `postMessage` the full array of candle objects using structured cloning. Pack each base candle into a `Float64Array` with a fixed six-value layout (`time`, `open`, `high`, `low`, `close`, `volume`) and transfer its `ArrayBuffer` once using the Worker transfer list, or use an equivalently memory-efficient strategy. Reconstruct only the current strategy-facing bar on demand. Do not keep multiple full-sized object copies of the dataset in memory.

Suggested worker message protocol:

- Request: `validate` or `run`, with script source, run configuration, and/or normalized bars.
- Worker replies: `validation-success` (including normalized metadata and parameter defaults), `progress`, `completed`, `failed`, or `cancelled` (if cancellation is represented in messages; main-thread `worker.terminate()` is also acceptable).
- Progress: send only every fixed chunk (e.g. every 1,000–5,000 strategy bars or around each 1% progress change).
- Include the current bar timestamp/index when reporting a strategy exception.
- Always terminate and release worker/object URLs after success, failure, cancellation, or navigation cleanup.
- Use a no-progress watchdog (reset on every progress message) so a broken strategy cannot leave a worker running forever without killing legitimate long runs that continue reporting progress.
- Chunk long loops and yield between chunks where practical; cancellation must remain available. Terminating the Worker from the main thread must stop an infinite synchronous strategy loop too.
- Do not send a React state update for every bar.

**Important security note:** a Web Worker keeps CPU-heavy strategy execution away from the UI thread, but it is not a hardened security sandbox for arbitrary untrusted JavaScript. Uploaded module code can use worker globals such as `fetch`, `import()`, `postMessage`, and can modify built-ins. Treat uploaded strategy code as code the user trusts and explicitly warn against uploading third-party scripts they have not reviewed. The app does not need network access for this feature, but the spec does not claim that network access is blocked. Strategies must be self-contained in the sense that the app will not resolve or bundle their imports; any imports they contain must work in a `data:` module context. Do not claim that Worker isolation makes malicious JavaScript safe.

If strategy loading, `createStrategy`, `onBar`, aggregation, or metrics calculation fails, stop the run and show a clear error. Do not output/export a partial result as though it completed successfully. Preserve the script and settings in memory so the user can correct the file or parameters and retry.

---

## 8. Test requirements and acceptance criteria

Before considering the feature complete, add deterministic unit tests for the pure engine and aggregation logic. `package.json` already defines a `test` script using Node's test runner and `tsx`; extend it with the new `tests/*.test.ts` files rather than adding a second runner. Do not rely only on manually clicking the UI.

### Engine tests (required)

1. A known synthetic dataset and known strategy produce the expected exact entry/exit times and prices.
2. `onBar` sees the current bar and prior bars but can never access a future bar through the history API.
3. A signal created at candle close fills at the next candle open, never at the same close.
4. Entry and exit slippage is applied adversely for long and short positions.
5. Commission is charged once per contract per side and deducted correctly from net P&L.
6. Point value and script-supplied quantity affect P&L and commission correctly for both directions, including different quantities on different entries in the same run.
7. Stop-loss-only, take-profit-only, and unbracketed positions behave correctly.
8. If both stop and target are touched on one candle, stop-loss wins.
9. Stop gaps use the documented adverse fill rule.
10. A position is checked for stop/target on its entry candle.
11. `exit`, `exitAll`, max-open-position rejection, malformed actions, and action ordering work as documented.
12. Queued actions on the final bar are not filled; remaining positions close at the final close when forced-close is enabled.
13. Warm-up bars initialize the strategy but cannot place trades or affect statistics.
14. Inclusive UTC start/end filtering is correct independent of the browser's local timezone.
15. Timeframe aggregation uses timestamp buckets, preserves OHLCV, creates no future data, never merges different buckets, and marks missing constituent minutes as partial rather than splitting the bucket.
16. Duplicate timestamps, out-of-order timestamps, invalid OHLC, empty ranges, zero trades, and all-winning/all-losing cases do not produce `NaN`/`Infinity`.
17. Results are deterministic across repeated runs with the same inputs and deterministic strategy code.
18. Data-quality warnings and rejected actions appear in the result/export.
19. Contract sizing is taken from each entry action's `quantity`, not from starting capital or a fixed engine default; missing quantity defaults to `1`, out-of-range/non-integer quantities are rejected rather than coerced or clamped, and the per-entry cap is enforced.
20. Wrong-side absolute bracket levels are rejected, and final partial timeframe buckets are processed consistently with an incomplete-aggregate warning.

### UI/integration acceptance criteria

- Existing Manual Replay functionality remains operational.
- Users can switch between Data Sources, Manual Replay, and Systematic Backtest without reloading the application.
- A selected source is shared by both Manual Replay and Systematic Backtest; running a backtest does not alter the manual replay's saved positions/session.
- A strategy module is validated before a run and its metadata-defined parameters are editable.
- The simulation processes all bars in the selected period; it is not limited to the current day or to the 200-bar replay history window.
- UI remains responsive during long runs; progress updates, Cancel Run, and error reporting work.
- Invalid candle data blocks a run with specific diagnostics; warning-only quality issues require acknowledgment and are preserved in results.
- Backtest results stay in memory and do not create localStorage, OPFS, IndexedDB, or server writes.
- The strategy, not the UI or starting capital, determines the contract quantity for each entry; different entries may use different quantities, and the trade list/export preserves them.
- Export JSON parses successfully and contains strategy source, parameter values, instrument, date range, timeframe, costs, assumptions, data-quality report, summary, equity curve, and trades.
- The project builds and linting still pass.

### Implementation sequence

Recommended order:

1. Refactor app navigation while preserving Manual Replay.
2. Add `loadAll()` to the candle source abstraction and implement data-quality validation.
3. Define the strategy API/types and include a small example strategy file.
4. Implement timeframe aggregation and the pure simulation engine with unit tests.
5. Run strategy validation/backtest in a Worker with progress/cancellation.
6. Build the configuration form, summary, equity curve, trade table, and export JSON.
7. Run the complete test suite, build, lint, and verify the existing manual workflow.

**Do not skip engine tests in favor of getting the UI done first.** Incorrect fill ordering, look-ahead, cost calculations, or candle aggregation would make the resulting performance report actively misleading.
