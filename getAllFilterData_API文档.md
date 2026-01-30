# getAllFilterData API 接口文档

## 接口概述

获取筛选后的BI广告数据，不分页返回所有符合条件的数据记录。

---

## 基础信息

| 项目 | 内容 |
|------|------|
| **接口名称** | 查询筛选后的BI广告数据（全量返回） |
| **请求地址** | `https://api.globaloneclick.org/project/adsData/getAllFilterData` |
| **请求方式** | `GET` |
| **数据格式** | `application/json` |
| **认证方式** | Bearer Token |

---

## 请求配置

### Headers

```http
Authorization: Bearer globaloneclick
Content-Type: application/json
```

---

## 请求参数

所有参数通过 **Query String** 传递：

| 参数名 | 类型 | 必填 | 说明 | 示例 |
|--------|------|------|------|------|
| `projectId` | Long | ✅ | 项目ID | `123456` |
| `startDate` | String | ✅ | 开始时间（格式：YYYY-MM-DD） | `2026-01-01` |
| `endDate` | String | ✅ | 结束时间（格式：YYYY-MM-DD） | `2026-01-31` |
| `platform` | String | ✅ | 广告平台 | `facebook` / `google` |
| `filterCampaignIdList` | List\<String\> | ❌ | 筛选的Campaign ID列表 | `["camp_001","camp_002"]` |
| `filterAccountIdList` | List\<String\> | ❌ | 筛选的广告账号ID列表 | `["acc_001","acc_002"]` |


---

## 请求示例

### 示例 1：基础查询（必填参数）

```http
GET https://api.globaloneclick.org/project/adsData/getAllFilterData?projectId=123456&startDate=2026-01-01&endDate=2026-01-31&platform=facebook
Authorization: Bearer globaloneclick
```

### 示例 2：带Campaign筛选

```http
GET https://api.globaloneclick.org/project/adsData/getAllFilterData?projectId=123456&startDate=2026-01-01&endDate=2026-01-31&platform=facebook&filterCampaignIdList=camp_001&filterCampaignIdList=camp_002
Authorization: Bearer globaloneclick
```

### 示例 3：带账号筛选

```http
GET https://api.globaloneclick.org/project/adsData/getAllFilterData?projectId=123456&startDate=2026-01-01&endDate=2026-01-31&platform=google&filterAccountIdList=acc_001&filterAccountIdList=acc_002
Authorization: Bearer globaloneclick
```

### 示例 4：完整筛选（JavaScript/cURL）

**使用 cURL**

```bash
curl -X GET "https://api.globaloneclick.org/project/adsData/getAllFilterData?projectId=123456&startDate=2026-01-01&endDate=2026-01-31&platform=facebook&filterCampaignIdList=camp_001&filterCampaignIdList=camp_002&filterAccountIdList=acc_001" \
  -H "Authorization: Bearer globaloneclick" \
  -H "Content-Type: application/json"
```

**使用 JavaScript (Fetch API)**

```javascript
const params = new URLSearchParams({
  projectId: '123456',
  startDate: '2026-01-01',
  endDate: '2026-01-31',
  platform: 'facebook'
});

// 添加数组参数
['camp_001', 'camp_002'].forEach(id => params.append('filterCampaignIdList', id));
['acc_001'].forEach(id => params.append('filterAccountIdList', id));

fetch(`https://api.globaloneclick.org/project/adsData/getAllFilterData?${params}`, {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer globaloneclick',
    'Content-Type': 'application/json'
  }
})
.then(response => response.json())
.then(data => console.log(data))
.catch(error => console.error('Error:', error));
```

**使用 Python (requests)**

```python
import requests

url = "https://api.globaloneclick.org/project/adsData/getAllFilterData"

headers = {
    "Authorization": "Bearer globaloneclick",
    "Content-Type": "application/json"
}

params = {
    "projectId": 123456,
    "startDate": "2026-01-01",
    "endDate": "2026-01-31",
    "platform": "facebook",
    "filterCampaignIdList": ["camp_001", "camp_002"],
    "filterAccountIdList": ["acc_001"]
}

