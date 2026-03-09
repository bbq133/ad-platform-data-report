# 飞书定时报表 - 部署操作指南

## 目录

1. [飞书应用配置](#1-飞书应用配置)
2. [创建飞书云文档文件夹](#2-创建飞书云文档文件夹)
3. [创建 Google Apps Script 新项目](#3-创建-google-apps-script-新项目)
4. [复制脚本文件](#4-复制脚本文件)
5. [配置脚本属性](#5-配置脚本属性)
6. [部署为 Web App](#6-部署为-web-app)
7. [配置定时触发器](#7-配置定时触发器)
8. [验证测试](#8-验证测试)
9. [前端接入（后续步骤）](#9-前端接入后续步骤)

---

## 1. 飞书应用配置

你已有 App ID：`cli_a923f13c0b7a1bd6`，只需确认权限已开通。

### 1.1 登录飞书开放平台

1. 浏览器打开 https://open.feishu.cn/
2. 用管理员账号登录 → 进入「开发者后台」
3. 找到你的应用（App ID = `cli_a923f13c0b7a1bd6`）并点击进入

### 1.2 开通 API 权限

进入应用 →「权限管理」→ 搜索并开通以下权限：

| 权限名称 | 权限 ID | 用途 |
|---------|---------|------|
| 查看、编辑和管理电子表格 | `sheets:spreadsheet` | 创建飞书表格、写入数据 |
| 查看、评论和管理云空间中所有文件 | `drive:drive` | 设置表格分享权限 |
| 以应用身份读取通讯录 | `contact:contact:readonly_as_app` | 获取部门和用户列表 |
| 获取用户邮箱信息 | `contact:user.email:readonly` | 获取用户飞书邮箱 |

> **注意**：权限 ID 仅供参考，不同版本可能有差异。在权限管理页面搜索关键词即可找到。

### 1.3 设置通讯录权限范围

进入应用 →「通讯录权限范围」→ 选择需要读取的部门范围（建议选"全部员工"或你需要发送报表的部门）。

### 1.4 发布应用

进入「版本管理与发布」→ 创建新版本 → 填写版本号和更新说明 → 提交审核/发布。

> **重要：未发布的应用，API 权限不会生效。**

---

## 2. 创建飞书云文档文件夹

报表生成后会创建为飞书电子表格文件，需要一个存放位置。

1. 打开飞书 → 云文档 → 我的空间（或团队空间）
2. 新建一个文件夹，例如命名为「广告数据报表」
3. 打开该文件夹，从浏览器地址栏复制 URL，格式类似：
   ```
   https://xxx.feishu.cn/drive/folder/abcdefghijk
   ```
4. 最后的 `abcdefghijk` 就是 **folder_token**，记下来备用  
5. **重要**：在该文件夹中，将你的飞书应用添加为「协作者」（右键文件夹 → 分享/协作 → 添加协作者 → 选择应用），否则创建表格时会因无文件夹权限而失败或创建到应用根目录。

> 如果不需要指定文件夹（直接创建在应用空间根目录），可以跳过此步骤，脚本属性中不配置 `FEISHU_FOLDER_TOKEN` 即可。

---

## 3. 创建 Google Apps Script 新项目

1. 打开 https://script.google.com/
2. 点击左侧 **「+ New project」**
3. 将项目重命名为：**`飞书定时报表`**（或 `gas-scripts-feishu`）

> **不要** 在现有的「ad数据分析」项目中操作，保持原项目不变。

---

## 4. 复制脚本文件

新项目中默认有一个 `Code.gs` 文件。你需要：

### 4.1 重命名默认文件

将默认的 `Code.gs` 重命名为 `CodeFeishu.gs`（点击文件名旁边的 ▼ → 重命名）。

### 4.2 逐个创建文件并粘贴内容

点击 **「+」→ 脚本** 来新建 .gs 文件。需要创建以下文件：

| 序号 | 文件名 | 对应仓库文件 | 说明 |
|------|--------|-------------|------|
| 1 | `CodeFeishu.gs` | `gas-scripts-feishu/CodeFeishu.gs` | Web App 入口（替换默认 Code.gs） |
| 2 | `Config.gs` | `gas-scripts-feishu/Config.gs` | 配置常量 |
| 3 | `FeishuAuth.gs` | `gas-scripts-feishu/FeishuAuth.gs` | 飞书鉴权 |
| 4 | `FeishuContacts.gs` | `gas-scripts-feishu/FeishuContacts.gs` | 飞书通讯录 |
| 5 | `FeishuSheets.gs` | `gas-scripts-feishu/FeishuSheets.gs` | 飞书电子表格 |
| 6 | `DataService.gs` | `gas-scripts-feishu/DataService.gs` | 数据拉取/转换/透视 |
| 7 | `FeishuScheduledReports.gs` | `gas-scripts-feishu/FeishuScheduledReports.gs` | 飞书定时任务核心 |

**操作步骤**（每个文件重复）：
1. 在 Apps Script 编辑器左侧，点击 **「文件」旁边的「+」→ 脚本**
2. 输入文件名（不需要 `.gs` 后缀，编辑器会自动加）
3. 清空默认内容
4. 打开仓库 `gas-scripts-feishu/` 下对应的文件，**全选复制** 内容
5. 粘贴到 Apps Script 编辑器中
6. **Ctrl+S** 保存

最终你的项目文件列表应该是：

```
飞书定时报表/
  ├── CodeFeishu.gs
  ├── Config.gs
  ├── FeishuAuth.gs
  ├── FeishuContacts.gs
  ├── FeishuSheets.gs
  ├── DataService.gs
  └── FeishuScheduledReports.gs
```

---

## 5. 配置脚本属性

这一步将飞书凭证安全地存储在脚本属性中，不写入代码。

1. 在 Apps Script 编辑器中，点击左侧齿轮图标 **「项目设置」**
2. 滚动到底部，找到 **「脚本属性」**
3. 点击 **「添加脚本属性」**，逐个添加：

| 属性 | 值 |
|------|----|
| `FEISHU_APP_ID` | `cli_a923f13c0b7a1bd6` |
| `FEISHU_APP_SECRET` | `zNLIbbIcaIIeQ1INSqhpCd8lfTYJxbuq` |
| `FEISHU_FOLDER_TOKEN` | 上面第 2 步获取的文件夹 token（**必填**才能让新表格出现在该文件夹；例如 URL 为 `.../folder/Pd2ifswftldD2KdZvHKcWgeyn6e` 则填 `Pd2ifswftldD2KdZvHKcWgeyn6e`） |

4. 点击 **「保存脚本属性」**

> **若新表格没有出现在指定文件夹**：① 确认脚本属性里有 `FEISHU_FOLDER_TOKEN` 且值为文件夹 URL 中最后一串（如 `Pd2ifswftldD2KdZvHKcWgeyn6e`）；② 确认该文件夹已把飞书应用添加为协作者。执行后查看日志中 `[飞书] 创建新表格，FEISHU_FOLDER_TOKEN=` 若显示 `(未配置...)` 说明未读到该属性。

---

## 6. 部署为 Web App

1. 在 Apps Script 编辑器中，点击右上角 **「部署」→「新建部署」**
2. 点击齿轮图标 → 选择 **「Web 应用」**
3. 配置：
   - **说明**：飞书定时报表 Web App
   - **执行身份**：我自己（你的 Google 账号）
   - **谁有权访问**：任何人（Anyone）
4. 点击 **「部署」**
5. **首次部署会请求授权**：点击「授权访问」→ 选择你的 Google 账号 → 「高级」→「转至 xxx（不安全）」→「允许」
6. 部署成功后，复制 **Web App URL**，格式类似：
   ```
   https://script.google.com/macros/s/AKfycbw.../exec
   ```
7. **记下这个 URL**，后面前端需要用到（配置为 `FEISHU_GAS_API_URL`）

> 每次修改代码后，需要「部署」→「管理部署」→ 编辑已有部署 → 版本选「新版本」→ 部署，才能让改动生效。

---

## 7. 配置定时触发器

1. 在 Apps Script 编辑器左侧，点击时钟图标 **「触发器」**
2. 点击右下角 **「+ 添加触发器」**
3. 配置：
   - **要运行的函数**：`processFeishuScheduledReports`
   - **部署版本**：Head
   - **事件来源**：时间驱动
   - **触发器类型**：分钟计时器
   - **间隔**：每 10 分钟（或根据需要选择每小时）
4. 点击 **「保存」**

---

## 8. 验证测试

### 8.1 测试飞书鉴权

1. 在 Apps Script 编辑器中，选择函数 `getFeishuTenantAccessToken`
2. 点击 **「运行」**
3. 查看执行日志（查看 → 日志），如果没有报错说明鉴权成功

### 8.2 测试获取通讯录

1. 选择函数 `getFeishuDepartments`（需要临时写个测试函数调用它）
2. 或者直接在浏览器访问：
   ```
   你的WebAppURL?action=feishuDepartments&parentDepartmentId=0
   ```
3. 如果返回部门列表 JSON，说明通讯录权限正常

### 8.3 手动测试完整流程

1. 选择函数 `processFeishuScheduledReportsForce`
2. 点击 **「运行」**
3. 注意：需要先在 UserConfigs 中有 `type = feishuScheduledReports` 的配置数据（前端接入后才会有）

---

## 9. 前端接入（后续步骤）

以下改动需要在前端代码中完成：

### 9.1 配置新的 GAS URL

在 `api-config.ts` 中新增：
```typescript
FEISHU_GAS_API_URL: '你的WebAppURL',
```

### 9.2 新增 API 函数

在 `api-service.ts` 中新增飞书相关函数：
- `fetchFeishuDepartments()` - 获取部门列表
- `fetchFeishuUsers(departmentId)` - 获取部门用户
- `saveFeishuScheduledReportsConfig()` - 保存飞书定时任务配置
- `testFeishuScheduledReport()` - 测试发送

### 9.3 新增/修改 UI 组件

在 `ScheduledReportsPanel.tsx` 中（或新建组件）：
- 增加「Google 报表 / 飞书报表」切换
- 飞书模式下，用部门/用户选择器替代邮箱输入框
- 调用飞书 API 获取部门树和用户列表

---

## 常见问题

### Q: 飞书 API 报 99991663 错误

权限未申请或未发布应用。请确认第 1 步中的权限已开通，并且应用已发布。

### Q: 创建表格成功但邮件中链接打不开

飞书文档默认只有创建者可以访问。脚本会自动尝试设置「链接可读」权限，如果失败，需要确认应用有「管理云空间」权限。

### Q: MailApp 发送邮件配额

免费 Google 账号每天 100 封，Google Workspace 账号每天 1500 封。

### Q: 如何获取 folder_token？

打开飞书云文档中的目标文件夹，浏览器地址栏 URL 最后一段即为 folder_token。例如 URL 为 `https://xxx.feishu.cn/drive/folder/abc123`，则 folder_token 为 `abc123`。
