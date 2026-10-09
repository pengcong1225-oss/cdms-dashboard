# 新监管大屏开发与验收

## 启动正式入口
```powershell
cd D:\codex\projects\hguard-monitor
npm install
npm run build
$env:MANAGER_BASE_URL = 'http://127.0.0.1:8081'
$env:MANAGER_UI_URL = '/cdmsmanager/'
npm start
```
入口 http://127.0.0.1:4318/ ，默认manager模式。无需快照文件或大屏数据库。Manager模式不读取server/data、不初始化旧数据接口，关闭并隐藏/legacy.html；旧版仅在显式DATA_MODE=db或snapshot且配置相应数据源时可用。
生产同域部署时复用管理端的localStorage.token/refreshToken，由Manager验证JWT、权限和机构范围。不把token放进URL或服务端配置。独立localhost端口以及不同域名不共享管理端登录态。

书签直接打开时先检查会话：没有登录则显示独立登录入口，不发送六个统计请求；入口固定到同源`/cdmsmanager/login`，新标签页登录后返回大屏，storage/focus/时钟检查自动恢复。已过期access token或统计401会合并为一次同源`POST /cdmsmanagerapi/api/v1/auth/refresh`（10秒超时）；成功后清除旧会话数据并按新token重新加载。续期被拒绝则清理会话并停止轮询，网络失败保留本地会话、显示重试按钮；续期期间切换账号或退出，旧结果不能恢复/清除新会话。部署须保留上述同源Manager UI/API前缀；独立localhost仅可预览未登录界面，完整登录联调需同源代理这两个前缀。
Manager需要包含此次新增的DashboardStatsController/DashboardStatsService和CopdStatsVO扩展；无需数据库迁移。MANAGER_BASE_URL可以包含原Nginx代理前缀，如http://127.0.0.1:8081/cdmsmanager；其后拼接/api/v1。

## 挂载路径
本机入口为 `/`，生产入口为 `/dashboard/`。页面资源使用相对路径，地图、配置、Manager代理和原版入口均按浏览器入口目录生成URL；字体相对CSS目录加载。Nginx现有 `/dashboard/` → Node `/smart-hguard-monitor/` 转发保持不变，Node先剥离该上游前缀再处理API及静态资源。返回管理端的地址由MANAGER_UI_URL配置，属于跨应用入口，不拼接大屏前缀。
原版静态资源原本相对入口；构建时将原版API、登录跳转和状态页也调整到入口目录。新增测试实际启动反向代理和Manager桩服务，验证挂载资源、地图、带19位机构ID和用户Authorization的请求，并确认不会落到域名根路径。

## 数据口径
| 界面 | 来源 | 口径 |
|---|---|---|
| 年度问卷 / ≥16分排行 | /api/v1/dashboard/screening | 复用筛查报表，事件人次 |
| 年度肺功能 | 同上 | 原报表lungFuncExamCount，检查人次 |
| 年度随访记录 | /api/v1/dashboard/follow-up | 原报表visitCount，随访人次 |
| 高危 / 待确诊 | /api/v1/dashboard/high-risk | 当前高危人群人数，状态分别统计；轻量只读聚合 |
| 确诊在管与分布 | /api/v1/dashboard/population | 当前活跃确诊患者；GOLD以已分级为分母；轻量只读聚合 |
| 档案质控 | 同上 qualityPassed | patient.qc_status=1；非肺功能报告质控 |
| COPD-SQ问卷风险 | 同上 riskDistribution | 最新问卷总分≥16为高风险；缺问卷单列未评估，非急性加重风险 |
| 当前预警患者 | /api/v1/monitoring/stats | activeAlertPatientCount，人数 |
| 活动预警条数 / 动态 | /api/v1/monitoring/alerts/popup | remainingCount条数，动态为近60分钟新发活动告警 |
| 慢阻肺共病统计 | /api/v1/dashboard/population 的 comorbidities | 展示共病分布；不再提供月度趋势、管理分级页签 |

年度接口分别沿用sys:report:screening:list和sys:report:followup:list，其他模块沿用各自权限。范围在Manager按OrgRule子树校验；地图只按字符串机构ID匹配地图配置，不以名字/JavaScript数值ID合并数据。
普通60秒、监测20秒轮询；切年份仅取消、清除和请求年度筛查/随访，人口、高危、监测与预警保留当前数据及在途请求。切机构范围取消所有旧请求并清除旧范围值。相同模块的在途请求复用同一Promise，每个模块独立epoch阻止取消后的旧响应覆盖新范围。403仅清除对应模块，不触发续期或退出；401由全局会话恢复处理。同域管理端登录账号/token变化（含localStorage.clear）清除全部统计、机构选项和已打开明细，仅在会话可用时按新token读取。

