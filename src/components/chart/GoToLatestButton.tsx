type GoToLatestButtonProps = {
    visible: boolean;
    onClick: () => void;
}


export function GoToLatestButton({
    visible,
    onClick,
}: GoToLatestButtonProps) {
    if (!visible) return null;

    return (
        <button
            type="button"
            onClick={onClick}
            title="Go to latest"
            aria-label="Go to latest"
            className="
                absolute
                bottom-12
                right-20
                z-50
                flex
                h-9
                w-9
                cursor-pointer
                items-center
                justify-center
                rounded-full
                border
                border-edge-strong
                bg-raised/90
                text-accent
                shadow-lg
                shadow-black/40
                backdrop-blur
                transition
                hover:border-accent
                hover:bg-accent
                hover:text-white
            "
        >
            <svg
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
                className="h-4 w-4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <path d="M5 12h13" />
                <path d="M12.5 6.5L18 12l-5.5 5.5" />
            </svg>
        </button>
    );
}
