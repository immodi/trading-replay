import { ReplaySpeedSelect } from "./ReplaySpeedSelect";
import { ReplayTimeframeSelect } from "./ReplayTimeframeSelect";

type ReplayToolbarProps = {
    setSpeed: (speed: number) => void,
    setTimeFrame: (timeFrame: number) => void
}
export function ReplayToolbar({ setSpeed, setTimeFrame }: ReplayToolbarProps) {
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

            <ReplaySpeedSelect setSpeed={setSpeed} />

            <ReplayTimeframeSelect setTimeFrame={setTimeFrame} />
        </div>
    );
}
