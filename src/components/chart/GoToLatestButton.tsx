interface Props {
    visible: boolean;
    onClick: () => void;
}

export function GoToLatestButton({
    visible,
    onClick,
}: Props) {
    if (!visible) return null;

    return (
        <button
            onClick={onClick}
            className="
                w-10
                h-10
                absolute
                bottom-40
                right-30
                z-50
                rounded-lg
                bg-white
                border
                border-gray-300
                px-3
                py-1.5
                text-sm
                cursor-pointer
                shadow-lg
                hover:bg-gray-50
            "
        >
            →
        </button>
    );
}
