import { useMemo } from "react";
import type { EquityPoint } from "@/backtesting/types";
import { formatMoneyPlain } from "./format";

interface EquityCurveProps {
    points: EquityPoint[];
}

export function EquityCurve({ points }: EquityCurveProps) {
    const geometry = useMemo(() => {
        if (points.length < 2) return null;

        const width = 720;
        const height = 220;
        const padding = 12;
        const values = points.map((point) => point.equity);
        const min = values.reduce(
            (lowest, value) => Math.min(lowest, value),
            Number.POSITIVE_INFINITY,
        );
        const max = values.reduce(
            (highest, value) => Math.max(highest, value),
            Number.NEGATIVE_INFINITY,
        );
        const range = max - min || 1;
        const step = (width - padding * 2) / (points.length - 1);

        const coordinates = points.map((point, index) => {
            const x = padding + index * step;
            const y =
                padding +
                (1 - (point.equity - min) / range) * (height - padding * 2);
            return `${x},${y}`;
        });

        return {
            width,
            height,
            path: `M ${coordinates.join(" L ")}`,
            min,
            max,
        };
    }, [points]);

    if (!geometry) {
        return (
            <div className="flex h-48 items-center justify-center rounded-lg border border-edge bg-raised text-xs text-sub">
                Not enough equity points to draw a curve.
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-sub">
                <span>Min {formatMoneyPlain(geometry.min)}</span>
                <span>Max {formatMoneyPlain(geometry.max)}</span>
            </div>
            <div className="overflow-hidden rounded-lg border border-edge bg-raised p-2">
                <svg
                    viewBox={`0 0 ${geometry.width} ${geometry.height}`}
                    className="h-56 w-full"
                    role="img"
                    aria-label="Equity curve"
                >
                    <line
                        x1="12"
                        x2={geometry.width - 12}
                        y1={geometry.height / 2}
                        y2={geometry.height / 2}
                        stroke="#232b3a"
                        strokeDasharray="4 4"
                    />
                    <path
                        d={geometry.path}
                        fill="none"
                        stroke="#3d7eff"
                        strokeWidth="2"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                    />
                </svg>
            </div>
        </div>
    );
}
