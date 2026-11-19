"use strict";

const state = {
  strategies: [],
  result: null,
  busy: false,
  tab: "all",
  search: "",
  selectedSymbol: null,
  fills: {},
};

const STORAGE = {
  strategy: "egx-screener.strategy",
  equity: "egx-screener.equity",
  held: "egx-screener.held",
  fixedFee: "egx-screener.fixedFee",
  feePct: "egx-screener.feePct",
};

const GATE_LETTERS = {
  history: "H",
  fresh: "F",
  volume: "V",
  price: "P",
  liquidity: "L",
};

const $ = (id) => document.getElementById(id);

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fmt(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }
  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtPrice(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }
  const number = Number(value);
  if (Math.abs(number) >= 1) {
    return number.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
  return number
    .toLocaleString("en-US", {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4,
    })
    .replace(/0+$/, "")
    .replace(/\.$/, "");
}

function fmtInputPrice(value) {
  if (value === null || value === undefined || value === "") return "";
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  if (Math.abs(number) >= 1) return number.toFixed(2);
  return number.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

function fmtInt(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }
  return Math.round(Number(value)).toLocaleString("en-US");
}

function pct(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }
  return `${(Number(value) * 100).toFixed(digits)}%`;
}

function statusLabel(row) {
  if (row.selected) return "SELECTED";
  return row.status.replaceAll("_", " ");
}

function statusClass(row) {
  if (row.selected) return "selected";
  return row.status.replaceAll("_", "-");
}

function gateLetter(key) {
  return GATE_LETTERS[key] || String(key || "?").slice(0, 1).toUpperCase();
}

function setBanner(message, kind = "error", showRefresh = false) {
  const banner = $("banner");
  banner.className = `banner ${kind}`;
  banner.innerHTML = `
    <div class="banner-text">${esc(message)}</div>
    ${showRefresh ? '<button type="button" class="ghost" id="banner-refresh">Refresh today</button>' : ""}
  `;
  const button = $("banner-refresh");
  if (button) button.addEventListener("click", refresh);
}

function clearBanner() {
  const banner = $("banner");
  banner.className = "banner hidden";
  banner.innerHTML = "";
}

async function api(path, options) {
  const response = await fetch(path, options);
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`HTTP ${response.status}`);
  }

  if (!response.ok || payload.ok === false) {
    const error = new Error(payload.error || `HTTP ${response.status}`);
    error.payload = payload;
    throw error;
  }

  return payload;
}

function params() {
  return {
    strategy: $("strategy").value || "donchian",
    equity: $("equity").value,
    held: $("held").value,
    fixed_fee: $("fixed-fee").value,
    fee_pct: $("fee-pct").value,
  };
}

function queryString() {
  const { strategy, equity, held, fixed_fee, fee_pct } = params();
  const search = new URLSearchParams();
  search.set("strategy", strategy);
  if (equity) search.set("equity", equity);
  if (held) search.set("held", held);
  if (fixed_fee) search.set("fixed_fee", fixed_fee);
  if (fee_pct) search.set("fee_pct", fee_pct);
  return search.toString();
}

function persist() {
  localStorage.setItem(STORAGE.strategy, $("strategy").value);
  localStorage.setItem(STORAGE.equity, $("equity").value);
  localStorage.setItem(STORAGE.held, $("held").value);
  localStorage.setItem(STORAGE.fixedFee, $("fixed-fee").value);
  localStorage.setItem(STORAGE.feePct, $("fee-pct").value);
}

function updateSubtitle() {
  const selected = state.strategies.find(
    (item) => item.key === $("strategy").value,
  );
  $("strategy-subtitle").textContent = selected
    ? selected.description
    : "Close-of-day decision, next-open fill";
}

async function loadStrategies() {
  const payload = await api("/api/strategies");
  state.strategies = payload.strategies;

  const select = $("strategy");
  select.innerHTML = state.strategies
    .map(
      (strategy) =>
        `<option value="${esc(strategy.key)}">${esc(strategy.label)}</option>`,
    )
    .join("");

  const stored = localStorage.getItem(STORAGE.strategy);
  if (stored && state.strategies.some((item) => item.key === stored)) {
    select.value = stored;
  }

  select.addEventListener("change", () => {
    persist();
    updateSubtitle();
    loadScreen();
  });
}

