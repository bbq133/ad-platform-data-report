/**
 * ======================================================================
 * 飞书广告预警监控引擎
 * ======================================================================
 * 流程：
 *   1. 读取 UserConfigs 中 type='dataAlerts' 的配置
 *   2. 根据 checkTime 判断是否执行
 *   3. 按 platform + lookbackDays 拉取广告数据
 *   4. 过滤默认 segment → 按 platform 过滤 → 应用筛选条件组
 *   5. 按 dimension 分组聚合 → 计算指标（含公式）
 *   6. 评估触发条件（高于/低于目标值）
 *   7. 若触发，通过飞书 IM API 向指定用户发送消息
 *   8. 写回 logs + lastTriggeredAt
 *
 * 触发器：
 *   在 Apps Script 编辑器中创建 Time-driven Trigger，
 *   定期调用 processDataAlerts()（建议每小时一次）
 *
 * 依赖（同项目内）：
 *   Config.gs        - 常量
 *   FeishuAuth.gs    - feishuHeaders()
 *   DataService.gs   - 数据拉取/转换/聚合/时间判断
 * ======================================================================
 */

var DATA_ALERTS_CONFIG_TYPE = 'dataAlerts';

// ==================== 主入口 ====================

function processDataAlerts() {
  processDataAlertsCore(false);
}

function processDataAlertsForce() {
  processDataAlertsCore(true);
}

function processDataAlertsCore(forceRun) {
  var now = new Date();
  var nowStr = Utilities.formatDate(now, TIMEZONE, 'HH:mm');
  var nowHour = parseInt(nowStr.split(':')[0], 10);
  var nowMin = parseInt(nowStr.split(':')[1], 10);

  Logger.log('[预警] 开始执行: ' + nowStr);

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var configSheet = ss.getSheetByName(USER_CONFIGS_SHEET);
  if (!configSheet) {
    Logger.log('[预警] 找不到 ' + USER_CONFIGS_SHEET + ' 工作表');
    return;
  }

  var allConfigs = getAllUserConfigs(configSheet);

  var alertConfigs = allConfigs.filter(function(c) {
    return c.type === DATA_ALERTS_CONFIG_TYPE;
  });

  Logger.log('[预警] 找到 ' + alertConfigs.length + ' 条 dataAlerts 配置');

  for (var i = 0; i < alertConfigs.length; i++) {
    var config = alertConfigs[i];
    try {
      var payload = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      var rules = payload.rules || [];
      var logs = payload.logs || [];
      var changed = false;

      for (var j = 0; j < rules.length; j++) {
        var rule = rules[j];
        if (!rule.active) continue;

        if (!forceRun) {
          var taskLike = { timeOfDay: rule.checkTime, frequency: 'daily', lastRunAt: rule.lastTriggeredAt };
          if (!shouldRunNow(taskLike, nowHour, nowMin, 0)) continue;
          if (hasRunRecently(taskLike, now)) continue;
        }

        Logger.log('[预警] 执行规则: ' + rule.name + ' (用户=' + config.user + ', 项目=' + config.projectId + ')');

        var logEntry = executeAlertRule(rule, config, allConfigs);
        logs.push(logEntry);
        if (logEntry.status === 'SENT' || logEntry.status === 'TRIGGERED') {
          rule.lastTriggeredAt = new Date().toISOString();
        }
        changed = true;
      }

      if (logs.length > 200) {
        logs = logs.slice(logs.length - 200);
      }

      if (changed) {
        payload.rules = rules;
        payload.logs = logs;
        updateUserConfig(configSheet, config.user, config.projectId, DATA_ALERTS_CONFIG_TYPE, payload);
        Logger.log('[预警] 已更新配置 (user=' + config.user + ', project=' + config.projectId + ')');
      }
    } catch (e) {
      Logger.log('[预警] 处理配置出错 (user=' + config.user + '): ' + e.message);
    }
  }

  Logger.log('[预警] 执行完毕');
}

