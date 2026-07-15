import { Timeframe, Timeframes } from "@/constants/toolbar";

type ReplayTimeframeSelectProps = {
    setTimeFrame: (timeFrame: number) => void
}

export function ReplayTimeframeSelect({ setTimeFrame }: ReplayTimeframeSelectProps) {
    return (
        <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">
                Timeframe
            </label>

            <select
                onChange={(e) => setTimeFrame(Number(e.target.value))}
                defaultValue={Timeframe.Minute15}
                className="
                    rounded
                    border
                    border-[#363A45]
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
            >
                {Timeframes.map(timeframe => (
                    <option
                        key={timeframe.value}
                        value={timeframe.value}
                    >
                        {timeframe.label}
                    </option>
                ))}
            </select>
        </div>
    );
}
