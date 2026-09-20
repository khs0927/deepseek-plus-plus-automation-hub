import {
  definePayloadlessRuntimeCommandHandler,
  type RuntimeCommandHandler,
} from '../../core/messaging/runtime-command-registry';
import { diagnosticLogBuffer } from '../../core/diagnostics/log-buffer';
import { summarizeDecisionTraces } from '../../core/decision/metrics';
import { getDecisionRuntimeConfig } from '../../core/decision/provider';
import { decisionTraceBuffer } from '../../core/decision/trace';

export interface DiagnosticsRuntimeHandlerDependencies {
  getVersion(): string;
}

export function createDiagnosticsRuntimeHandlers(
  dependencies: DiagnosticsRuntimeHandlerDependencies,
): readonly RuntimeCommandHandler[] {
  return Object.freeze([
    definePayloadlessRuntimeCommandHandler('EXPORT_DIAGNOSTIC_LOGS', () => {
      const decisionConfig = getDecisionRuntimeConfig();
      const decisionTraces = decisionTraceBuffer.list();
      return {
        exportedAt: new Date().toISOString(),
        extensionVersion: dependencies.getVersion(),
        entries: diagnosticLogBuffer.snapshot(),
        decision: {
          runtime: {
            mode: decisionConfig.mode,
            provider: decisionConfig.provider?.id ?? null,
            timeoutMs: decisionConfig.timeoutMs,
          },
          metrics: summarizeDecisionTraces(decisionTraces),
          traceCount: decisionTraces.length,
        },
      };
    }),
  ]);
}