// ==================== 规则执行 ====================

function executeAlertRule(rule, config, allConfigs) {
  var logEntry = {
    ruleId: rule.id,
    ruleName: rule.name,
    triggeredAt: new Date().toISOString(),
    metric: rule.metric,
    dimension: rule.dimension,
    matchedItems: [],
    status: 'TRIGGERED',
    recipients: '',
    errorMessage: ''
  };

  try {
    // 1. 计算日期范围
    var days = rule.lookbackDays || 7;
    var today = new Date();
    var endDate = Utilities.formatDate(today, TIMEZONE, 'yyyy-MM-dd');
    var startDateObj = new Date(today.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
    var startDate = Utilities.formatDate(startDateObj, TIMEZONE, 'yyyy-MM-dd');

    // 2. 按天 + 单平台拉取广告数据（避免单次响应超过 GAS 50MB 限制）
    var platformKey = rule.platform === 'facebook' ? 'facebook' : 'google';
    var adData = fetchAdDataByDay(config.projectId, startDate, endDate, platformKey);
    if (!adData || adData.length === 0) {
      logEntry.status = 'FAIL';
      logEntry.errorMessage = 'API 未返回数据（项目=' + config.projectId + '，平台=' + platformKey + '）';
      return logEntry;
    }

    // 3. 转换数据
    var transformedData = transformApiData(adData);

    // 4. 过滤默认 segment
    var filtered = transformedData.filter(function(row) {
      return isDefaultSegmentRow(row);
    });

    // 6. 应用筛选条件组
    if (rule.filterRules && rule.filterRules.length > 0) {
      filtered = applyAlertFilterRules(filtered, rule.filterRules, rule.filterLogic || 'OR');
    }

    if (filtered.length === 0) {
      logEntry.status = 'TRIGGERED';
      logEntry.errorMessage = '筛选后无数据';
      return logEntry;
    }

    // 7. 获取用户公式配置
    var formulaConfig = allConfigs.filter(function(c) {
      return c.user === config.user && c.projectId === config.projectId && c.type === 'formulas';
    })[0];
    var formulas = [];
    if (formulaConfig && formulaConfig.data) {
      var formulaData = typeof formulaConfig.data === 'string' ? JSON.parse(formulaConfig.data) : formulaConfig.data;
      if (Array.isArray(formulaData)) formulas = formulaData;
    }

    // 8. 按 dimension 分组聚合
    var dimKey = getDimensionColumnKey(rule.dimension);
    var groups = groupByDimension(filtered, dimKey);

    var aggregateMetricValue = computeMetricValue(filtered, rule.metric, formulas);

    // 9. 计算目标指标并评估触发条件
    var triggeredItems = [];
    var groupKeys = Object.keys(groups);

    for (var g = 0; g < groupKeys.length; g++) {
      var gKey = groupKeys[g];
      var rows = groups[gKey];

      // 跳过 cost=0 的分组（无花费则不参与单项评估）
      var groupCost = 0;
      for (var ci = 0; ci < rows.length; ci++) {
        groupCost += parseFloat(rows[ci][METRIC_KEY_MAP['cost']]) || 0;
      }
      if (groupCost <= 0) continue;

      var metricValue = computeMetricValue(rows, rule.metric, formulas);

      var shouldTrigger = false;
      if (rule.triggerDirection === 'above') {
        shouldTrigger = metricValue > rule.triggerValue;
      } else {
        shouldTrigger = metricValue < rule.triggerValue;
      }

      if (shouldTrigger) {
        triggeredItems.push({
          name: gKey || '(空)',
          value: Math.round(metricValue * 100) / 100
        });
      }
    }

    // 9b. 汇总（总计）也参与评估：若汇总指标满足条件则触发（与透视表「总计」一致）
    var triggerVal = Number(rule.triggerValue);
    var aggregateRounded = Math.round(aggregateMetricValue * 100) / 100;
    var aggregateTriggers = false;
    if (typeof aggregateRounded === 'number' && !isNaN(aggregateRounded) && isFinite(aggregateRounded) && !isNaN(triggerVal)) {
      aggregateTriggers = rule.triggerDirection === 'above'
        ? aggregateRounded > triggerVal
        : aggregateRounded < triggerVal;
    }
    if (aggregateTriggers) {
      var alreadyHasTotal = triggeredItems.some(function(item) { return item.name === '总计'; });
      if (!alreadyHasTotal) {
        triggeredItems.push({ name: '总计', value: aggregateRounded });
      }
    }

    logEntry.matchedItems = triggeredItems;

    if (triggeredItems.length === 0) {
      logEntry.status = 'TRIGGERED';
      logEntry.errorMessage = '未触发（所有项均未满足条件）';
      return logEntry;
    }

    // 10. 发送飞书消息
    if (rule.feishuUserIds && rule.feishuUserIds.length > 0) {
      var messageContent = buildAlertMessageContent(rule, triggeredItems, startDate, endDate, config.projectId);
      var recipientNames = sendFeishuAlertMessages(rule.feishuUserIds, messageContent);
      logEntry.recipients = recipientNames.join(', ');
      logEntry.status = 'SENT';
      Logger.log('[预警] 飞书消息已发送: ' + rule.name + ' -> ' + recipientNames.join(', '));
    } else {
      logEntry.status = 'TRIGGERED';
      logEntry.errorMessage = '无收件人配置';
    }

  } catch (e) {
    logEntry.status = 'FAIL';
    logEntry.errorMessage = e.message || String(e);
    Logger.log('[预警] 规则执行失败: ' + rule.name + ' - ' + e.message);
  }

  // 服务端埋点：预警实际触发（已发送或满足条件但无收件人）
  if (logEntry.status === 'SENT' || (logEntry.status === 'TRIGGERED' && logEntry.matchedItems && logEntry.matchedItems.length > 0)) {
    try {
      sendTrackingEvent('alert_trigger', 'alert_triggered: ' + rule.name, config.user);
    } catch (err) {
      Logger.log('[预警] 埋点发送失败: ' + (err.message || err));
    }
  }

  return logEntry;
}

// ==================== 筛选条件 ====================

var ALERT_FILTER_FIELD_MAP = {
  'campaignName': 'Campaign Name',
  'adsetName': 'Ad Set Name',
  'adName': 'Ad Name'
};

function applyAlertFilterRules(data, filterRules, logic) {
  if (!filterRules || filterRules.length === 0) return data;

  return data.filter(function(row) {
    var results = [];
    for (var i = 0; i < filterRules.length; i++) {
      var fr = filterRules[i];
      var colName = ALERT_FILTER_FIELD_MAP[fr.field] || fr.field;
      var cellVal = String(row[colName] || '').toLowerCase();
      var filterVal = (fr.value || '').toLowerCase();
      var match = false;

      switch (fr.operator) {
        case 'contains':
          match = cellVal.indexOf(filterVal) >= 0;
          break;
        case 'not_contains':
          match = cellVal.indexOf(filterVal) < 0;
          break;
        case 'equals':
          match = cellVal === filterVal;
          break;
        case 'not_equals':
          match = cellVal !== filterVal;
          break;
        default:
          match = true;
      }
      results.push(match);
    }

    if (logic === 'AND') {
      return results.every(function(r) { return r; });
    }
    return results.some(function(r) { return r; });
  });
}

// ==================== 分组聚合 ====================

function getDimensionColumnKey(dimension) {
  switch (dimension) {
    case 'campaign': return 'Campaign Name';
    case 'adset': return 'Ad Set Name';
    case 'ad': return 'Ad Name';
    default: return 'Campaign Name';
  }
}

function groupByDimension(data, dimColKey) {
  var groups = {};
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var key = String(row[dimColKey] || '');
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  }
  return groups;
}