function statChip(label, value, tone = "") {
  return `
    <span class="stat ${tone}">
      <span>${esc(label)}</span>
      <strong>${esc(value)}</strong>
    </span>
  `;
}

function renderSession(result) {
  $("session-date").textContent = result.session_date;

  const stats = result.summary;
  $("session-note").textContent =
    `${result.strategy_label} · ${result.universe} · ${stats.universe} names · ` +
    `looked back ${result.looked_back_days} days`;

  $("session-stats").innerHTML = [
    statChip("Eligible", stats.eligible),
    statChip("Triggered", stats.triggered),
    statChip("Selected", stats.selected, "accent"),
    statChip("Filtered", stats.filtered, stats.filtered ? "warn" : ""),
    statChip(
      "Fee warnings",
      stats.fee_warnings,
      stats.fee_warnings ? "danger" : "",
    ),
    statChip(
      "Stale / missing",
      stats.stale + stats.missing,
      stats.stale + stats.missing ? "warn" : "",
    ),
  ].join("");
}

function computeSizing(fill, config) {
  const stopPct = Number(config.strategy.stop_pct);
  const riskAmount = Number(config.equity) * Number(config.risk_per_trade);
  const costPct = Number(config.cost_pct_per_side);
  const fixedFee = Math.max(0, Number(config.fixed_fee_per_order || 0));
  const roundTripFixed = fixedFee * 2;
  const warningThreshold = Number(config.fee_warning_threshold || 0.25);

  const base = {
    stop: null,
    shares: 0,
    notional: 0,
    riskAmount,
    stopPct,
    entryFee: 0,
    exitFee: 0,
    roundTripFees: 0,
    feePctOfRisk: 0,
    breakevenPct: 0,
    worstCaseLoss: 0,
    cappedBy: "invalid",
    feeWarning: false,
  };

  if (!Number.isFinite(fill) || fill <= 0) {
    return base;
  }

  const stop = fill * (1 - stopPct);
  const stopDistance = fill * stopPct;

  if (riskAmount <= roundTripFixed) {
    return {
      ...base,
      stop,
      roundTripFees: roundTripFixed,
      feePctOfRisk: 1,
      cappedBy: "fees",
      feeWarning: true,
    };
  }

  const feePerShare = fill * costPct * 2;
  const riskShares = Math.floor(
    (riskAmount - roundTripFixed) / (stopDistance + feePerShare),
  );
  const notionalShares = Math.floor(Number(config.max_order_notional) / fill);
  const cashShares = Math.floor(
    Math.max(0, Number(config.equity) - fixedFee) / (fill * (1 + costPct)),
  );

  const limits = {
    risk: riskShares,
    notional: notionalShares,
    cash: cashShares,
  };
  const shares = Math.max(0, Math.min(riskShares, notionalShares, cashShares));
  const cappedBy =
    shares > 0
      ? Object.keys(limits).reduce((best, key) =>
          limits[key] < limits[best] ? key : best,
        )
      : "fees";

  const notional = shares * fill;
  const entryFee = notional * costPct + fixedFee;
  const exitFee = notional * costPct + fixedFee;
  const roundTripFees = entryFee + exitFee;
  const feePctOfRisk = riskAmount > 0 ? roundTripFees / riskAmount : 0;
  const breakevenPct = notional > 0 ? roundTripFees / notional : 0;
  const worstCaseLoss = shares * stopDistance + roundTripFees;
  const feeWarning =
    (shares === 0 && cappedBy === "fees") ||
    (shares > 0 &&
      (feePctOfRisk > warningThreshold || breakevenPct > stopPct));

  return {
    stop,
    shares,
    notional,
    riskAmount,
    stopPct,
    entryFee,
    exitFee,
    roundTripFees,
    feePctOfRisk,
    breakevenPct,
    worstCaseLoss,
    cappedBy,
    feeWarning,
  };
}

