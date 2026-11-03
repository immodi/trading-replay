import { useEffect, useState } from "react";
import { ChartComponent } from "./components/chart/Chart";
import { SystematicBacktestPage } from "./components/backtest/SystematicBacktestPage";
import SourceSelect from "./components/source/SourceSelect";
import SourceView from "./components/source/SourceView";
import type { CandleSourceConfig } from "./types/candleSource";

type AppTab = "sources" | "manual" | "backtest";

const isValidConfig = (
    config: CandleSourceConfig | null,
): config is CandleSourceConfig =>
    config !== null &&
    config.symbol !== "" &&
    config.id !== "" &&
    Number.isFinite(config.pointValue) &&
    config.pointValue > 0 &&
    Number.isFinite(config.commission ?? 0) &&
    (config.commission ?? 0) >= 0 &&
    config.fileName !== "";

function App() {
    // The upload form is edited here until it is saved.
    const [formConfig, setFormConfig] = useState<CandleSourceConfig | null>(null);
    // The source chosen from the stored list drives both working modes.
    const [activeConfig, setActiveConfig] = useState<CandleSourceConfig | null>(
        null,
    );
    const [refreshKey, setRefreshKey] = useState(0);
    const [tab, setTab] = useState<AppTab>("sources");

    const hasSource = isValidConfig(activeConfig);

    useEffect(() => {
        if (!hasSource) setTab("sources");
    }, [hasSource]);

    const selectSource = (config: CandleSourceConfig) => {
        setActiveConfig(config);
        setTab("manual");
    };

    const navButton = (value: AppTab, label: string, disabled = false) => (
        <button
            key={value}
            type="button"
            disabled={disabled}
            onClick={() => setTab(value)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                tab === value
                    ? "bg-accent text-white"
                    : "text-sub hover:bg-raised hover:text-ink"
            } disabled:cursor-not-allowed disabled:opacity-35`}
            aria-current={tab === value ? "page" : undefined}
        >
            {label}
        </button>
    );

    return (
        <div className="flex h-dvh w-full flex-col overflow-hidden bg-canvas">
            <nav className="flex h-11 shrink-0 items-center gap-1 border-b border-edge bg-surface px-3">
                {navButton("sources", "Data Sources")}
                {navButton("manual", "Manual Replay", !hasSource)}
                {navButton("backtest", "Systematic Backtest", !hasSource)}
                <div className="ml-auto flex items-center gap-2 text-[11px] text-faint">
                    {hasSource ? (
                        <>
                            <span className="text-sub">Active source</span>
                            <span className="rounded-full border border-edge-strong bg-raised px-2 py-1 text-ink">
                                {activeConfig.symbol}
                            </span>
                        </>
                    ) : (
                        <span>No source selected</span>
                    )}
                </div>
            </nav>

            <main className="min-h-0 flex-1 overflow-hidden">
                {tab === "sources" ? (
                    <div className="h-full overflow-auto p-6">
                        <div className="mx-auto w-full max-w-xl space-y-6 rounded-2xl border border-edge bg-surface p-6 shadow-xl shadow-black/30">
                            <SourceSelect
                                config={formConfig}
                                setConfig={setFormConfig}
                                onSaved={() => setRefreshKey((key) => key + 1)}
                            />
                            <SourceView
                                config={activeConfig}
                                setConfig={setActiveConfig}
                                onSelect={selectSource}
                                refreshKey={refreshKey}
                            />
                        </div>
                    </div>
                ) : null}

                {tab === "manual" && hasSource ? (
                    <ChartComponent
                        key={activeConfig.fileName}
                        config={activeConfig}
                    />
                ) : null}

                {hasSource ? (
                    <div
                        className={
                            tab === "backtest" ? "h-full min-h-0" : "hidden"
                        }
                    >
                        <SystematicBacktestPage
                            key={activeConfig.fileName}
                            config={activeConfig}
                        />
                    </div>
                ) : null}
            </main>
        </div>
    );
}

export default App;
