var SHEET_CONFIG_NAME = 'UserConfigs';
// 或：如果你在 ScheduledReports.gs 里也定义了 USER_CONFIGS_SHEET，可以改成：
// var SHEET_CONFIG_NAME = USER_CONFIGS_SHEET;

/**
 * 处理 GET 请求：前端的 fetchUserConfig(...) 会走这里，
 * action = getConfig 时，根据 user + projectId + type 从 UserConfigs 里读一行出来。
 *
 * 对所有类型一视同仁：metrics / dimensions / formulas / pivotPresets / bi / scheduledReports 都支持。
 */
function doGet(e) {
  var params = e && e.parameter ? e.parameter : {};
  var action = params.action || 'getConfig';

  if (action === 'getConfig') {
    var user = params.user;
    var projectId = params.projectId || 'global';
    var type = params.type; // 可能是 'metrics' / 'dimensions' / 'pivotPresets' / 'scheduledReports' 等

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_CONFIG_NAME);
    if (!sheet) {
      return ContentService.createTextOutput(JSON.stringify({
        status: 'success',
        data: null
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var values = sheet.getDataRange().getValues();
    var foundConfigJson = null;

    // 跳过表头，从第 2 行开始：User | ProjectId | Type | ConfigJson | UpdateTime
    for (var i = 1; i < values.length; i++) {
      var row = values[i];
      if (row[0] == user && row[1] == projectId && row[2] == type) {
        foundConfigJson = row[3]; // 第 4 列 ConfigJson
        break;
      }
    }

    var parsed = null;
    if (foundConfigJson && typeof foundConfigJson === 'string' && foundConfigJson.trim()) {
      try {
        parsed = JSON.parse(foundConfigJson);
      } catch (err) {
        parsed = null;
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'success',
      data: parsed
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // 其它未识别的 action
  return ContentService.createTextOutput(JSON.stringify({
    status: 'error',
    message: 'Unknown action for doGet'
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * 处理 POST 请求：
 * - action = 'testScheduledReport'：触发一次性的定时报表测试发送（不写回 UserConfigs）
 * - 其它：保存用户配置到 UserConfigs（metrics / dimensions / formulas / pivotPresets / bi / scheduledReports 等）
 */
function doPost(e) {
  try {
    var rawBody = e.postData && e.postData.contents ? e.postData.contents : '{}';
    var params = JSON.parse(rawBody);
    var action = params.action || 'saveConfig';

    // ========== 1. 测试发送定时报表：action = 'testScheduledReport' ==========
    if (action === 'testScheduledReport') {
      var user = params.user;
      var projectId = params.projectId || 'global';
      var task = params.task; // 前端传来的 ScheduledReportTaskPayload

      // 调试日志（不打印邮箱等敏感信息）
      Logger.log('[testScheduledReport] user=%s, projectId=%s, taskName=%s', user, projectId, task && task.name);

      if (!user || !projectId || !task) {
        return ContentService.createTextOutput(
          JSON.stringify({ status: 'error', message: '缺少必要参数 user / projectId / task' })
        ).setMimeType(ContentService.MimeType.JSON);
      }

      // 使用 ScheduledReports.gs 中的工具函数
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var configSheet = ss.getSheetByName(SHEET_CONFIG_NAME); // 即 'UserConfigs'
      if (!configSheet) {
        return ContentService.createTextOutput(
          JSON.stringify({ status: 'error', message: 'UserConfigs 工作表不存在' })
        ).setMimeType(ContentService.MimeType.JSON);
      }

      // 读取所有配置（其中会包含 pivotPresets 配置）
      var allConfigs = getAllUserConfigs(configSheet);

      // 构造一个“临时”的 scheduledReports 配置对象，只提供 executeTask 需要的字段
      var tempConfig = {
        user: String(user),
        projectId: String(projectId),
        type: 'scheduledReports',
        data: null
      };

      // 直接复用 executeTask：这会拉取数据、生成报表、发送邮件
      var logEntry = executeTask(task, tempConfig, allConfigs);

      // 这里不写回 UserConfigs，不影响正式定时任务的 tasks/logs
      if (logEntry.status === 'SUCCESS') {
        return ContentService.createTextOutput(
          JSON.stringify({ status: 'success', data: logEntry })
        ).setMimeType(ContentService.MimeType.JSON);
      }

      return ContentService.createTextOutput(
        JSON.stringify({ status: 'error', message: logEntry.errorMessage || '测试发送失败', data: logEntry })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // ========== 2. 默认分支：保存用户配置（metrics / dimensions / formulas / pivotPresets / bi / scheduledReports） ==========
    var lock = LockService.getScriptLock();
    // 尝试获取锁，避免并发冲突
    if (lock.tryLock(5000)) {
      var ss2 = SpreadsheetApp.getActiveSpreadsheet();
      var configSheet2 = ss2.getSheetByName(SHEET_CONFIG_NAME);

      // 1) 如果 Sheet 不存在，自动创建并初始化 Header
      if (!configSheet2) {
        configSheet2 = ss2.insertSheet(SHEET_CONFIG_NAME);
        // Header: User, ProjectId, Type, ConfigJson, UpdateTime
        configSheet2.appendRow(['User', 'ProjectId', 'Type', 'ConfigJson', 'UpdateTime']);
      }

      var user2 = params.user; // 用户名
      var projectId2 = params.projectId || 'global'; // 项目ID，默认为 global
      var type2 = params.type; // 例如 'metrics' / 'dimensions' / 'pivotPresets' / 'scheduledReports'
      var configJson = JSON.stringify(params.data); // 将配置对象转为 JSON 字符串存储
      var updateTime = new Date();

      // 3) 查找是否已存在该用户的配置行
      var dataRange = configSheet2.getDataRange().getValues();
      var rowIndexToUpdate = -1;
      for (var i2 = 1; i2 < dataRange.length; i2++) {
        var row2 = dataRange[i2];
        if (row2[0] == user2 && row2[1] == projectId2 && row2[2] == type2) {
          rowIndexToUpdate = i2 + 1; // 转换为 1-based index
          break;
        }
      }

      // 4) 执行更新或插入
      if (rowIndexToUpdate > 0) {
        configSheet2.getRange(rowIndexToUpdate, 4).setValue(configJson);
        configSheet2.getRange(rowIndexToUpdate, 5).setValue(updateTime);
      } else {
        configSheet2.appendRow([user2, projectId2, type2, configJson, updateTime]);
      }

      lock.releaseLock();
      return ContentService.createTextOutput(
        JSON.stringify({ status: 'success', message: 'Saved' })
      ).setMimeType(ContentService.MimeType.JSON);
    } else {
      return ContentService.createTextOutput(
        JSON.stringify({ status: 'error', message: 'Is busy, try again later' })
      ).setMimeType(ContentService.MimeType.JSON);
    }
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ status: 'error', message: err.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

