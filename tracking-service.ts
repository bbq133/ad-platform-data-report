/**
 * 用户行为埋点跟踪服务
 * 通过飞书多维表格 Webhook 记录用户操作事件
 */

const SYSTEM_NAME = 'G0C04—AdIntel Growth Scientist';

interface TrackingEvent {
  事件类型: string;
  事件名称: string;
  用户名: string;
  日期: string;
  访问系统名称: string;
}

let _webhookUrl = '';
let _bearerToken = '';

export function initTracking(webhookUrl: string, bearerToken: string): void {
  _webhookUrl = webhookUrl;
  _bearerToken = bearerToken;
}

function formatDateTime(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function sendEvent(event: TrackingEvent): void {
  if (!_webhookUrl) return;

  fetch(_webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(event),
    mode: 'no-cors',
  }).catch(() => {});
}

function track(eventType: string, eventName: string, username: string): void {
  sendEvent({
    事件类型: eventType,
    事件名称: eventName,
    用户名: username,
    日期: formatDateTime(),
    访问系统名称: SYSTEM_NAME,
  });
}

// ---- 预定义的埋点事件 ----

export function trackLogin(username: string): void {
  track('login', 'login', username);
}

export function trackProjectSelect(username: string, projectName: string): void {
  track('click', `click_select_project: ${projectName}`, username);
}

export function trackFetchData(username: string, projectName: string): void {
  track('click', `click_fetch_data: ${projectName}`, username);
}

export function trackExportData(username: string, exportType: string): void {
  track('click', `click_export_data: ${exportType}`, username);
}

export function trackSaveConfig(username: string): void {
  track('click', 'click_save_config', username);
}

export function trackSavePivotPreset(username: string, presetName: string): void {
  track('click', `click_save_pivot_preset: ${presetName}`, username);
}

export function trackAiAnalysis(username: string): void {
  track('click', 'click_ai_analysis', username);
}

export function trackPageView(username: string, pageName: string): void {
  track('click', `click_page_view: ${pageName}`, username);
}

export function trackScheduledTaskCreate(username: string, taskName: string): void {
  track('click', `click_create_scheduled_task: ${taskName}`, username);
}

export function trackScheduledTaskEdit(username: string, taskName: string): void {
  track('click', `click_edit_scheduled_task: ${taskName}`, username);
}

export function trackScheduledTaskDelete(username: string, taskName: string): void {
  track('click', `click_delete_scheduled_task: ${taskName}`, username);
}

export function trackScheduledTaskToggle(username: string, taskName: string, active: boolean): void {
  track('click', `click_${active ? 'pause' : 'enable'}_scheduled_task: ${taskName}`, username);
}

export function trackScheduledTaskSend(username: string, taskName: string, status: 'SUCCESS' | 'FAIL'): void {
  track('scheduled_send', `scheduled_send_${status.toLowerCase()}: ${taskName}`, username);
}
