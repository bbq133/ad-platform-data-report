# 定时报表发送 - Google Apps Script 配置指南

## 概述

前端部分已经完成（定时任务配置界面 + 历史发送记录），但 **实际的定时执行和邮件发送** 需要在 Google Apps Script 中部署。

本指南将引导你完成所有手动配置步骤。

---

## 第一步：确认 UserConfigs 工作表结构

打开你的 Google Sheet：
```
https://docs.google.com/spreadsheets/d/1rdNtMU_IfrhKPDl6xqXPFVn1vf-rm85zTVvR5ArSmWc/edit
```

### 1.1 确认 UserConfigs 工作表

前端保存定时任务配置时，会写入 `UserConfigs` 工作表，格式为：

| user | projectId | type | data |
|------|-----------|------|------|
| admin | 47 | pivotPresets | {JSON...} |
| admin | 47 | scheduledReports | {JSON...} |

其中 `type = 'scheduledReports'` 的行就是定时任务配置。

**你需要确认**：当前的 `UserConfigs` 工作表的列顺序是否是 `A=user, B=projectId, C=type, D=data`。如果不是，需要调整 `ScheduledReports.gs` 中 `getAllUserConfigs` 函数的列索引。

### 1.2 如果 UserConfigs 还没有这个表

如果你的 Google Sheet 中还没有 `UserConfigs` 工作表，说明 `saveUserConfig` 函数会自动在你现有的 GAS 代码中创建它。在前端页面中创建一个定时任务并保存后，观察 Sheet 中是否出现了对应数据即可。

---

## 第二步：部署 Apps Script 代码

### 2.1 打开 Apps Script 编辑器

1. 在 Google Sheet 中点击 **扩展程序 (Extensions)** > **Apps Script**
2. 这会打开你已有的 Apps Script 项目（前端的 `GAS_API_URL` 指向的那个项目）

### 2.2 添加 ScheduledReports.gs

1. 在 Apps Script 编辑器左侧的文件列表中，点击 **+** > **脚本 (Script)**
2. 将新文件命名为 `ScheduledReports`
3. 将本仓库中 `gas-scripts/ScheduledReports.gs` 的 **全部内容** 复制粘贴进去
4. 保存（Ctrl+S）

### 2.3 确认配置常量

在 `ScheduledReports.gs` 文件顶部，确认以下常量与你的实际环境一致：

```javascript
var TIMEZONE = 'Asia/Shanghai';                                    // 时区
var SPREADSHEET_ID = '1rdNtMU_IfrhKPDl6xqXPFVn1vf-rm85zTVvR5ArSmWc'; // Google Sheet ID
var USER_CONFIGS_SHEET = 'UserConfigs';                            // 配置表名称

var AD_API_BASE = 'https://api.globaloneclick.org';                // 广告数据 API
var AD_API_TOKEN = 'globaloneclick';                               // API Token
var AD_API_CLIENT_ID = 'dce41dca2ad7cfaa5c3e306472571f0d';         // Client ID
```

---

## 第三步：创建定时触发器 (Time-driven Trigger)

### 3.1 手动创建触发器

1. 在 Apps Script 编辑器中，点击左侧菜单的 **触发器 (Triggers)**（时钟图标）
2. 点击右下角 **+ 添加触发器 (Add Trigger)**
3. 配置如下：

| 配置项 | 值 |
|--------|-----|
| 选择要运行的函数 | `processScheduledReports` |
| 选择运行的部署 | `Head` |
| 选择事件来源 | `时间驱动 (Time-driven)` |
| 选择时间触发器类型 | `分钟定时器 (Minutes timer)` |
| 选择时间间隔 | `每 10 分钟 (Every 10 minutes)` 或 `每 30 分钟 (Every 30 minutes)` |

> **建议**：测试阶段用 `每 10 分钟`，稳定后可改为 `每 30 分钟` 或 `每小时` 以减少执行次数。

4. 点击 **保存 (Save)**

### 3.2 授权

第一次保存触发器时，Google 会弹出授权弹窗：

1. 选择你的 Google 账号
2. 如果提示"此应用未经过 Google 验证"，点击 **高级 (Advanced)** > **前往 xxx（不安全）**
3. 授予以下权限：
   - **Google Sheets** - 读写 Sheet 数据
   - **Google Drive** - 创建和管理 Spreadsheet 文件
   - **Gmail** - 发送邮件（MailApp 需要此权限）

