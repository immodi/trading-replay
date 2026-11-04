# TradeReplay Systematic Backtesting — Strategy API

Reference for strategy modules uploaded to **Systematic Backtest**.

- **API version:** `1`
- **Module format:** a single self-contained JavaScript ES module (`.js` / `.mjs`)
- **Execution:** synchronous `onBar` calls in a Web Worker
- **Source limit:** 256 KiB. Imports are not resolved or bundled — the file is
  loaded as a `data:` URL module, so it must not rely on relative imports.

The canonical TypeScript definitions live in
[`src/backtesting/types.ts`](./src/backtesting/types.ts). A complete commented
example is [`public/examples/strategies/sma-cross.js`](./public/examples/strategies/sma-cross.js).

---

## 1. Module shape

A strategy module exports exactly two things:

```js
export const metadata = { /* see below */ };

export function createStrategy({ params, instrument }) {
    return {
        onBar(context) {
            // return an action, an array of actions, or null/undefined
            return null;
        },
    };
}
```

| Export | Required | Description |
| --- | --- | --- |
| `metadata` | yes | Static description of the strategy and its parameters. |
| `createStrategy(context)` | yes | Factory called once per run. Must return an object with an `onBar` function. |

`createStrategy` receives:

```ts
{
    params: Readonly<Record<string, unknown>>; // validated parameter values
    instrument: InstrumentContext;
}
```

The same frozen `instrument` object is also exposed on every bar context.

---

## 2. `metadata`

```js
export const metadata = {
    apiVersion: 1,
    id: "orb-breakout",
    name: "Opening Range Breakout",
    version: "1.9.0",
    description: "Optional description.",
    warmupBars: 0,
    maxLookbackBars: 1,
    parameters: [
        {
            key: "riskDollars",
            label: "Risk budget ($)",
            type: "number",
            default: 70,
            min: 5,
            max: 1000,
            step: 5,
            advanced: false,
        },
    ],
};
```

| Field | Required | Rules |
| --- | --- | --- |
| `apiVersion` | yes | Must be exactly `1`. |
| `id` | yes | Non-empty string, max 64 chars (trimmed). |
| `name` | yes | Non-empty string, max 128 chars (trimmed). |
| `version` | yes | Non-empty string, max 32 chars (trimmed). |
| `description` | no | Non-empty string, max 4,000 chars. |
| `warmupBars` | no | Integer `0…10,000`. Defaults to `0`. |
| `maxLookbackBars` | no | Integer `1…10,000`. Defaults to `500`. |
| `parameters` | no | Array, max 30 entries. Defaults to `[]`. |

### Parameter definitions

Each parameter needs a unique `key` and one of three `type`s. `key` must be a safe
JavaScript identifier (max 64 chars) and cannot be `__proto__`, `constructor`,
or `prototype`.

| `type` | Required | Optional |
| --- | --- | --- |
| `number` | `default: number` | `min`, `max`, `step`, `advanced` |
| `boolean` | `default: boolean` | `advanced` |
| `string` | `default: string` | `advanced` |

- `label` defaults to `key` and is capped at 128 chars.
- Number defaults must be finite and inside `min`/`max` when provided.
- `step` must be greater than zero; it is a UI hint, not a value constraint.
- String defaults are capped at 10,000 chars.
- At run time, values are checked against `min`/`max`; missing values fall back
  to defaults. `params` therefore always contains every declared key.

---

## 3. Bar context

`onBar` is called once per bar: first for warm-up bars (if any), then for every
bar in the selected UTC range.

```ts
interface BarContext {
    apiVersion: 1;
    index: number;            // 0-based index since the first warm-up bar
    isWarmup: boolean;
    bar: BacktestBar;
    history: HistoryApi;
    instrument: InstrumentContext;
    params: Readonly<Record<string, unknown>>;
    positions: OpenPositionView[];
    account: AccountContext;
    time: StrategyTimeContext;
}
```

All nested objects (`bar`, position views, `history` bars, `params`,
`instrument`) are frozen. Treat the context as read-only.

### `bar`

```ts
interface BacktestBar {
    time: number;      // Unix seconds (UTC)
    timeISO: string;   // ISO-8601 string
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}
```