function feeModelText(config) {
  const percent = (Number(config.cost_pct_per_side) * 100).toFixed(2);
  const fixedValue = Number(config.fixed_fee_per_order || 0);
  const fixed = Number.isInteger(fixedValue)
    ? String(fixedValue)
    : fixedValue.toFixed(2);
  return `${percent}%/side + ${fixed} EGP/order`;
}

function feeWarningText(sizing) {
  if (!sizing.feeWarning) return "";
  if (sizing.shares === 0) {
    return (
      "No shares fit after fees: the round-trip cost alone exceeds the " +
      "risk budget at this account size."
    );
  }
  return (
    `Fee drag is ${pct(sizing.feePctOfRisk)} of the risk budget. ` +
    `The position must move ${pct(sizing.breakevenPct, 2)} just to break even.`
  );
}

function exitPlanText(row, strategy, stop) {
  const maxHold = strategy.max_hold_bars;
  const trigger = row.detail?.exit_trigger;
  const label = row.detail?.exit_trigger_label || "strategy exit";

  if (
    row.detail?.exit_trigger_kind === "price" &&
    trigger !== null &&
    trigger !== undefined &&
    Number.isFinite(Number(trigger))
  ) {
    return (
      `No fixed TP. Exit if the close breaks ${fmtPrice(trigger)} ` +
      `(${label}), the stop at ${fmtPrice(stop)} is hit, or after ${maxHold} sessions.`
    );
  }

  return `No fixed TP. ${strategy.exit_description} Reference stop ${fmtPrice(stop)}.`;
}

function orderCard(row, result) {
  const config = result.config;
  const strategy = config.strategy;
  const close = Number(row.close);
  const fill =
    state.fills[row.symbol] !== undefined
      ? state.fills[row.symbol]
      : close;
  const sizing = computeSizing(fill, config);
  const riskPct = pct(config.risk_per_trade, 1);

  return `
    <article class="order-card" data-symbol="${esc(row.symbol)}">
      <header class="order-head">
        <span class="rank">${row.rank ?? "—"}</span>
        <div class="order-title">
          <h3>${esc(row.symbol)} <span>${esc(row.name)}</span></h3>
          <p>${esc(row.reasons?.[0] || "Passed the strategy and every gate.")}</p>
        </div>
        <span class="pill selected">SELECTED</span>
      </header>

      <div class="order-metrics">
        <div class="metric">
          <span>Entry / desired price</span>
          <strong>Next open</strong>
          <small>ref close ${fmtPrice(close)}</small>
        </div>

        <div class="metric metric-fill">
          <span>Actual fill</span>
          <input
            class="fill-input"
            type="number"
            min="0"
            step="0.01"
            value="${fmtInputPrice(fill)}"
            aria-label="Actual fill price for ${esc(row.symbol)}"
          />
          <small>edit to recalc</small>
        </div>

        <div class="metric">
          <span>Stop loss</span>
          <strong data-field="stop">${fmtPrice(sizing.stop)}</strong>
          <small data-field="stop-pct">-${fmt(sizing.stopPct * 100, 1)}%</small>
        </div>

        <div class="metric">
          <span>Shares</span>
          <strong data-field="shares">${fmtInt(sizing.shares)}</strong>
          <small data-field="notional">${fmtInt(sizing.notional)} EGP</small>
        </div>

        <div class="metric">
          <span>Risk</span>
          <strong data-field="risk">${fmtInt(sizing.riskAmount)} EGP</strong>
          <small>${riskPct} of equity</small>
        </div>

        <div class="metric">
          <span>Fees (round trip)</span>
          <strong data-field="fees">${fmt(sizing.roundTripFees)} EGP</strong>
          <small data-field="fee-pct">${pct(sizing.feePctOfRisk)} of risk</small>
        </div>

        <div class="metric">
          <span>Break-even move</span>
          <strong data-field="breakeven">${pct(sizing.breakevenPct, 2)}</strong>
          <small>just to cover fees</small>
        </div>
      </div>

      <div class="exit-plan">
        <span class="eyebrow">Exit plan / TP</span>
        <p data-field="exit">${esc(
          exitPlanText(row, strategy, sizing.stop),
        )}</p>
      </div>

      <div class="fee-warning ${sizing.feeWarning ? "" : "hidden"}"
           data-field="fee-warning">
        ${esc(feeWarningText(sizing))}
      </div>

      <footer class="order-foot">
        <span class="gates-badge">
          ${(row.filters || []).filter((item) => item.passed).length}/
          ${(row.filters || []).length} gates passed
        </span>
        <button type="button" class="link" data-inspect="${esc(row.symbol)}">
          Inspect checklist
        </button>
      </footer>
    </article>
  `;
}

