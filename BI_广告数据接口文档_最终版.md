# BI 广告数据查询与导出接口文档（最终版）

本文档统一说明 BI 广告数据**查询接口**与**导出接口**的使用方式，以及所有返回/导出字段的详细含义。适用于前端对接、BI 分析与数据导出。

---

## 一、广告数据查询接口

| 项目 | 说明 |
|------|------|
| **接口地址** | `GET /project/adsData/getAllFilterData` |
| **完整 URL** | `{BASE_URL}/project/adsData/getAllFilterData` |
| **说明** | 根据筛选条件查询广告数据，返回 JSON 列表结果。 |

### 请求参数

| 参数名 | 类型 | 是否必填 | 说明 |
|--------|------|----------|------|
| projectId | Long | 是 | 项目 ID |
| platform | String | 是 | 平台：`GOOGLE` / `FACEBOOK` |
| startDate | String | 是 | 开始日期（yyyy-MM-dd） |
| endDate | String | 是 | 结束日期（yyyy-MM-dd） |
| filterAccountIdList | List\<String\> | 否 | 广告账号 ID 过滤 |
| filterCampaignIdList | List\<String\> | 否 | Campaign ID 过滤 |
| ~~segment~~ | ~~String~~ | ~~否~~ | ~~已移除，后端自动返回所有层级数据。~~ 前端通过返回数据中的 `segments` 字段区分数据层级。 |

---

## 二、广告数据导出接口

| 项目 | 说明 |
|------|------|
| **接口地址** | `GET /project/adsData/exportFilterData` |
| **完整 URL** | `{BASE_URL}/project/adsData/exportFilterData` |
| **说明** | 根据筛选条件导出广告数据，返回 Excel 文件（.xlsx）。 |

**请求参数**：与【广告数据查询接口】完全一致。

---

## 三、返回 / 导出字段说明

以下字段同时适用于**查询接口返回数据**与**导出 Excel 文件**。不同 segments 下部分字段为空属正常情况。

