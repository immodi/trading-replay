import type { PlayDirection } from "@/hooks/useReplay";
import { ReplayControls } from "./ReplayControls";
import { ReplaySpeedSelect } from "./ReplaySpeedSelect";
import { ReplayTimeframeSelect } from "./ReplayTimeframeSelect";

type ReplayToolbarProps = {
    isPlaying: boolean,
    isDone: boolean,
    direction: PlayDirection,

    setTimeFrame: (timeFrame: number) => void
    setSpeed: (speed: number) => void,

    start: (direction: PlayDirection) => void,
    stop: () => void,
    restart: () => void,
    rewind: () => void,
}
export function ReplayToolbar(props: ReplayToolbarProps) {
    return (
        <div
            className="
                flex
                h-12
                items-center
                gap-4
                border-b
                border-[#363A45]
                bg-[#1E222D]
                px-4
            "
        >
            <span className="text-sm font-semibold text-gray-200">
                MNQ
            </span>

            <div className="h-5 w-px bg-[#363A45]" />

            <ReplaySpeedSelect setSpeed={props.setSpeed} />

            <ReplayTimeframeSelect setTimeFrame={props.setTimeFrame} />

            <ReplayControls {...props} />
        </div>
    );
}
