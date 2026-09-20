/**
 * core/automation/seumter-polling.ts
 * Seumter Civil Petition Supplement Notification Polling & Briefing Task
 * Periodically polls Seumter architectural permit application status and injects briefing into DeepSeek chat.
 */

import { runDeepSeekAutomation } from './runner';
import { getAutomationById, claimAutomationRun, finalizeAutomationRun } from './store';
import type { DeepSeekAutomationClient } from '../deepseek/automation-client-port';
import type { AutomationExecutionContext } from './execution';

export interface SeumterCivilPetitionTarget {
  applicationNo: string;      // 세움터 민원접수번호 (예: 2026-건축허가-0104)
  buildingTitle: string;      // 공사명/대지위치
  applicantName: string;      // 건축주/신청인 성명
  assignedOfficer?: string;   // 담당 공무원
}

export interface SeumterStatusSnapshot {
  applicationNo: string;
  statusCode: 'RECEIVED' | 'UNDER_REVIEW' | 'SUPPLEMENT_REQUESTED' | 'APPROVED' | 'REJECTED';
  statusLabel: string;        // 예: '보완통보', '검토중', '접수'
  supplementDetails?: {
    notificationDate: string; // 보완요구일자
    deadlineDate: string;     // 보완기한
    reason: string;           // 보완 요구 상세 사유
    requiredDocuments: string[]; // 보완 대상 도서/서류 목록
  };
  checkedAt: number;
  hash: string;               // 중복 브리핑 방지용 상태 해시
}

export interface SeumterPollingConfig {
  automationId: string;
  target: SeumterCivilPetitionTarget;
  lastKnownHash: string | null;
  nativeHostProvider: 'cdp' | 'shell_host';
}

export class SeumterPollingService {
  private static STORAGE_KEY = 'dspp_seumter_polling_registry';

  /**
   * CDP 또는 Shell Native Host를 통해 세움터 민원 상태를 조회하는 어댑터
   */
  public static async querySeumterStatus(
    target: SeumterCivilPetitionTarget
  ): Promise<SeumterStatusSnapshot> {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendNativeMessage) {
      // Mock / Dev Fallback
      return {
        applicationNo: target.applicationNo,
        statusCode: 'UNDER_REVIEW',
        statusLabel: '검토중',
        checkedAt: Date.now(),
        hash: `${target.applicationNo}_검토중_${Date.now()}`,
      };
    }

    const response = await chrome.runtime.sendNativeMessage('com.deepseek.pp.native_host', {
      action: 'QUERY_SEUMTER_APPLICATION',
      payload: { applicationNo: target.applicationNo },
    });

    if (!response || !response.ok) {
      throw new Error(`Failed to query Seumter status: ${response?.error ?? 'Unknown error'}`);
    }

    const data = response.data;
    const isSupplement = data.statusLabel?.includes('보완') ?? false;
    const hash = `${target.applicationNo}_${data.statusLabel}_${data.supplementDetails?.notificationDate ?? ''}`;

