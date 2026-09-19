---
name: energy-solar-infrastructure
description: >-
  NREL 재생에너지 연구소 PVWatts 태양광 발전 시뮬레이션, 전력 요금 체계, 대체 연료(EV 충전소/수소) 인프라 검색 및 EIA 미국 주별 석유/가스/전력 수급 데이터 분석.
version: 1.0.0
servers:
  - "blackboxfoundry-livedatalink"
tools_count: 12
---

# ENERGY SOLAR INFRASTRUCTURE Skill

NREL 재생에너지 연구소 PVWatts 태양광 발전 시뮬레이션, 전력 요금 체계, 대체 연료(EV 충전소/수소) 인프라 검색 및 EIA 미국 주별 석유/가스/전력 수급 데이터 분석.

---

## 1. 지원하는 MCP 서버 및 도구 목록 (총 12개)

### 연결 서버:
- `blackboxfoundry-livedatalink`

### 도구 목록 (Actual Tool Names):
- `nrel_pvwatts`
- `nrel_solar_resource`
- `nrel_utility_rates`
- `nrel_alt_fuel_stations`
- `nrel_alt_fuel_station_detail`
- `eia_gasoline_prices`
- `eia_natural_gas`
- `eia_electricity_state`
- `eia_oil_supply`
- `eia_renewable_generation`
- `eia_energy_consumption`
- `eia_series_lookup`

---

## 2. 도구 호출 가이드 및 예시

### 실행 방식:
`execute(server="blackboxfoundry-livedatalink", tool="nrel_pvwatts", arguments={"system_capacity": 4, "latitude": 37.5, "longitude": -122.2, "tilt": 20, "azimuth": 180})`
`execute(server="blackboxfoundry-livedatalink", tool="nrel_alt_fuel_stations", arguments={"location": "Austin, TX", "fuel_type": "ELEC"})`

---

## 3. 베스트 프랙티스
1. 작업 시작 전 필요한 도구 이름을 명확히 확인하고 호출하십시오.
2. Smithery 연동 서버의 도구는 `execute(server, tool, arguments)`를 통해 호출하며, 파라미터 규격을 준수하십시오.
3. 여러 단계의 작업이 필요한 경우 `invoke_subagent` 또는 순차 호출을 통해 결과를 검증하며 진행하십시오.
