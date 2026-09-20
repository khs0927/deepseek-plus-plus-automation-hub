/**
 * core/inline-agent/hitl.ts
 * DeepSeek++ Inline Agent Human-in-the-Loop (HITL) State Machine & Session Recovery
 * Supports Seumter architectural permit inspection report electronic signature pause/resume loop.
 * Complies with Manifest V3 Service Worker lifecycle and prompt freeze requirements.
 */

export type WorkflowStepId =
  | 'STEP_1_BASIC_INFO'
  | 'STEP_2_BUILDING_OVERVIEW'
  | 'STEP_3_INSPECTION_REPORT'
  | 'STEP_4_CHECKLIST'
  | 'STEP_5_FINAL_SUBMISSION';

export type HITLStatus =
  | 'IDLE'
  | 'RUNNING'
  | 'AWAITING_HUMAN_ACTION'
  | 'RESUMING'
  | 'COMPLETED'
  | 'ABORTED'
  | 'ERROR';

export interface HITLReason {
  type: 'DIGITAL_SIGNATURE_REQUIRED' | 'CAPTCHA' | 'MANUAL_VERIFICATION';
  title: string;
  description: string;
  targetSystem: 'SEUMTER' | 'NATIVE_HOST' | 'GENERIC_WEB';
  requiredArtifacts?: string[];
}

export interface HITLSessionSnapshot {
  sessionId: string;
  chatSessionId: string;
  parentMessageId: string;
  currentStep: WorkflowStepId;
  nextStep: WorkflowStepId;
  status: HITLStatus;
  hitlReason?: HITLReason;
  stepPayloads: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export type HITLEvent =
  | { type: 'START_WORKFLOW'; sessionId: string; chatSessionId: string; parentMessageId: string }
  | { type: 'ADVANCE_STEP'; nextStep: WorkflowStepId; payload?: Record<string, unknown> }
  | { type: 'TRIGGER_PAUSE'; reason: HITLReason; currentStep: WorkflowStepId; nextStep: WorkflowStepId; stepPayload?: Record<string, unknown> }
  | { type: 'REQUEST_RESUME'; userVerificationToken?: string }
  | { type: 'CONFIRM_RESUME' }
  | { type: 'ABORT'; reason: string }
  | { type: 'FAIL'; error: string };

const STORAGE_KEY_PREFIX = 'dspp_hitl_session_';

export class HITLStateMachine {
  private snapshot: HITLSessionSnapshot;
  private onStateChangeListeners: Array<(snapshot: HITLSessionSnapshot) => void> = [];