### `history`

```ts
interface HistoryApi {
    readonly length: number;          // accessible bars, capped by maxLookbackBars
    at(offset: number): BacktestBar | null;
    last(count: number): BacktestBar[];
}
```

- `at(0)` is the current bar; `at(-1)` is the previous bar.
- Positive offsets return `null`. Out-of-range or non-integer offsets return `null`.
- `last(n)` returns up to `n` bars, oldest → newest, including the current bar.
- Access is capped by `metadata.maxLookbackBars` and by available dataset history.

### `instrument`

```ts
interface InstrumentContext {
    id: string;
    symbol: string;
    pointValue: number;         // dollars per point per contract
    commissionPerSide: number;  // dollars per contract per side
}
```

### `positions`

Open positions **after** this bar's queued actions and bracket checks, i.e. the
positions still open when `onBar` is called. Views are read-only snapshots.

```ts
interface OpenPositionView {
    id: string;                 // e.g. "position-000001"
    side: "long" | "short";
    quantity: number;
    entryTime: number;          // Unix seconds of the fill bar
    entryPrice: number;         // actual fill, including slippage
    stopLossPrice?: number;     // current level, including modifications
    takeProfitPrice?: number;   // current level, including modifications
}
```

### `account`

Computed at the current bar close, before `onBar` runs.

```ts
interface AccountContext {
    startingCapital: number;
    realizedNetPnl: number;         // net of round-trip commission for closed trades
    unrealizedPnlAtClose: number;   // open positions marked at this bar's close
    equityAtClose: number;          // capital + realized + unrealized - open entry commission
    closedTrades: number;
    currentDrawdown: number;        // peak equity - current equity, >= 0
    currentDrawdownPct: number | null; // null when peak equity <= 0
}
```

### `time`

UTC components derived from `bar.time`:

```ts
interface StrategyTimeContext {
    utcYear: number;
    utcMonth: number;      // 1-12
    utcDay: number;
    utcHour: number;
    utcMinute: number;
    utcDayOfWeek: number;  // 0 = Sunday
}
```

Use `time` for calendars and sessions; do not infer exchange-local time from it.

---

## 4. Actions

`onBar` may return `null`, `undefined`, one action, or an array of actions.
At most **50 actions per bar** are processed; extras are discarded and counted
as `too_many_actions`. `onBar` must be synchronous — returning a Promise fails
the run.

Actions are queued when returned and executed at the **next bar open**. The one
exception is the final bar: actions returned there are never executed and are
counted in `summary.pendingActionsAtEnd`.

Execution order within a bar:

1. `modify` actions
2. `exit` / `exitAll` actions
3. `enter` actions

Each group preserves the order returned. After queued actions, bracket checks
run for that bar. `onBar` for bar *N* runs after bar *N*'s bracket checks, so any
action it returns first takes effect at bar *N+1*'s open.

### 4.1 `enter`

Opens a market position at the next bar open.

```ts
interface EnterAction {
    type: "enter";
    side: "long" | "short";
    quantity?: number;            // default 1; integer 1…100
    stopLossPoints?: number;      // > 0
    takeProfitPoints?: number;    // > 0
    stopLossPrice?: number;       // absolute price
    takeProfitPrice?: number;     // absolute price
    tag?: string;                 // max 64 chars; longer values are truncated
}
```

Bracket conventions, relative to the entry fill:

| Side | Stop from points | Target from points |
| --- | --- | --- |
| long | `fill - stopLossPoints` | `fill + takeProfitPoints` |
| short | `fill + stopLossPoints` | `fill - takeProfitPoints` |

- Use **either** points **or** an absolute price for each bracket, not both
  (`conflicting_bracket`).
- Absolute stops must be strictly below the fill for longs and above for shorts;
  absolute targets must be strictly above the fill for longs and below for
  shorts. Otherwise the entry is rejected as `invalid_bracket`.
- Entry fills use adverse slippage: `+slippage` for longs, `-slippage` for shorts.
- Brackets can trigger on the entry bar itself.

### 4.2 `modify` — change an open position's TP/SL

