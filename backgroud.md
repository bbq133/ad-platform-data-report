产品背景：广告智投分析系统 (AdIntel Growth Scientist Suite)
1. 产品定位 (Product Positioning)
本系统是一款面向 全球众筹（Kickstarter/Indiegogo） 与 出海品牌 的高级效果广告诊断平台。它旨在解决跨境电商在 Meta (Facebook) 和 Google 广告投放中面临的“数据归因难、多平台对齐难、手动报表效率低”的痛点。
核心理念：基于 "Aetherion Standard"（一种业内先进的数据对齐与分析协议），将非结构化的广告命名规则转化为可分析的结构化多维数据。
技术关键词：Growth Scientist, Dimensional Attribution, AI Diagnostic, PCM (Raw Data Processing).
2. 核心用户 (Target Audience)
资深投放经理 (Senior Media Buyers)：需要快速从成百上千个素材中筛选出高 ROAS 组合。
数据科学家 (Data Scientists)：通过自定义公式（如自定义归因权重、新客成本分析）进行深度挖掘。
项目负责人 (Project Leads)：通过 AI 自动生成的总结报告，快速掌握项目健康度，而无需查阅复杂的表格。
3. 核心功能逻辑 (Core Business Logic)
A. 命名规范解析 (Naming Convention Parsing)
这是系统的灵魂。出海广告主习惯将维度信息嵌入在 Campaign/Ad Name 中（例如：US_Prospecting_Video_20Off_SpringSale）。
逻辑：系统允许用户自定义分隔符（_ 或 -），并指定索引（Index）将特定的字段解析为“国家”、“素材类型”、“折扣信息”等维度。
B. 动态指标引擎 (Dynamic Metric Engine)
基础指标：直接读取 Spend, Leads, Impressions 等原始数据。
自定义指标：支持类似 Excel 的公式编辑器（如 (cost / linkClicks)），并允许设置单位（$、%）。
C. 全局筛选联动 (Global Filter Integration)
联动性：仪表盘的时间、平台、以及表格中的“维度值”筛选是全局生效的。
下钻 (Drill-down)：当用户在维度表中筛选了“国家：美国”后，上方的趋势图和 AI 分析结果会自动过滤，仅展现美国的数据。
D. AI 智能归因报告 (AI-Powered Insights)
集成：深度集成 Google Gemini API。
上下文感知：系统不仅发送原始数据，还会发送用户当前的筛选状态给 AI。
报告结构：AI 被设定为“资深分析师”，输出包括“核心洞察”、“深度归因”及“下周行动计划（红黑榜）”。
4. 技术栈 (Technical Stack)
前端：React (Hooks), Tailwind CSS (UI), Lucide React (Icons).
图表：Recharts (高性能 SVG 图表库).
数据处理：PapaParse (CSV), XLSX (Excel), 计算逻辑基于 Memo 优化。
大模型：@google/genai (Gemini 3 Pro Preview), 启用 Thinking 模式增强逻辑推理。
5. 二次开发建议 (Future Roadmap)
若要进行后续开发，可关注以下方向：
持久化存储：目前数据为前端 Session 态，可增加 IndexDB 或 Backend 存储已配置的 Mapping。
多周期对比 (Period-over-Period)：在 KPI 卡片中实现真实的环比数据计算。
创意缩略图墙：若 CSV 包含素材 URL，可增加可视化素材分析板。
自动化指令：增加通过 AI 接口直接生成 Meta 批量调控指令的功能。
AI IDE 提示词建议：
"你现在是这个项目的核心开发者。请基于 Naming Convention Parsing 逻辑，确保任何新增的图表或计算函数都必须严格遵守 filteredData 的全局筛选上下文。UI 风格请保持 Aetherion 的高冷工业感（Slate-900 配合高饱和度的 Indigo/Emerald）。"