import { aggregatePackedBars } from "./aggregateBars";
import { PACKED_BAR_STRIDE } from "./range";
import { BacktestError, runBacktest } from "./runBacktest";
import type { DataQualityIssue } from "./types";
import {
    createStrategyInstance,
    importStrategyModule,
    StrategyValidationError,
    validateParameterValues,
} from "./validateStrategy";
import type {
    BacktestWorkerRequest,
    BacktestWorkerResponse,
} from "./workerProtocol";

const scope = self as unknown as {
    onmessage:
        | ((event: MessageEvent<BacktestWorkerRequest>) => void)
        | null;
    postMessage: (
        message: BacktestWorkerResponse,
        transfer?: Transferable[],
    ) => void;
};

function fail(error: unknown): void {
    if (error instanceof BacktestError) {
        scope.postMessage({
            type: "failed",
            error: error.message,
            ...(error.barIndex === undefined ? {} : { barIndex: error.barIndex }),
            ...(error.barTime === undefined ? {} : { barTime: error.barTime }),
        });
        return;
    }

    scope.postMessage({
        type: "failed",
        error:
            error instanceof StrategyValidationError || error instanceof Error
                ? error.message
                : String(error),
    });
}

async function handle(request: BacktestWorkerRequest): Promise<void> {
    try {
        const module = await importStrategyModule(request.source);

        if (request.type === "validate") {
            const parameterValues = validateParameterValues(
                module.metadata,
                request.parameterValues,
            );

            createStrategyInstance(
                module,
                parameterValues,
                request.instrument,
            );

            scope.postMessage({
                type: "validation-success",
                metadata: module.metadata,
                parameterValues,
            });
            return;
        }

        const parameterValues = validateParameterValues(
            module.metadata,
            request.config.parameters,
        );
        const config = {
            ...request.config,
            maxLookbackBars: module.metadata.maxLookbackBars,
            parameters: parameterValues,
        };

        const strategy = createStrategyInstance(
            module,
            parameterValues,
            config.instrument,
        );

        const packed = new Float64Array(request.bars);
        const aggregated = aggregatePackedBars(
            packed,
            config.timeframeMinutes,
            request.dropFirstAggregate,
        );

        if (aggregated.bars.length === 0) {
            throw new BacktestError("No bars remain after timeframe aggregation.");
        }

        const result = runBacktest({
            bars: aggregated.bars,
            config,
            strategy,
            onProgress: (processed, total) => {
                scope.postMessage({ type: "progress", processed, total });
            },
        });

        const additionalWarnings: DataQualityIssue[] =
            aggregated.partialBucketCount > 0 &&
            !request.dataQuality.warnings.some(
                (issue) => issue.type === "partial_aggregate",
            )
                ? [
                      {
                          type: "partial_aggregate",
                          message:
                              "Higher-timeframe buckets with missing base bars were processed as partial aggregates.",
                          count: aggregated.partialBucketCount,
                          ...(aggregated.partialBucketTimes[0] === undefined
                              ? {}
                              : {
                                    time: aggregated.partialBucketTimes[0],
                                    timeISO: new Date(
                                        aggregated.partialBucketTimes[0] * 1000,
                                    ).toISOString(),
                                }),
                      },
                  ]
                : [];

        result.dataQuality = {
            ...request.dataQuality,
            baseBarsProcessed: packed.length / PACKED_BAR_STRIDE,
            strategyBarsProcessed: result.dataQuality.strategyBarsProcessed,
            inRangeStrategyBars: result.dataQuality.inRangeStrategyBars,
            warnings: [...request.dataQuality.warnings, ...additionalWarnings],
        };

        scope.postMessage({ type: "completed", result });
    } catch (error) {
        fail(error);
    }
}

scope.onmessage = (event) => {
    void handle(event.data);
};
