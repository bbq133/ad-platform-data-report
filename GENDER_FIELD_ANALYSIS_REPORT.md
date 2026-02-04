# Gender 字段分析报告

**Project ID:** 26  
**Campaign:** US-META-AO-AO-CV-ROI-All-Image-RT-20250616-All-Adv-GOCAI2.0-MaxValue  
**Platform:** Meta (Facebook)  
**Date:** 2026-01-28  
**查询时间:** 2026-02-04

---

## 📊 核心发现

### ✅ **是的，该 Campaign 有返回 Gender 字段值！**

- **总数据条数:** 16 条
- **包含 Gender 数据:** 3 条（18.8%）
- **Gender 值分布:**
  - `FEMALE`: 1 条（花费 $148.69，展示 11,313 次，点击 159 次）
  - `MALE`: 1 条（花费 $316.47，展示 24,206 次，点击 264 次）
  - `UNDETERMINED`: 1 条（花费 $3.70，展示 372 次，点击 6 次）

---

## 🔍 详细分析

### 数据维度结构

API 返回的数据包含**三种不同的聚合层级**：

#### 1️⃣ **按性别维度聚合的数据**（3 条）
- ✅ **有 `genderType` 字段值**
- ❌ `ageRange` 为 null
- ❌ `adId` 和 `adName` 为 null
- ✅ 有 `adsetId` 和 `adsetName`
- **特征:** 数据在 Ad Set 层级按性别分组汇总

#### 2️⃣ **按年龄维度聚合的数据**（5 条）
- ❌ `genderType` 为 null
- ✅ **有 `ageRange` 字段值**（25_34、35_44、45_54、55_64、65_UP）
- ❌ `adsetId`、`adId` 和 `adName` 都为 null
- **特征:** 数据在 Campaign 层级按年龄分组汇总

#### 3️⃣ **具体广告级别的数据**（8 条）
- ❌ `genderType` 为 null
- ❌ `ageRange` 为 null
- ✅ 有具体的 `adId` 和 `adName`
- **特征:** 广告级别的明细数据，未按性别/年龄分组

---

## 📈 数据示例

### 有 Gender 字段的数据示例：

```json
{
  "campaignName": "US-META-AO-AO-CV-ROI-All-Image-RT-20250616-All-Adv-GOCAI2.0-MaxValue",
  "campaignId": "120225558015380532",
  "accountName": "EcoflowUS-OneClick-230103-03",
  "adsetName": "Other_AI2.0_All-MaxValue",
  "adsetId": "120225558015400532",
  "adName": null,
  "adId": null,
  "genderType": "FEMALE",
  "ageRange": null,
  "recordDate": "2026-01-28",
  "cost": 148.688055,
  "impressions": 11313,
  "clicks": 159
}
```

### 有 Age 字段但无 Gender 的数据示例：

```json
{
  "campaignName": "US-META-AO-AO-CV-ROI-All-Image-RT-20250616-All-Adv-GOCAI2.0-MaxValue",
  "campaignId": "120225558015380532",
  "accountName": "EcoflowUS-OneClick-230103-03",
  "adsetName": null,
  "adsetId": null,
  "adName": null,
  "adId": null,
  "genderType": null,
  "ageRange": "35_44",
  "recordDate": "2026-01-28",
  "cost": 103.536499,
  "impressions": 8571,
  "clicks": 75
}
```

---

## 💡 结论与建议

### ✅ 关于 Gender 字段的结论：

1. **API 确实返回了 Gender 字段值**
2. Gender 数据以**按性别维度聚合**的形式返回
3. 每个性别（FEMALE、MALE、UNDETERMINED）对应一条聚合记录
4. Gender 维度数据在 **Ad Set 层级**进行汇总

### ⚠️ 为什么界面显示"缺失维度：性别"？

可能的原因：

1. **前端未正确识别聚合数据结构**
   - 前端可能期望所有数据行都有 Gender 字段
   - 但实际上只有"按性别维度聚合"的数据才有 Gender 值

2. **数据合并逻辑问题**
   - 前端可能将所有数据类型混合在一起
   - 导致 81.3% 的数据（非性别维度的数据）被误判为"缺失 Gender"

3. **维度识别逻辑需要优化**
   - 应该识别数据的聚合类型（性别维度 vs 年龄维度 vs 广告明细）
   - 根据数据类型决定是否应该有 Gender 字段

### 🔧 建议的解决方案：

1. **分离不同维度的数据**
   ```javascript
   // 性别维度数据
   const genderData = allData.filter(row => row.genderType && !row.adId);
   
   // 年龄维度数据
   const ageData = allData.filter(row => row.ageRange && !row.adId);
   
   // 广告明细数据
   const adData = allData.filter(row => row.adId);
   ```

2. **更新维度缺失检测逻辑**
   ```javascript
   // 检查是否有按性别维度聚合的数据
   const hasGenderDimension = allData.some(row => 
     row.genderType && row.genderType !== null
   );
   
   if (!hasGenderDimension) {
     // 真正的缺失：完全没有性别维度数据
     showWarning("缺失维度：性别");
   }
   ```

3. **在界面上明确区分数据类型**
   - "性别分布数据"（按性别聚合）
   - "年龄分布数据"（按年龄聚合）
   - "广告明细数据"（广告级别）

---

## 📝 API 请求参数说明

无论是否添加 `segment=gender_adset_date` 参数，API 都会返回相同的结果：

```
# 不带 segment 参数
GET /project/adsData/getAllFilterData?projectId=26&startDate=2026-01-28&endDate=2026-01-28&platform=facebook

# 带 gender_adset_date segment 参数
GET /project/adsData/getAllFilterData?projectId=26&startDate=2026-01-28&endDate=2026-01-28&platform=facebook&segment=gender_adset_date

# 结果：两者返回的数据完全相同
```

这说明后端可能**默认就返回所有维度的数据**，或者该项目的配置已经包含了性别和年龄维度。

---

## 🎯 最终答案

**问：projectid 26 的这条 campaign 和广告平台在 2026-01-28 有没有返回 gender 字段值？**

**答：✅ 有！**

- 返回了 3 条包含 Gender 字段值的数据
- Gender 值包括：`FEMALE`、`MALE`、`UNDETERMINED`
- 这些数据是按性别维度在 Ad Set 层级聚合的结果
- 总花费：$468.86（FEMALE: $148.69 + MALE: $316.47 + UNDETERMINED: $3.70）
- 总展示：35,891 次
- 总点击：429 次

界面显示"缺失维度：性别"可能是前端数据处理逻辑的误判，实际上 API 已经正确返回了性别维度数据。
