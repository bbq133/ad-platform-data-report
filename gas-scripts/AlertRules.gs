/**
 * ======================================================================
 * 广告预警监控 - Google Apps Script
 * ======================================================================
 *
 * 功能：
 *   1. 读取 UserConfigs 中 type='alertRules' 的预警规则配置
 *   2. 根据 runAtTime 判断当前是否需要执行
 *   3. 按规则拉取广告数据，应用筛选条件组 (filters + filterLogic)
 *   4. 按维度聚合并计算公式指标
 *   5. 与目标值比较，触发则通过 MailApp 发送预警邮件
 *   6. 将执行结果写回 logs 字段
 *
 * 部署方式：
 *   将本文件内容复制到 Google Apps Script 项目中（新建一个 .gs 文件）
 *   在 Apps Script 编辑器中创建 Time-driven Trigger（每小时或每 30 分钟）
 *
 * 依赖：
 *   与 ScheduledReports.gs 共用同一 Spreadsheet / UserConfigs 工作表。
 *   如果 ScheduledReports.gs 中已有 getAllUserConfigs / updateUserConfig /
 *   fetchAdDataFromApi / isDefaultSegmentRow / filterBySegmentMode 等函数，
 *   本文件会直接调用它们（同一 Apps Script 项目内函数全局可见）。
 *   如果独立部署，需将这些工具函数复制过来。
 *
 * ======================================================================
 */

// ==================== 配置常量（如与 ScheduledReports.gs 共用则可删除） ====================

var ALERT_TIMEZONE = 'Asia/Shanghai';
var ALERT_SPREADSHEET_ID = '1rdNtMU_IfrhKPDl6xqXPFVn1vf-rm85zTVvR5ArSmWc';
var ALERT_USER_CONFIGS_SHEET = 'UserConfigs';

var ALERT_AD_API_BASE = 'https://api.globaloneclick.org';
var ALERT_AD_API_TOKEN = 'globaloneclick';
var ALERT_AD_API_CLIENT_ID = 'dce41dca2ad7cfaa5c3e306472571f0d';

// 指标 key 到数据列名的映射（与 ScheduledReports.gs 中 METRIC_KEY_MAP 一致）
var ALERT_METRIC_KEY_MAP = {
  'cost': 'Amount spent (USD)',
  'impressions': 'Impressions',
  'reach': 'Reach',
  'clicks': 'Clicks (all)',
  'linkClicks': 'Link clicks',
  'conversion': 'Purchases',
  'conversionValue': 'Purchases conversion value',
  'addToCart': 'Add to Cart',
  'landingPageViews': 'Landing page views',
  'leads': 'Leads',
  'videoViews': 'Video views',
  'checkout': 'Checkouts initiated',
  'subscribe': 'Subscriptions'
};

// 维度到数据列名的映射
var ALERT_DIMENSION_COL_MAP = {
  'campaign': 'Campaign Name',
  'adSet': 'Ad Set Name',
  'ad': 'Ad Name'
};

// ==================== 主入口 ====================

function processAlertRules() {
  processAlertRulesCore(false);
}

function processAlertRulesForce() {
  processAlertRulesCore(true);
}

function processAlertRulesCore(forceRun) {
  var now = new Date();
  var nowStr = Utilities.formatDate(now, ALERT_TIMEZONE, 'HH:mm');
  var nowHour = parseInt(nowStr.split(':')[0], 10);
  var nowMin = parseInt(nowStr.split(':')[1], 10);

  Logger.log('processAlertRules 开始执行: ' + nowStr);

  var ss = SpreadsheetApp.openById(ALERT_SPREADSHEET_ID);
  var configSheet = ss.getSheetByName(ALERT_USER_CONFIGS_SHEET);
  if (!configSheet) {
    Logger.log('找不到 ' + ALERT_USER_CONFIGS_SHEET + ' 工作表');
    return;
  }

  var allConfigs = getAllUserConfigs(configSheet);

  var alertConfigs = allConfigs.filter(function(c) {
    return c.type === 'alertRules';
  });

  Logger.log('找到 ' + alertConfigs.length + ' 条 alertRules 配置');

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
          if (!alertShouldRunNow(rule, nowHour, nowMin)) continue;
          if (alertHasRunRecently(rule, now)) continue;
        }

        Logger.log('执行预警规则: ' + rule.name + ' (用户=' + config.user + ', 项目=' + config.projectId + ')');

        var logEntry = executeAlertRule(rule, config, allConfigs);
        logs.push(logEntry);
        rule.lastRunAt = new Date().toISOString();
        changed = true;
      }

      if (logs.length > 200) {
        logs = logs.slice(logs.length - 200);
      }

      if (changed) {
        payload.rules = rules;
        payload.logs = logs;
        updateUserConfig(configSheet, config.user, config.projectId, 'alertRules', payload);
        Logger.log('已更新 alertRules 配置 (user=' + config.user + ', project=' + config.projectId + ')');
      }

    } catch (e) {
      Logger.log('处理 alertRules 出错 (user=' + config.user + '): ' + e.message);
    }
  }

  Logger.log('processAlertRules 执行完毕');
}

