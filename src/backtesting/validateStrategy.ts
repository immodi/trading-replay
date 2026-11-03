import {
    MAX_LOOKBACK_BARS,
    MAX_PARAMETERS,
    MAX_STRATEGY_BYTES,
    MAX_WARMUP_BARS,
} from "./constants";
import type {
    InstrumentContext,
    StrategyInstance,
    StrategyMetadata,
    StrategyModule,
    StrategyParameter,
} from "./types";

export class StrategyValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "StrategyValidationError";
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(
    value: unknown,
    label: string,
    maxLength: number,
): string {
    if (typeof value !== "string" || value.trim() === "") {
        throw new StrategyValidationError(`${label} must be a non-empty string.`);
    }

    const trimmed = value.trim();

    if (trimmed.length > maxLength) {
        throw new StrategyValidationError(
            `${label} must be at most ${maxLength} characters.`,
        );
    }

    return trimmed;
}

function optionalFiniteNumber(value: unknown, label: string): number | undefined {
    if (value === undefined) return undefined;

    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new StrategyValidationError(`${label} must be a finite number.`);
    }

    return value;
}

function normalizeParameter(raw: unknown, index: number): StrategyParameter {
    if (!isRecord(raw)) {
        throw new StrategyValidationError(`Parameter ${index + 1} must be an object.`);
    }

    const key = requireString(raw.key, `Parameter ${index + 1} key`, 64);

    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)) {
        throw new StrategyValidationError(
            `Parameter key "${key}" must be a safe JavaScript identifier.`,
        );
    }

    if (key === "__proto__" || key === "constructor" || key === "prototype") {
        throw new StrategyValidationError(
            `Parameter key "${key}" is reserved and cannot be used.`,
        );
    }

    const label =
        typeof raw.label === "string" && raw.label.trim() !== ""
            ? raw.label.trim().slice(0, 128)
            : key;

    if (raw.advanced !== undefined && typeof raw.advanced !== "boolean") {
        throw new StrategyValidationError(
            `Parameter "${key}" advanced must be a boolean when provided.`,
        );
    }

    const advanced = raw.advanced === true;

    if (raw.type === "number") {
        if (typeof raw.default !== "number" || !Number.isFinite(raw.default)) {
            throw new StrategyValidationError(
                `Parameter "${key}" default must be a finite number.`,
            );
        }

        const min = optionalFiniteNumber(raw.min, `Parameter "${key}" min`);
        const max = optionalFiniteNumber(raw.max, `Parameter "${key}" max`);
        const step = optionalFiniteNumber(raw.step, `Parameter "${key}" step`);

        if (min !== undefined && max !== undefined && min > max) {
            throw new StrategyValidationError(
                `Parameter "${key}" min cannot be greater than max.`,
            );
        }

        if (step !== undefined && step <= 0) {
            throw new StrategyValidationError(
                `Parameter "${key}" step must be greater than zero.`,
            );
        }

        if (
            (min !== undefined && raw.default < min) ||
            (max !== undefined && raw.default > max)
        ) {
            throw new StrategyValidationError(
                `Parameter "${key}" default is outside its min/max range.`,
            );
        }

        return {
            key,
            label,
            type: "number",
            default: raw.default,
            ...(min === undefined ? {} : { min }),
            ...(max === undefined ? {} : { max }),
            ...(step === undefined ? {} : { step }),
            ...(advanced ? { advanced: true } : {}),
        };
    }

    if (raw.type === "boolean") {
        if (typeof raw.default !== "boolean") {
            throw new StrategyValidationError(
                `Parameter "${key}" default must be a boolean.`,
            );
        }

        return {
            key,
            label,
            type: "boolean",
            default: raw.default,
            ...(advanced ? { advanced: true } : {}),
        };
    }

    if (raw.type === "string") {
        if (typeof raw.default !== "string") {
            throw new StrategyValidationError(
                `Parameter "${key}" default must be a string.`,
            );
        }

        return {
            key,
            label,
            type: "string",
            default: raw.default.slice(0, 10_000),
            ...(advanced ? { advanced: true } : {}),
        };
    }

    throw new StrategyValidationError(
        `Parameter "${key}" has unsupported type "${String(raw.type)}". Use number, boolean, or string.`,
    );
}