function renderOrders(result) {
  const selected = result.rows.filter((row) => row.selected);
  const planNote = $("plan-note");
  const config = result.config;
  const strategy = config.strategy;
  const riskAmount = config.equity * config.risk_per_trade;

  $("selected-count").textContent = String(selected.length);
  planNote.textContent =
    `${strategy.label} · entry at next open · ` +
    `stop ${(Number(strategy.stop_pct) * 100).toFixed(1)}% · ` +
    `exit ${strategy.exit_short} · ` +
    `risk ${fmtInt(riskAmount)} EGP/trade · fees ${feeModelText(config)}`;

  const container = $("orders");

  if (selected.length === 0) {
    let message = "No stock triggered the entry rule on this close.";
    let target = "all";
    let action = "Review all names";

    if (result.summary.triggered > 0 && result.summary.signals === 0) {
      message =
        "Stock(s) triggered the entry rule, but none passed every eligibility gate. " +
        "The Filtered tab shows which gate failed.";
      target = "filtered";
      action = "See filtered names";
    } else if (result.summary.signals > 0) {
      message =
        `${result.summary.signals} signal(s) are outside the selection cap ` +
        `or already held.`;
      target = "signals";
      action = "Review signals";
    }

    container.innerHTML = `
      <div class="orders-empty">
        <h3>No orders for next open</h3>
        <p>${esc(message)}</p>
        <button type="button" class="ghost" data-goto-tab="${esc(target)}">
          ${esc(action)}
        </button>
      </div>
    `;
  } else {
    container.innerHTML = selected.map((row) => orderCard(row, result)).join("");
  }

  container.querySelectorAll(".fill-input").forEach((input) => {
    input.addEventListener("input", () => {
      const card = input.closest(".order-card");
      const symbol = card.dataset.symbol;
      const value = Number(input.value);
      state.fills[symbol] = Number.isFinite(value) ? value : null;
      updateOrderCard(card, result);
    });
  });

  container.querySelectorAll("[data-inspect]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedSymbol = button.dataset.inspect;
      renderTable(result);
      renderDetail(result);
      $("detail").scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  });

  container.querySelectorAll("[data-goto-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.tab = button.dataset.gotoTab;
      renderTabs(result);
      renderTable(result);
    });
  });
}

function updateOrderCard(card, result) {
  const row = result.rows.find((item) => item.symbol === card.dataset.symbol);
  if (!row) return;

  const config = result.config;
  const fill = Number(card.querySelector(".fill-input").value);
  const sizing = computeSizing(fill, config);

  card.querySelector('[data-field="stop"]').textContent = fmtPrice(sizing.stop);
  card.querySelector('[data-field="stop-pct"]').textContent =
    `-${fmt(sizing.stopPct * 100, 1)}%`;
  card.querySelector('[data-field="shares"]').textContent = fmtInt(sizing.shares);
  card.querySelector('[data-field="notional"]').textContent =
    `${fmtInt(sizing.notional)} EGP`;
  card.querySelector('[data-field="fees"]').textContent =
    `${fmt(sizing.roundTripFees)} EGP`;
  card.querySelector('[data-field="fee-pct"]').textContent =
    `${pct(sizing.feePctOfRisk)} of risk`;
  card.querySelector('[data-field="breakeven"]').textContent =
    pct(sizing.breakevenPct, 2);
  card.querySelector('[data-field="exit"]').textContent = exitPlanText(
    row,
    config.strategy,
    sizing.stop,
  );

  const warning = card.querySelector('[data-field="fee-warning"]');
  warning.textContent = feeWarningText(sizing);
  warning.classList.toggle("hidden", !sizing.feeWarning);
}

