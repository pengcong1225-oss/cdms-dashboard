# 监管大屏实时数据接入设计

## 目标

在保留现有原站页面、样式、交互和 9 个 v2 接口契约的前提下，将数据来源切换为 `cdms_followup` 的只读统计查询。快照只作为明确配置的本地开发模式，不作为数据库失败时的隐式后备。

## 约束与口径

- 数据库连接只从运行环境读取，代码、前端和文档不保存密码。
- 查询使用参数绑定、只读连接和有限缓存；本轮不建表、不写业务数据。
- 筛查统计按有效筛查记录关联患者后去重患者；缺日期记录不进入年份趋势，并在健康状态中报告缺口。
- 肺功能报告优先使用 `cdms_lung_function_report`；IoT 事实只作为其来源链路，不与报告重复计数。旧 `cdms_lung_function_record` 仅在能关联患者和机构时参与补充，无法关联的记录单独计入缺口。
- 支气管舒张试验只统计明确标记为已做的记录；缺字段或未知值不计入未做。
- 诊断按每名患者最新有效版本统计，撤销或排除状态不计入确诊。
- 随访只统计 `status=1` 且 `draft=0` 的完成记录；人数和人次分开返回。
- 分级、A/B/E 分组和管理等级按最新有效评估统计；未评估单独保留为未知，不转成零。
- 全区去重人数不由机构人数相加得到；期间去重人数不由每日去重人数相加得到。
- 机构地图坐标只能来自明确配置；缺坐标时保留机构统计并标记地图数据不完整，不猜坐标。
- 数据库连接失败返回 503 和可读错误；只有 `DATA_MODE=snapshot` 才读取既有快照。

## 组件

`server/db.mjs` 创建 MySQL 只读连接池；`server/metrics.mjs` 暴露统一的聚合提供器；`server/handler.mjs` 负责请求校验、缓存和响应信封；`server/index.mjs` 负责模式选择、健康检查和 HTTP 错误；`server/map-config.json` 保存可审阅的机构地图配置。

提供器接口按现有接口名称划分：`getContext`、`getLungFunctionStats`、`getAbnormalTrend`、`getInstitutionRank`、`getMapLayer`、`getOrgRegionList`、`getLungLevelDistribution`、`getAssessmentGroupDistribution`、`getManagementLevelRating`。每个方法只返回接口 `data`，响应信封仍由服务统一生成。

## 故障与缓存

数据库模式下缓存按请求参数短时复用，缓存键包含接口、机构和年份。查询失败不读取旧快照，健康检查返回 `databaseConnected=false`、错误摘要和最近成功统计时间。快照模式保留原有 181 个响应的契约测试。

## 验收

自动化测试验证两种模式、输入校验、口径转换、缺失数据和数据库异常；构建和接口 smoke 验证资源与 HTTP 契约；浏览器联调验证机构、年份、全屏和错误状态。真实库联调只执行只读 `SELECT`，不打印患者姓名、电话、身份证或其他明细。
