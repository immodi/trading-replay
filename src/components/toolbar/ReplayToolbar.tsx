import type { PlayDirection } from "@/hooks/useReplay";
import { ReplayControls } from "./ReplayControls";
import { ReplaySpeedSelect } from "./ReplaySpeedSelect";
import { ReplayTimeframeSelect } from "./ReplayTimeframeSelect";
import { ReplayTimezoneSelect } from "./ReplayTimezoneSelect";
import { IndicatorControls } from "./IndicatorControls";
import { SessionControls } from "./SessionControls";
import type { ChartTimezone } from "@/constants/timezone";
import type { IndicatorConfig } from "@/types/indicator";
import type { SessionSummary, SessionTrade } from "@/types/session";

export type ReplayToolbarProps = {
    minDate: Date,
    maxDate: Date,
    currentDate: Date | null,

    isPlaying: boolean,
    isDone: boolean,
    direction: PlayDirection,
    indicators: IndicatorConfig[];
    timeFrameMinutes: number;
    speed: number;
    chartTimezone: ChartTimezone;

    setTimeFrame: (timeFrame: number) => void
    setSpeed: (speed: number) => void,
    setChartTimezone: (timezone: ChartTimezone) => void,
    setChartDate: (date: Date) => void,

    start: (direction: PlayDirection) => void,
    stop: () => void,
    restart: () => void,
    playback: (direction: PlayDirection) => void,
    setIndicators: (indicators: IndicatorConfig[]) => void,

    sessionInstrument: string,
    sessionTrades: SessionTrade[],
    sessionSummary: SessionSummary,
    sessionHasUnexportedChanges: boolean,
    removeSessionTrade: (id: string) => void,
    exportSession: () => void,
}

export function ReplayToolbar(props: ReplayToolbarProps) {
    const onDateChange = async (
        event: React.ChangeEvent<HTMLInputElement>,
    ) => {
        const date = new Date(event.target.value);
        props.setChartDate(date)
    };


    return (
        <div
            className="
                relative
                flex
                h-12
                shrink-0
                items-center
                gap-3
                border-b
                border-edge
                bg-canvas
                px-4
                overflow-x-auto
                overflow-y-visible
                whitespace-nowrap
            "
        >
            <ReplayControls
                isPlaying={props.isPlaying}
                isDone={props.isDone}
                direction={props.direction}
                start={props.start}
                stop={props.stop}
                restart={props.restart}
                playback={props.playback}
            />

            <div className="h-5 w-px shrink-0 bg-edge" />

            <ReplaySpeedSelect speed={props.speed} setSpeed={props.setSpeed} />

            <ReplayTimeframeSelect
                timeFrame={props.timeFrameMinutes}
                setTimeFrame={props.setTimeFrame}
            />

            <ReplayTimezoneSelect
                timezone={props.chartTimezone}
                setTimezone={props.setChartTimezone}
            />

            <div className="ml-auto flex items-center gap-3 pl-4">
                <label className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">
                        Date
                    </span>
                    <input
                        type="date"
                        value={
                            (props.currentDate ?? props.minDate)
                                .toISOString()
                                .split("T")[0]
                        }
                        min={props.minDate.toISOString().split("T")[0]}
                        max={props.maxDate.toISOString().split("T")[0]}
                        onChange={onDateChange}
                        className="
                            rounded-md
                            border
                            border-edge
                            bg-surface
                            px-2
                            py-1
                            text-xs
                            text-ink
                            outline-none
                            transition
                            [color-scheme:dark]
                            hover:border-edge-strong
                            focus:border-accent/60
                        "
                    />
                </label>

                <div className="h-5 w-px shrink-0 bg-edge" />

                <SessionControls
                    instrument={props.sessionInstrument}
                    trades={props.sessionTrades}
                    summary={props.sessionSummary}
                    hasUnexportedChanges={props.sessionHasUnexportedChanges}
                    onRemove={props.removeSessionTrade}
                    onExport={props.exportSession}
                />

                <IndicatorControls
                    indicators={props.indicators}
                    onChange={props.setIndicators}
                />
            </div>
        </div>
    );
}