| 字段名 | Excel 列名 | 说明 |
|--------|------------|------|
| id | 主键 ID | 数据主键 |
| platform | 平台 | 广告平台 |
| segments | 数据层级类型 | 数据统计维度 |
| recordDate | 日期 | 数据日期 |
| projectId | 项目 ID | 项目 ID |
| projectDisplayName | 项目全名 | 项目全名 |
| accountId | 广告账号 ID | 广告账号 ID |
| accountName | 广告账号名称 | 广告账号名称 |
| source | 来源 | Source |
| medium | 媒介 | Medium |
| campaignId | Campaign ID | 广告活动 ID |
| campaignName | Campaign 名称 | 广告活动名称 |
| campaignObjective | Campaign 目标 | 广告活动目标 |
| campaignAdvertisingType | Campaign 类型 | 广告活动类型 |
| adsetId | Adset ID | 广告组 ID |
| adsetName | Adset 名称 | 广告组名称 |
| adsetStatus | Adset 状态 | 广告组状态 |
| adsetType | Adset 类型 | 广告组类型 |
| adId | Ad ID | 广告 ID |
| keywordId | 关键词 ID | 关键词 ID |
| keyword | 关键词 | 关键词 |
| searchTerm | 搜索词 | 用户搜索词 |
| adName | 广告名称 | 广告名称 |
| adStrength | 广告强度 | 广告强度 |
| finalUrls | 最终落地页 URL | 广告最终跳转 URL |
| adImageUrl | 广告素材 URL | 广告素材 URL |
| adType | 广告类型 | 广告类型 |
| adStatus | 广告状态 | 广告状态 |
| audienceSegments | 广告受众 | 广告受众 |
| country | 国家 | 国家 |
| device | 设备 | 设备 |
| region | 地区 | 地区 |
| genderType | 性别 | 性别 |
| ageRange | 年龄段 | 年龄段 |
| adTags | 广告标签 | 广告标签 |
| addToCart | 加购数 | 加入购物车次数 |
| addToWishlist | 加心愿数 | 加入心愿单次数 |
| checkout | 下单数 | 下单次数 |
| averagePageViews | 平均浏览页数 | 平均浏览页数 |
| bounceRate | 跳出率 | 跳出率 |
| clicks | 点击数 | 广告点击次数 |
| conversionValue | 转化金额 | 转化产生金额 |
| conversion | 转化次数 | 转化次数 |
| allConversions | 总转化次数 | 所有转化次数 |
| cost | 花费 | 广告花费 |
| currency | 货币 | 货币类型 |
| costUsd | 美元花费 | 折算美元花费 |
| engagements | 互动数 | 互动次数 |
| impressions | 展示数 | 广告展示次数 |
| landingPageViews | 落地页浏览数 | 落地页浏览次数 |
| linkClicks | 链接点击数 | 链接点击次数 |
| postComments | 帖子评论数 | 评论数 |
| postReactions | 帖子回复数 | 互动回复数 |
| postSaves | 帖子保存数 | 保存次数 |
| postShares | 帖子分享数 | 分享次数 |
| campaignBudget | Campaign 预算 | 广告活动预算 |
| videoViews | 视频浏览数 | 视频浏览次数 |
| videoViews25 | 视频浏览 25%数 | 视频浏览 25% |
| videoViews50 | 视频浏览 50%数 | 视频浏览 50% |
| videoViews75 | 视频浏览 75%数 | 视频浏览 75% |
| videoViews100 | 视频浏览 100%数 | 视频完整播放数 |
| reach | 触达人数 | 触达人数 |
| leads | 潜在客户线索数 | 线索数量 |
| subscribe | 订阅行为数 | 订阅次数 |
| users | 用户数 | 用户数量 |
| sessions | 会话数 | 会话数量 |
| averageViewTime | 平均浏览时间 | 平均浏览时间 |
| dashboardCount | 浓度报告数量 | 浓度报告数量 |
| dashboardRevenue | 浓度报告收入 | 浓度报告收入 |
| dashboardRevisitCount | 浓度报告回访人数 | 回访人数 |
| gaCurrency | GA4 货币 | GA4 配置货币 |
| gaConvertedRevenue | GA4 转换后收入 | GA4 转换后收入 |
| category | 广告所属大类 | 广告分类 |
| productSeries | 产品系列 | 产品系列 |
| extra | 额外信息 | 扩展信息 |
| watchTimeDuration | 视频观看时长（秒） | 视频观看时长 |
| longHeadline | 长标题 | 长标题 |
| descriptions | 描述文案 | 描述文案 |
| businessName | 品牌名 | 品牌或商户名称 |
| landscapeImageIds | 横向图片素材 ID | 横向图片素材 ID |
| squareImageIds | 方形图片素材 ID | 方形图片素材 ID |
| portraitImageIds | 竖向图片素材 ID | 竖向图片素材 ID |
| logoImageIds | Logo 素材 ID | Logo 素材 ID |
| videoIds | 视频素材 ID | 视频素材 ID |
| callToActionText | CTA 文案 | 行动号召文案 |
| callToActionHeadline | CTA Headline | CTA 标题 |
| appFinalUrl | App 最终落地页 URL | App 最终落地 URL |
| displayUrl | 展示 URL | 展示 URL |
| trackingUrlTemplate | Tracking URL 模板 | 跟踪 URL 模板 |
| finalUrlSuffix | Final URL Suffix | URL 后缀 |
| customerParam | URL 自定义参数 | 自定义参数 |
| devicePreference | 设备偏好 | 设备偏好 |
| previewLink | 广告预览链接 | 广告预览链接 |
| headline | 短标题 Headline | 短标题 |
| linkUrl | 点击跳转链接 | 点击跳转 URL |
| addsPaymentInfo | 添加支付信息次数 | 添加支付信息次数 |
| costPerAddPaymentInfo | 添加支付信息成本 | 添加支付信息成本 |

---

## 四、数据层级（segments）说明

本接口为**多维度聚合查询**，一次请求可返回多个统计层级（segments）的数据，不同层级的数据混合在同一结果集中。每一行仅对应一种 segments。

### Google（platform = GOOGLE）支持的 segments

| segments | 说明 |
|----------|------|
| ad_date | 广告（Ad）+ 日期维度数据 |
| asset_group_date | 资产组（Asset Group）+ 日期维度数据（主要用于 Performance Max） |
| age_date | 年龄段 + 日期维度数据 |
| gender_adset_date | 性别 + 广告组（Adset）+ 日期维度数据 |
| keyword_date | 关键词（Keyword）+ 日期维度数据（Search 广告） |
| search_term_date | 搜索词（Search Term）+ 日期维度数据 |

### Facebook（platform = FACEBOOK）支持的 segments

| segments | 说明 |
|----------|------|
| ad_date | 广告（Ad）+ 日期维度数据 |
| age_date | 年龄段 + 日期维度数据 |
| gender_adset_date | 性别 + 广告组（Adset）+ 日期维度数据 |
| country_campaign_date | 国家 + Campaign + 日期维度数据 |

### 注意

- 不同 segments 下可用字段存在差异，非当前统计维度对应的字段为空属正常现象，并非数据缺失。
- 请求时通过 `segment` 参数可指定需要返回的层级（可传多个）。

---

## 五、补充说明

1. 查询接口与导出接口返回字段结构一致。
2. 不同数据类型（segments）下，部分字段为空属于正常情况。
3. 导出接口适用于大数据量分析及离线处理。
4. 接口返回结果适用于 BI 分析、数据导出及多维度数据整合场景。

---

*文档版本：最终版，与《BI 广告数据查询与导出接口文档_字段完整版》PDF 内容一致并合并为单一 Markdown 文档。*
