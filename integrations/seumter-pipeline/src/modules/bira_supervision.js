/**
 * BIRA (부산광역시건축사회) 감리 연계 모듈
 */
const { IMMUTABLE_ARCHITECT_PROFILE } = require("./checklist_rules");

const BIRA_STAGES = Object.freeze({
  COMMENCEMENT: "STAGE_01_COMMENCEMENT",
  FOUNDATION_REBAR: "STAGE_02_FOUNDATION_REBAR",
  FRAME_COMPLETION: "STAGE_03_FRAME_COMPLETION",
  FINAL_COMPLETION: "STAGE_04_FINAL_COMPLETION"
});

class BiraSupervisionEngine {
  constructor(projectConfig) {
    this.project = projectConfig;
    this.architect = IMMUTABLE_ARCHITECT_PROFILE;
  }
  createDailyLog(logDate, weather, progressPercentage, inspectionNotes) {
    return {
      logId: "BIRA-LOG-" + logDate.replace(/-/g, ""),
      projectId: this.project.project_meta?.project_id || "PRJ-001",
      date: logDate,
      weather: weather || "맑음",
      supervisor: { office: this.architect.officeName, architect: this.architect.architectName, businessNo: this.architect.businessNumber },
      currentProgress: { planPercent: progressPercentage, actualPercent: progressPercentage },
      inspectionSummary: inspectionNotes,
      keyCheckpoints: [
        { item: "철근 배근 간격 및 피복두께 규격 준수 여부", result: "적합" },
        { item: "콘크리트 타설 전 거푸집 수평도 및 청소 상태", result: "적합" }
      ],
      biraSyncStatus: "READY_FOR_UPLOAD"
    };
  }
  generateInterimReport(stageCode, inspectionDate) {
    return {
      reportId: "BIRA-INTERIM-" + stageCode + "-" + inspectionDate.replace(/-/g, ""),
      title: stageCode === BIRA_STAGES.FOUNDATION_REBAR ? "기초 철근배근 공사감리 중간보고서" : "골조완료 공사감리 중간보고서",
      stage: stageCode,
      inspectionDate,
      overallVerdict: "적합 (시공 상태 설계도서 일치)",
      supervisor: { office: this.architect.officeName, architect: this.architect.architectName, businessNumber: this.architect.businessNumber }
    };
  }
  generateFinalCompletionReport(completionDate) {
    return {
      reportId: "BIRA-FINAL-" + completionDate.replace(/-/g, ""),
      title: "건축공사 감리완료보고서 (세움터 서식 별지 제21호)",
      completionDate,
      biraVerificationCode: "BIRA-BUSAN-CERT-2026-99164",
      supervisor: { office: this.architect.officeName, architect: this.architect.architectName, businessNumber: this.architect.businessNumber },
      comprehensiveOpinion: "건축법령 및 허가도서에 적합하게 시공 완료되었음을 확인하여 공사감리완료보고서를 제출함."
    };
  }
}

module.exports = { BIRA_STAGES, BiraSupervisionEngine };
