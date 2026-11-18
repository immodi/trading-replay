import {
    assetClassDefinition,
    normaliseAssetClass,
    normaliseBaseTimeframe,
    normaliseCurrency,
} from "@/constants/assetClass";
import type { CandleSourceConfig } from "@/types/candleSource";

export type CandleSourceConfigInput = Partial<CandleSourceConfig>;

/**
 * Fill in the fields introduced with stock/daily support so datasets saved by
 * older versions keep working as futures, 1-minute sources.
 */
export function withSourceDefaults(
    config: CandleSourceConfigInput,
): CandleSourceConfig {
    const assetClass = normaliseAssetClass(config.assetClass);
    const definition = assetClassDefinition(assetClass);

    const pointValue =
        assetClass === "stock"
            ? 1
            : typeof config.pointValue === "number" &&
                Number.isFinite(config.pointValue) &&
                config.pointValue > 0
              ? config.pointValue
              : definition.defaultPointValue;

    const commission =
        typeof config.commission === "number" &&
        Number.isFinite(config.commission) &&
        config.commission >= 0
            ? config.commission
            : 0;

    const commissionPercent =
        typeof config.commissionPercent === "number" &&
        Number.isFinite(config.commissionPercent) &&
        config.commissionPercent >= 0
            ? config.commissionPercent
            : 0;

    return {
        id: config.id ?? "",
        symbol: config.symbol ?? "",
        assetClass,
        currency: normaliseCurrency(config.currency),
        pointValue,
        commission,
        commissionPercent,
        baseTimeframeMinutes: normaliseBaseTimeframe(
            config.baseTimeframeMinutes,
            assetClass,
        ),
        fileName: config.fileName ?? "",
    };
}
