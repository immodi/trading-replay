import { list, loadJson, remove } from "@/data/opfs";
import type { CandleSourceConfig } from "@/types/candleSource";
import { useCallback, useEffect, useState } from "react";

type StoredSource = {
    fileName: string;
    config: CandleSourceConfig | null;
};

type SourceViewProps = {
    config: CandleSourceConfig | null;
    setConfig: React.Dispatch<React.SetStateAction<CandleSourceConfig | null>>;
    /** Bumped by the uploader so the list reloads after every save. */
    refreshKey: number;
};

export default function SourceView({ config, setConfig, refreshKey }: SourceViewProps) {
    const [sources, setSources] = useState<StoredSource[]>([]);

    const refresh = useCallback(async () => {
        const names = await list();

        const stored = await Promise.all(
            names.map(async (fileName) => ({
                fileName,
                config: await loadJson<CandleSourceConfig>(fileName, true),
            })),
        );

        setSources(stored);
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh, refreshKey]);

    const onSelect = (fileName: string) => {
        const selected = sources.find((source) => source.fileName === fileName);
        if (selected?.config) setConfig(selected.config);
    };

    const onDelete = async (fileName: string) => {
        // Clear the active choice and drop the row immediately, then remove it for good.
        if (config?.fileName === fileName) setConfig(null);
        setSources((prev) => prev.filter((source) => source.fileName !== fileName));

        await remove(fileName);
    };

    return (
        <section className="space-y-4 border-t border-[#2A2E39] pt-6">
            <h2 className="text-lg font-semibold text-gray-100">Stored sources</h2>

            {sources.length === 0 ? (
                <p className="rounded-lg border border-dashed border-[#363A45] bg-[#171B26] px-4 py-8 text-center text-sm text-gray-400">
                    No sources uploaded yet. Add one above to get started.
                </p>
            ) : (
                <div className="space-y-3">
                    <ul className="space-y-2">
                        {sources.map((source) => (
                            <li
                                key={source.fileName}
                                onClick={() => onSelect(source.fileName)}
                                className="
                                    flex
                                    items-center
                                    cursor-pointer
                                    justify-between
                                    gap-3
                                    rounded-lg
                                    border
                                    border-[#2A2E39]
                                    bg-[#171B26]
                                    px-3
                                    py-2
                                    transition
                                    hover:border-[#363A45]
                                "
                            >
                                <div
                                    className="min-w-0">
                                    <span className="block truncate text-sm font-medium text-gray-100">
                                        {source.config?.symbol ?? "—"}
                                    </span>
                                    <span className="block truncate text-xs text-gray-500">
                                        {source.fileName}
                                    </span>
                                    <span className="block truncate text-xs text-gray-500">
                                        Commission: ${(source.config?.commission ?? 0).toFixed(2)}/side
                                    </span>
                                </div>

                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDelete(source.fileName);
                                    }}
                                    className="
                                        shrink-0
                                        rounded-md
                                        border
                                        border-[#363A45]
                                        px-3
                                        py-1
                                        text-xs
                                        font-medium
                                        text-gray-300
                                        transition
                                        hover:border-red-500/60
                                        hover:bg-red-500/10
                                        hover:text-red-300
                                        focus:outline-none
                                        focus:ring-2
                                        focus:ring-red-500/40
                                        cursor-pointer
                                    "
                                >
                                    Delete
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </section>
    );
}
