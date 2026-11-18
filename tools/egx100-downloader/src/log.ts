export function log(message = ""): void {
    process.stdout.write(`${message}\n`);
}

export function warn(message: string): void {
    process.stderr.write(`warning: ${message}\n`);
}

export function error(message: string): void {
    process.stderr.write(`error: ${message}\n`);
}

export function formatDateForFileName(date: Date): string {
    return date.toISOString().slice(0, 10);
}

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function retryLabel(attempt: number, total: number): string {
    return total > 1 ? ` (attempt ${attempt + 1}/${total})` : "";
}
