import { generateCandles } from "@/data/generateCandles";
import { ColorType, CrosshairMode, type ChartOptions, type DeepPartial } from "lightweight-charts";
import { Chart, CandlestickSeries } from "lightweight-charts-react-components";

const data = generateCandles(200);


const options: DeepPartial<ChartOptions> = {
    layout: {
        background: {
            type: ColorType.Solid,
            color: "#ffffff",
        },
        textColor: "#000000",
        attributionLogo: false,
    },
    grid: {
        vertLines: {
            visible: true,
            color: "#e5e7eb",
        },
        horzLines: {
            visible: true,
            color: "#e5e7eb",
        },
    },
    timeScale: {
        timeVisible: true,
        secondsVisible: false,
    },
    crosshair: {
        mode: CrosshairMode.MagnetOHLC,
    },
};

export function ChartComponent() {
    return (
        <div className="w-3/4 h-3/4">
            <Chart options={options} containerProps={{ style: { width: '100%', height: '100%' } }}>
                <CandlestickSeries data={data} />
            </Chart>
        </div >
    );
}