function computeMetricValue(rows, metricName, formulas) {
  // Check if metric is a base metric
  var baseCol = METRIC_KEY_MAP[metricName];
  if (baseCol) {
    var sum = 0;
    for (var i = 0; i < rows.length; i++) {
      sum += parseFloat(rows[i][baseCol]) || 0;
    }
    return sum;
  }

  // Check if metric is a formula
  var formulaDef = null;
  for (var f = 0; f < formulas.length; f++) {
    if (formulas[f].name === metricName) {
      formulaDef = formulas[f];
      break;
    }
  }

  if (formulaDef) {
    var refKeys = getReferencedMetricKeys(formulaDef.formula);
    var ctx = {};
    for (var r = 0; r < refKeys.length; r++) {
      var rk = refKeys[r];
      var rkCol = METRIC_KEY_MAP[rk];
      if (!rkCol) continue;
      var rkSum = 0;
      for (var ri = 0; ri < rows.length; ri++) {
        rkSum += parseFloat(rows[ri][rkCol]) || 0;
      }
      ctx[rk] = rkSum;
    }
    return evalFormulaForSheet(formulaDef.formula, ctx);
  }

  return 0;
}

// ==================== 飞书消息发送 ====================

function buildAlertMessageContent(rule, triggeredItems, startDate, endDate, projectId) {
  var dirLabel = rule.triggerDirection === 'above' ? '高于' : '低于';

  var content = [
    [{ tag: 'text', text: '规则名称: ' + rule.name }],
    [{ tag: 'text', text: '项目ID: ' + projectId + ' | 平台: ' + (rule.platform === 'facebook' ? 'Meta' : 'Google') + ' | 维度: ' + getDimensionLabel(rule.dimension) }],
    [{ tag: 'text', text: '指标: ' + rule.metric + ' | 触发条件: ' + dirLabel + ' ' + rule.triggerValue }],
    [{ tag: 'text', text: '数据范围: ' + startDate + ' ~ ' + endDate + '（近 ' + rule.lookbackDays + ' 天）' }],
    [{ tag: 'text', text: '' }],
    [{ tag: 'text', text: '⚠️ 以下' + getDimensionLabel(rule.dimension) + '触发预警：' }]
  ];

  for (var i = 0; i < triggeredItems.length && i < 20; i++) {
    var item = triggeredItems[i];
    content.push([{ tag: 'text', text: '  • ' + item.name + ': ' + rule.metric + ' = ' + item.value }]);
  }

  if (triggeredItems.length > 20) {
    content.push([{ tag: 'text', text: '  ... 共 ' + triggeredItems.length + ' 项（仅显示前 20 项）' }]);
  }

  if (rule.filterRules && rule.filterRules.length > 0) {
    var filterDesc = rule.filterRules.map(function(fr) {
      return getFilterFieldLabel(fr.field) + ' ' + fr.operator + ' "' + fr.value + '"';
    }).join(' ' + (rule.filterLogic || 'OR') + ' ');
    content.push([{ tag: 'text', text: '' }]);
    content.push([{ tag: 'text', text: '筛选条件: ' + filterDesc }]);
  }

  content.push([{ tag: 'text', text: '' }]);
  content.push([{ tag: 'text', text: '检测时间: ' + Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm') + ' (GMT+8)' }]);
  content.push([{ tag: 'text', text: '' }]);
  content.push([{ tag: 'text', text: '💡 默认过滤高于' + rule.metric + '目标值以及 Cost 为 0 的 ' + getDimensionLabel(rule.dimension) }]);

  return {
    zh_cn: {
      title: '【广告预警】' + rule.name,
      content: content
    }
  };
}

function getDimensionLabel(dim) {
  switch (dim) {
    case 'campaign': return 'Campaign';
    case 'adset': return 'Ad Set';
    case 'ad': return 'Ad';
    default: return dim;
  }
}

function getFilterFieldLabel(field) {
  switch (field) {
    case 'campaignName': return 'Campaign Name';
    case 'adsetName': return 'Ad Set Name';
    case 'adName': return 'Ad Name';
    default: return field;
  }
}

/**
 * 向飞书用户发送预警消息
 * @param {string[]} userOpenIds 飞书用户 open_id 数组
 * @param {Object} messageContent 富文本消息内容（post 格式）
 * @return {string[]} 成功发送的用户名列表
 */
function sendFeishuAlertMessages(userOpenIds, messageContent) {
  var names = [];
  var url = FEISHU_API_BASE + '/im/v1/messages?receive_id_type=open_id';
  var headers = feishuHeaders();

  for (var i = 0; i < userOpenIds.length; i++) {
    var openId = userOpenIds[i];
    try {
      var body = {
        receive_id: openId,
        msg_type: 'post',
        content: JSON.stringify(messageContent)
      };

      var response = UrlFetchApp.fetch(url, {
        method: 'post',
        headers: headers,
        payload: JSON.stringify(body),
        muteHttpExceptions: true
      });

      var result = JSON.parse(response.getContentText());
      if (result.code === 0) {
        names.push(openId);
        Logger.log('[预警] 飞书消息发送成功: ' + openId);
      } else {
        Logger.log('[预警] 飞书消息发送失败 (' + openId + '): code=' + result.code + ' msg=' + (result.msg || ''));
      }
    } catch (e) {
      Logger.log('[预警] 飞书消息发送异常 (' + openId + '): ' + e.message);
    }
  }

  // 尝试获取用户名（用于日志展示）
  if (names.length > 0) {
    try {
      var userInfos = getFeishuUsersByIds(names);
      var nameMap = {};
      for (var u = 0; u < userInfos.length; u++) {
        nameMap[userInfos[u].open_id] = userInfos[u].name;
      }
      names = names.map(function(id) { return nameMap[id] || id; });
    } catch (e) {
      // keep open_ids as names
    }
  }

  return names;
}

// ==================== 按天拉取（预警专用） ====================

/**
 * 按天逐日拉取单个平台的广告数据，规避 GAS UrlFetchApp 50MB 响应体限制。
 * @param {string} projectId
 * @param {string} startDate  'yyyy-MM-dd'
 * @param {string} endDate    'yyyy-MM-dd'
 * @param {string} platform   'facebook' | 'google'
 * @return {Object[]} 合并后的原始 API 数据行
 */
function fetchAdDataByDay(projectId, startDate, endDate, platform) {
  var allData = [];
  var cursor = new Date(startDate + 'T00:00:00');
  var end = new Date(endDate + 'T00:00:00');
  var apiPlatform = platform === 'facebook' ? 'FACEBOOK' : 'GOOGLE';

  while (cursor <= end) {
    var dayStr = Utilities.formatDate(cursor, TIMEZONE, 'yyyy-MM-dd');
    try {
      var url = AD_API_BASE + '/project/adsData/getAllFilterData'
        + '?projectId=' + projectId
        + '&startDate=' + dayStr
        + '&endDate=' + dayStr
        + '&platform=' + apiPlatform;

      var options = {
        method: 'get',
        headers: {
          'Authorization': 'Bearer ' + AD_API_TOKEN,
          'clientid': AD_API_CLIENT_ID,
          'Content-Type': 'application/json'
        },
        muteHttpExceptions: true
      };

      var response = UrlFetchApp.fetch(url, options);
      var result = JSON.parse(response.getContentText());

      if (result.code === 200 && result.data) {
        allData = allData.concat(result.data);
        Logger.log('[预警] 拉取 ' + apiPlatform + ' ' + dayStr + ': ' + result.data.length + ' 行');
      }
    } catch (e) {
      Logger.log('[预警] 拉取 ' + apiPlatform + ' ' + dayStr + ' 失败: ' + e.message);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return allData;
}
