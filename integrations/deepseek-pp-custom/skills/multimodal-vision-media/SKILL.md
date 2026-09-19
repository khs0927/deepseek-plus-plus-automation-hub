---
name: multimodal-vision-media
description: >-
  이미지 및 비디오 멀티모달 정밀 분석, OCR 글자 인식, QR 코드 생성, 마크다운 문서 변환(HTML/PDF to MD) 및 SparkForge 미디어 생성/편집 도구군.
version: 1.0.0
servers:
  - "Multimodal Vision"
  - "henry-ships-sparkforge"
tools_count: 10
---

# MULTIMODAL VISION MEDIA Skill

이미지 및 비디오 멀티모달 정밀 분석, OCR 글자 인식, QR 코드 생성, 마크다운 문서 변환(HTML/PDF to MD) 및 SparkForge 미디어 생성/편집 도구군.

---

## 1. 지원하는 MCP 서버 및 도구 목록 (총 10개)

### 연결 서버:
- `Multimodal Vision`
- `henry-ships-sparkforge`

### 도구 목록 (Actual Tool Names):
- `analyze_images`
- `analyze_video`
- `vision_status`
- `ocr`
- `scrape_webpage`
- `html_to_markdown`
- `pdf_to_markdown`
- `generate_qr_code`
- `generate_image`
- `image_resize`

---

## 2. 도구 호출 가이드 및 예시

### 실행 방식:
`analyze_images(prompt="이 다이어그램의 아키텍처를 설명해줘", images=["..."])`
`execute(server="henry-ships-sparkforge", tool="ocr", arguments={"image_url": "https://..."})`
`execute(server="henry-ships-sparkforge", tool="generate_qr_code", arguments={"data": "https://deepseek.com"})`

---

## 3. 베스트 프랙티스
1. 작업 시작 전 필요한 도구 이름을 명확히 확인하고 호출하십시오.
2. Smithery 연동 서버의 도구는 `execute(server, tool, arguments)`를 통해 호출하며, 파라미터 규격을 준수하십시오.
3. 여러 단계의 작업이 필요한 경우 `invoke_subagent` 또는 순차 호출을 통해 결과를 검증하며 진행하십시오.
