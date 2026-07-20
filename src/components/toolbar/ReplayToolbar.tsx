import type { PlayDirection } from "@/hooks/useReplay";
import { ReplayControls } from "./ReplayControls";
import { ReplaySpeedSelect } from "./ReplaySpeedSelect";
import { ReplayTimeframeSelect } from "./ReplayTimeframeSelect";
import type { Candle } from "@/types/candle";
import { loadContinuousMnq } from "@/data/mnq";

type ReplayToolbarProps = {
    minDate: Date,
    maxDate: Date,

    isPlaying: boolean,
    isDone: boolean,
    direction: PlayDirection,

    setTimeFrame: (timeFrame: number) => void
    setSpeed: (speed: number) => void,
    setCandleData: (data: Candle[]) => void,

    start: (direction: PlayDirection) => void,
    stop: () => void,
    restart: () => void,
    playback: (direction: PlayDirection) => void,
}
export function ReplayToolbar(props: ReplayToolbarProps) {
    const onDateChange = async (
        event: React.ChangeEvent<HTMLInputElement>,
    ) => {
        const candleData = await loadContinuousMnq(new Date(event.target.value));
        props.setCandleData(candleData);
    };

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
            <div
                className="
                    flex
                    items-center
                    gap-2
                "
            >

                <input
                    type="date"
                    defaultValue={props.minDate.toISOString().split("T")[0]}
                    min={props.minDate.toISOString().split("T")[0]}
                    max={props.maxDate.toISOString().split("T")[0]}
                    onChange={onDateChange}
                    className="
                        rounded
                        border
                        bg-[#131722]
                        px-2
                        py-1
                        text-sm
                        text-gray-200
                        outline-none
                        transition
                        hover:border-gray-500
                        focus:border-blue-500
                    "
                />
            </div>

            <div className="h-5 w-px bg-[#363A45]" />

            <ReplaySpeedSelect setSpeed={props.setSpeed} />

            <ReplayTimeframeSelect setTimeFrame={props.setTimeFrame} />

            <ReplayControls {...props} />
        </div>
    );
}
