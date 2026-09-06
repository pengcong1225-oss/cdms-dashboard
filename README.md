# 武汉经开区监管大屏复刻

本地地址：<http://127.0.0.1:4318/>

当前交付采用 **原站展示资源本地化 + 独立 Node 接口服务**。保留原站 Vue/ECharts 发布程序、样式、中文字体、地图边界和背景，所有大屏数据请求由本地服务处理。不是 iframe 嵌入原站，也不是截图页面。原始 `.vue` 工程和原站后端源码未取得，因此不宣称已还原原始源工程。

## 已实现

- 筛查统计、月趋势、机构排名、地图机构点位/提示、街道看板、机构明细、肺功能分级、综合评估分组、管理分级。
- 原站快照保留 17 家机构与“全部”视图；实时库按 `cdms_org` 返回当前机构范围；2024、2025、2026 三个年份；全屏切换与窗口自适应。
- 当前前端使用的 9 个 v2 POST 接口，保持原站字段、响应信封与聚合值。
- 支持 `DATA_MODE=snapshot` 的原站聚合快照和 `DATA_MODE=db` 的 `cdms_followup` 只读实时统计；两种模式共用前端接口。
- 快照模式保留 180 份机构/年份聚合响应与一份上下文，采集于 2026-09-05；不包含患者明细。
- 本地只绑定 127.0.0.1，检查 Host 与跨站 Origin；快照在 server/data，静态服务无法读取。
- 数据快照标识、数据状态页、可重复构建、SHA-256 资源校验、单元测试与全量接口比对。

## 启动

需要 Node.js 22 或更新版本。已生成 dist，可直接执行：

```powershell
cd D:\codex\projects\hguard-monitor
.\start.ps1
```

`start.ps1` 在后台启动预览，不弹出终端窗口。日志在 artifacts/server.log 和 artifacts/server-error.log。也可以在终端运行 `npm start`，用 Ctrl+C 停止。

```powershell
npm test
npm run build
node scripts/smoke.mjs
```

`smoke.mjs` 要求本地服务已启动，会检查全部 181 个已采集响应、原站资源和异常场景。

## 源文件与数据

| 路径 | 用途 |
|---|---|
| public/ | 原站展示发布资源，按原始内容保存 |
| src/ | 本地数据状态与接入扩展 |
| server/index.mjs | 本地 HTTP 服务与静态文件访问边界 |
| server/handler.mjs | 大屏 9 个接口、机构和年份验证 |
| server/data/ | 授权聚合快照，已排除 Git |
| scripts/build.mjs | 校验原站资源并生成本地展示目录 |
| scripts/capture.mjs | 使用临时登录凭据重新读取聚合数据 |
| scripts/inspect-database.mjs | 只读查询指定数据库的表结构 |
| docs/api-contract.md | API 字段和未来数据库映射要求 |
| artifacts/verification.json | 最近一次接口和资源检查结果 |

默认使用快照模式。实时模式启动前把连接参数放入忽略的 `.env`，设置 `DATA_MODE=db` 后运行；数据库失败会在接口返回 503，不会静默回退旧快照。浏览器不保存数据库账号密码。

## 数据库接入状态

目标数据库为 `cdms_followup`（服务器上不存在无下划线的 `cdmsfollowup`）。已用只读会话核验业务表、字段和聚合数量；实时适配使用筛查、肺功能报告/旧记录、诊断、评估、随访和机构表，不写业务数据。

`.env.example` 提供连接字段。将有效连接信息放在忽略的 `.env` 中后运行：

```powershell
npm ci
node --env-file=.env scripts/inspect-database.mjs
```

实时模式：

```powershell
Copy-Item .env.example .env
# 编辑 .env：DATA_MODE=db、DB_PASSWORD=实际只读密码
.\start.ps1
```

`DB_NAME` 应为 `cdms_followup`。实时模式默认读取 `server/map-config.json`，其中的 17 个点位按机构名称与原站地图元数据精确匹配；统计仍全部来自新库。`MAP_CONFIG_PATH` 可指向另一份经过确认的机构坐标配置；没有坐标时地图保留统计但不猜位置。只读 schema 检查仍可用 `scripts/inspect-database.mjs`，不会修改数据库。

## 范围边界

- 原站“返回工作台”属于原业务平台入口，其业务后台未包含在本次大屏复刻范围。
- 本地服务不复制原站登录权限体系，不作为多用户生产服务；未发布到云端或修改生产站点。
- 未进行源站/本地逐像素差异比较。已在浏览器确认页面和图表渲染、机构数据联动、年份控件、全屏切换，并检查控制台无 error/warn。