function tabDefs(result) {
  return [
    { key: "all", label: "All", count: result.rows.length },
    {
      key: "selected",
      label: "Selected",
      count: result.rows.filter((row) => row.selected).length,
    },
    {
      key: "signals",
      label: "Signals",
      count: result.rows.filter((row) => row.triggered && row.eligible).length,
    },
    {
      key: "passed",
      label: "Passed gates",
      count: result.rows.filter(
        (row) => row.eligible && row.status !== "missing",
      ).length,
    },
    {
      key: "filtered",
      label: "Filtered",
      count: result.rows.filter((row) => row.status === "filtered").length,
    },
    {
      key: "attention",
      label: "Stale / missing",
      count: result.rows.filter(
        (row) => row.status === "stale" || row.status === "missing",
      ).length,
    },
  ];
}

function renderTabs(result) {
  const tabs = tabDefs(result);
  if (!tabs.some((tab) => tab.key === state.tab)) {
    state.tab = "all";
  }

  $("tabs").innerHTML = tabs
    .map(
      (tab) => `
        <button type="button"
          class="tab ${state.tab === tab.key ? "active" : ""}"
          data-tab="${esc(tab.key)}">
          ${esc(tab.label)} <span>${tab.count}</span>
        </button>
      `,
    )
    .join("");

  $("tabs").querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.tab = button.dataset.tab;
      renderTabs(result);
      renderTable(result);
    });
  });
}

function rowMatchesTab(row, tab) {
  switch (tab) {
    case "selected":
      return row.selected;
    case "signals":
      return row.triggered && row.eligible;
    case "passed":
      return row.eligible && row.status !== "missing";
    case "filtered":
      return row.status === "filtered";
    case "attention":
      return row.status === "stale" || row.status === "missing";
    default:
      return true;
  }
}

function visibleRows(result) {
  const query = state.search.trim().toLowerCase();
  return result.rows.filter((row) => {
    if (!rowMatchesTab(row, state.tab)) return false;
    if (!query) return true;
    return (
      row.symbol.toLowerCase().includes(query) ||
      row.name.toLowerCase().includes(query)
    );
  });
}

function gateChip(filter) {
  return `
    <span
      class="gate ${filter.passed ? "pass" : "fail"}"
      title="${esc(filter.label)}: ${esc(filter.reason)}"
    >${esc(gateLetter(filter.key))}</span>
  `;
}

function renderTable(result) {
  const rows = visibleRows(result);
  const body = $("rows");
  const empty = $("empty");

  if (rows.length === 0) {
    body.innerHTML = "";
    empty.textContent =
      state.search.trim().length > 0
        ? `No stock matches “${state.search.trim()}”.`
        : "No stocks in this tab.";
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");

  body.innerHTML = rows
    .map((row) => {
      const gates = (row.filters || []).map(gateChip).join("");
      const signal = row.triggered
        ? '<span class="mini-pill signal">SIGNAL</span>'
        : '<span class="muted">—</span>';
      const feeDrag =
        row.fee_pct_of_risk === null || row.fee_pct_of_risk === undefined
          ? '<span class="muted">—</span>'
          : `<span class="${row.fee_warning ? "fee-high" : ""}">${pct(
              row.fee_pct_of_risk,
            )}</span>`;
      const selectedClass =
        state.selectedSymbol === row.symbol ? "is-inspected" : "";

      return `
        <tr class="row status-${statusClass(row)} ${selectedClass}"
            data-symbol="${esc(row.symbol)}"
            title="${esc(row.reasons?.[0] || "")}">
          <td class="num">${row.rank ?? "—"}</td>
          <td class="symbol">${esc(row.symbol)}</td>
          <td class="num">${fmtPrice(row.close)}</td>
          <td>${signal}</td>
          <td><div class="gates">${gates || '<span class="muted">—</span>'}</div></td>
          <td class="num">${fmt(row.score, 3)}</td>
          <td class="num">${feeDrag}</td>
          <td class="num">${fmtPrice(row.stop)}</td>
          <td class="num">${fmtInt(row.shares)}</td>
          <td><span class="pill ${statusClass(row)}">${esc(statusLabel(row))}</span></td>
        </tr>
      `;
    })
    .join("");

  body.querySelectorAll("tr[data-symbol]").forEach((tr) => {
    tr.addEventListener("click", () => {
      state.selectedSymbol = tr.dataset.symbol;
      renderTable(result);
      renderDetail(result);
    });
  });
}

function fmtFilterValue(value) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? value.toLocaleString("en-US")
      : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  return String(value);
}

