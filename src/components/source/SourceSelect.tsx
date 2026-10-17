import { save } from "@/data/opfs";
import type { CandleSourceConfig } from "@/types/candleSource";
import { useRef, useState } from "react";

type SourceSelectProps = {
    config: CandleSourceConfig | null,
    setConfig: React.Dispatch<React.SetStateAction<CandleSourceConfig | null>>,
    /** Called after a successful save so the stored-source list can refresh. */
    onSaved?: () => void,
}

export default function SourceSelect({ config, setConfig, onSaved }: SourceSelectProps) {
    const [file, setFile] = useState<File | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const update = (patch: Partial<CandleSourceConfig>) =>
        setConfig((c) => ({ id: "", symbol: "", pointValue: 0, fileName: "", ...c, ...patch }));

    const onFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files && files.length > 0) {
            const file = files[0];
            update({ fileName: file.name });
            setFile(file);
        }
    };

    const canSave = file !== null && config !== null && !isSaving;

    const onSave = async () => {
        if (!canSave || !file || !config) return;

        setIsSaving(true);
        try {
            await save(config.fileName, file, config);

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

            <div className="grid gap-3 sm:grid-cols-2">
                <input
                    type="text"
                    placeholder="Symbol"
                    value={config?.symbol || ""}
                    onChange={(e) => {
                        const symbol = e.target.value.toUpperCase();
                        update({ symbol, id: symbol.toLowerCase() });
                    }}
                    className="
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
                    "
                />
                <input
                    type="number"
                    placeholder="Point value"
                    value={config?.pointValue || 0}
                    onChange={(e) => update({ pointValue: Number(e.target.value) })}
                    className="
                        w-full
                        rounded-lg
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
                    "
                />
            </div>

            <input
                ref={fileInputRef}
                type="file"
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
