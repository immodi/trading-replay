import { ChartSpeed, ChartSpeeds } from "@/constants/chart";

type ReplaySpeedProps = {
    setSpeed: (speed: number) => void
}

export function ReplaySpeedSelect({ setSpeed }: ReplaySpeedProps) {
    return (
        <div className="flex items-center gap-2">
            <label className="text-sm text-gray-400">
                Speed
            </label>

            <select
                onChange={(e) => setSpeed(Number(e.target.value))}
                defaultValue={ChartSpeed.X1}
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
                {ChartSpeeds.map(speed => (
                    <option
                        key={speed.label}
                        value={speed.interval}
                    >
                        {speed.label}
                    </option>
                ))}
            </select>
        </div>
    );
}