  constructor(initialSnapshot?: HITLSessionSnapshot) {
    this.snapshot = initialSnapshot || {
      sessionId: `hitl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      chatSessionId: '',
      parentMessageId: '',
      currentStep: 'STEP_1_BASIC_INFO',
      nextStep: 'STEP_2_BUILDING_OVERVIEW',
      status: 'IDLE',
      stepPayloads: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  public getSnapshot(): Readonly<HITLSessionSnapshot> {
    return { ...this.snapshot };
  }

  public subscribe(listener: (snapshot: HITLSessionSnapshot) => void): () => void {
    this.onStateChangeListeners.push(listener);
    return () => {
      this.onStateChangeListeners = this.onStateChangeListeners.filter(l => l !== listener);
    };
  }

  /**
   * Pure state transition handler
   */
  public async transition(event: HITLEvent): Promise<HITLSessionSnapshot> {
    const prevStatus = this.snapshot.status;
    let nextStatus = prevStatus;

    switch (event.type) {
      case 'START_WORKFLOW':
        this.snapshot.sessionId = event.sessionId;
        this.snapshot.chatSessionId = event.chatSessionId;
        this.snapshot.parentMessageId = event.parentMessageId;
        this.snapshot.currentStep = 'STEP_1_BASIC_INFO';
        this.snapshot.nextStep = 'STEP_2_BUILDING_OVERVIEW';
        nextStatus = 'RUNNING';
        break;

      case 'ADVANCE_STEP':
        if (prevStatus !== 'RUNNING' && prevStatus !== 'RESUMING') {
          throw new Error(`Cannot advance step from status ${prevStatus}`);
        }
        if (event.payload) {
          this.snapshot.stepPayloads[this.snapshot.currentStep] = event.payload;
        }
        this.snapshot.currentStep = event.nextStep;
        nextStatus = 'RUNNING';
        break;

      case 'TRIGGER_PAUSE':
        if (event.stepPayload) {
          this.snapshot.stepPayloads[event.currentStep] = event.stepPayload;
        }
        this.snapshot.currentStep = event.currentStep;
        this.snapshot.nextStep = event.nextStep;
        this.snapshot.hitlReason = event.reason;
        nextStatus = 'AWAITING_HUMAN_ACTION';
        break;

      case 'REQUEST_RESUME':
        if (prevStatus !== 'AWAITING_HUMAN_ACTION') {
          throw new Error(`Cannot request resume when not awaiting human action (current: ${prevStatus})`);
        }
        nextStatus = 'RESUMING';
        break;

      case 'CONFIRM_RESUME':
        if (prevStatus !== 'RESUMING') {
          throw new Error(`Cannot confirm resume unless in RESUMING state`);
        }
        this.snapshot.currentStep = this.snapshot.nextStep;
        this.snapshot.hitlReason = undefined;
        nextStatus = 'RUNNING';
        break;

      case 'ABORT':
        nextStatus = 'ABORTED';
        break;

      case 'FAIL':
        nextStatus = 'ERROR';
        break;
    }

    this.snapshot.status = nextStatus;
    this.snapshot.updatedAt = Date.now();

    await this.persist();
    this.notify();

    return this.getSnapshot();
  }

  /**
   * Convenience trigger: Step 3 (Inspection Report) completion waiting for Seumter certificate signature
   */
  public async pauseForCertificateSignature(
    inspectionReportPayload: Record<string, unknown>
  ): Promise<HITLSessionSnapshot> {
    return this.transition({
      type: 'TRIGGER_PAUSE',
      currentStep: 'STEP_3_INSPECTION_REPORT',
      nextStep: 'STEP_4_CHECKLIST',
      reason: {
        type: 'DIGITAL_SIGNATURE_REQUIRED',
        title: '공인인증서 전자서명 대기 중',
        description: '세움터 조사및검사조서 제출을 위해 공동/금융인증서 전자서명을 완료해주세요.',
        targetSystem: 'SEUMTER',
        requiredArtifacts: ['INSPECTION_REPORT_FORM'],
      },
      stepPayload: inspectionReportPayload,
    });
  }

  /**
   * Resumes workflow after signature is completed, advancing to Step 4 (Checklist)
   */
  public async resumeToChecklist(): Promise<{
    snapshot: HITLSessionSnapshot;
    continuationPrompt: string;
  }> {
    await this.transition({ type: 'REQUEST_RESUME' });
    const resumed = await this.transition({ type: 'CONFIRM_RESUME' });

    // Format continuation message conforming to standard <tool_results> prompt freeze rules
    const continuationPrompt = `[SYSTEM: HITL_RESUMED]\n사용자가 세움터 공인인증서 전자서명을 정상적으로 완료했습니다. 즉시 4단계(체크리스트 작성 및 검토) 단계로 진입하여 작업을 계속 진행하세요.\n세션 데이터: ${JSON.stringify(resumed.stepPayloads['STEP_3_INSPECTION_REPORT'] || {})}`;

    return {
      snapshot: resumed,
      continuationPrompt,
    };
  }

  /**
   * Persist state to browser storage (MV3 compliant)
   */
  public async persist(): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const key = `${STORAGE_KEY_PREFIX}${this.snapshot.sessionId}`;
      await chrome.storage.local.set({ [key]: this.snapshot });
    }
  }

  /**
   * Restore state from browser storage
   */
  public static async restore(sessionId: string): Promise<HITLStateMachine | null> {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const key = `${STORAGE_KEY_PREFIX}${sessionId}`;
      const result = await chrome.storage.local.get(key);
      if (!result[key]) return null;
      return new HITLStateMachine(result[key] as HITLSessionSnapshot);
    }
    return null;
  }

  private notify(): void {
    const current = this.getSnapshot();
    for (const listener of this.onStateChangeListeners) {
      try {
        listener(current);
      } catch (err) {
        console.error('[HITLStateMachine] listener error:', err);
      }
    }
  }
}
