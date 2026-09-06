# HGuard Live Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将监管大屏的接口数据源接入 `cdms_followup` 只读统计，同时保持现有页面和接口契约。

**Architecture:** Node 服务通过只读 MySQL 连接池调用统一统计提供器；处理器保持 9 个前端接口不变，支持显式 `db` 和 `snapshot` 两种模式。数据库异常在 `db` 模式返回 503，不隐式回退旧快照。

**Tech Stack:** Node.js 22+, mysql2, Node test runner, 原站 Vue/ECharts 静态资源。

**Spec:** `docs/superpowers/specs/2026-09-06-hguard-live-data-design.md`

## Global Constraints

- 数据库连接只从运行环境读取，代码、前端和文档不保存密码。
- 查询使用参数绑定、只读连接和有限缓存；本轮不建表、不写业务数据。
- 报告与 IoT 事实不能重复计数，旧肺功能孤立记录不能直接相加。
- 缺失、未评估和未知状态必须保持可见，不能转成零。
- 数据库失败返回 503；只有 `DATA_MODE=snapshot` 才读取快照。
- 机构地图坐标必须来自明确配置，不猜经纬度。

### Task 1: Provider contracts and failing tests

**Files:**
- Create: `tests/live-data.test.mjs`
- Create: `server/provider-contract.mjs`

**Interfaces:**
- `createProviderContract(provider)` validates the nine provider method names and returns a normalized provider wrapper.
- Each method accepts `{ enterpriseId, year }` where applicable and returns interface `data` only.

- [x] Write tests for missing provider methods, normalized empty arrays, and explicit database error propagation.
- [x] Run `node --test tests/live-data.test.mjs`; confirm failure because the contract module does not exist.
- [x] Implement the smallest contract wrapper and normalization helpers.
- [x] Run the focused test, then `npm test`; confirm all pass.

### Task 2: Read-only database pool and SQL metrics provider

**Files:**
- Create: `server/db.mjs`
- Create: `server/metrics.mjs`
- Create: `server/map-config.example.json`
- Modify: `tests/live-data.test.mjs`

**Interfaces:**
- `createReadOnlyPool(config)` returns a mysql2 pool configured from `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`.
- `createSqlProvider({ pool, mapConfig, now })` returns the provider contract from Task 1.

- [x] Add tests using a query executor fixture that asserts parameterized SQL and verifies screening, report, diagnosis, follow-up and unknown-state transformations.
- [x] Run the focused tests and confirm failure before implementation.
- [x] Implement pooled read-only connection setup with connection/session initialization that does not mutate data.
- [x] Implement parameterized aggregate queries: screening distinct people and trend; reports plus IoT lineage dedupe; latest diagnosis with MySQL 8 window functions; completed follow-up; latest assessment distributions; institution summaries; explicit map configuration.
- [x] Run focused tests and a real read-only aggregate probe against `cdms_followup` without printing patient detail.

### Task 3: Mode-aware HTTP integration

**Files:**
- Modify: `server/handler.mjs`
- Modify: `server/index.mjs`
- Modify: `tests/api.test.mjs`

**Interfaces:**
- `createHandler({ provider, dataDir, mode })` serves the same endpoint names and response envelope.
- `GET /api/health` reports `mode`, `databaseConnected`, `lastSuccessAt`, and data quality counts.

- [x] Add tests proving `db` mode calls the provider, provider failures return 503, and snapshot mode retains exact old responses.
- [x] Run focused tests and confirm red before changing integration.
- [x] Implement mode selection from `DATA_MODE`, provider injection, bounded cache keys, and explicit error responses.
- [x] Update health response without exposing credentials or patient details.
- [x] Run `npm test` and `npm run build`.

### Task 4: Status UI, configuration docs, and live smoke verification

**Files:**
- Modify: `src/status.html`
- Modify: `src/replica-status.js`
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/api-contract.md`
- Modify: `scripts/smoke.mjs`

- [x] Add status-page validation through the HTTP health contract and browser verification for live/snapshot state and missing coordinates.
- [x] Run the focused status validation and confirm the status page renders the current mode before implementation changes.
- [x] Display mode, last successful query, quality gaps and current database status; do not display secrets or patient data.
- [x] Document `DATA_MODE=db`, required environment variables, explicit snapshot use, and read-only verification commands.
- [x] Run full `npm test`, `npm run build`, `node scripts/smoke.mjs`, and browser checks for institution/year/fullscreen/error state.
- [x] Record final verification and remaining source-data gaps in `artifacts/live-data-verification.json`.
