# 监管大屏接口契约与数据库接入

当前接口前缀：`POST /smart-hguard/api/v1/screen/v2/`。JSON 请求，保持与原站发布程序一致。

请求共用字段：`enterpriseId?: string`，省略表示全部；`abnormal-trend` 额外接受整数 `year`。机构 ID 必须保留字符串类型，原站 ID 超出 JavaScript 安全整数范围。

成功信封以原站响应为准：`{ code: "200", msg: "操作成功", data: ..., extra: {}, count: 0, nextStartIndex: 0, isEnd: 1 }`。本地参数错误使用 HTTP 400，不存在的年份/接口为 HTTP 404，跨站请求为 HTTP 403。

| 接口 | data 字段 | 目标数据库需要提供 |
|---|---|---|
| context | viewAll, canSwitchHospital, hospitalLevel, currentEnterpriseName, hospitals[{id,name}] | 授权机构范围、机构层级、稳定字符串 ID 与名称 |
| lung-function-stats | screeningCount, lungTestCount, copdCount, followUpCount, bronchodilationCount, bronchodilationPositiveCount, bronchodilationPositiveRate | 筛查人数、肺功能人数、确诊人数、随访次数及舒张试验人数/阳性人数 |
| abnormal-trend | monthlyScreeningCounts[12], monthlyCopdCounts[12] | 按业务日期与年份分组的十二个月去重人数 |
| institution-rank | list[{institutionName,copdCount}] | 各机构确诊人数与稳定排序 |
| map-layer | hospitalMarkers[{name,shortName,hospitalLevel,lng,lat,labelLng?,labelLat?,screeningCount,copdCount,bronchodilationCount,bronchodilationPositiveCount,bronchodilationPositiveRate}] | 机构经纬度、级别和机构统计；没有经过确认的坐标时 `lng/lat` 为 `null`，不猜位置 |
| org-region-list | list[{communityName,lungTestCount,bronchodilationCount,questionnaireCount,screeningCount}] | 各机构问卷、肺通气、舒张试验与筛查去重人数 |
| lung-level-distribution | categories[], values[] | 肺功能轻度/中度/重度/极重度分级人数 |
| assessment-group-distribution | categories[], values[] | A/B/E 综合评估分组人数 |
| management-level-rating | items[{name,value,color}] | 一级/二级/三级/四级管理分级人数，保持原站配色 |

权威样本保存在 `server/data/all--<接口名>.json`，趋势接口包含年份后缀。服务不把不存在的机构或年份替换成全部视图。

## 当前证据

- 原站聚合采集成功：17 家机构 + 全部，2024–2026 年趋势，180 份数据响应。
- 目标库实际为 `cdms_followup`，服务器上存在 `cdms_followup`，不存在无下划线的 `cdmsfollowup`；只读查询已确认 `cdms_patient`、`cdms_copd_screening`、`cdms_lung_function_record`、`cdms_lung_function_report`、`cdms_copd_diagnosis`、`cdms_copd_assessment`、`cdms_follow_up_record` 和机构表。
- 当前已验证的聚合样本：筛查去重患者 9556、肺功能去重患者 311、有效确诊 245、完成随访记录 771、明确舒张试验 14（阳性 1）。这些数字随数据库变化，不是前端固定值。
- 旧肺功能记录和新报告字段不完全一致；报告与 IoT 事实存在关联链路，统计服务不把两者重复相加。评估和地图坐标覆盖不足会明确保留为未知/缺口。

## 接入时必须明确的统计口径

1. 筛查人数是患者数还是筛查记录数；多机构就诊如何归属；删除、草稿和审核状态如何处理。
2. 肺功能人数是受检患者数还是检测次数；舒张试验前/后记录怎样合并；阳性判定来自哪个业务字段。
3. 慢阻肺确诊是否只统计最新有效版本；诊断撤销/修订如何处理。
4. 随访次数是否仅统计已完成随访，电话/线上/线下是否合并。
5. 肺功能、综合评估、管理分级是否取最新有效评估，每名患者是否允许多次入组。
6. 机构层级、合并机构和原站 ID 映射；地图坐标系须与当前 GCJ-02 边界一致。
7. 趋势统计日期使用筛查日期、诊断日期还是记录创建时间，时区固定 Asia/Shanghai。

原站某些汇总并不相等：肺功能总人数 4091，而分级图表样本数为 4110。应保持当前原站数据，待源系统口径确认后再决定是否统一，不能擅自修正成相同数字。

## 验收方法

数据层替换后仍运行当前接口契约测试，并用目标数据库聚合查询结果核对页面。必须验证全局、单机构、无数据机构、跨年、重复记录、撤销诊断和缺失分级；错误不能被包装成成功且全部为零。数据库查询使用参数绑定和只读账号，不从浏览器传 SQL。