    return {
      applicationNo: target.applicationNo,
      statusCode: isSupplement ? 'SUPPLEMENT_REQUESTED' : 'UNDER_REVIEW',
      statusLabel: data.statusLabel,
      supplementDetails: isSupplement ? data.supplementDetails : undefined,
      checkedAt: Date.now(),
      hash,
    };
  }

  /**
   * 보완통보 감지 시 DeepSeek 주입용 브리핑 프롬프트 생성 (Prompt Freeze 계약 준수)
   */
  public static buildSupplementBriefingPrompt(
    target: SeumterCivilPetitionTarget,
    snapshot: SeumterStatusSnapshot
  ): string {
    const details = snapshot.supplementDetails;
    return [
      `[세움터 인허가 민원 보완통보 자동 알림]`,
      `• 민원접수번호: ${target.applicationNo}`,
      `• 공사명/대지위치: ${target.buildingTitle}`,
      `• 건축주/신청인: ${target.applicantName}`,
      `• 현재 진행상태: ${snapshot.statusLabel}`,
      details ? `• 보완통보일: ${details.notificationDate}` : '',
      details ? `• 보완완료기한: ${details.deadlineDate}` : '',
      details ? `• 보완요구내용:\n${details.reason}` : '',
      details && details.requiredDocuments && details.requiredDocuments.length > 0
        ? `• 제출 요구 도서: ${details.requiredDocuments.join(', ')}`
        : '',
      ``,
      `[요청 작업]`,
      `위 세움터 보완통보 사항을 건축법 및 관련 조례 기준에 따라 면밀히 분석하고,`,
      `1) 주요 보완 사유 및 쟁점 요약`,
      `2) 도면/서류 수정 방향 및 보완조서 작성 체크리스트`,
      `3) 기한 내 보완 처리를 위한 실행 계획을 상세히 브리핑해주세요.`,
    ].filter(Boolean).join('\n');
  }

  /**
   * 폴링 실행 주기마다 호출되어 보완통보를 검사하고 DeepSeek 세션에 브리핑을 실행하는 메인 핸들러
   */
  public static async executePollingCycle(
    config: SeumterPollingConfig,
    deepSeekClient: DeepSeekAutomationClient,
    execution?: AutomationExecutionContext
  ): Promise<{ statusChanged: boolean; briefed: boolean }> {
    const automation = await getAutomationById(config.automationId);
    if (!automation || automation.status !== 'active') {
      return { statusChanged: false, briefed: false };
    }

    const currentSnapshot = await this.querySeumterStatus(config.target);

    const isNewSupplement =
      currentSnapshot.statusCode === 'SUPPLEMENT_REQUESTED' &&
      currentSnapshot.hash !== config.lastKnownHash;

    if (!isNewSupplement) {
      return { statusChanged: false, briefed: false };
    }

    const briefingPrompt = this.buildSupplementBriefingPrompt(config.target, currentSnapshot);

    const runId = `seumter_poll_${Date.now()}`;
    const claim = await claimAutomationRun({
      runId,
      automationId: automation.id,
      trigger: 'schedule',
      scheduledFor: Date.now(),
      startedAt: Date.now(),
      createRequest: (auto) => ({
        runId,
        automationId: auto.id,
        deadlineAt: Date.now() + 180_000,
        prompt: briefingPrompt,
        trigger: 'schedule',
        chatSessionId: auto.deepseek.chatSessionId,
        parentMessageId: auto.deepseek.parentMessageId,
        promptOptions: auto.promptOptions,
        requestedAt: Date.now(),
      }),
    });

    if (claim.kind !== 'claimed') {
      return { statusChanged: true, briefed: false };
    }

    const result = await runDeepSeekAutomation(claim.run.request!, {
      deepSeekClient,
      execution,
    });

    await finalizeAutomationRun({
      runId,
      automationId: automation.id,
      status: result.ok ? 'succeeded' : 'failed',
      result,
      runtimePatch: (auto) => ({
        lastRunAt: Date.now(),
        lastError: result.ok ? null : result.error,
        deepseek: result.ok
          ? {
              chatSessionId: result.chatSessionId,
              parentMessageId: result.parentMessageId,
              sessionUrl: result.sessionUrl,
              lastHistorySyncedAt: Date.now(),
            }
          : auto.deepseek,
      }),
    });

    config.lastKnownHash = currentSnapshot.hash;
    await this.updateConfig(config);

    return { statusChanged: true, briefed: result.ok };
  }

  private static async updateConfig(config: SeumterPollingConfig): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const data = await chrome.storage.local.get(this.STORAGE_KEY);
      const registry: Record<string, SeumterPollingConfig> = data[this.STORAGE_KEY] ?? {};
      registry[config.automationId] = config;
      await chrome.storage.local.set({ [this.STORAGE_KEY]: registry });
    }
  }
}
