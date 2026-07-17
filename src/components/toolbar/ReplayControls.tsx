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
    rewind: () => void,
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

    return (
        <div className="flex items-center gap-2">
            <button
                type="button"
                className="
                    rounded
                    border
                    border-[#363A45]
                    bg-[#131722]
                    px-3
                    py-1
                    text-sm
                    text-gray-200
                    transition
                    hover:border-gray-500
                    hover:bg-[#1B2130]
                    cursor-pointer
                "
                onClick={props.rewind}
            >
                <img src={RewindIcon} alt="rewind" className="h-5 w-5" />
            </button>

            {props.isDone ?
                <button
                    type="button"
                    className="
                    rounded
                    border
                    border-[#363A45]
                    bg-[#131722]
                    px-3
                    py-1
                    text-sm
                    text-gray-200
                    transition
                    hover:border-gray-500
                    hover:bg-[#1B2130]
                    cursor-pointer
                "
                    onClick={props.restart}
                >
                    <img src={RestartIcon} alt="restart" className="h-5 w-5" />
                </button>
                :
                <button
                    type="button"
                    className="
                    rounded
                    border
                    border-[#363A45]
                    bg-[#131722]
                    px-3
                    py-1
                    text-sm
                    text-gray-200
                    transition
                    hover:border-gray-500
                    hover:bg-[#1B2130]
                    cursor-pointer
                "
                    onClick={props.isPlaying ? stop : start}
                >
                    {
                        props.isPlaying
                            ? <img src={StopIcon} alt="stop" className="h-5 w-5" />
                            : <img src={StartIcon} alt="start" className="h-5 w-5" />
                    }
                </button>


            }
        </div>
    );
}
