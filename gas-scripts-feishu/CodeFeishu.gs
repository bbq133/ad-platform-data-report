/**
 * ======================================================================
 * 飞书定时报表 - Web App 入口（doGet / doPost）
 * ======================================================================
 * 部署为独立 Web App，前端通过 FEISHU_GAS_API_URL 调用。
 *
 * 支持的 action：
 *   GET:
 *     - getConfig            读取 UserConfigs（与原有一致）
 *     - feishuDepartments    获取飞书部门列表（供前端选人）
 *     - feishuUsers          获取指定部门的用户列表（含邮箱）
 *     - feishuAllUsers       全公司用户（含子部门），带脚本缓存 TTL 减少飞书 API 调用
 *
 *   POST:
 *     - saveConfig                     保存 feishuScheduledReports 配置
 *     - testFeishuScheduledReport      测试发送（不写回配置）
 * ======================================================================
 */

function doGet(e) {
  var params = e && e.parameter ? e.parameter : {};
  var action = params.action || 'getConfig';

  try {
    // ===== 读取用户配置 =====
    if (action === 'getConfig') {
      var user = params.user;
      var projectId = params.projectId || 'global';
      var type = params.type;

      var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      var sheet = ss.getSheetByName(USER_CONFIGS_SHEET);
      if (!sheet) {
        return jsonOutput({ status: 'success', data: null });
      }

      var values = sheet.getDataRange().getValues();
      var foundConfigJson = null;
      for (var i = 1; i < values.length; i++) {
        var row = values[i];
        if (row[0] == user && row[1] == projectId && row[2] == type) {
          foundConfigJson = row[3];
          break;
        }
      }

      var parsed = null;
      if (foundConfigJson && typeof foundConfigJson === 'string' && foundConfigJson.trim()) {
        try { parsed = JSON.parse(foundConfigJson); } catch (err) { parsed = null; }
      }

      return jsonOutput({ status: 'success', data: parsed });
    }

    // ===== 飞书部门列表 =====
    if (action === 'feishuDepartments') {
      var parentId = params.parentDepartmentId || '0';
      var departments = getFeishuDepartments(parentId, false);
      return jsonOutput({ status: 'success', data: departments });
    }

    // ===== 飞书用户列表 =====
    if (action === 'feishuUsers') {
      var deptId = params.departmentId || '0';
      var users = getFeishuUsersByDepartment(deptId);
      return jsonOutput({ status: 'success', data: users });
    }

    // ===== 按 open_id 批量获取用户信息（用于编辑时展示收件人姓名） =====
    if (action === 'feishuUsersByIds') {
      var openIdsStr = params.openIds || '';
      var openIds = openIdsStr ? openIdsStr.split(',').map(function(id) { return id.trim(); }).filter(Boolean) : [];
      var usersByIds = getFeishuUsersByIds(openIds);
      return jsonOutput({ status: 'success', data: usersByIds });
    }

    // ===== 全公司用户（含子部门），TTL 内走缓存避免重复打飞书 API =====
    if (action === 'feishuAllUsers') {
      var CACHE_KEY = 'feishuAllUsers';
      var CACHE_TTL_SEC = 600; // 10 分钟
      var CACHE_VALUE_MAX = 100000; // ScriptCache 单值约 100KB 上限
      var cache = CacheService.getScriptCache();
      var cached = cache.get(CACHE_KEY);
      if (cached) {
        try {
          var data = JSON.parse(cached);
          return jsonOutput({ status: 'success', data: data });
        } catch (err) {
          // 缓存内容损坏则重新拉取
        }
      }
      var users = getFeishuAllUsersUnderRoot();
      var jsonStr = JSON.stringify(users);
      if (jsonStr.length <= CACHE_VALUE_MAX) {
        try {
          cache.put(CACHE_KEY, jsonStr, CACHE_TTL_SEC);
        } catch (e) {
          Logger.log('feishuAllUsers cache put failed: ' + (e.message || e));
        }
      }
      return jsonOutput({ status: 'success', data: users });
    }

    return jsonOutput({ status: 'error', message: 'Unknown GET action: ' + action });

  } catch (err) {
    return jsonOutput({ status: 'error', message: err.message || String(err) });
  }
}

