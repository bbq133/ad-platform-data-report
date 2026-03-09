/**
 * ======================================================================
 * 飞书定时报表 - 配置常量
 * ======================================================================
 *
 * 【重要】飞书凭证（FEISHU_APP_ID / FEISHU_APP_SECRET / FEISHU_FOLDER_TOKEN）
 * 请在 Apps Script 编辑器中通过「项目设置 → 脚本属性」配置，不要写死在代码里。
 *
 * 脚本属性需要配置的 Key：
 *   FEISHU_APP_ID          - 飞书应用 App ID（cli_ 开头）
 *   FEISHU_APP_SECRET      - 飞书应用 App Secret
 *   FEISHU_FOLDER_TOKEN    - 飞书云文档文件夹 token（可选，不填则创建到应用根目录）
 * ======================================================================
 */

// ==================== Google Sheet 配置（与现有项目共用同一份 Sheet） ====================

var SPREADSHEET_ID = '1rdNtMU_IfrhKPDl6xqXPFVn1vf-rm85zTVvR5ArSmWc';
var USER_CONFIGS_SHEET = 'UserConfigs';
var TIMEZONE = 'Asia/Shanghai';

// ==================== 广告数据 API ====================

var AD_API_BASE = 'https://api.globaloneclick.org';
var AD_API_TOKEN = 'globaloneclick';
var AD_API_CLIENT_ID = 'dce41dca2ad7cfaa5c3e306472571f0d';

// ==================== 飞书 API ====================

var FEISHU_API_BASE = 'https://open.feishu.cn/open-apis';

// 飞书定时任务在 UserConfigs 中的 type 标识（与原有 'scheduledReports' 隔离）
var FEISHU_CONFIG_TYPE = 'feishuScheduledReports';

/**
 * 从脚本属性中读取飞书凭证
 */
function getFeishuAppId() {
  return PropertiesService.getScriptProperties().getProperty('FEISHU_APP_ID') || '';
}

function getFeishuAppSecret() {
  return PropertiesService.getScriptProperties().getProperty('FEISHU_APP_SECRET') || '';
}

function getFeishuFolderToken() {
  return PropertiesService.getScriptProperties().getProperty('FEISHU_FOLDER_TOKEN') || '';
}
