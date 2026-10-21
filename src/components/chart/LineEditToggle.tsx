type LineEditToggleProps = {
    active: boolean;
    onToggle: () => void;
};

export function LineEditToggle({ active, onToggle }: LineEditToggleProps) {
    return (
        <button
            type="button"
            onClick={onToggle}
            aria-pressed={active}
            aria-label="Toggle order line editing"
            title={
                active
                    ? "Order line editing is on. Tap to turn off."
                    : "Edit order lines (simulates holding Shift)"
            }
            className={`
                absolute
                left-3
                top-3
                z-40
                flex
                h-9
                cursor-pointer
                items-center
                gap-1.5
                rounded-full
                border
                px-3
                text-[11px]
                font-semibold
                shadow-lg
                shadow-black/30
                backdrop-blur
                transition
                ${
                    active
                        ? "border-accent bg-accent text-white shadow-accent/25"
                        : "border-edge-strong bg-raised/90 text-sub hover:border-edge-strong hover:text-ink"
                }
            `}
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
                <rect x="5" y="11" width="14" height="9" rx="2" />
                {active ? (
                    <path d="M8 11V7a4 4 0 1 1 8 0v4" />
                ) : (
                    <path d="M8 11V7a4 4 0 0 1 7-2.65" />
                )}
            </svg>
            <span>{active ? "Editing" : "Edit lines"}</span>
        </button>
    );
}
