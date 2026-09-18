const fs = require('fs');
const path = require('path');

const TARGET_DIR = 'G:\\내 드라이브\\##작업중\\##학장동 카페\\허가\\도면\\구조';

const STRUCTURAL_TASKS = [
  {
    folderName: 'S11(기초위치도)',
    nodeId: 'BDS11_anchor',
    files: ['기초구조평면도.dwg']
  },
  {
    folderName: 'S21(평면도)',
    nodeId: 'BDS21_anchor',
    files: [
      '지상1층구조평면도.dwg',
      '지상2층구조평면도-1(1STS.L+4,000).dwg',
      '지상2층구조평면도-2(1STS.L+5,200).dwg',
      '지붕층구조평면도-1(1STS.L+7,400).dwg',
      '지붕층구조평면도-2(1STS.L+10,530).dwg'
    ]
  },
  {
    folderName: 'S32(기둥일람표)',
    nodeId: 'BDS32_anchor',
    files: ['기둥일람표.dwg']
  },
  {
    folderName: 'S33(콘크리트벽일람표)',
    nodeId: 'BDS33_anchor',
    files: [
      '벽체일람표.dwg',
      '지하외벽일람표.dwg'
    ]
  },
  {
    folderName: 'S34(보일람표)',
    nodeId: 'BDS34_anchor',
    files: [
      '보일람표-1.dwg',
      '보일람표-2.dwg'
    ]
  },
  {
    folderName: 'S35(슬래브일람표)',
    nodeId: 'BDS35_anchor',
    files: ['슬래브일람표계단일람표.dwg']
  },
  {
    folderName: 'S40(RC구조상세도)',
    nodeId: 'BDS40_anchor',
    files: ['계단상세도.dwg']
  },
  {
    folderName: 'S50(철골일람표)',
    nodeId: 'BDS50_anchor',
    files: ['임베디드플레이트일람표.dwg']
  },
  {
    folderName: 'S51(철골기둥일람표)',
    nodeId: 'BDS51_anchor',
    files: ['합성기둥일람표.dwg']
  },
  {
    folderName: 'S52(베이스플레이트일람표)',
    nodeId: 'BDS52_anchor',
    files: [
      '베이스플레이트일람표-1.dwg',
      '베이스플레이트일람표-2.dwg',
      '베이스플레이트일람표-3.dwg',
      '베이스플레이트일람표-4.dwg'
    ]
  },
  {
    folderName: 'S55(보접합상세도)',
    nodeId: 'BDS55_anchor',
    files: ['철골보+철근콘크리트보·벽체접합부디테일.dwg']
  },
  {
    folderName: 'S56(기타접합상세도)',
    nodeId: 'BDS56_anchor',
    files: [
      'STEELBOLTCONNECTIONLIST-1.dwg',
      'STEELBOLTCONNECTIONLIST-2.dwg',
      'STEELBOLTCONNECTIONLIST-3.dwg'
    ]
  },
  {
    folderName: 'S91(데크플레이트상세도)',
    nodeId: 'BDS91_anchor',
    files: [
      'N.TDECKS조단면공통도-1.dwg',
      'N.TDECKS조단면공통도-2.dwg',
      'N.TDECKS조단면공통도-3.dwg',
      '철선일체형DECKPLATE단면도-1.dwg',
      '철선일체형DECKPLATE단면도-2.dwg'
    ]
  }
];

console.log('=== Checking File Existence ===');
let allExist = true;
let totalCount = 0;

for (const task of STRUCTURAL_TASKS) {
  console.log(`\nFolder: ${task.folderName} (Node: ${task.nodeId})`);
  for (const f of task.files) {
    const fullPath = path.join(TARGET_DIR, f);
    const exists = fs.existsSync(fullPath);
    console.log(`  - [${exists ? 'OK' : 'MISSING'}] ${f}`);
    if (!exists) allExist = false;
    totalCount++;
  }
}

console.log(`\nTotal Files Checked: ${totalCount}`);
console.log(`All Files Exist: ${allExist}`);

module.exports = { STRUCTURAL_TASKS, TARGET_DIR };
