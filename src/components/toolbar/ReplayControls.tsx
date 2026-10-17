import StartIcon from "@/assets/start.svg";
import StopIcon from "@/assets/stop.svg";
import RewindIcon from "@/assets/rewind.svg";
import RestartIcon from "@/assets/restart.svg";
import type { PlayDirection } from "@/hooks/useReplay";

type ReplayControlsProps = {
    isPlaying: boolean,
    isDone: boolean,
    direction: PlayDirection,

    start: (direction: PlayDirection) => void,
    stop: () => void,
    restart: () => void,
    playback: (direction: PlayDirection) => void,
};

export function ReplayControls(props: ReplayControlsProps) {
    const start = () => {
        if (props.isDone) return;
        props.start(props.direction);
    };

    const stop = () => {
        if (props.isDone) return;
        props.stop();
    };

    const fastForward = () => {
        props.playback("forward");
    };

    const rewind = () => {
        props.playback("backward");
    };

    const isForward = props.direction === "forward";

    const buttonBase = `
        flex
        h-8
        w-10
        items-center
        justify-center
        rounded-md
        transition
        disabled:cursor-not-allowed
        disabled:opacity-40
    `;

    return (
        <div className="flex shrink-0 items-center gap-1 rounded-lg border border-edge bg-surface p-0.5">
            <button
                type="button"
                aria-label={isForward ? "Rewind" : "Fast forward"}
                title={isForward ? "Rewind" : "Fast forward"}
                className={`${buttonBase} text-sub hover:bg-raised hover:text-ink`}
                disabled={props.isDone}
                onClick={isForward ? rewind : fastForward}
            >
                <img
                    src={RewindIcon}
                    alt=""
                    className={`h-[18px] w-[18px] opacity-90 ${isForward ? "" : "rotate-180"}`}
                />
            </button>

            {props.isDone ? (
                <button
                    type="button"
                    aria-label="Restart"
                    title="Restart"
                    className={`${buttonBase} text-sub hover:bg-raised hover:text-ink`}
                    onClick={props.restart}
                >
                    <img src={RestartIcon} alt="" className="h-[18px] w-[18px] opacity-90" />
                </button>
            ) : (
                <button
                    type="button"
                    aria-label={props.isPlaying ? "Pause" : "Play"}
                    title={props.isPlaying ? "Pause" : "Play"}
                    className={`
                        ${buttonBase}
                        ${props.isPlaying
                            ? "bg-bear/20 hover:bg-bear/30"
                            : "bg-bull/20 hover:bg-bull/30"
                        }
                    `}
                    onClick={props.isPlaying ? stop : start}
                >
                    <img
                        src={props.isPlaying ? StopIcon : StartIcon}
                        alt=""
                        className="h-[18px] w-[18px] opacity-90"
                    />
                </button>
            )}
        </div>
    );
}
