#!/usr/bin/env node
/**
 * khs0927 / deepseek-plus-plus-automation-hub
 * Unified CLI Runner for Architectural Permit Pipeline
 */

const path = require("path");
const fs = require("fs");
const { SeumterCdpController } = require("../automation/seumter_cdp_controller");
const { KoreanBuildingChecklistOrchestrator } = require("../modules/checklist_rules");
const { BiraSupervisionEngine, BIRA_STAGES } = require("../modules/bira_supervision");

async function main() {
  console.log("=========================================================================");
  console.log("🚀 khs0927 DeepSeek++ 세움터 자동화 허브 통합 실행 CLI");
  console.log("=========================================================================");

  const templatePath = path.join(__dirname, "../pipeline/project_template.json");
  const project = JSON.parse(fs.readFileSync(templatePath, "utf-8"));
  console.log("프로젝트: " + project.project_meta.project_title);

  const orch = new KoreanBuildingChecklistOrchestrator();
  const checklist = await orch.processChecklist({
    useType: project.building_overview.main_usage,
    grossFloorArea: project.building_overview.gross_floor_area_sqm,
    buildingArea: project.building_overview.building_area_sqm,
    siteArea: project.site_overview.site_area_sqm,
    grossFloorAreaForFAR: project.building_overview.far_floor_area_sqm,
    floorsAbove: project.building_overview.floors_above,
    floorsBelow: project.building_overview.floors_below,
    height: project.building_overview.max_height_m,
    zoneType: project.site_overview.zoning_primary,
    structureType: project.building_overview.main_structure,
    parkingRequired: 4,
    parkingPlanned: 4
  });

  const cdp = new SeumterCdpController({ dryRun: true });
  const cdpResult = await cdp.runFullAutomation(project, checklist);
  console.log("세움터 빨간색 오류 수: " + cdpResult.validation.redHighlightCount);
  console.log("=========================================================================");
}

main().catch(err => { console.error(err); process.exit(1); });
