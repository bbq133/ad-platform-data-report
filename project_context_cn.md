# AdIntel Growth Scientist Suite - AI IDE 项目背景文档

## 1. 项目概览 (Project Overview)
**名称:** AdIntel Growth Scientist Suite (广告智投分析套件)
**目标:** 面向跨境电商的高性能广告数据分析平台。旨在解决 Meta/Google 广告中非结构化数据的问题，通过解析“命名规范 (Naming Conventions)”将其转化为结构化的维度，以便进行深度分析。
**核心理念:** "Aetherion Standard" —— 将原始、非结构化的广告数据转化为多维度的可执行洞察。

## 2. 技术栈 (Technology Stack)
- **框架:** React 19 (Hooks/Functional Components), TypeScript (Strict Mode).
- **构建工具:** Vite 6.
- **UI 系统:** Tailwind CSS (专注于“高端/工业风”美学: Slate-900, Indigo, Emerald), Lucide React Icons.
- **数据处理:**
    - `papaparse`: CSV 解析.
    - `xlsx`: Excel 文件处理.
    - **核心逻辑:** 自定义内存处理，用于过滤、聚合和计算字段 (Memoized).
- **可视化:** Recharts (高性能 SVG 图表库).
- **AI 集成:** Google Gemini API (`@google/genai`) 用于生成诊断报告和自然语言洞察。
- **部署:** GitHub Pages (客户端路由).

## 3. 架构与数据流 (Architecture & Data Flow)

### A. 数据源层 (Data Source Layer)
应用主要以“客户端 (Client-Side)”模式运行，但连接两个关键的外部服务：
1.  **广告数据 API (`api-service.ts`)**:
    -   **端点:** `https://api.globaloneclick.org/project/adsData/getAllFilterData`
    -   **认证:** Bearer Token.
    -   **功能:** 获取原始的 Campaign/Ad 绩效数据。
    -   **转换:** 数据通过 `transformApiDataToRawData` 标准化，以匹配内部的“原始数据 (Raw Data)”格式 (与 CSV 上传兼容)。

2.  **配置持久化 (Google Apps Script)**:
    -   **端点:** 通过 `fetchUserConfig` / `saveUserConfig` 访问。
    -   **目的:** 存储用户定义的设置 (指标映射、维度定义、自定义公式)，以便在没有重型后端的情况下跨会话持久化。

### B. 核心业务逻辑 (Core Business Logic)
1.  **命名规范解析 (Naming Convention Parsing):**
    -   **输入:** `campaignName` 或 `adName` (例如: `US_Prospecting_Video_SpringSale`).
    -   **过程:** 用户定义分隔符 (例如: `_`) 并将位置 (Index 0, 1, 2...) 映射到维度 (国家, 漏斗, 素材类型)。
    -   **输出:** 虚拟列添加到数据集中，用于分组和筛选。

2.  **动态指标引擎 (Dynamic Metric Engine):**
    -   允许用户创建自定义计算指标 (例如: `CPR = Spend / Result`).
    -   支持数学表达式。

3.  **全局筛选上下文 (Global Filter Context):**
    -   统一的状态控制 `startDate` (开始日期), `endDate` (结束日期), `platform` (平台) 和动态维度筛选。
    -   **约束:** 所有图表和 AI 分析 *必须* 遵循当前筛选状态。

### C. AI 模块 (AI Module)
-   **角色:** "资深数据科学家 (Senior Data Scientist)".
-   **输入:** 聚合数据摘要 + 当前筛选上下文。
-   **输出:** Markdown 格式的报告，突出“红榜 (Wins)” (高 ROAS) 和 “黑榜 (Losses)” (低效花费)，并提供易于阅读的战略建议。

## 4. 关键数据约束 (Key Data Constraints)
-   **原始数据字段 (`RawDataRow`):**
    -   标准: `Spend` (花费), `Impressions` (展示), `Clicks` (点击), `Purchases` (购买), `KV` (键值自定义字段).
    -   平台特定: Google (Campaign/AdGroup), Meta (Campaign/AdSet/Ad).
-   **API 响应映射:**
    -   `cost` -> `Spend`
    -   `conversionValue` -> `Purchases conversion value`
    -   `roas` 通常是动态计算的: `conversionValue / cost`.

## 5. 开发者指南 (Developer Guidelines)
-   **UI 美学:** 保持“工业高科技 (Industrial High-Tech)”外观。默认深色模式。面板采用玻璃拟态 (Glassmorphism).
-   **性能:** 数据数组可能很大 (10k+ 行)。对昂贵的聚合使用 `useMemo`。避免主数据表不必要的重新渲染。
-   **代码风格:** 功能分解。保持组件只有少量代码 (如果可能 `< 200 行`)。使用自定义 Hooks 处理逻辑 (`useDataProcessor`, `useAIAnalysis`).
