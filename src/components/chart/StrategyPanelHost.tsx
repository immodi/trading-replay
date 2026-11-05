import type { ReactNode } from "react";

export type StrategyPanelDefinition = {
    id: string;
    label: string;
    content: ReactNode;
};

type StrategyPanelHostProps = {
    panels: StrategyPanelDefinition[];
    activeId: string | null;
    onShow: (id: string) => void;
    onHide: () => void;
};

/**
 * Right-edge host for strategy-specific checks. One panel is visible at a time;
 * collapsing it leaves a narrow rail so more panels can be added later without
 * changing the chart layout.
 */
export function StrategyPanelHost({
    panels,
    activeId,
    onShow,
    onHide,
}: StrategyPanelHostProps) {
    const active = panels.find((panel) => panel.id === activeId) ?? null;

    if (active === null) {
        return (
            <aside className="flex w-9 shrink-0 flex-col items-center gap-2 border-l border-edge bg-surface py-3">
                {panels.map((panel) => (
                    <button
                        key={panel.id}
                        type="button"
                        onClick={() => onShow(panel.id)}
                        title={`Show ${panel.label}`}
                        aria-label={`Show ${panel.label}`}
                        className="
                            rounded-md
                            border
                            border-edge
                            bg-canvas
                            px-1
                            py-3
                            text-[9px]
                            font-semibold
                            uppercase
                            tracking-wider
                            text-sub
                            transition
                            hover:border-edge-strong
                            hover:bg-raised
                            hover:text-ink
                        "
                        style={{ writingMode: "vertical-rl" }}
                    >
                        {panel.label}
                    </button>
                ))}
            </aside>
        );
    }

    return (
        <div className="flex min-h-0 shrink-0">
            {active.content}
            <button
                type="button"
                onClick={onHide}
                title="Hide panel"
                aria-label="Hide panel"
                className="
                    flex
                    w-6
                    shrink-0
                    items-start
                    justify-center
                    border-l
                    border-edge
                    bg-canvas
                    pt-3
                    text-faint
                    transition
                    hover:bg-raised
                    hover:text-ink
                "
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                    className="h-3.5 w-3.5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path d="M9 6l6 6-6 6" />
                </svg>
            </button>
        </div>
    );
}
