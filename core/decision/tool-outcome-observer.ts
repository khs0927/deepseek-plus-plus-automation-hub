import type { RuntimeToolOutcomeObserver } from '../tool/runtime';
import { judgeToolOutcome } from './result-judge';

export const decisionToolOutcomeObserver: RuntimeToolOutcomeObserver = {
  async observe({ call, descriptor, result, signal }) {
    await judgeToolOutcome({
      call,
      descriptor,
      result,
      signal,
    });
  },
};
