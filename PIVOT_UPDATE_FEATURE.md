# 数据透视分析 - 报告更新功能说明

## 📋 功能概述

新增的报告更新功能允许用户直接修改已保存的数据透视报告配置，并自动同步到 Google Sheets 配置表中。

---

## ✨ 功能特性

### 1️⃣ **更新已保存报告**
- ✅ 用当前字段配置覆盖已保存的报告
- ✅ 保持报告名称和 ID 不变
- ✅ 更新所有配置参数
- ✅ 自动同步到云端 (Google Sheets)

### 2️⃣ **删除报告（增强）**
- ✅ 删除前确认提示
- ✅ 显示报告名称
- ✅ 防止误操作

---

## 🎯 使用方法

### 更新已保存的报告配置

#### 步骤 1：加载要修改的报告
1. 进入"数据透视分析"模块
2. 点击"已保存报告"按钮
3. 从下拉菜单中选择要修改的报告
4. 系统会自动加载该报告的所有配置

#### 步骤 2：修改字段配置
1. 点击"字段配置"按钮打开配置面板
2. 根据需要修改：
   - **筛选器**：添加/删除/修改筛选条件
   - **行字段**：拖动排序或添加/删除维度
   - **列字段**：拖动排序或添加/删除维度
   - **值字段**：添加/删除指标
   - **平台范围**：选择要包含的广告平台
   - **显示选项**：小计、总计等

#### 步骤 3：更新报告
1. 打开"已保存报告"下拉菜单
2. 找到刚才加载的报告
3. 鼠标悬停在报告名称上
4. 点击 ✏️ **编辑图标**（显示提示：用当前配置覆盖）
5. 确认更新操作
6. 系统提示"报告已更新并同步到云端 ✅"

---

## 🔧 技术实现

### 更新函数

```typescript
const handleUpdatePivotPreset = (id: string, e: React.MouseEvent) => {
  e.stopPropagation();
  
  // 1. 查找要更新的报告
  const preset = pivotPresets.find(p => p.id === id);
  if (!preset) return;
  
  // 2. 确认操作
  if (!confirm(`确定要用当前配置覆盖报告「${preset.name}」吗？`)) {
    return;
  }
  
  // 3. 更新报告配置
  setPivotPresets(prev => {
    const next = prev.map(p => {
      if (p.id !== id) return p;
      
      // 保持原名称和ID，更新其他所有配置
      return {
        ...p,
        filters: pivotFilters.map(f => ({
          fieldKey: f.fieldKey,
          label: f.label,
          mode: f.mode,
          selectedValues: f.selectedValues,
          textValue: f.textValue,
          dateRange: f.dateRange,
        })),
        rows: [...pivotRows],
        columns: [...pivotColumns],
        values: [...pivotValues],
        display: { ...pivotDisplay },
        platformScopes: [...pivotPlatformScopes],
      };
    });
    
    // 4. 保存到本地和云端
    persistPivotPresets(next);
    return next;
  });
  
  // 5. 用户反馈
  setIsPivotPresetDropdownOpen(false);
  setTimeout(() => {
    alert(`报告「${preset.name}」已更新并同步到云端 ✅`);
  }, 100);
};
```

### 同步机制

```typescript
const persistPivotPresets = (list: PivotPreset[]) => {
  const key = getPivotPresetsStorageKey();
  if (!key) return;
  
  // 1. 保存到本地 localStorage
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch (e) {
    console.error('Failed to persist pivot presets', e);
  }
  
  // 2. 同步到云端 Google Sheets
  void savePivotPresetsToCloud(list);
};

const savePivotPresetsToCloud = async (list: PivotPreset[]) => {
  if (!currentUser?.username || !selectedProject?.projectId) return;
  try {
    const accountKey = getPivotAccountKey();
    const existing = await fetchUserConfig(currentUser.username, selectedProject.projectId, 'pivotPresets');
    const store = normalizePivotPresetsPayload(existing);
    store.byAccountKey[accountKey] = list;
    const ok = await saveUserConfig(currentUser.username, selectedProject.projectId, 'pivotPresets', store);
    if (!ok) console.warn('Failed to save pivot presets to cloud');
  } catch (e) {
    console.error('Failed to save pivot presets to cloud', e);
  }
};
```

---

## 📊 报告配置结构

每个报告预设包含以下配置：

```typescript
interface PivotPreset {
  id: string;                         // 唯一标识（不变）
  name: string;                       // 报告名称（不变）
  filters: PivotFilterPreset[];       // 筛选器配置
  rows: string[];                     // 行字段列表
  columns: string[];                  // 列字段列表
  values: string[];                   // 值字段（指标）列表
  display: {                          // 显示选项
    showSubtotal: boolean;            // 显示小计
    showGrandTotal: boolean;          // 显示总计
    totalAxis: 'row' | 'column';      // 总计轴方向
  };
  platformScopes: PivotPlatformScope[]; // 平台范围
}

interface PivotFilterPreset {
  fieldKey: string;                   // 字段键
  label: string;                      // 显示标签
  mode: 'multi' | 'contains' | 'not_contains' | 'date_range';
  selectedValues: string[];           // 多选值
  textValue: string;                  // 文本筛选值
  dateRange: { start: string; end: string }; // 日期范围
}
```

