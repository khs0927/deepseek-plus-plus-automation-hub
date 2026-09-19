---
name: live-market-data
description: >-
  실시간 금융/거시/크립토/에너지 시장 데이터 분석. 주식/옵션/암호화폐 시세, SEC EDGAR 공시, FRED 연준 경제지표, EIA 유가/에너지, LastLook 거시 번들, AKShare 중국 A주 시세 조회 시 자동 활성화됩니다.
version: 1.0.0
servers:
  - "blackboxfoundry-livedatalink"
  - "zev-lastlook-data"
  - "zwldarren-akshare-one-mcp"
tools_count: 51
---

# LIVE MARKET DATA Skill

실시간 금융/거시/크립토/에너지 시장 데이터 분석. 주식/옵션/암호화폐 시세, SEC EDGAR 공시, FRED 연준 경제지표, EIA 유가/에너지, LastLook 거시 번들, AKShare 중국 A주 시세 조회 시 자동 활성화됩니다.

---

## 1. 지원하는 MCP 서버 및 도구 목록 (총 51개)

### 연결 서버:
- `blackboxfoundry-livedatalink`
- `zev-lastlook-data`
- `zwldarren-akshare-one-mcp`

### 도구 목록 (Actual Tool Names):
- `stock_quote`
- `stock_quote_batch`
- `options_chain`
- `stock_history`
- `company_info`
- `stock_compare`
- `crypto_price`
- `crypto_compare`
- `crypto_trending`
- `crypto_info`
- `edgar_company_lookup`
- `edgar_recent_filings`
- `edgar_filing_content`
- `edgar_full_text_search`
- `edgar_company_facts`
- `edgar_insider_transactions`
- `fred_series_info`
- `fred_observations`
- `fred_search`
- `fred_category_series`
- `fred_quick_indicator`
- `fred_compare`
- `fred_releases`
- `treasury_debt`
- `treasury_interest_rates`
- `treasury_exchange_rates`
- `treasury_auctions`
- `treasury_cash_balance`
- `eia_gasoline_prices`
- `eia_natural_gas`
- `eia_electricity_state`
- `eia_oil_supply`
- `eia_renewable_generation`
- `eia_energy_consumption`
- `worldbank_indicator`
- `worldbank_compare`
- `bls_indicator`
- `get_bundle_macro`
- `get_bundle_fx_dashboard`
- `get_bundle_crypto`
- `get_bundle_energy`
- `get_bundle_mortgage_pulse`
- `get_recession_indicator`
- `get_economic_calendar`
- `get_fx_rate_current`
- `get_realtime_data`
- `get_hist_data`
- `get_financial_metrics`
- `get_balance_sheet`
- `get_income_statement`
- `get_cash_flow`

---

## 2. 도구 호출 가이드 및 예시

### 실행 방식:
- Smithery Toolbox 도구: `execute(server="blackboxfoundry-livedatalink", tool="stock_quote", arguments={"symbol": "AAPL"})`
- 거시 번들: `execute(server="zev-lastlook-data", tool="get_bundle_macro", arguments={})`
- A주 데이터: `execute(server="zwldarren-akshare-one-mcp", tool="get_realtime_data", arguments={"symbol": "sh000001"})`

---

## 3. 베스트 프랙티스
1. 작업 시작 전 필요한 도구 이름을 명확히 확인하고 호출하십시오.
2. Smithery 연동 서버의 도구는 `execute(server, tool, arguments)`를 통해 호출하며, 파라미터 규격을 준수하십시오.
3. 여러 단계의 작업이 필요한 경우 `invoke_subagent` 또는 순차 호출을 통해 결과를 검증하며 진행하십시오.
