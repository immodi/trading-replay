import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const INPUT = path.join(ROOT, "data", "glbx-mdp3-20210710-20260709.ohlcv-1m.csv");
const OUTPUT = path.join(ROOT, "public", "mnq-1m.json");

const csv = fs.readFileSync(INPUT, "utf8");
const lines = csv.split("\n");

const candles = [];

for (let i = 1; i < lines.length;) {
    const line = lines[i].trim();
    if (!line) { i++; continue; }

    const first = line.split(",");
    const timestamp = first[0];
    let best = first;
    let j = i + 1;

    while (j < lines.length) {
        const next = lines[j].trim();
        if (!next) { j++; continue; }

        const cols = next.split(",");
        if (cols[0] !== timestamp) break;

        if (Number(cols[8]) > Number(best[8])) best = cols;
        j++;
    }

    candles.push({
        time: Math.floor(new Date(best[0]).getTime() / 1000),
        open: Number(best[4]),
        high: Number(best[5]),
        low: Number(best[6]),
        close: Number(best[7]),
        volume: Number(best[8]),
    });

    i = j;
}

fs.writeFileSync(OUTPUT, JSON.stringify(candles));
console.log(`Saved ${candles.length} candles to ${OUTPUT}`);
