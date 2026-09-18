const { runFullPipeline } = require('./modules/pipeline');
const { runAllChecklists } = require('./modules/checklist_all');
const { runBuildingChecklist } = require('./modules/checklist_building');
const { runLocationChecklist } = require('./modules/checklist_location');
const { handlePermitInspectionSign } = require('./modules/permit_inspection');

module.exports = {
  runFullPipeline,
  runAllChecklists,
  runBuildingChecklist,
  runLocationChecklist,
  handlePermitInspectionSign
};

console.log('Seumter Full Automation Suite Ready.');