response = requests.get(url, headers=headers, params=params)
data = response.json()
print(data)
```

---

## 响应数据

### 成功响应

**HTTP状态码**: `200 OK`

**响应结构**:

```json
{
  "code": 200,
  "msg": "操作成功",
  "data": [
    {
      "id": 1001,
      "platform": "facebook",
      "segments": "campaign",
      "recordDate": "2026-01-15",
      "projectId": 123456,
      "projectDisplayName": "示例项目",
      "accountId": "acc_001",
      "accountName": "Facebook广告账户1",
      "source": "facebook",
      "medium": "cpc",
      "campaignId": "camp_001",
      "campaignName": "新年促销活动",
      "campaignObjective": "CONVERSIONS",
      "campaignAdvertisingType": "AUCTION",
      "adsetId": "adset_001",
      "adsetName": "广告组1",
      "adsetStatus": "ACTIVE",
      "adsetType": "STANDARD",
      "adId": "ad_001",
      "adName": "春节广告1",
      "adStrength": "EXCELLENT",
      "finalUrls": "https://example.com/landing",
      "adImageUrl": "https://example.com/image.jpg",
      "adType": "IMAGE",
      "adStatus": "ACTIVE",
      "audienceSegments": "18-35岁女性",
      "country": "US",
      "device": "mobile",
      "region": "California",
      "genderType": "female",
      "ageRange": "25-34",
      "adTags": "tag1,tag2",
      "addToCart": 150.5,
      "addToWishlist": 80,
      "checkout": 120.0,
      "averagePageViews": 3.5,
      "bounceRate": 0.45,
      "clicks": 5000,
      "conversionValue": 15000.50,
      "conversion": 350.0,
      "allConversions": 400.0,
      "cost": 3000.00,
      "currency": "USD",
      "costUsd": 3000.00,
      "engagements": 8000,
      "impressions": 150000,
      "landingPageViews": 4500,
      "linkClicks": 4800,
      "postComments": 120,
      "postReactions": 2500,
      "postSaves": 300,
      "postShares": 150,
      "campaignBudget": 5000.00,
      "videoViews": 10000,
      "videoViews25": 8000,
      "videoViews50": 6000,
      "videoViews75": 4000,
      "videoViews100": 2500,
      "reach": 120000,
      "leads": 250,
      "subscribe": 180,
      "users": 95000,
      "sessions": 110000,
      "averageViewTime": 45.6,
      "dashboardCount": 500,
      "dashboardRevenue": 18000.00,
      "dashboardRevisitCount": 12000,
      "gaCurrency": "USD",
      "gaConvertedRevenue": 18500.00,
      "category": "电商",
      "productSeries": "服饰系列",
      "extra": "{\"customField\":\"value\"}",
      "watchTimeDuration": 120.5
    }
  ]
}
```

### 响应字段说明

#### 基础信息字段

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `id` | Long | 数据记录主键ID |
| `platform` | String | 广告平台（如：facebook, google, tiktok） |
| `segments` | String | 数据类型/维度 |
| `recordDate` | String | 记录日期（格式：YYYY-MM-DD） |
| `projectId` | Long | 项目ID |
| `projectDisplayName` | String | 项目全名 |

#### 账号信息

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `accountId` | String | 广告账号ID |
| `accountName` | String | 广告账号名称 |
| `source` | String | 流量来源 |
| `medium` | String | 流量媒介 |

#### Campaign层级

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `campaignId` | String | Campaign ID |
| `campaignName` | String | Campaign名称 |
| `campaignObjective` | String | Campaign目标（如：CONVERSIONS, TRAFFIC） |
| `campaignAdvertisingType` | String | Campaign类型 |
| `campaignBudget` | BigDecimal | Campaign预算 |

#### Adset层级

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `adsetId` | String | Adset ID |
| `adsetName` | String | Adset名称 |
| `adsetStatus` | String | Adset状态（ACTIVE/PAUSED/DELETED） |
| `adsetType` | String | Adset类型 |

#### Ad层级

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `adId` | String | Ad ID |
| `adName` | String | Ad名称 |
| `adStrength` | String | 广告强度评分 |
| `adType` | String | 广告类型 |
| `adStatus` | String | 广告状态 |
| `adImageUrl` | String | 广告素材URL |
| `finalUrls` | String | 广告落地页URL |
| `adTags` | String | 广告标签 |

#### 受众定向

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `audienceSegments` | String | 广告受众 |
| `country` | String | 国家 |
| `region` | String | 地区 |
| `device` | String | 设备类型 |
| `genderType` | String | 性别 |
| `ageRange` | String | 年龄段 |

#### 核心指标

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `impressions` | Long | 展示次数 |
| `clicks` | Long | 点击次数 |
| `cost` | BigDecimal | 广告花费 |
| `costUsd` | BigDecimal | 美元花费 |
| `currency` | String | 货币类型 |
| `reach` | Long | 触达人数 |
| `engagements` | Long | 互动数 |

#### 转化指标

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `conversion` | BigDecimal | 购买次数 |
| `conversionValue` | BigDecimal | 购买金额 |
| `allConversions` | BigDecimal | 总转换数 |
| `addToCart` | BigDecimal | 加购数 |
| `addToWishlist` | Long | 加心愿单数 |
| `checkout` | BigDecimal | 下单数 |
| `leads` | Long | 潜在客户线索数 |
| `subscribe` | Long | 订阅行为数 |

#### 互动指标

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `linkClicks` | Long | 链接点击数 |
| `landingPageViews` | Long | 落地页浏览数 |
| `postComments` | Long | 帖子评论数 |
| `postReactions` | Long | 帖子回复数 |
| `postSaves` | Long | 帖子保存数 |
| `postShares` | Long | 帖子分享数 |

#### 视频指标

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `videoViews` | Long | 视频浏览数 |
| `videoViews25` | Long | 视频浏览到25%数 |
| `videoViews50` | Long | 视频浏览到50%数 |
| `videoViews75` | Long | 视频浏览到75%数 |
| `videoViews100` | Long | 视频浏览到100%数 |
| `watchTimeDuration` | BigDecimal | 观看时长 |

#### GA4指标

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `users` | Long | 用户数 |
| `sessions` | Long | 会话数 |
| `averagePageViews` | BigDecimal | 平均页面浏览数 |
| `bounceRate` | BigDecimal | 跳出率 |
| `averageViewTime` | BigDecimal | 平均浏览时间 |
| `gaCurrency` | String | GA4平台配置的货币 |
| `gaConvertedRevenue` | BigDecimal | 指定货币类型转换后的值 |

#### 仪表板指标

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `dashboardCount` | Long | 浓度报告count |
| `dashboardRevenue` | BigDecimal | 浓度报告对应revenue |
| `dashboardRevisitCount` | Long | 浓度报告对应回访人数 |

#### 分类信息

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `category` | String | Ad所属的大类 |
| `productSeries` | String | UTM campaign对应的产品系列 |
| `extra` | String | 额外信息（JSON格式） |

---

## 错误响应

### 参数缺失

**HTTP状态码**: `400 Bad Request`

```json
{
  "code": 400,
  "msg": "项目id不能为空"
}
```

### 未授权

**HTTP状态码**: `401 Unauthorized`

```json
{
  "code": 401,
  "msg": "未授权，请先登录"
}
```

### 服务器错误

**HTTP状态码**: `500 Internal Server Error`

```json
{
  "code": 500,
  "msg": "系统内部错误"
}
```

---

## 常见错误码

| 错误码 | 说明 | 解决方案 |
|--------|------|----------|
| 400 | 参数验证失败 | 检查必填参数是否传递，格式是否正确 |
| 401 | 未授权 | 检查Authorization Header是否正确 |
| 404 | 资源不存在 | 确认projectId是否存在 |
| 500 | 服务器内部错误 | 联系技术支持 |

---

## 注意事项

> [!IMPORTANT]
> 1. **数据量提示**：此接口返回所有符合条件的数据，不分页，可能返回大量数据，建议合理设置时间范围
> 2. **时间格式**：startDate和endDate必须使用 `YYYY-MM-DD` 格式（如：2026-01-15）
> 3. **认证方式**：必须在Header中携带正确的Bearer Token

> [!WARNING]
> - 日期范围过大可能导致请求超时，建议单次查询不超过90天
> - 数组参数传递时，需多次使用同一参数名（如：`filterCampaignIdList=id1&filterCampaignIdList=id2`）

> [!TIP]
> - 优先使用filterCampaignIdList和filterAccountIdList进行精准筛选，可提高查询效率
> - 建议分批次获取数据，避免一次性查询过大时间范围

---

## 使用场景

1. **数据分析**：获取特定时间段的广告数据用于分析
2. **报表生成**：导出完整数据用于生成自定义报表
3. **数据同步**：将广告数据同步到第三方系统
4. **性能监控**：监控特定Campaign或Account的表现
5. **趋势分析**：分析不同维度的数据趋势

---

## 版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0 | 2026-01-29 | 初始版本 |

---

## 技术支持

如有问题，请联系技术支持团队。
