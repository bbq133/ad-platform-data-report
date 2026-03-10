/**
 * ======================================================================
 * 服务端埋点 - 与前端 tracking-service 同一格式，写入飞书多维表格 Webhook
 * ======================================================================
 * 用于：定时任务实际推送、预警实际触发（GAS 执行时无前端，需在此上报）
 * 需在脚本属性中配置 TRACKING_WEBHOOK_URL（与前端 FEISHU_WEBHOOK_URL 一致）
 * ======================================================================
 */

var TRACKING_SYSTEM_NAME = 'G0C04—AdIntel Growth Scientist';

/**
 * 发送一条埋点事件（与前端 TrackingEvent 字段一致）
 * @param {string} eventType 事件类型，如 'scheduled_send'、'alert_trigger'
 * @param {string} eventName 事件名称，如 'scheduled_send_success: 任务名'、'alert_triggered: 规则名'
 * @param {string} username 用户名
 */
function sendTrackingEvent(eventType, eventName, username) {
  var url = getTrackingWebhookUrl();
  if (!url) return;

  var now = new Date();
  var pad = function(n) { return (n < 10 ? '0' : '') + n; };
  var dateStr = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) +
    ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ':' + pad(now.getSeconds());

  var payload = {
    '事件类型': eventType,
    '事件名称': eventName,
    '用户名': username,
    '日期': dateStr,
    '访问系统名称': TRACKING_SYSTEM_NAME
  };

  var options = {
    method: 'post',
    contentType: 'text/plain;charset=utf-8',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  var token = getTrackingWebhookToken();
  if (token) {
    options.headers = { 'Authorization': 'Bearer ' + token };
  }
  try {
    UrlFetchApp.fetch(url, options);
  } catch (e) {
    Logger.log('[埋点] sendTrackingEvent 失败: ' + e.message);
  }
}