function checklistItem(filter) {
  return `
    <li class="${filter.passed ? "pass" : "fail"}">
      <span class="tick">${filter.passed ? "✓" : "✕"}</span>
      <div>
        <div class="check-head">
          <strong>${esc(filter.label)}</strong>
          <span class="check-value">
            ${esc(fmtFilterValue(filter.value))}
            <span class="muted">/ ${esc(fmtFilterValue(filter.threshold))}</span>
          </span>
        </div>
        <p>${esc(filter.reason)}</p>
      </div>
    </li>
  `;
}

function detailValue(label, value) {
  return `
    <div class="kv">
      <span>${esc(label)}</span>
      <strong>${esc(value)}</strong>
    </div>
  `;
}

function renderDetail(result) {
  const panel = $("detail");
  const row = result.rows.find((item) => item.symbol === state.selectedSymbol);

  if (!row) {
    panel.innerHTML = `
      <div class="detail-empty">
        <h3>Inspect a stock</h3>
        <p>Choose any row to see its checklist, signal, and reference trade plan.</p>
      </div>
    `;
    return;
  }

  const strategy = result.config.strategy;
  const detail = row.detail || {};
  const filters = (row.filters || []).map(checklistItem).join("");
  const reasons = (row.reasons || []).map((reason) => `<li>${esc(reason)}</li>`).join("");

  const tradePlan =
    row.triggered && row.eligible
      ? `
        <div class="detail-section">
          <h4>Reference trade plan</h4>
          <div class="plan-lines">
            <div class="plan-line">
              <span>Entry / desired price</span>
              <strong>Next open</strong>
              <small>reference close ${fmtPrice(row.close)}</small>
            </div>
            <div class="plan-line">
              <span>Stop loss (SL)</span>
              <strong>${fmtPrice(row.stop)}</strong>
              <small>-${fmt(Number(strategy.stop_pct) * 100, 1)}% from fill</small>
            </div>
            <div class="plan-line">
              <span>Take profit (TP)</span>
              <strong>None</strong>
              <small>${esc(strategy.exit_description)}</small>
            </div>
            <div class="plan-line">
              <span>Size (reference)</span>
              <strong>${fmtInt(row.shares)} shares</strong>
              <small>${fmtInt(row.notional)} EGP · risk ${fmtInt(
                result.equity * Number(result.config.risk_per_trade),
              )} EGP · fees ${fmt(row.round_trip_fees)} EGP (${pct(
                row.fee_pct_of_risk,
              )} of risk)</small>
            </div>
          </div>
          ${
            detail.exit_trigger_kind === "price" &&
            detail.exit_trigger !== null &&
            detail.exit_trigger !== undefined
              ? `<p class="exit-trigger">
                   Current exit trigger: <strong>${esc(
                     detail.exit_trigger_label || "strategy exit",
                   )}</strong> at ${fmtPrice(detail.exit_trigger)}
                 </p>`
              : ""
          }
        </div>
      `
      : `
        <div class="detail-section">
          <h4>Trade plan</h4>
          <p class="muted">
            ${
              row.status === "filtered"
                ? "Not eligible for an order: at least one gate failed."
                : row.triggered
                  ? "Triggered, but not eligible for an order."
                  : "No entry signal on this close."
            }
          </p>
        </div>
      `;

  const rowSizing = {
    feeWarning: row.fee_warning,
    shares: row.shares,
    feePctOfRisk: row.fee_pct_of_risk,
    breakevenPct: row.breakeven_pct,
  };

  const costs =
    row.shares !== null && row.shares !== undefined
      ? `
        <div class="detail-section">
          <h4>Costs</h4>
          <div class="kv-grid">
            ${detailValue("Entry fee", `${fmt(row.entry_fee)} EGP`)}
            ${detailValue("Exit fee", `${fmt(row.exit_fee)} EGP`)}
            ${detailValue("Round trip", `${fmt(row.round_trip_fees)} EGP`)}
            ${detailValue("Fee / risk", pct(row.fee_pct_of_risk))}
            ${detailValue("Break-even", pct(row.breakeven_pct, 2))}
            ${detailValue("Worst-case loss", `${fmt(row.worst_case_loss)} EGP`)}
          </div>
          ${
            row.fee_warning
              ? `<div class="fee-warning">${esc(
                  feeWarningText(rowSizing),
                )}</div>`
              : ""
          }
        </div>
      `
      : "";

  const exitLabel =
    detail.exit_trigger_kind === "price" ? "Exit trigger" : "Exit ref";
  const grid = [
    detailValue("Close", fmtPrice(detail.close)),
    detailValue("Prior 19d high", fmtPrice(detail.prior_high)),
    detailValue("20d high (incl.)", fmtPrice(detail.donchian_high_20)),
    detailValue(exitLabel, fmtPrice(detail.exit_trigger)),
    detailValue("ATR14", fmtPrice(detail.atr14)),
    detailValue("ATR %", pct(detail.atr_pct)),
    detailValue("Avg vol 20", fmtInt(detail.avg_volume_20)),
    detailValue("RS60", pct(detail.rs60)),
    detailValue("SMA50", fmtPrice(detail.sma50)),
    detailValue("EMA10", fmtPrice(detail.ema10)),
    detailValue("EMA30", fmtPrice(detail.ema30)),
    detailValue("ADX14", fmt(detail.adx14)),
    detailValue("RSI14", fmt(detail.rsi14)),
    detailValue("Gap", pct(detail.gap_pct)),
  ].join("");

  panel.innerHTML = `
    <div class="detail-head">
      <div>
        <h3>${esc(row.symbol)} <span>${esc(row.name)}</span></h3>
        <p class="muted">
          ${row.rank !== null ? `Rank ${row.rank} · ` : ""}Score ${fmt(row.score, 3)}
          ${row.last_date ? ` · last bar ${esc(row.last_date)}` : ""}
        </p>
      </div>
      <span class="pill ${statusClass(row)}">${esc(statusLabel(row))}</span>
    </div>

    <div class="detail-section">
      <h4>Checklist</h4>
      <ul class="checklist">${filters || "<li>No local file for this symbol.</li>"}</ul>
    </div>

    ${tradePlan}
    ${costs}

    <div class="detail-section">
      <h4>Strategy values</h4>
      <div class="kv-grid">${grid}</div>
    </div>

    <div class="detail-section">
      <h4>Notes</h4>
      <ul class="notes">${reasons || "<li>No notes.</li>"}</ul>
    </div>
  `;
}

