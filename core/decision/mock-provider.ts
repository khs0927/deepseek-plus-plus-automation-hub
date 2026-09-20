import type {
  DecisionRequest,
  DecisionResult,
} from './contract';
import type { DecisionProvider } from './provider';

export type MockDecisionHandler = (
  request: DecisionRequest,
) => DecisionResult | Promise<DecisionResult>;

export class MockDecisionProvider implements DecisionProvider {
  readonly id = 'mock';

  constructor(private readonly handler: MockDecisionHandler) {}

  async evaluate(
    request: DecisionRequest,
    _signal?: AbortSignal,
  ): Promise<DecisionResult> {
    return this.handler(request);
  }
}