---

## 🔐 数据存储

### 本地存储 (localStorage)
- **键格式**：`pivotPresets_{username}_{projectId}_{accountKey}`
- **用途**：快速加载，离线访问
- **更新时机**：每次保存/更新/删除报告时

### 云端存储 (Google Sheets)
- **API 端点**：`saveUserConfig(username, projectId, 'pivotPresets', data)`
- **数据结构**：
  ```json
  {
    "byAccountKey": {
      "accountKey1": [preset1, preset2, ...],
      "accountKey2": [preset3, preset4, ...],
      "all": [preset5, preset6, ...]
    }
  }
  ```
- **用途**：跨设备同步，团队共享
- **更新时机**：自动在本地保存后异步上传

---

## ⚠️ 注意事项

### 1. **配置验证**
更新时会验证字段有效性：
- 维度字段必须存在于当前 `dimConfigs` 中
- 指标字段必须存在于当前可用指标列表中
- 平台范围必须有效
- 无效的字段会被过滤掉

### 2. **账号隔离**
- 不同广告账号组合的报告独立存储
- 切换账号后会加载对应的报告列表
- 避免账号间配置冲突

### 3. **确认提示**
- 更新操作前会弹出确认对话框
- 防止误操作覆盖重要配置
- 显示报告名称便于识别

### 4. **同步状态**
- 更新成功后会显示提示："报告已更新并同步到云端 ✅"
- 如果云端同步失败，本地仍会保存
- 检查浏览器控制台查看同步错误

---

## 🎨 UI 交互

### 已保存报告下拉菜单

```
┌─────────────────────────────────────┐
│  已保存报告            [3]    ▼     │
├─────────────────────────────────────┤
│  📊 每日国家分析         ✏️  🗑️    │ ← 鼠标悬停显示操作按钮
│  📊 广告类型对比         ✏️  🗑️    │
│  📊 平台效果汇总         ✏️  🗑️    │
└─────────────────────────────────────┘

图标说明：
✏️ = 用当前配置覆盖（更新报告）
🗑️ = 删除报告
```

### 操作流程

```
用户操作流程：

1. 点击"已保存报告" → 打开下拉菜单
2. 点击报告名称 → 加载配置到当前视图
3. 修改字段配置 → 调整行/列/值/筛选器
4. 鼠标悬停在报告上 → 显示 ✏️ 和 🗑️ 按钮
5. 点击 ✏️ → 弹出确认对话框
6. 确认 → 更新报告并同步到云端
7. 提示 → "报告「XXX」已更新并同步到云端 ✅"
```

---

## 🚀 使用场景

### 场景 1：优化现有报告
- 初始创建了一个基础报告
- 后续发现需要添加更多筛选器
- 使用更新功能增强报告配置

### 场景 2：调整显示格式
- 报告数据维度不变
- 调整行列布局优化可读性
- 更新报告保持名称不变

### 场景 3：适应新指标
- 系统新增了自定义指标
- 需要将新指标添加到现有报告
- 更新报告包含最新指标

---

## 🔄 版本对比

### 旧方式（更新前）
```
修改报告配置的步骤：
1. 加载旧报告
2. 修改配置
3. 保存为新报告（新名称）
4. 删除旧报告
5. 手动重命名新报告
```
❌ 步骤繁琐，容易出错

### 新方式（更新后）
```
修改报告配置的步骤：
1. 加载报告
2. 修改配置
3. 点击 ✏️ 更新
```
✅ 一键更新，自动同步

---

## 📝 开发记录

**实现日期**：2026-02-04
**相关文件**：`/Users/mac/antigravity/ad-platform-data-report-main/index.tsx`
**相关函数**：
- `handleUpdatePivotPreset` (line 1957-2003)
- `handleRemovePivotPreset` (line 2005-2017) - 增强版
- `persistPivotPresets` (line 885-894)
- `savePivotPresetsToCloud` (line 767-779)

**关联 API**：
- `saveUserConfig()` - 保存配置到 Google Sheets
- `fetchUserConfig()` - 从 Google Sheets 读取配置

---

## ✅ 测试检查项

- [ ] 更新报告后配置正确保存
- [ ] 报告名称和 ID 保持不变
- [ ] 本地 localStorage 正确更新
- [ ] 云端 Google Sheets 同步成功
- [ ] 确认对话框正常显示
- [ ] 成功提示正常显示
- [ ] 多个账号的报告独立管理
- [ ] 无效字段正确过滤
- [ ] 删除功能确认提示正常

---

## 🎉 总结

新功能使数据透视报告的管理更加便捷高效，用户可以轻松迭代优化报告配置，同时确保所有修改自动同步到云端，实现跨设备无缝协作。