function renderBanner(result) {
  if (result.warnings?.length) {
    setBanner(result.warnings.join("  ·  "), "warning");
  } else {
    clearBanner();
  }
}

function render(result) {
  state.result = result;
  state.fills = {};

  const exists = result.rows.some(
    (row) => row.symbol === state.selectedSymbol,
  );
  if (!exists) {
    const firstSelected = result.rows.find((row) => row.selected);
    state.selectedSymbol = firstSelected ? firstSelected.symbol : null;
  }

  updateSubtitle();
  renderSession(result);
  renderOrders(result);
  renderTabs(result);
  renderTable(result);
  renderDetail(result);
  renderBanner(result);
}

function renderEmpty() {
  state.result = null;
  state.selectedSymbol = null;
  $("session-date").textContent = "—";
  $("session-note").textContent = "";
  $("session-stats").innerHTML = "";
  $("orders").innerHTML = "";
  $("selected-count").textContent = "0";
  $("tabs").innerHTML = "";
  $("rows").innerHTML = "";
  $("detail").innerHTML = `
    <div class="detail-empty">
      <h3>Inspect a stock</h3>
      <p>No screen loaded yet. Refresh today's data to begin.</p>
    </div>
  `;
  $("empty").classList.remove("hidden");
  $("empty").textContent = "No screen loaded yet.";
}