// ==================== 时间判断 ====================

function alertShouldRunNow(rule, nowHour, nowMin) {
  var parts = (rule.runAtTime || '09:00').split(':');
  var targetHour = parseInt(parts[0], 10);
  var targetMin = parseInt(parts[1], 10);

  var nowTotal = nowHour * 60 + nowMin;
  var targetTotal = targetHour * 60 + targetMin;
  return Math.abs(nowTotal - targetTotal) <= 15;
}

function alertHasRunRecently(rule, now) {
  if (!rule.lastRunAt) return false;
  var lastRun = new Date(rule.lastRunAt);
  var diffMs = now.getTime() - lastRun.getTime();
  return diffMs < 6 * 60 * 60 * 1000;
}

// ==================== 规则执行 ====================

function executeAlertRule(rule, config, allConfigs) {
  var logEntry = {
    ruleId: rule.id,
    ruleName: rule.name,
    metricKey: rule.metricKey,
    currentValue: 0,
    targetValue: rule.targetValue,
    triggerCondition: rule.triggerCondition,
    emails: rule.emails.join(', '),
    triggeredAt: new Date().toISOString(),
    status: 'OK',
    errorMessage: ''
  };

  try {
    // 1. 计算日期范围
    var dateRange = getAlertDateRange(rule);

    // 2. 拉取数据（单平台）
    var platform = rule.platform === 'meta' ? 'facebook' : 'google';
    var adData = alertFetchAdData(config.projectId, dateRange.start, dateRange.end, platform);

    if (!adData || adData.length === 0) {
      logEntry.status = 'OK';
      logEntry.errorMessage = '无数据';
      Logger.log('规则 ' + rule.name + ': 该时间段无数据');
      return logEntry;
    }

    // 3. 转换数据
    var transformed = alertTransformData(adData);

    // 4. 默认 segment 过滤
    transformed = transformed.filter(function(row) {
      return alertIsDefaultSegmentRow(row);
    });

    if (transformed.length === 0) {
      logEntry.status = 'OK';
      logEntry.errorMessage = '默认 segment 无数据';
      return logEntry;
    }

    // 5. 应用筛选条件组
    if (rule.filters && rule.filters.length > 0) {
      transformed = applyAlertFilters(transformed, rule.filters, rule.filterLogic || 'and');
    }

    if (transformed.length === 0) {
      logEntry.status = 'OK';
      logEntry.errorMessage = '筛选后无数据';
      return logEntry;
    }

    // 6. 聚合基础指标
    var aggregated = alertAggregateMetrics(transformed);

    // 7. 读取用户公式配置并计算指标
    var formulaConfig = allConfigs.filter(function(c) {
      return c.user === config.user && c.projectId === config.projectId && c.type === 'formulas';
    })[0];

    var formulas = [];
    if (formulaConfig) {
      var fd = typeof formulaConfig.data === 'string' ? JSON.parse(formulaConfig.data) : formulaConfig.data;
      formulas = Array.isArray(fd) ? fd : [];
    }

    var metricValue = computeFormulaMetric(rule.metricKey, formulas, aggregated);
    logEntry.currentValue = Math.round(metricValue * 10000) / 10000;

    // 8. 触发判断
    var triggered = false;
    if (rule.triggerCondition === 'above_target') {
      triggered = metricValue > rule.targetValue;
    } else if (rule.triggerCondition === 'below_target') {
      triggered = metricValue < rule.targetValue;
    }

    if (triggered) {
      logEntry.status = 'TRIGGERED';
      sendAlertEmail(rule, metricValue, dateRange);
      Logger.log('规则 ' + rule.name + ' 已触发: ' + rule.metricKey + '=' + metricValue + ' (目标=' + rule.targetValue + ')');
    } else {
      logEntry.status = 'OK';
      Logger.log('规则 ' + rule.name + ' 未触发: ' + rule.metricKey + '=' + metricValue + ' (目标=' + rule.targetValue + ')');
    }

  } catch (e) {
    logEntry.status = 'FAIL';
    logEntry.errorMessage = e.message || String(e);
    Logger.log('规则执行失败: ' + rule.name + ' - ' + e.message);
  }

  return logEntry;
}