首屏业务统计在会话可用后立即发起，导航配置与地图下载独立完成，地图晚到时按最新数据和机构范围绘制。地图保留缩放、平移及机构联动，不再显示定位数量提示。对于成功返回 `meta.refreshing=true` 的模块，每3秒检查一次后台刷新结果，每轮最多5次；完成、失败、权限变更或数据过期即停止，常规60秒轮询继续保底。隐藏页面不发轮询请求，短轮询复用请求去重和权限隔离，不重置后台统计时间。

接口成功或失败只更新依赖该模块的区块和状态；监测、预警、排行页签均不重建地图。相同缓存数据只更新状态，不重绘图表；地图点位仅在年度数据或机构范围改变时更新。年度更新保留现有地图缩放、平移以及街道事件处理器。
机构明细与街道看板跟随年度数据，共病“更多”跟随人口数据；其来源内容更新、401/403清除或超过最大陈旧时间时关闭并清空弹窗，避免继续展示过期快照。

### 缓存时间与刷新状态
年度两接口及人口/高危接口保持`Result.data`原来的数组或统计对象形状，增加可选`Result.meta`：
```json
{"dataUpdatedAt":"2026-10-09T00:00:00Z","stale":false,"refreshing":false,"refreshFailed":false,"freshUntil":"2026-10-09T00:03:00Z","staleUntil":"2026-10-09T00:13:00Z"}
```
`dataUpdatedAt`必须为后台聚合成功时间，命中缓存或客户端读取不改此值；`freshUntil`/`staleUntil`为UTC ISO时间。状态区明确区分“数据更新”“数据陈旧”“后台刷新中”“刷新失败”。前端每秒检查有效期，超过`staleUntil`后移除对应数据，不能无限保留旧值；请求失败保留仍在允许窗口内的本范围上次成功值。没有meta的实时监测/预警显示“收到… · 数据更新时间未提供”，避免把读取时间当成源数据时间。

年度新鲜窗口180秒、最多额外陈旧600秒；人口/高危新鲜45秒、最多额外陈旧120秒。实际边界以前端收到的meta为准。新增两接口需Manager同步升级，Node代理仅将它们加入既有只读allowlist，生产`/dashboard/`路径与Authorization转发不变。

## 可重复构建
assets/asset-manifest.json已经入源码，不再依赖被忽略的artifacts JSON。原13份发布资源仍保持哈希验证，新增页面从src/dashboard复制。assets/streets.json来自原站发布模块c046；可运行node scripts/extract-street-map.mjs重新提取七个原街道几何。
文本资产的sha256按CRLF规范为LF后的原始字节校验，独立CR和其他内容变化仍会失败；字体、图片、图标保持严格原始字节校验。manifest当前13份规范哈希已与`git show HEAD:public/...`原始Git字节核对一致，避免Windows检出或归档换行差异阻止重建；bytes字段保留原采集长度，不用作跨平台文本校验。

## 测试与独立样例验收
```powershell
npm test
npm run build
node scripts/preview-dashboard-fixture.mjs
```
最后一个命令只启动4319隔离测试页，明确标注“验收样例 · 非业务数据”，不会被生产服务导入，也不写数据库。样例使用新人口/高危路径，meta时间固定为样例服务启动时间，轮询不冒充数据更新。用于检查完整布局、17机构引线、所有分布、机构与地图联动、明细、排行页签和街道看板；不作为业务数据交付。正式入口4318不加载该样例。

新增刷新测试覆盖年度与当前接口独立、请求去重、旧响应抛弃、token隔离、403清除、缓存真实时间和过期清理。真实app配合小型DOM边界替身执行，验证年度仅两请求、监测不触碰人口/排行/地图DOM、缓存命中不重绘、地图滚轮与拖动状态在刷新后保留。该测试不替代真实浏览器与生产数据联调。

Java定向：backend目录运行mvn -q '-Dtest=DashboardStatsServiceTest,CopdServiceImplTest' clean test。全量mvn test在本机缺少JWT_SECRET等集成配置时会有Spring/数据库契约启动失败，不能替代联调验收。