function doPost(e) {
  try {
    var rawBody = e.postData && e.postData.contents ? e.postData.contents : '{}';
    var params = JSON.parse(rawBody);
    var action = params.action || 'saveConfig';

    // ===== 测试发送飞书定时报表 =====
    if (action === 'testFeishuScheduledReport') {
      return handleTestFeishuScheduledReport(params);
    }

    // ===== 测试预警规则 =====
    if (action === 'testDataAlert') {
      return handleTestDataAlert(params);
    }

    // ===== 保存用户配置 =====
    var lock = LockService.getScriptLock();
    if (lock.tryLock(5000)) {
      var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      var configSheet = ss.getSheetByName(USER_CONFIGS_SHEET);

      if (!configSheet) {
        configSheet = ss.insertSheet(USER_CONFIGS_SHEET);
        configSheet.appendRow(['User', 'ProjectId', 'Type', 'ConfigJson', 'UpdateTime']);
      }

      var user = params.user;
      var projectId = params.projectId || 'global';
      var type = params.type;
      var configJson = JSON.stringify(params.data);
      var updateTime = new Date();

      var dataRange = configSheet.getDataRange().getValues();
      var rowIndexToUpdate = -1;
      for (var i = 1; i < dataRange.length; i++) {
        var row = dataRange[i];
        if (row[0] == user && row[1] == projectId && row[2] == type) {
          rowIndexToUpdate = i + 1;
          break;
        }
      }

      if (rowIndexToUpdate > 0) {
        configSheet.getRange(rowIndexToUpdate, 4).setValue(configJson);
        configSheet.getRange(rowIndexToUpdate, 5).setValue(updateTime);
      } else {
        configSheet.appendRow([user, projectId, type, configJson, updateTime]);
      }

      lock.releaseLock();
      return jsonOutput({ status: 'success', message: 'Saved' });
    } else {
      return jsonOutput({ status: 'error', message: 'Is busy, try again later' });
    }

  } catch (err) {
    return jsonOutput({ status: 'error', message: err.toString() });
  }
}

// ==================== 测试发送 ====================

function handleTestFeishuScheduledReport(postData) {
  try {
    var user = postData.user;
    var projectId = postData.projectId || 'global';
    var task = postData.task;

    if (!user || !projectId || !task) {
      return jsonOutput({ status: 'error', message: '缺少参数 user / projectId / task' });
    }

    if (!task.pivotPresetIds || !task.pivotPresetIds.length) {
      return jsonOutput({ status: 'error', message: '请至少选择一个报告' });
    }

    // 校验收件人配置
    var hasRecipients = false;
    if (task.feishuRecipientType === 'department' && task.feishuDepartmentIds && task.feishuDepartmentIds.length > 0) {
      hasRecipients = true;
    }
    if (task.feishuRecipientType === 'users' && task.feishuUserIds && task.feishuUserIds.length > 0) {
      hasRecipients = true;
    }
    if (!hasRecipients) {
      return jsonOutput({ status: 'error', message: '请选择至少一个收件部门或用户' });
    }

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var configSheet = ss.getSheetByName(USER_CONFIGS_SHEET);
    if (!configSheet) {
      return jsonOutput({ status: 'error', message: '找不到 UserConfigs 工作表' });
    }

    var allConfigs = getAllUserConfigs(configSheet);
    var config = {
      user: String(user),
      projectId: String(projectId),
      type: FEISHU_CONFIG_TYPE,
      data: {}
    };

    var logEntry = executeFeishuTask(task, config, allConfigs);

    if (logEntry.status === 'SUCCESS') {
      return jsonOutput({ status: 'success', data: logEntry });
    }
    return jsonOutput({ status: 'error', message: logEntry.errorMessage || '测试发送失败', data: logEntry });

  } catch (e) {
    Logger.log('[飞书] handleTestFeishuScheduledReport 异常: ' + e.message);
    return jsonOutput({ status: 'error', message: e.message || String(e) });
  }
}

// ==================== 测试预警规则 ====================

function handleTestDataAlert(postData) {
  try {
    var user = postData.user;
    var projectId = postData.projectId || 'global';
    var rule = postData.rule;

    if (!user || !projectId || !rule) {
      return jsonOutput({ status: 'error', message: '缺少参数 user / projectId / rule' });
    }

    if (!rule.metric) {
      return jsonOutput({ status: 'error', message: '请选择预警指标' });
    }

    if (!rule.feishuUserIds || rule.feishuUserIds.length === 0) {
      return jsonOutput({ status: 'error', message: '请选择至少一个飞书收件人' });
    }

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var configSheet = ss.getSheetByName(USER_CONFIGS_SHEET);
    if (!configSheet) {
      return jsonOutput({ status: 'error', message: '找不到 UserConfigs 工作表' });
    }

    var allConfigs = getAllUserConfigs(configSheet);
    var config = {
      user: String(user),
      projectId: String(projectId),
      type: DATA_ALERTS_CONFIG_TYPE,
      data: {}
    };

    var logEntry = executeAlertRule(rule, config, allConfigs);

    var triggered = logEntry.status === 'SENT' || (logEntry.matchedItems && logEntry.matchedItems.length > 0);
    return jsonOutput({
      status: 'success',
      data: {
        triggered: triggered,
        matchedItems: logEntry.matchedItems || [],
        log: logEntry
      }
    });

  } catch (e) {
    Logger.log('[预警] handleTestDataAlert 异常: ' + e.message);
    return jsonOutput({ status: 'error', message: e.message || String(e) });
  }
}

// ==================== 工具 ====================

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
