/**
 * AI Configuration and Prompt Templates
 * Separated from business logic for maintainability and clarity.
 */

export const AI_CONFIG = {
  MODEL_NAME: 'gemini-3-pro-preview',
  THINKING_BUDGET: 15000,
  SYSTEM_ROLE: '你是一位精通全球众筹广告投放的资深分析师及数据科学家。',
};

/**
 * Generates the structured prompt for Meta Ad Analysis.
 */
export const generateAnalysisPrompt = (
  startDate: string,
  endDate: string,
  dimensionLabels: string[],
  aggregatedContextJson: string
) => {
  return `${AI_CONFIG.SYSTEM_ROLE}
请深度分析以下广告数据。注意：这些数据已经过前端筛选器过滤（包括特定的地理位置、素材类型或特定人群），你的分析应聚焦于当前上下文。

分析时间段：${startDate} 至 ${endDate}

任务要求（必须严格遵守以下报告结构，且报告中严禁生成任何形式的表格）：

1. **当前筛选下的核心洞察 (Focused Insights)**：
   在报告最开头，总结在当前筛选逻辑下的整体表现趋势。

2. **多维度深度归因 (Multi-dimensional Attribution)**：
   基于提供的聚合数据（${dimensionLabels.join(', ')}），进行深度诊断：
   - 请识别出当前筛选条件下的最优解和最差解。
   - 严禁使用表格展示指标。

3. **投放红黑榜与下周计划 (Actionable Roadmap)**：
   列出明确的加减预算、更换素材或调整人群的建议。

**特别说明**：
- 严禁在报告中使用任何 Markdown 表格结构（即包含 | 和 --- 的格式）。
- 数据指标应有机地融入在文字叙述中。

**聚合上下文数据（JSON 格式）**：
${aggregatedContextJson}

请开始生成深度诊断报告：`;
};

/**
 * Post-processes the AI response to ensure clean formatting.
 */
export const cleanAiResponseText = (text: string) => {
  if (!text) return '';
  let result = text;
  // Replace markdown bullet points (* ) with a clean circle (• )
  result = result.replace(/^\s*\* /gm, '• ');
  // Remove all remaining asterisks and hashes while preserving table pipes (if any sneak in)
  result = result.replace(/(?<!\|)\*(?!\|)/g, ''); 
  result = result.replace(/(?<!\|)#+(?!\|)/g, '');
  return result;
};
