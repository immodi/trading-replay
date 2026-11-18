import { save } from "@/data/opfs";
import { withSourceDefaults } from "@/data/sources/config";
import {
    ASSET_CLASSES,
    BASE_TIMEFRAME_OPTIONS,
    assetClassDefinition,
    type AssetClass,
} from "@/constants/assetClass";
import type { CandleSourceConfig } from "@/types/candleSource";
import { useRef, useState } from "react";

type SourceSelectProps = {
    config: CandleSourceConfig | null,
    setConfig: React.Dispatch<React.SetStateAction<CandleSourceConfig | null>>,
    /** Called after a successful save so the stored-source list can refresh. */
    onSaved?: () => void,
}

const inputClass = `
    w-full
    rounded-lg
    border
    border-[#363A45]
    bg-[#131722]
    px-3
    py-2
    text-sm
    text-gray-200
    outline-none
    transition
    hover:border-gray-500
    focus:ring-1
    focus:ring-blue-500/40
`;

const labelClass =
    "text-[10px] font-semibold uppercase tracking-wider text-gray-400";

export default function SourceSelect({ config, setConfig, onSaved }: SourceSelectProps) {
    const [file, setFile] = useState<File | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const update = (patch: Partial<CandleSourceConfig>) =>
        setConfig((c) => ({
            id: "",
            symbol: "",
            assetClass: "futures",
            currency: "USD",
            pointValue: 0,
            commission: 0,
            commissionPercent: 0,
            baseTimeframeMinutes: 1,
            fileName: "",
            ...c,
            ...patch,
        }));

    const onAssetClassChange = (assetClass: AssetClass) => {
        const definition = assetClassDefinition(assetClass);

        setConfig((current) => {
            const base = {
                id: "",
                symbol: "",
                assetClass: "futures" as AssetClass,
                currency: "USD",
                pointValue: 0,
                commission: 0,
                commissionPercent: 0,
                baseTimeframeMinutes: 1,
                fileName: "",
                ...current,
            };

            return {
                ...base,
                assetClass,
                baseTimeframeMinutes:
                    definition.defaultBaseTimeframeMinutes,
                // Stocks are quoted per share, so one point is one currency
                // unit. Futures point values are instrument-specific, so an
                // existing value is left untouched.
                pointValue:
                    assetClass === "stock" || base.pointValue <= 0
                        ? definition.defaultPointValue
                        : base.pointValue,
            };
        });
    };

    const onFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files && files.length > 0) {
            const file = files[0];
            update({ fileName: file.name });
            setFile(file);
        }
    };

    const canSave =
        file !== null &&
        config !== null &&
        !isSaving &&
        config.symbol.trim() !== "" &&
        config.id.trim() !== "" &&
        config.fileName.trim() !== "" &&
        config.currency.trim() !== "" &&
        (config.assetClass === "stock" ||
            (Number.isFinite(config.pointValue) && config.pointValue > 0)) &&
        Number.isFinite(config.commission ?? 0) &&
        (config.commission ?? 0) >= 0 &&
        Number.isFinite(config.commissionPercent ?? 0) &&
        (config.commissionPercent ?? 0) >= 0 &&
        Number.isFinite(config.baseTimeframeMinutes) &&
        config.baseTimeframeMinutes >= 1;

    const onSave = async () => {
        if (!canSave || !file || !config) return;

        setIsSaving(true);
        try {
            await save(
                config.fileName,
                file,
                withSourceDefaults(config),
            );

            // Reset the form so the next source starts from a clean slate.
            setFile(null);
            setConfig(null);
            if (fileInputRef.current) fileInputRef.current.value = "";

            onSaved?.();
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <section className="space-y-4">
            <h1 className="text-lg font-semibold text-gray-100">Add a source</h1>

            <div className="grid gap-3 sm:grid-cols-3">
                <label className="space-y-1">
                    <span className={labelClass}>Market</span>
                    <select
                        value={config?.assetClass ?? "futures"}
                        onChange={(e) =>
                            onAssetClassChange(e.target.value as AssetClass)
                        }
                        className={`${inputClass} cursor-pointer`}
                    >
                        {ASSET_CLASSES.map((assetClass) => (
                            <option key={assetClass.value} value={assetClass.value}>
                                {assetClass.label}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="space-y-1">
                    <span className={labelClass}>Data interval</span>
                    <select
                        value={config?.baseTimeframeMinutes ?? 1}
                        onChange={(e) =>
                            update({
                                baseTimeframeMinutes: Number(e.target.value),
                            })
                        }
                        className={`${inputClass} cursor-pointer`}
                    >
                        {BASE_TIMEFRAME_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </label>

                <label className="space-y-1">
                    <span className={labelClass}>Currency</span>
                    <input
                        type="text"
                        placeholder="USD"
                        maxLength={5}
                        value={config?.currency || ""}
                        onChange={(e) =>
                            update({ currency: e.target.value.toUpperCase() })
                        }
                        className={inputClass}
                    />
                </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
                <input
                    type="text"
                    placeholder="Symbol"
                    value={config?.symbol || ""}
                    onChange={(e) => {
                        const symbol = e.target.value.toUpperCase();
                        update({ symbol, id: symbol.toLowerCase() });
                    }}
                    className={inputClass}
                />
                <input
                    type="number"
                    placeholder={config?.assetClass === "stock" ? "1 (shares)" : "Point value"}
                    min={0}
                    step="any"
                    disabled={config?.assetClass === "stock"}
                    value={
                        config?.assetClass === "stock"
                            ? 1
                            : config?.pointValue || ""
                    }
                    onChange={(e) => update({ pointValue: Number(e.target.value) })}
                    className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-60`}
                />
                <input
                    type="number"
                    placeholder={
                        config?.assetClass === "stock"
                            ? "Fixed commission / order / side"
                            : "Commission / contract / side"
                    }
                    min={0}
                    step={0.01}
                    value={config?.commission || ""}
                    onChange={(e) => update({ commission: Number(e.target.value) })}
                    className={inputClass}
                />
                <input
                    type="number"
                    placeholder="Commission % / side"
                    min={0}
                    step={0.01}
                    value={config?.commissionPercent || ""}
                    onChange={(e) =>
                        update({ commissionPercent: Number(e.target.value) })
                    }
                    className={inputClass}
                />
                <p className="text-[11px] leading-relaxed text-gray-500 sm:col-span-2">
                    Example EGX stock fees: fixed `2` per order/side plus `0.1`
                    percent per side. Set the percentage to `0` for markets
                    without a percentage commission.
                </p>
            </div>

            <p className="text-[11px] leading-relaxed text-gray-500">
                {config?.assetClass === "stock"
                    ? "Stock P/L is calculated in the source currency as price change × shares. Bracket stop/target distances are entered in that currency, not points. Commission is per side."
                    : `Futures point value is the dollar value of one price point per ${assetClassDefinition(config?.assetClass).quantityLabel}.`}
                {config?.baseTimeframeMinutes === 1440
                    ? " Daily bars replay one candle per trading day; timestamp each bar on its trading day's UTC date."
                    : " One-minute bars can be aggregated into every larger timeframe."}
            </p>

            <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={onFileChange}
                className="
                    block
                    w-full
                    cursor-pointer
                    rounded-lg
                    border-dashed
                    border-[#363A45]
                    bg-[#131722]
                    text-sm
                    text-gray-400
                    transition
                    hover:border-gray-500
                    file:mr-3
                    file:border-0
                    file:px-3
                    file:py-2
                    file:font-medium
                    focus:outline-none
                "
            />

            <button
                type="button"
                disabled={!canSave}
                onClick={onSave}
                className="
                    w-full
                    rounded-lg
                    bg-blue-600
                    px-4
                    py-2
                    text-sm
                    font-medium
                    text-white
                    transition
                    hover:bg-blue-500
                    focus:outline-none
                    focus:ring-2
                    focus:ring-blue-500/50
                    disabled:opacity-40
                    cursor-pointer
                "
            >
                {isSaving ? (
                    <span className="flex items-center justify-center gap-2">
                        <span
                            className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                            aria-hidden="true"
                        />
                        Saving…
                    </span>
                ) : (
                    "Save source"
                )}
            </button>
        </section>
    );
}