// ==================== 日期范围计算 ====================

function getAlertDateRange(rule) {
  var days = rule.timeRangeValue || 7;
  var unit = rule.timeRangeUnit || 'days';

  if (unit === 'weeks') days = days * 7;
  else if (unit === 'months') days = days * 30;

  var today = new Date();
  var endDate = Utilities.formatDate(today, ALERT_TIMEZONE, 'yyyy-MM-dd');
  var startDateObj = new Date(today.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  var startDate = Utilities.formatDate(startDateObj, ALERT_TIMEZONE, 'yyyy-MM-dd');
  return { start: startDate, end: endDate };
}

// ==================== 数据拉取 ====================

function alertFetchAdData(projectId, startDate, endDate, platform) {
  try {
    var url = ALERT_AD_API_BASE + '/project/adsData/getAllFilterData'
      + '?projectId=' + projectId
      + '&startDate=' + startDate
      + '&endDate=' + endDate
      + '&platform=' + platform;

    var options = {
      method: 'get',
      headers: {
        'Authorization': 'Bearer ' + ALERT_AD_API_TOKEN,
        'clientid': ALERT_AD_API_CLIENT_ID,
        'Content-Type': 'application/json'
      },
      muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch(url, options);
    var result = JSON.parse(response.getContentText());

    if (result.code === 200 && result.data) {
      return result.data;
    }
    return [];
  } catch (e) {
    Logger.log('拉取 ' + platform + ' 数据失败: ' + e.message);
    return [];
  }
}

// ==================== 数据转换 ====================

function alertTransformData(apiData) {
  return apiData.map(function(row) {
    var costUsd = parseFloat(row.costUsd) || 0;
    var cost = parseFloat(row.cost) || 0;
    var effectiveCostUsd = costUsd > 0 ? costUsd : cost;
    var platform = (row.platform || '').toLowerCase();
    var adType = (row.campaignAdvertisingType || '').toUpperCase();

    return {
      'Campaign Name': row.campaignName || '',
      'Ad Set Name': row.adsetName || '',
      'Ad Name': row.adName || '',
      'Day': row.recordDate || '',
      'Campaign ID': row.campaignId || '',
      'Ad Set ID': row.adsetId || '',
      'Ad ID': row.adId || '',
      'Account ID': row.accountId || '',
      'Account Name': row.accountName || '',
      'Platform': platform,
      'Campaign Objective': row.campaignObjective || '',
      'Campaign Type': adType,
      'Country': row.country || '',
      'Amount spent (USD)': effectiveCostUsd,
      'Spend': cost,
      'Impressions': row.impressions || 0,
      'Reach': row.reach || 0,
      'Clicks (all)': row.clicks || 0,
      'Link clicks': row.linkClicks || 0,
      'Purchases': row.conversion || 0,
      'Purchases conversion value': row.conversionValue || 0,
      'Add to Cart': row.addToCart || 0,
      'Landing page views': row.landingPageViews || 0,
      'Leads': row.leads || 0,
      'Video views': row.videoViews || 0,
      'Checkouts initiated': row.checkout || 0,
      'Subscriptions': row.subscribe || 0,
      '__segments': (row.segments || '').toLowerCase(),
      '__platform': platform,
      '__campaignType': adType
    };
  });
}

// ==================== Segment 过滤 ====================

function alertIsDefaultSegmentRow(row) {
  var seg = (row['__segments'] || '').toLowerCase();
  var platform = (row['__platform'] || '').toLowerCase();
  var campaignType = (row['__campaignType'] || '').toUpperCase();
  if (platform.indexOf('google') >= 0 && campaignType === 'PERFORMANCE_MAX') {
    return seg === 'asset_group_date';
  }
  return seg === 'ad_date';
}

// ==================== 筛选条件组 ====================

function applyAlertFilters(data, filters, filterLogic) {
  if (!filters || filters.length === 0) return data;

  return data.filter(function(row) {
    var results = filters.map(function(f) {
      return evaluateFilterCondition(row, f);
    });

    if (filterLogic === 'or') {
      return results.some(function(r) { return r; });
    }
    // 默认 AND
    return results.every(function(r) { return r; });
  });
}

function evaluateFilterCondition(row, filter) {
  var fieldValue = String(row[filter.field] || '').toLowerCase();
  var filterValue = String(filter.value || '').toLowerCase();

  switch (filter.operator) {
    case 'contains':
      return fieldValue.indexOf(filterValue) >= 0;
    case 'not_contains':
      return fieldValue.indexOf(filterValue) < 0;
    case 'equals':
      return fieldValue === filterValue;
    case 'not_equals':
      return fieldValue !== filterValue;
    default:
      return true;
  }
}

// ==================== 聚合 ====================

function alertAggregateMetrics(data) {
  var totals = {};
  var metricKeys = Object.keys(ALERT_METRIC_KEY_MAP);

  metricKeys.forEach(function(key) {
    var col = ALERT_METRIC_KEY_MAP[key];
    totals[key] = 0;
    data.forEach(function(row) {
      totals[key] += (parseFloat(row[col]) || 0);
    });
  });

  return totals;
}

// ==================== 公式计算 ====================

/**
 * 根据公式名称在聚合后的指标上计算值
 * formulas: 用户保存的公式数组 [{ name, formula, ... }]
 * aggregated: { cost: 1000, impressions: 50000, ... }
 */
function computeFormulaMetric(metricKey, formulas, aggregated) {
  var formula = null;
  for (var i = 0; i < formulas.length; i++) {
    if (formulas[i].name === metricKey) {
      formula = formulas[i];
      break;
    }
  }

  if (!formula) {
    // 如果直接是基础指标 key
    if (aggregated[metricKey] !== undefined) {
      return aggregated[metricKey];
    }
    throw new Error('找不到指标 "' + metricKey + '" 的公式定义');
  }

  // 将公式中的变量名替换为聚合值
  var expr = formula.formula;
  var metricNames = Object.keys(aggregated);
  // 按长度降序排列以避免子串匹配（如 conversionValue 先于 conversion）
  metricNames.sort(function(a, b) { return b.length - a.length; });

  metricNames.forEach(function(key) {
    var regex = new RegExp('\\b' + key + '\\b', 'g');
    expr = expr.replace(regex, String(aggregated[key]));
  });

  try {
    var result = eval(expr);
    if (typeof result !== 'number' || !isFinite(result)) return 0;
    return result;
  } catch (e) {
    Logger.log('公式计算失败: ' + formula.formula + ' -> ' + expr + ' 错误: ' + e.message);
    return 0;
  }
}

// ==================== 邮件发送 ====================

function sendAlertEmail(rule, currentValue, dateRange) {
  var conditionText = rule.triggerCondition === 'above_target' ? '高于' : '低于';
  var subject = '【广告预警】' + rule.name + ' - ' + rule.metricKey + ' ' + conditionText + '目标值';

  var roundedValue = Math.round(currentValue * 10000) / 10000;

  var body = '你好，\n\n'
    + '以下广告预警规则已触发：\n\n'
    + '规则名称：' + rule.name + '\n'
    + '广告平台：' + (rule.platform === 'meta' ? 'Meta (Facebook)' : 'Google') + '\n'
    + '监控指标：' + rule.metricKey + '\n'
    + '当前值：' + roundedValue + '\n'
    + '目标值：' + rule.targetValue + '\n'
    + '触发条件：' + conditionText + '目标值\n'
    + '数据范围：' + dateRange.start + ' ~ ' + dateRange.end + '\n';

  if (rule.filters && rule.filters.length > 0) {
    body += '筛选条件 (' + (rule.filterLogic === 'or' ? 'OR' : 'AND') + ')：\n';
    rule.filters.forEach(function(f, idx) {
      var opText = { contains: '包含', not_contains: '不包含', equals: '等于', not_equals: '不等于' };
      body += '  ' + (idx + 1) + '. ' + f.field + ' ' + (opText[f.operator] || f.operator) + ' "' + f.value + '"\n';
    });
  }

  if (rule.alertContentTemplate) {
    body += '\n补充说明：' + rule.alertContentTemplate + '\n';
  }

  body += '\n---\n此邮件由广告数据报告分析平台自动发送，请勿直接回复。';

  var htmlBody = '<div style="font-family: Arial, sans-serif; color: #333; max-width: 600px;">'
    + '<h2 style="color: #e74c3c; border-bottom: 2px solid #e74c3c; padding-bottom: 8px;">'
    + '广告预警 - ' + rule.name + '</h2>'
    + '<table style="border-collapse: collapse; margin: 16px 0; width: 100%;">'
    + '<tr><td style="padding: 8px 12px; color: #666; border-bottom: 1px solid #eee;">广告平台</td>'
    + '<td style="padding: 8px 12px; font-weight: bold; border-bottom: 1px solid #eee;">'
    + (rule.platform === 'meta' ? 'Meta (Facebook)' : 'Google') + '</td></tr>'
    + '<tr><td style="padding: 8px 12px; color: #666; border-bottom: 1px solid #eee;">监控指标</td>'
    + '<td style="padding: 8px 12px; font-weight: bold; border-bottom: 1px solid #eee;">' + rule.metricKey + '</td></tr>'
    + '<tr style="background: #fff5f5;"><td style="padding: 8px 12px; color: #666; border-bottom: 1px solid #eee;">当前值</td>'
    + '<td style="padding: 8px 12px; font-weight: bold; color: #e74c3c; border-bottom: 1px solid #eee; font-size: 18px;">' + roundedValue + '</td></tr>'
    + '<tr><td style="padding: 8px 12px; color: #666; border-bottom: 1px solid #eee;">目标值</td>'
    + '<td style="padding: 8px 12px; font-weight: bold; border-bottom: 1px solid #eee;">' + rule.targetValue + '</td></tr>'
    + '<tr><td style="padding: 8px 12px; color: #666; border-bottom: 1px solid #eee;">触发条件</td>'
    + '<td style="padding: 8px 12px; font-weight: bold; border-bottom: 1px solid #eee;">' + conditionText + '目标值</td></tr>'
    + '<tr><td style="padding: 8px 12px; color: #666; border-bottom: 1px solid #eee;">数据范围</td>'
    + '<td style="padding: 8px 12px; font-weight: bold; border-bottom: 1px solid #eee;">'
    + dateRange.start + ' ~ ' + dateRange.end + '</td></tr>'
    + '</table>';

  if (rule.filters && rule.filters.length > 0) {
    htmlBody += '<h3 style="color: #666; font-size: 14px;">筛选条件 (' + (rule.filterLogic === 'or' ? 'OR - 满足任一' : 'AND - 满足全部') + ')</h3>'
      + '<ul style="margin: 8px 0; color: #555;">';
    var opLabels = { contains: '包含', not_contains: '不包含', equals: '等于', not_equals: '不等于' };
    rule.filters.forEach(function(f) {
      htmlBody += '<li style="margin: 4px 0;">' + f.field + ' <strong>' + (opLabels[f.operator] || f.operator) + '</strong> "' + f.value + '"</li>';
    });
    htmlBody += '</ul>';
  }

  if (rule.alertContentTemplate) {
    htmlBody += '<div style="margin: 16px 0; padding: 12px; background: #f8f9fa; border-left: 4px solid #4a86e8; border-radius: 4px;">'
      + '<strong style="color: #666;">补充说明：</strong><br>' + rule.alertContentTemplate + '</div>';
  }

  htmlBody += '<p style="color: #999; font-size: 12px; margin-top: 32px; border-top: 1px solid #eee; padding-top: 12px;">'
    + '此邮件由广告数据报告分析平台自动发送。</p>'
    + '</div>';

  var recipients = rule.emails.join(',');

  MailApp.sendEmail({
    to: recipients,
    subject: subject,
    body: body,
    htmlBody: htmlBody
  });

  Logger.log('预警邮件已发送至: ' + recipients);
}
