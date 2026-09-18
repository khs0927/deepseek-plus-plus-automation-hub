# 세움터(EAIS) 건축행정 자동화 통합 솔루션

국토교통부 건축행정시스템 **세움터(EAIS)**의 인허가(건축·대수선·용도변경 등) 신청서 작성 및 한국건축규정 검토를 100% 자동화하는 엔지니어링 패키지입니다.

---

## 1. 프로젝트 디렉토리 구조

```
C:\code\seumter/
├── package.json                   # 의존성 및 CLI 실행 스크립트
├── README.md                      # 프로젝트 실행 매뉴얼
├── MEMORY.md                      # 세움터(EAIS) 자동화 룰, UI 조작 원칙, 법령 판정 기준 (영구 기억)
├── BIRA_MEMORY.md                 # 부산광역시건축사회(BIRA) 도서검토 자동화 매뉴얼 및 영구 기억
└── src/
    ├── index.js                   # 세움터 통합 진입점
    ├── config/                    # 세움터 설정
    ├── modules/                   # 세움터 자동화 모듈
    └── bira/                      # [신규] 부산광역시건축사회(BIRA) 도서검토 전용 패키지
        ├── index.js               # BIRA 통합 진입점
        ├── config/                # BIRA 설정 (constants, jurye_project.json 등)
        └── modules/               # BIRA 1~4단계 자동화 모듈 (step1~step4, pipeline)
```

---

## 2. 핵심 실행 명령어 (NPM Scripts)

### A. 부산광역시건축사회 (BIRA) 도서검토 자동화
```bash
# 1. BIRA 1단계 (기본정보 및 건축개요 입력)
npm run bira:step1

# 2. BIRA 2단계 (층별 개요 입력)
npm run bira:step2

# 3. BIRA 3단계 (도면 및 서류 파일 업로드)
npm run bira:step3

# 4. BIRA 4단계 (체크리스트 작성)
npm run bira:step4

# 5. BIRA 1~4단계 전체 원클릭 파이프라인
npm run bira:all
```

### B. 세움터 (EAIS) 건축행정시스템 자동화
```bash
# 1. 세움터 인허가 신청서 전체 원클릭 자동 완성
npm run pipeline:all

# 2. 한국건축규정 체크리스트 (154개 전수) 단독 실행
npm run checklist:all
```

---

## 3. 시스템별 영구 기억 가이드
* **세움터(EAIS)** 표준 매뉴얼: [`MEMORY.md`](file:///c:/code/seumter/MEMORY.md)
* **부산건축사회(BIRA)** 표준 매뉴얼: [`BIRA_MEMORY.md`](file:///c:/code/seumter/BIRA_MEMORY.md)
