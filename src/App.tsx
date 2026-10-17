import { useState } from "react";
import { ChartComponent } from "./components/chart/Chart"
import SourceSelect from "./components/source/SourceSelect";
import SourceView from "./components/source/SourceView";
import type { CandleSourceConfig } from "./types/candleSource";

const isValidConfig = (config: CandleSourceConfig | null): config is CandleSourceConfig =>
    config !== null &&
    config.symbol !== "" &&
    config.id !== "" &&
    config.pointValue !== 0 &&
    config.fileName !== "";

function App() {
    // The upload form is edited here until it is saved.
    const [formConfig, setFormConfig] = useState<CandleSourceConfig | null>(null);
    // The source chosen from the stored list, which drives the replay chart.
    const [activeConfig, setActiveConfig] = useState<CandleSourceConfig | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    if (isValidConfig(activeConfig)) {
        return <ChartComponent key={activeConfig.fileName} config={activeConfig} />;
    }

    return (
        <main className="flex min-h-dvh w-full items-center justify-center bg-[#131722] p-6 text-gray-200">
            <div className="w-full max-w-xl space-y-6 rounded-2xl border border-[#2A2E39] bg-[#1E222D] p-6 shadow-xl shadow-black/30">
                <SourceSelect
                    config={formConfig}
                    setConfig={setFormConfig}
                    onSaved={() => setRefreshKey((key) => key + 1)}
                />
                <SourceView
                    config={activeConfig}
                    setConfig={setActiveConfig}
                    refreshKey={refreshKey}
                />
            </div>
        </main>
    )
}

export default App
