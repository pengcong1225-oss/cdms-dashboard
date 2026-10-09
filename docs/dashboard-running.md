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
生产同域部署时保留管理端登录的localStorage.token（大屏只读转发Authorization），由Manager验证JWT、权限和机构范围。不把token放进URL或服务端配置。独立localhost端口不共享管理端登录态，因此未登录预览显示“—/请先从管理端登录”，不造0。
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
| 高危 / 待确诊 | /api/v1/highrisk/stats | 当前高危人群人数，状态分别统计 |
| 确诊在管与分布 | /api/v1/copd/stats | 当前活跃确诊患者；GOLD以已分级为分母 |
| 档案质控 | 同上 qualityPassed | patient.qc_status=1；非肺功能报告质控 |
| COPD-SQ问卷风险 | 同上 riskDistribution | 最新问卷总分≥16为高风险；缺问卷单列未评估，非急性加重风险 |
| 当前预警患者 | /api/v1/monitoring/stats | activeAlertPatientCount，人数 |
| 活动预警条数 / 动态 | /api/v1/monitoring/alerts/popup | remainingCount条数，动态为近60分钟新发活动告警 |
| 慢阻肺共病升级 | /api/v1/copd/stats 的 comorbidities | 人群特征与管理仅展示共病分布；不再提供月度趋势、管理分级页签 |

年度接口分别沿用sys:report:screening:list和sys:report:followup:list，其他模块沿用各自权限。范围在Manager按OrgRule子树校验；地图只按字符串机构ID匹配地图配置，不以名字/JavaScript数值ID合并数据。
普通60秒、监测20秒刷新；切范围取消旧请求并清除旧范围值；连接失败保留本范围最后成功数据且提示更新时间。401/403清除该模块旧数据；同域管理端登录账号/token变化时重置机构选项和全部统计。不同模块可独立失败。

## 可重复构建
assets/asset-manifest.json已经入源码，不再依赖被忽略的artifacts JSON。原13份发布资源仍保持哈希验证，新增页面从src/dashboard复制。assets/streets.json来自原站发布模块c046；可运行node scripts/extract-street-map.mjs重新提取七个原街道几何。
文本资产的sha256按CRLF规范为LF后的原始字节校验，独立CR和其他内容变化仍会失败；字体、图片、图标保持严格原始字节校验。manifest当前13份规范哈希已与`git show HEAD:public/...`原始Git字节核对一致，避免Windows检出或归档换行差异阻止重建；bytes字段保留原采集长度，不用作跨平台文本校验。

## 测试与独立样例验收
```powershell
npm test
npm run build
node scripts/preview-dashboard-fixture.mjs
```
最后一个命令只启动4319隔离测试页，明确标注“验收样例 · 非业务数据”，不会被生产服务导入，也不写数据库。用于检查完整布局、17机构引线、所有分布、机构与地图联动、明细、页签和街道看板；不作为业务数据交付。正式入口4318不加载该样例。

Java定向：backend目录运行mvn -q '-Dtest=DashboardStatsServiceTest,CopdServiceImplTest' clean test。全量mvn test在本机缺少JWT_SECRET等集成配置时会有Spring/数据库契约启动失败，不能替代联调验收。
