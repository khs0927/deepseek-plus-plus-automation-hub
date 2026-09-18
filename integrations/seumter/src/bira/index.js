const { fillStep1Overview } = require('./modules/step1_overview');
const { fillStep2Floors } = require('./modules/step2_floors');
const { uploadStep3Drawings } = require('./modules/step3_drawings');
const { fillStep4Checklist } = require('./modules/step4_checklist');
const { runBiraPipeline } = require('./modules/pipeline_all');

module.exports = {
  fillStep1Overview,
  fillStep2Floors,
  uploadStep3Drawings,
  fillStep4Checklist,
  runBiraPipeline
};