```ts
interface ModifyAction {
    type: "modify";
    positionId: string;
    stopLossPoints?: number | null;
    takeProfitPoints?: number | null;
    stopLossPrice?: number | null;
    takeProfitPrice?: number | null;
}
```

- Omitted fields leave the current level unchanged.
- `null` removes that bracket. For example `takeProfitPrice: null` cancels the
  target and keeps the stop.
- Points are measured from the position's **entry fill**, using the same
  long/short convention as `enter`:
  - long stop = `entryPrice - stopLossPoints`
  - long target = `entryPrice + takeProfitPoints`
  - short stop = `entryPrice + stopLossPoints`
  - short target = `entryPrice - takeProfitPoints`
- Points may be zero or negative. `stopLossPoints: 0` moves the stop to
  breakeven; negative points lock in profit (e.g. for a long,
  `stopLossPoints: -5` places the stop 5 points above entry).
- Do not combine points and an absolute price for the same bracket
  (`conflicting_bracket`).
- The action must reference an open position at execution time; otherwise it is
  rejected as `unknown_position`.
- Because entries execute after modifies in the same batch, a `modify` cannot
  target a position created by an `enter` returned in the same `onBar` call.
- The action is applied at the next bar open, before that bar's bracket checks.
  If the new stop is already beyond the open (for example after a gap), normal
  stop handling exits at the open with adverse slippage.
- `ClosedTrade.stopLossPrice` / `takeProfitPrice` record the levels in effect at
  exit, including modifications.

Examples:

```js
// Move the stop to breakeven.
return {
    type: "modify",
    positionId: context.positions[0].id,
    stopLossPoints: 0,
};

// Lock in 1R on a long (entry + riskPoints) and leave the target unchanged.
return {
    type: "modify",
    positionId: context.positions[0].id,
    stopLossPrice: context.positions[0].entryPrice + riskPoints,
};

// Trail a long stop 20 points below the current close.
return {
    type: "modify",
    positionId: context.positions[0].id,
    stopLossPrice: context.bar.close - 20,
};

// Remove the take-profit while keeping the stop.
return {
    type: "modify",
    positionId: context.positions[0].id,
    takeProfitPrice: null,
};
```

### 4.3 `exit`

Closes one position at the next bar open, with adverse slippage.

```ts
interface ExitAction {
    type: "exit";
    positionId: string;
    reason?: string;   // max 128 chars; longer values are truncated
}
```

An unknown `positionId` is rejected as `unknown_position`.

### 4.4 `exitAll`

Closes every open position at the next bar open, with adverse slippage.

```ts
interface ExitAllAction {
    type: "exitAll";
    reason?: string;   // max 128 chars
}
```

Exits are recorded with `exitReason: "exit_all"`; individual exits use
`"strategy_exit"`.

---

## 5. Execution model

| Topic | Behavior |
| --- | --- |
| Market entry | Next bar open, adverse slippage. |
| Strategy exit / `exitAll` | Next bar open, adverse slippage. |
| Stop-loss hit | Stop level, or the bar open when the open is worse (gap). Adverse slippage applies. |
| Take-profit hit | Exactly at the target. No adverse slippage and no price improvement. |
| Both stop and target in one bar | Stop-loss is checked first. |
| Entry bar | Brackets can trigger on the same bar as the entry fill. |
| Commission | `commissionPerSide × 2 × quantity` per completed trade. |
| Slippage | `slippagePointsPerSide` per entry and per exit/stop fill. Targets are exempt. |
| Forced close | Any position still open at the end closes at the last bar close with adverse slippage (`end_of_test`). |
| Drawdown | Mark-to-market at each bar close. |
| Position sizing | Strategy-supplied `quantity` per entry; max 100 contracts per entry. |
| Opening-gap priority | Queued modifies/exits/entries run before existing bracket checks at the same bar open. |

P/L for a closed trade:

```text
grossPnl = (exitPrice - entryPrice) × pointValue × quantity   (long)
grossPnl = (entryPrice - exitPrice) × pointValue × quantity   (short)
netPnl   = grossPnl - commissionPerSide × 2 × quantity
```

### Warm-up

`onBar` is called for up to `warmupBars` bars before the selected range. During
warm-up, `isWarmup` is `true`, `index` still increments from `0`, and **all
returned actions are ignored**. Warm-up is for building indicator/session state
only.

