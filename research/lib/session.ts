/** US Eastern session helpers shared by the research scripts. */

export function etOffsetMinutes(ts: number): number {
    const d = new Date(ts * 1000);
    const y = d.getUTCFullYear();
    const marchFirst = Date.UTC(y, 2, 1) / 1000;
    const marchDow = new Date(marchFirst * 1000).getUTCDay();
    const secondSunMarch = marchFirst + ((7 - marchDow) % 7 + 7) * 86400;
    const novFirst = Date.UTC(y, 10, 1) / 1000;
    const novDow = new Date(novFirst * 1000).getUTCDay();
    const firstSunNov = novFirst + ((7 - novDow) % 7) * 86400;
    return ts >= secondSunMarch && ts < firstSunNov ? -240 : -300;
}

export interface EtParts {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    dow: number;
    minutes: number;
    date: string;
}

export function etParts(ts: number): EtParts {
    const local = new Date((ts + etOffsetMinutes(ts) * 60) * 1000);
    const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
    return {
        year: local.getUTCFullYear(),
        month: local.getUTCMonth() + 1,
        day: local.getUTCDate(),
        hour: local.getUTCHours(),
        minute: local.getUTCMinutes(),
        dow: local.getUTCDay(),
        minutes,
        date: `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-${String(local.getUTCDate()).padStart(2, "0")}`,
    };
}

export function isRth(ts: number): boolean {
    const p = etParts(ts);
    return p.dow >= 1 && p.dow <= 5 && p.minutes >= 570 && p.minutes < 960;
}