export function validateMetadata(raw: unknown): StrategyMetadata {
    if (!isRecord(raw)) {
        throw new StrategyValidationError("The module must export a metadata object.");
    }

    if (raw.apiVersion !== 1) {
        throw new StrategyValidationError("metadata.apiVersion must be 1.");
    }

    const id = requireString(raw.id, "metadata.id", 64);
    const name = requireString(raw.name, "metadata.name", 128);
    const version = requireString(raw.version, "metadata.version", 32);

    const description =
        raw.description === undefined
            ? undefined
            : requireString(raw.description, "metadata.description", 4_000);

    const rawParameters = raw.parameters ?? [];
    if (!Array.isArray(rawParameters)) {
        throw new StrategyValidationError("metadata.parameters must be an array.");
    }

    if (rawParameters.length > MAX_PARAMETERS) {
        throw new StrategyValidationError(
            `metadata.parameters may contain at most ${MAX_PARAMETERS} entries.`,
        );
    }

    const parameters = rawParameters.map(normalizeParameter);
    const keys = new Set<string>();

    for (const parameter of parameters) {
        if (keys.has(parameter.key)) {
            throw new StrategyValidationError(
                `Duplicate parameter key "${parameter.key}".`,
            );
        }
        keys.add(parameter.key);
    }

    const warmupBars = raw.warmupBars ?? 0;
    if (
        typeof warmupBars !== "number" ||
        !Number.isInteger(warmupBars) ||
        warmupBars < 0 ||
        warmupBars > MAX_WARMUP_BARS
    ) {
        throw new StrategyValidationError(
            `metadata.warmupBars must be an integer from 0 to ${MAX_WARMUP_BARS}.`,
        );
    }

    const maxLookbackBars = raw.maxLookbackBars ?? 500;
    if (
        typeof maxLookbackBars !== "number" ||
        !Number.isInteger(maxLookbackBars) ||
        maxLookbackBars < 1 ||
        maxLookbackBars > MAX_LOOKBACK_BARS
    ) {
        throw new StrategyValidationError(
            `metadata.maxLookbackBars must be an integer from 1 to ${MAX_LOOKBACK_BARS}.`,
        );
    }

    return {
        apiVersion: 1,
        id,
        name,
        version,
        ...(description === undefined ? {} : { description }),
        warmupBars,
        maxLookbackBars,
        parameters,
    };
}

export function defaultParameterValues(
    metadata: StrategyMetadata,
): Record<string, unknown> {
    return Object.fromEntries(
        metadata.parameters.map((parameter) => [parameter.key, parameter.default]),
    );
}

export function validateParameterValues(
    metadata: StrategyMetadata,
    values: Record<string, unknown>,
): Record<string, unknown> {
    const output: Record<string, unknown> = {};

    for (const parameter of metadata.parameters) {
        const value = values[parameter.key] ?? parameter.default;

        if (parameter.type === "number") {
            if (typeof value !== "number" || !Number.isFinite(value)) {
                throw new StrategyValidationError(
                    `Parameter "${parameter.key}" must be a finite number.`,
                );
            }

            if (parameter.min !== undefined && value < parameter.min) {
                throw new StrategyValidationError(
                    `Parameter "${parameter.key}" must be at least ${parameter.min}.`,
                );
            }

            if (parameter.max !== undefined && value > parameter.max) {
                throw new StrategyValidationError(
                    `Parameter "${parameter.key}" must be at most ${parameter.max}.`,
                );
            }

            output[parameter.key] = value;
            continue;
        }

        if (parameter.type === "boolean") {
            if (typeof value !== "boolean") {
                throw new StrategyValidationError(
                    `Parameter "${parameter.key}" must be a boolean.`,
                );
            }

            output[parameter.key] = value;
            continue;
        }

        if (typeof value !== "string") {
            throw new StrategyValidationError(
                `Parameter "${parameter.key}" must be a string.`,
            );
        }

        if (value.length > 10_000) {
            throw new StrategyValidationError(
                `Parameter "${parameter.key}" is too long.`,
            );
        }

        output[parameter.key] = value;
    }

    return output;
}

function moduleDataUrl(source: string): string {
    const bytes = new TextEncoder().encode(source);
    let binary = "";

    for (let index = 0; index < bytes.length; index += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }

    return `data:text/javascript;base64,${btoa(binary)}`;
}

/**
 * Load a single self-contained ES module from source text inside a worker.
 * Data URLs work in module workers across browsers; the app never resolves or
 * bundles imports for the strategy.
 */
export async function importStrategyModule(
    source: string,
): Promise<StrategyModule> {
    if (new TextEncoder().encode(source).byteLength > MAX_STRATEGY_BYTES) {
        throw new StrategyValidationError(
            `Strategy source exceeds the ${Math.floor(MAX_STRATEGY_BYTES / 1024)} KiB limit.`,
        );
    }

    const url = moduleDataUrl(source);

    try {
        const module = (await import(/* @vite-ignore */ url)) as unknown;

        if (!isRecord(module)) {
            throw new StrategyValidationError(
                "The uploaded file did not load as an ES module.",
            );
        }

        if (!("metadata" in module)) {
            throw new StrategyValidationError(
                "The module must export a `metadata` constant.",
            );
        }

        if (typeof module.createStrategy !== "function") {
            throw new StrategyValidationError(
                "The module must export a `createStrategy` function.",
            );
        }

        return {
            metadata: validateMetadata(module.metadata),
            createStrategy: module.createStrategy as StrategyModule["createStrategy"],
        };
    } catch (error) {
        if (error instanceof StrategyValidationError) throw error;

        throw new StrategyValidationError(
            error instanceof Error
                ? `Could not load strategy module: ${error.message}`
                : "Could not load strategy module.",
        );
    }
}

export function createStrategyInstance(
    module: StrategyModule,
    parameters: Record<string, unknown>,
    instrument: InstrumentContext,
): StrategyInstance {
    let instance: unknown;

    try {
        instance = module.createStrategy({
            params: Object.freeze({ ...parameters }),
            instrument: Object.freeze({ ...instrument }),
        });
    } catch (error) {
        throw new StrategyValidationError(
            error instanceof Error
                ? `createStrategy failed: ${error.message}`
                : "createStrategy failed.",
        );
    }

    if (!isRecord(instance) || typeof instance.onBar !== "function") {
        throw new StrategyValidationError(
            "createStrategy must return an object with an onBar function.",
        );
    }

    return instance as unknown as StrategyInstance;
}