If fewer bars are available than requested, the engine uses what exists and
sets `result.dataQuality.warmup.insufficient = true`.

### Final bar

`onBar` still runs for the last in-range bar, but its returned actions are not
executed. They increment `summary.pendingActionsAtEnd` instead. Open positions
are then closed at the last close.

---

## 6. Rejections

Invalid actions never throw; they are skipped and counted in
`result.summary.rejectedActions` by reason:

| Reason | Cause |
| --- | --- |
| `malformed_action` | Action is not an object. |
| `unknown_action_type` | `type` is not `enter`, `modify`, `exit`, or `exitAll`. |
| `invalid_side` | `enter.side` is not `"long"` or `"short"`. |
| `invalid_quantity` | Quantity is not an integer from 1 to 100. |
| `invalid_position_id` | Missing or empty `positionId`. |
| `unknown_position` | `exit` / `modify` references a position that is not open. |
| `invalid_bracket` | Non-finite bracket value, non-positive `enter` points, or a wrong-side absolute entry bracket. |
| `conflicting_bracket` | Both points and an absolute price for the same bracket. |
| `empty_modify` | `modify` has no level fields. |
| `max_open_positions` | `enter` while the configured maximum is already open. |
| `too_many_actions` | More than 50 actions returned in one bar (excess count). |

`onBar` throwing an exception aborts the whole run with a `BacktestError` that
includes the bar time. So does returning a Promise.

---

## 7. Results relevant to strategies

```ts
type ExitReason =
    | "stop_loss"
    | "take_profit"
    | "strategy_exit"
    | "exit_all"
    | "end_of_test";
```

Each completed trade includes:

```ts
{
    id: string;
    side: "long" | "short";
    quantity: number;
    entryTime: number;
    entryTimeISO: string;
    entryPrice: number;
    exitTime: number;
    exitTimeISO: string;
    exitPrice: number;
    exitReason: ExitReason;
    exitNote?: string;          // action `reason`
    stopLossPrice?: number;     // level in effect at exit
    takeProfitPrice?: number;   // level in effect at exit
    barsHeld: number;
    tag?: string;
    grossPnl: number;
    commissionCost: number;
    slippageCostEstimate: number;
    netPnl: number;
}
```

Useful summary fields:

- `summary.rejectedActions` — counts by reason (see above).
- `summary.pendingActionsAtEnd` — actions returned on the final bar.
- `dataQuality.warmup` — `requestedBars`, `availableBars`, `actualBars`,
  `insufficient`.

---

## 8. Limits

| Limit | Value |
| --- | --- |
| Strategy source size | 256 KiB |
| Parameters per strategy | 30 |
| `warmupBars` | 0…10,000 |
| `maxLookbackBars` | 1…10,000 (default 500) |
| Contracts per entry | 1…100 |
| Actions per bar | 50 |
| `tag` / `reason` length | 64 / 128 chars (truncated) |

---

## 9. Minimal complete example

```js
export const metadata = {
    apiVersion: 1,
    id: "breakeven-example",
    name: "Breakeven Example",
    version: "1.0.0",
    warmupBars: 0,
    maxLookbackBars: 1,
    parameters: [
        {
            key: "riskPoints",
            label: "Risk (points)",
            type: "number",
            default: 10,
            min: 1,
            max: 100,
            step: 1,
        },
    ],
};

export function createStrategy({ params }) {
    let entered = false;

    return {
        onBar(context) {
            if (context.isWarmup) return null;

            if (!entered && context.positions.length === 0) {
                entered = true;

                return {
                    type: "enter",
                    side: "long",
                    quantity: 1,
                    stopLossPoints: params.riskPoints,
                    takeProfitPoints: params.riskPoints * 2,
                };
            }

            if (context.positions.length === 0) return null;

            const position = context.positions[0];
            const moveToBreakeven =
                position.stopLossPrice === undefined ||
                position.stopLossPrice < position.entryPrice;

            return moveToBreakeven
                ? {
                      type: "modify",
                      positionId: position.id,
                      stopLossPoints: 0,
                  }
                : null;
        },
    };
}
```
