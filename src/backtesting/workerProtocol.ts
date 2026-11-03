import type {
    BacktestResult,
    BacktestRunConfig,
    DataQualityReport,
    InstrumentContext,
    StrategyMetadata,
} from "./types";

export type BacktestWorkerRequest =
    | {
          type: "validate";
          source: string;
          instrument: InstrumentContext;
          parameterValues: Record<string, unknown>;
      }
    | {
          type: "run";
          source: string;
          config: BacktestRunConfig;
          bars: ArrayBuffer;
          dropFirstAggregate: boolean;
          dataQuality: DataQualityReport;
      };

export type BacktestWorkerResponse =
    | {
          type: "validation-success";
          metadata: StrategyMetadata;
          parameterValues: Record<string, unknown>;
      }
    | {
          type: "progress";
          processed: number;
          total: number;
      }
    | {
          type: "completed";
          result: BacktestResult;
      }
    | {
          type: "failed";
          error: string;
          barIndex?: number;
          barTime?: number;
      }
    | {
          type: "cancelled";
      };