async function loadScreen() {
  clearBanner();
  try {
    const payload = await api(`/api/screen?${queryString()}`);
    render(payload.result);
  } catch (error) {
    renderEmpty();
    setBanner(error.message, "error", Boolean(error.payload?.needs_refresh));
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function showProgress(status) {
  const panel = $("progress");
  panel.classList.remove("hidden");

  const current = Number(status.current) || 0;
  const total = Number(status.total) || 0;
  const percent =
    total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

  $("progress-label").textContent = status.message || "Refreshing…";
  $("progress-count").textContent =
    total > 0 ? `${current} / ${total} · ${percent}%` : "working…";

  const bar = $("progress-bar");
  bar.style.width = status.phase === "done" ? "100%" : `${percent}%`;
  bar.classList.toggle(
    "indeterminate",
    total === 0 && status.phase !== "done",
  );

  $("progress-log").textContent = (status.log_tail || []).slice(-5).join("\n");
}

function hideProgress() {
  $("progress").classList.add("hidden");
  $("progress-bar").style.width = "0%";
  $("progress-bar").classList.remove("indeterminate");
  $("progress-log").textContent = "";
}

function setControlsDisabled(disabled) {
  [
    "strategy",
    "equity",
    "held",
    "fixed-fee",
    "fee-pct",
    "refresh-names",
  ].forEach((id) => {
    $(id).disabled = disabled;
  });
}

async function pollRefresh() {
  while (true) {
    const payload = await api("/api/refresh/status");
    const status = payload.status;
    showProgress(status);

    if (status.phase === "done") {
      if (status.result) {
        render(status.result);
      } else if (status.message) {
        setBanner(status.message, "info");
      }
      setTimeout(hideProgress, 900);
      return;
    }

    if (status.phase === "error") {
      throw new Error(status.error || "Refresh failed.");
    }

    if (status.phase === "idle") {
      throw new Error("Refresh state was lost; try again.");
    }

    await sleep(800);
  }
}

async function refresh(options = {}) {
  if (state.busy) return;
  const refreshNames = options.names === true;

  state.busy = true;
  const button = $("refresh");
  button.disabled = true;
  button.textContent = "Refreshing…";
  setControlsDisabled(true);
  clearBanner();
  showProgress({
    message: refreshNames
      ? "Starting index name refresh…"
      : "Starting refresh…",
    current: 0,
    total: 0,
  });

  try {
    try {
      await api("/api/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...params(),
          refresh_names: refreshNames ? "true" : "",
          names_only: refreshNames ? "true" : "",
        }),
      });
    } catch (error) {
      // 409 means another tab/request already started the job; poll it.
      if (!error.payload?.busy) throw error;
    }

    await pollRefresh();
  } catch (error) {
    hideProgress();
    setBanner(error.message, "error", Boolean(error.payload?.needs_refresh));
  } finally {
    state.busy = false;
    button.disabled = false;
    button.textContent = "Refresh today";
    setControlsDisabled(false);
  }
}

async function init() {
  const equity = localStorage.getItem(STORAGE.equity);
  $("equity").value = equity || "100000";

  const held = localStorage.getItem(STORAGE.held);
  if (held) $("held").value = held;

  const fixedFee = localStorage.getItem(STORAGE.fixedFee);
  $("fixed-fee").value = fixedFee ?? "2";

  const feePct = localStorage.getItem(STORAGE.feePct);
  $("fee-pct").value = feePct ?? "0.1";

  $("refresh").addEventListener("click", () => refresh());
  $("refresh-names").addEventListener("click", () => refresh({ names: true }));

  $("equity").addEventListener("change", () => {
    persist();
    loadScreen();
  });
  $("held").addEventListener("change", () => {
    persist();
    loadScreen();
  });
  $("fixed-fee").addEventListener("change", () => {
    persist();
    loadScreen();
  });
  $("fee-pct").addEventListener("change", () => {
    persist();
    loadScreen();
  });
  $("search").addEventListener("input", () => {
    state.search = $("search").value;
    if (state.result) renderTable(state.result);
  });

  try {
    await loadStrategies();
  } catch (error) {
    setBanner(`Could not load strategies: ${error.message}`, "error", false);
    return;
  }

  updateSubtitle();
  persist();
  await loadScreen();
}

init();
