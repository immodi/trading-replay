export function formatMoney(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) {
        return "—";
    }

    const sign = value > 0 ? "+" : value < 0 ? "-" : "";
    return `${sign}$${Math.abs(value).toFixed(2)}`;
}

export function formatMoneyPlain(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) {
        return "—";
    }

    const sign = value < 0 ? "-" : "";
    return `${sign}$${Math.abs(value).toFixed(2)}`;
}

export function formatNumber(
    value: number | null | undefined,
    digits = 2,
): string {
    if (value === null || value === undefined || !Number.isFinite(value)) {
        return "—";
    }

    return value.toFixed(digits);
}

export function formatPct(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) {
        return "—";
    }

    return `${value.toFixed(2)}%`;
}

export function formatDateTime(seconds: number | null | undefined): string {
    if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
        return "—";
    }

    return new Date(seconds * 1000).toLocaleString(undefined, {
        timeZone: "UTC",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KiB`;
}