---

## 第四步：测试

### 4.1 在前端创建测试任务

1. 在广告数据报告平台中，选择一个项目
2. 切换到 **定时任务** Tab
3. 点击 **新建定时任务**
4. 配置：
   - 任务名称：`测试日报`
   - 选择 1-2 个已保存的报告
   - 频率：`每天`
   - 时间：选择当前时间 **之后 10-20 分钟** 的最近时间点
   - 邮箱：填写你自己的邮箱
   - 启用
5. 保存

### 4.2 手动触发测试

不想等触发器自动执行？可以手动测试：

1. 在 Apps Script 编辑器中，选择函数 `processScheduledReports`
2. 点击 **运行 (Run)** 按钮
3. 查看 **执行日志 (Execution log)** 确认输出
4. 检查邮箱是否收到邮件
5. 检查邮件中的 Google Sheet 链接是否能正常打开

### 4.3 检查日志

如果执行有问题：

1. Apps Script 编辑器 > 左侧 **执行记录 (Executions)**
2. 点击具体的执行记录查看详细日志
3. 常见问题：
   - `找不到 UserConfigs 工作表`：检查 Sheet 名称是否匹配
   - `API 未返回数据`：检查 projectId 和 API Token
   - `找不到用户的 pivotPresets 配置`：确保该用户在该项目下有已保存的报告
   - `邮件发送失败`：检查 MailApp 日配额（免费 Google 账号每天 100 封，Workspace 账号每天 1500 封）

---

## 第五步：确认前端已有的 GAS Web App 支持 scheduledReports

你现有的 GAS Web App（处理 `doGet`/`doPost` 的那个文件）需要能够处理 `type = 'scheduledReports'` 的读写请求。

因为前端使用的是通用的 `fetchUserConfig/saveUserConfig` 接口，它们只是在请求参数中把 `type` 设为 `'scheduledReports'`。如果你现有的 GAS 代码对 `type` 值没有白名单限制（即不管 type 是什么值都统一存入 `UserConfigs`），那么 **不需要任何修改**。

如果你的 GAS 代码中对 `type` 有校验（比如只允许 `metrics/dimensions/formulas/pivotPresets/bi`），则需要：

在处理 POST 请求的代码中，找到类似：
```javascript
var allowedTypes = ['metrics', 'dimensions', 'formulas', 'pivotPresets', 'bi'];
```

添加 `'scheduledReports'`：
```javascript
var allowedTypes = ['metrics', 'dimensions', 'formulas', 'pivotPresets', 'bi', 'scheduledReports'];
```

同样在 GET 请求（`getConfig` action）中也确认没有对 type 做过滤。

---

## 架构总结

```
前端 (React/Vite)                    Google Sheet                        Apps Script
─────────────────                    ────────────                        ───────────
                                     
定时任务配置面板  ──save──>  UserConfigs (type='scheduledReports')
                                             │
                                             │  每 10 分钟
                                             ▼
                                     processScheduledReports()
                                             │
                                     ┌───────┴────────┐
                                     │                │
                              读取 pivotPresets    调用广告 API
                                     │                │
                                     └───────┬────────┘
                                             │
                                     生成 Google Spreadsheet
                                     (每个报告一个 Sheet Tab)
                                             │
                                     MailApp 发送邮件
                                     (包含文档链接)
                                             │
                                     写回 logs 到 UserConfigs
                                             │
                                             ▼
历史发送记录面板  <──load──  UserConfigs (logs 字段)
```

---

## 注意事项

1. **Apps Script 执行时间限制**：单次执行最长 6 分钟（免费账号）/ 30 分钟（Workspace）。如果报告数据量很大，可能需要优化。

2. **MailApp 配额**：
   - 免费 Google 账号：每天最多 100 封
   - Google Workspace：每天最多 1500 封

3. **Spreadsheet 大小限制**：单个 Spreadsheet 最多 1000 万个单元格。如果数据量特别大，建议在定时任务中限制日期范围。

4. **时区**：脚本中硬编码为 `Asia/Shanghai` (GMT+8)，如需修改请调整 `TIMEZONE` 常量。

5. **报表文件复用**：同一个任务会复用之前创建的 Spreadsheet（通过 `sheetFileId`），每次运行时清空重写数据，不会每次都创建新文件。
