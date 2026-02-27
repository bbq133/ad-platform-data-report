/**
 * ======================================================================
 * 定时报表发送 - Google Apps Script
 * ======================================================================
 * 
 * 功能：
 *   1. 读取 UserConfigs 中 type='scheduledReports' 的定时任务配置
 *   2. 根据 frequency/timeOfDay/weekDay 判断当前是否需要执行
 *   3. 读取对应的 pivotPresets 配置，调用广告数据 API 拉取数据
 *   4. 生成 Google Spreadsheet（每个报告一个 Sheet Tab）
 *   5. 通过 MailApp 发送邮件（含文档链接）
 *   6. 将发送结果写回 logs 字段
 * 
 * 部署方式：
 *   将本文件内容复制到你现有的 Google Apps Script 项目中（新建一个 .gs 文件）
 *   然后在 Apps Script 编辑器中创建 Time-driven Trigger
 * 
 * ======================================================================
 */

// ==================== 配置常量 ====================

var TIMEZONE = 'Asia/Shanghai'; // GMT+8
var SPREADSHEET_ID = '1rdNtMU_IfrhKPDl6xqXPFVn1vf-rm85zTVvR5ArSmWc';
var USER_CONFIGS_SHEET = 'UserConfigs';

var AD_API_BASE = 'https://api.globaloneclick.org';
var AD_API_TOKEN = 'globaloneclick';
var AD_API_CLIENT_ID = 'dce41dca2ad7cfaa5c3e306472571f0d';

// ==================== 主入口 ====================

/**
 * 定时触发器入口函数
 * 每 10 分钟或每小时由 Time-driven Trigger 调用
 * 正常运行时会根据时间窗口和 lastRunAt 做限制
 */
function processScheduledReports() {
  processScheduledReportsCore(false);
}

/**
 * 手动强制执行入口函数
 * 不受时间窗口和 lastRunAt 限制，适合调试或临时重发
 * 运行时在 Apps Script 里选择此函数执行即可
 */
function processScheduledReportsForce() {
  processScheduledReportsCore(true);
}

/**
 * 实际处理逻辑
 * @param {boolean} forceRun 是否跳过时间和频率限制
 */
function processScheduledReportsCore(forceRun) {
  var now = new Date();
  var nowStr = Utilities.formatDate(now, TIMEZONE, 'HH:mm');
  var nowHour = parseInt(nowStr.split(':')[0], 10);
  var nowMin = parseInt(nowStr.split(':')[1], 10);
  var dayOfWeek = getDayOfWeekNumber(now); // 1=Mon ... 7=Sun
  
  Logger.log('processScheduledReports 开始执行: ' + nowStr + ', 星期' + dayOfWeek);
  
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var configSheet = ss.getSheetByName(USER_CONFIGS_SHEET);
  if (!configSheet) {
    Logger.log('找不到 ' + USER_CONFIGS_SHEET + ' 工作表');
    return;
  }
  
  var allConfigs = getAllUserConfigs(configSheet);
  
  // 筛选出所有 scheduledReports 配置
  var scheduledConfigs = allConfigs.filter(function(c) {
    return c.type === 'scheduledReports';
  });
  
  Logger.log('找到 ' + scheduledConfigs.length + ' 条 scheduledReports 配置');
  
  for (var i = 0; i < scheduledConfigs.length; i++) {
    var config = scheduledConfigs[i];
    try {
      var payload = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      var tasks = payload.tasks || [];
      var logs = payload.logs || [];
      var changed = false;
      
      for (var j = 0; j < tasks.length; j++) {
        var task = tasks[j];
        if (!task.active) continue;
        if (!forceRun) {
          // 判断是否应该在当前时间执行
          if (!shouldRunNow(task, nowHour, nowMin, dayOfWeek)) continue;
          
          // 防止重复执行：检查 lastRunAt 是否在同一天的同一时间窗口
          if (hasRunRecently(task, now)) continue;
        }
        
        Logger.log('执行任务: ' + task.name + ' (用户=' + config.user + ', 项目=' + config.projectId + ')');
        
        var logEntry = executeTask(task, config, allConfigs);
        logs.push(logEntry);
        task.lastRunAt = new Date().toISOString();
        changed = true;
      }
      
      // 只保留最近 100 条日志
      if (logs.length > 100) {
        logs = logs.slice(logs.length - 100);
      }
      
      if (changed) {
        payload.tasks = tasks;
        payload.logs = logs;
        updateUserConfig(configSheet, config.user, config.projectId, 'scheduledReports', payload);
        Logger.log('已更新配置 (user=' + config.user + ', project=' + config.projectId + ')');
      }
      
    } catch (e) {
      Logger.log('处理配置出错 (user=' + config.user + '): ' + e.message);
    }
  }
  
  Logger.log('processScheduledReports 执行完毕');
}

// ==================== 时间判断 ====================

function getDayOfWeekNumber(date) {
  // JavaScript: 0=Sun, 1=Mon ... 6=Sat -> 转为 1=Mon ... 7=Sun
  var d = parseInt(Utilities.formatDate(date, TIMEZONE, 'u'), 10); // u = day of week (1=Mon)
  return d;
}

function shouldRunNow(task, nowHour, nowMin, dayOfWeek) {
  var parts = (task.timeOfDay || '09:00').split(':');
  var targetHour = parseInt(parts[0], 10);
  var targetMin = parseInt(parts[1], 10);
  
  // 允许 +/- 15 分钟的时间窗口
  var nowTotal = nowHour * 60 + nowMin;
  var targetTotal = targetHour * 60 + targetMin;
  if (Math.abs(nowTotal - targetTotal) > 15) return false;
  
  if (task.frequency === 'weekly') {
    return task.weekDay === dayOfWeek;
  }
  
  return true; // daily
}

function hasRunRecently(task, now) {
  if (!task.lastRunAt) return false;
  var lastRun = new Date(task.lastRunAt);
  var diffMs = now.getTime() - lastRun.getTime();
  // 如果距离上次运行不到 6 小时，跳过（防止同一时间窗口重复触发）
  return diffMs < 6 * 60 * 60 * 1000;
}

// ==================== 任务执行 ====================

function executeTask(task, config, allConfigs) {
  var logEntry = {
    taskId: task.id,
    taskName: task.name,
    presetNames: '',
    emails: task.emails.join(', '),
    sentAt: new Date().toISOString(),
    status: 'FAIL',
    sheetUrl: '',
    errorMessage: ''
  };
  
  try {
    // 1. 获取 pivotPresets
    var pivotConfig = allConfigs.filter(function(c) {
      return c.user === config.user && c.projectId === config.projectId && c.type === 'pivotPresets';
    })[0];
    
    if (!pivotConfig) {
      throw new Error('找不到用户的 pivotPresets 配置');
    }
    
    var pivotData = typeof pivotConfig.data === 'string' ? JSON.parse(pivotConfig.data) : pivotConfig.data;
    var allPresets = extractAllPresets(pivotData);
    
    // 按 ID 筛选需要发送的报告
    var selectedPresets = [];
    var presetNames = [];
    for (var i = 0; i < task.pivotPresetIds.length; i++) {
      var pid = task.pivotPresetIds[i];
      var found = allPresets.filter(function(p) { return p.id === pid; })[0];
      if (found) {
        selectedPresets.push(found);
        presetNames.push(found.name);
      }
    }
    
    logEntry.presetNames = presetNames.join(', ');
    
    if (selectedPresets.length === 0) {
      throw new Error('未找到匹配的已保存报告');
    }
    
    // 2. 拉取广告数据（根据任务配置的时间范围）
    var dateRange = getTaskDateRange(task);
    var adData = fetchAdDataFromApi(config.projectId, dateRange.start, dateRange.end);
    
    if (!adData || adData.length === 0) {
      throw new Error('API 未返回数据（项目=' + config.projectId + '）');
    }
    
    // 3. 转换数据
    var transformedData = transformApiData(adData);
    
    // 4. 创建 / 更新 Google Spreadsheet
    var reportSpreadsheet = createOrUpdateReportSpreadsheet(task, selectedPresets, transformedData);
    var sheetUrl = reportSpreadsheet.getUrl();
    logEntry.sheetUrl = sheetUrl;
    
    // 5. 发送邮件
    sendReportEmail(task, sheetUrl, presetNames, dateRange);
    
    logEntry.status = 'SUCCESS';
    Logger.log('任务执行成功: ' + task.name);
    
  } catch (e) {
    logEntry.errorMessage = e.message || String(e);
    Logger.log('任务执行失败: ' + task.name + ' - ' + e.message);
  }
  
  return logEntry;
}

// ==================== 数据拉取 ====================

/**
 * 根据任务配置计算数据日期范围
 * dateRangePreset: 'last3' | 'last7' | 'last15' | 'last30' | 'custom'
 */
function getTaskDateRange(task) {
  var preset = task.dateRangePreset || 'last3';
  
  if (preset === 'custom' && task.customDateStart && task.customDateEnd) {
    return { start: task.customDateStart, end: task.customDateEnd };
  }
  
  var daysMap = {
    'last3': 3,
    'last7': 7,
    'last15': 15,
    'last30': 30
  };
  var days = daysMap[preset] || 3;
  
  var today = new Date();
  var endDate = Utilities.formatDate(today, TIMEZONE, 'yyyy-MM-dd');
  var startDateObj = new Date(today.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  var startDate = Utilities.formatDate(startDateObj, TIMEZONE, 'yyyy-MM-dd');
  return { start: startDate, end: endDate };
}

function getDefaultDateRange() {
  return getTaskDateRange({ dateRangePreset: 'last15' });
}

function fetchAdDataFromApi(projectId, startDate, endDate) {
  var allData = [];
  var platforms = ['facebook', 'google'];
  
  for (var p = 0; p < platforms.length; p++) {
    try {
      var url = AD_API_BASE + '/project/adsData/getAllFilterData'
        + '?projectId=' + projectId
        + '&startDate=' + startDate
        + '&endDate=' + endDate
        + '&platform=' + platforms[p];
      
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
      }
    } catch (e) {
      Logger.log('拉取 ' + platforms[p] + ' 数据失败: ' + e.message);
    }
  }
  
  return allData;
}

// ==================== 数据转换（简化版） ====================

function transformApiData(apiData) {
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
      'Device': row.device || '',
      'Age': row.ageRange || '',
      'Gender': row.genderType || '',
      'Amount spent (USD)': effectiveCostUsd,
      'Spend': cost,
      'Currency': row.currency || '',
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
      'Keyword': row.keyword || '',
      'Search term': row.searchTerm || '',
      'Category': row.category || '',
      'Product Series': row.productSeries || '',
      '__segments': (row.segments || '').toLowerCase(),
      '__platform': platform,
      '__campaignType': adType
    };
  });
}

// ==================== 报告生成 ====================

function extractAllPresets(pivotData) {
  var allPresets = [];
  if (Array.isArray(pivotData)) {
    allPresets = pivotData;
  } else if (pivotData && pivotData.byAccountKey) {
    var keys = Object.keys(pivotData.byAccountKey);
    for (var i = 0; i < keys.length; i++) {
      var list = pivotData.byAccountKey[keys[i]];
      if (Array.isArray(list)) {
        allPresets = allPresets.concat(list);
      }
    }
    // 去重
    var seen = {};
    allPresets = allPresets.filter(function(p) {
      if (p.id && seen[p.id]) return false;
      if (p.id) seen[p.id] = true;
      return true;
    });
  }
  return allPresets;
}

function createOrUpdateReportSpreadsheet(task, presets, allData) {
  var spreadsheet;
  
  // 尝试打开已有文档
  if (task.sheetFileId) {
    try {
      spreadsheet = SpreadsheetApp.openById(task.sheetFileId);
    } catch (e) {
      Logger.log('无法打开已有文档 ' + task.sheetFileId + ', 将创建新的');
      spreadsheet = null;
    }
  }
  
  // 创建新文档
  if (!spreadsheet) {
    var title = '定时报表 - ' + task.name + ' - ' + Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
    spreadsheet = SpreadsheetApp.create(title);
    task.sheetFileId = spreadsheet.getId();
    
    // 设置分享：任何有链接的人可查看
    try {
      DriveApp.getFileById(spreadsheet.getId()).setSharing(
        DriveApp.Access.ANYONE_WITH_LINK,
        DriveApp.Permission.VIEW
      );
    } catch (e) {
      Logger.log('设置分享权限失败: ' + e.message);
    }
  }
  
  // 为每个 preset 创建 / 更新一个 Sheet Tab
  for (var i = 0; i < presets.length; i++) {
    var preset = presets[i];
    var sheetName = sanitizeSheetName(preset.name);
    
    // 根据 preset 的 filters、platformScopes 过滤数据
    var filteredData = applyPresetFilters(allData, preset);
    
    // 按透视维度分组聚合（与前端透视表一致）
    var sheetData = buildPivotSheetData(filteredData, preset);
    
    // 写入 Sheet
    writeToSheet(spreadsheet, sheetName, sheetData);
  }
  
  // 删除默认的 Sheet1（如果存在且有其他 sheet）
  try {
    var defaultSheet = spreadsheet.getSheetByName('Sheet1') || spreadsheet.getSheetByName('工作表1');
    if (defaultSheet && spreadsheet.getSheets().length > 1) {
      spreadsheet.deleteSheet(defaultSheet);
    }
  } catch (e) { /* ignore */ }
  
  return spreadsheet;
}

function sanitizeSheetName(name) {
  // Sheet 名称不能超过 100 字符，不能包含特殊字符
  var clean = (name || 'Report').replace(/[\/\\?*\[\]:]/g, '_');
  return clean.substring(0, 100);
}

/**
 * segment 模式到 API segments 值的映射（与前端 PIVOT_SEGMENT_MODE_MAP 一致）
 */
var SEGMENT_MODE_MAP = {
  'age': 'age_date',
  'gender': 'gender_adset_date',
  'country': 'country_campaign_date',
  'keyword': 'keyword_date',
  'search_term': 'search_term_date'
};

/**
 * 判断一行是否属于默认 segment（与前端 isDefaultSegmentRow 一致）
 */
function isDefaultSegmentRow(row) {
  var seg = (row['__segments'] || '').toLowerCase();
  var platform = (row['__platform'] || '').toLowerCase();
  var campaignType = (row['__campaignType'] || '').toUpperCase();
  if (platform.indexOf('google') >= 0 && campaignType === 'PERFORMANCE_MAX') {
    return seg === 'asset_group_date';
  }
  return seg === 'ad_date';
}

/**
 * 按 segment 模式过滤数据（与前端 matchesSegment 一致）
 */
function filterBySegmentMode(data, segmentMode) {
  if (!segmentMode || segmentMode === 'default') {
    return data.filter(function(row) {
      return isDefaultSegmentRow(row);
    });
  }
  
  var targetSeg = SEGMENT_MODE_MAP[segmentMode];
  if (!targetSeg) {
    return data.filter(function(row) {
      return isDefaultSegmentRow(row);
    });
  }
  
  return data.filter(function(row) {
    var seg = (row['__segments'] || '').toLowerCase();
    var platform = (row['__platform'] || '').toLowerCase();
    var campaignType = (row['__campaignType'] || '').toUpperCase();
    
    // country segment 仅 Meta 有
    if (segmentMode === 'country' && platform.indexOf('facebook') < 0) {
      return isDefaultSegmentRow(row);
    }
    // keyword / search_term segment 仅 Google Search 有
    if ((segmentMode === 'keyword' || segmentMode === 'search_term') &&
      !(platform.indexOf('google') >= 0 && campaignType === 'SEARCH')) {
      return isDefaultSegmentRow(row);
    }
    return seg === targetSeg;
  });
}

function applyPresetFilters(allData, preset) {
  var filtered = allData;
  
  // 1. 按 segment 模式过滤（最重要：决定数据行的粒度）
  filtered = filterBySegmentMode(filtered, preset.segmentMode);
  
  // 2. 按平台范围过滤
  if (preset.platformScopes && preset.platformScopes.length > 0) {
    filtered = filtered.filter(function(row) {
      var platform = (row['__platform'] || '').toLowerCase();
      var campaignType = (row['__campaignType'] || '').toUpperCase();
      
      for (var i = 0; i < preset.platformScopes.length; i++) {
        var scope = preset.platformScopes[i];
        if (scope === 'meta' && platform.indexOf('facebook') >= 0) return true;
        if (scope === 'meta' && platform.indexOf('meta') >= 0) return true;
        if (scope === 'google_search' && platform.indexOf('google') >= 0 && campaignType === 'SEARCH') return true;
        if (scope === 'google_demand_gen' && platform.indexOf('google') >= 0 && campaignType === 'DEMAND_GEN') return true;
        if (scope === 'google_performance_max' && platform.indexOf('google') >= 0 && campaignType === 'PERFORMANCE_MAX') return true;
        if (scope === 'google_video' && platform.indexOf('google') >= 0 && campaignType === 'VIDEO') return true;
        if (scope === 'google_shopping' && platform.indexOf('google') >= 0 && campaignType === 'SHOPPING') return true;
      }
      return false;
    });
  }
  
  // 3. 按报告中保存的 filters 过滤
  if (preset.filters && preset.filters.length > 0) {
    for (var f = 0; f < preset.filters.length; f++) {
      var filter = preset.filters[f];
      filtered = applyOneFilter(filtered, filter);
    }
  }
  
  return filtered;
}

function resolveFilterFieldKey(fieldKey) {
  return DIMENSION_KEY_MAP[fieldKey] || fieldKey;
}

function applyOneFilter(data, filter) {
  if (!filter || !filter.fieldKey) return data;
  
  var colName = resolveFilterFieldKey(filter.fieldKey);
  
  if (filter.mode === 'multi' && filter.selectedValues && filter.selectedValues.length > 0) {
    var valSet = {};
    filter.selectedValues.forEach(function(v) { valSet[v] = true; });
    return data.filter(function(row) {
      return valSet[String(row[colName] || '')] === true;
    });
  }
  
  if (filter.mode === 'contains' && filter.textValue) {
    var searchText = filter.textValue.toLowerCase();
    return data.filter(function(row) {
      return String(row[colName] || '').toLowerCase().indexOf(searchText) >= 0;
    });
  }
  
  if (filter.mode === 'not_contains' && filter.textValue) {
    var excludeText = filter.textValue.toLowerCase();
    return data.filter(function(row) {
      return String(row[colName] || '').toLowerCase().indexOf(excludeText) < 0;
    });
  }
  
  if (filter.mode === 'date_range' && filter.dateRange) {
    return data.filter(function(row) {
      var val = String(row[colName] || '');
      if (filter.dateRange.start && val < filter.dateRange.start) return false;
      if (filter.dateRange.end && val > filter.dateRange.end) return false;
      return true;
    });
  }
  
  return data;
}

// ==================== 列选择 & 数据构建 ====================

// 维度 key 到数据列名的映射
var DIMENSION_KEY_MAP = {
  'Campaign': 'Campaign Name',
  'Ad Set': 'Ad Set Name',
  'Ad': 'Ad Name',
  'Day': 'Day',
  'Gender': 'Gender',
  'Age': 'Age',
  'Country': 'Country',
  'Device': 'Device',
  'Account': 'Account Name',
  'Campaign ID': 'Campaign ID',
  'Ad Set ID': 'Ad Set ID',
  'Ad ID': 'Ad ID',
  'Account ID': 'Account ID',
  'Ad Type': 'Campaign Type',
  'Keyword': 'Keyword',
  'Search Term': 'Search term',
  'Category': 'Category',
  'Product Series': 'Product Series',
  'Platform': 'Platform'
};

// 指标 key 到数据列名的映射
var METRIC_KEY_MAP = {
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

function getDisplayColumns(preset, data) {
  var columns = [];
  
  // 添加行维度
  if (preset.rows) {
    preset.rows.forEach(function(key) {
      var col = DIMENSION_KEY_MAP[key] || key;
      if (columns.indexOf(col) < 0) columns.push(col);
    });
  }
  
  // 添加列维度
  if (preset.columns) {
    preset.columns.forEach(function(key) {
      var col = DIMENSION_KEY_MAP[key] || key;
      if (columns.indexOf(col) < 0) columns.push(col);
    });
  }
  
  // 添加指标
  if (preset.values) {
    preset.values.forEach(function(key) {
      var col = METRIC_KEY_MAP[key] || key;
      if (columns.indexOf(col) < 0) columns.push(col);
    });
  }
  
  // 如果都为空，则默认输出所有列（排除内部字段）
  if (columns.length === 0 && data.length > 0) {
    columns = Object.keys(data[0]).filter(function(k) {
      return k.indexOf('__') !== 0;
    });
  }
  
  return columns;
}

function buildSheetData(data, columns) {
  var result = [columns];
  
  for (var i = 0; i < data.length; i++) {
    var row = [];
    for (var j = 0; j < columns.length; j++) {
      var val = data[i][columns[j]];
      row.push(val !== undefined && val !== null ? val : '');
    }
    result.push(row);
  }
  
  return result;
}

/**
 * 透视聚合：按 preset.rows + preset.columns 分组，对 preset.values 求和
 * 输出与前端透视表一致的汇总数据
 */
function buildPivotSheetData(data, preset) {
  var rowDimKeys = (preset.rows || []);
  var colDimKeys = (preset.columns || []);
  var valueKeys = (preset.values || []);
  
  // 将 key 映射为实际数据列名
  var rowDimCols = rowDimKeys.map(function(k) { return DIMENSION_KEY_MAP[k] || k; });
  var colDimCols = colDimKeys.map(function(k) { return DIMENSION_KEY_MAP[k] || k; });
  var valueCols = valueKeys.map(function(k) { return METRIC_KEY_MAP[k] || k; });
  
  // 所有维度列合并（行维度 + 列维度）
  var allDimCols = rowDimCols.concat(colDimCols);
  
  if (allDimCols.length === 0 && valueCols.length === 0) {
    return buildSheetData(data, getDisplayColumns(preset, data));
  }
  
  // 如果没有维度只有指标，输出全局汇总一行
  if (allDimCols.length === 0) {
    var totals = {};
    valueCols.forEach(function(col) { totals[col] = 0; });
    data.forEach(function(row) {
      valueCols.forEach(function(col) {
        totals[col] += (parseFloat(row[col]) || 0);
      });
    });
    var header = valueCols;
    var totalRow = valueCols.map(function(col) {
      return Math.round(totals[col] * 100) / 100;
    });
    return [header, totalRow];
  }
  
  // 按维度组合生成分组 key，聚合指标
  var groups = {};
  var groupOrder = [];
  
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var groupKeyParts = allDimCols.map(function(col) {
      return String(row[col] || '');
    });
    var groupKey = groupKeyParts.join('|||');
    
    if (!groups[groupKey]) {
      groups[groupKey] = { dims: groupKeyParts, values: {} };
      valueCols.forEach(function(col) { groups[groupKey].values[col] = 0; });
      groupOrder.push(groupKey);
    }
    
    valueCols.forEach(function(col) {
      groups[groupKey].values[col] += (parseFloat(row[col]) || 0);
    });
  }
  
  // 按维度层级排序（与前端 build() 递归分组一致）
  groupOrder.sort(function(a, b) {
    var da = groups[a].dims;
    var db = groups[b].dims;
    for (var i = 0; i < da.length; i++) {
      var cmp = String(da[i]).localeCompare(String(db[i]));
      if (cmp !== 0) return cmp;
    }
    return 0;
  });
  
  // 构建表头
  var header = allDimCols.concat(valueCols);
  var result = [header];
  
  // 构建数据行（多行维度时去掉连续重复值，与前端显示一致）
  var lastDims = [];
  for (var g = 0; g < groupOrder.length; g++) {
    var group = groups[groupOrder[g]];
    var displayDims = group.dims.slice();
    
    if (allDimCols.length > 1) {
      for (var d = 0; d < displayDims.length; d++) {
        var samePrefix = true;
        for (var k = 0; k <= d; k++) {
          if (group.dims[k] !== lastDims[k]) { samePrefix = false; break; }
        }
        if (samePrefix) {
          displayDims[d] = '';
        }
      }
      lastDims = group.dims.slice();
    }
    
    var outputRow = displayDims.concat(
      valueCols.map(function(col) {
        return Math.round(group.values[col] * 100) / 100;
      })
    );
    result.push(outputRow);
  }
  
  // 添加总计行（与前端 showGrandTotal 对应）
  if (!preset.display || preset.display.showGrandTotal !== false) {
    var grandTotal = allDimCols.map(function(_, idx) {
      return idx === 0 ? '总计' : '';
    });
    valueCols.forEach(function(col) {
      var sum = 0;
      for (var g = 0; g < groupOrder.length; g++) {
        sum += groups[groupOrder[g]].values[col];
      }
      grandTotal.push(Math.round(sum * 100) / 100);
    });
    result.push(grandTotal);
  }
  
  return result;
}

function writeToSheet(spreadsheet, sheetName, data) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  
  if (sheet) {
    sheet.clear();
  } else {
    sheet = spreadsheet.insertSheet(sheetName);
  }
  
  if (data.length > 0 && data[0].length > 0) {
    sheet.getRange(1, 1, data.length, data[0].length).setValues(data);
    
    // 格式化表头
    var headerRange = sheet.getRange(1, 1, 1, data[0].length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#4a86e8');
    headerRange.setFontColor('#ffffff');
    
    // 自动调整列宽
    for (var c = 1; c <= data[0].length; c++) {
      sheet.autoResizeColumn(c);
    }
    
    // 冻结首行
    sheet.setFrozenRows(1);
  }
}

// ==================== 邮件发送 ====================

function sendReportEmail(task, sheetUrl, presetNames, dateRange) {
  var subject = '【广告数据报表】' + task.name + ' - ' + Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
  
  var freqText = task.frequency === 'daily' ? '每天' : '每周';
  var presetList = presetNames.map(function(name, idx) {
    return '  ' + (idx + 1) + '. ' + name;
  }).join('\n');
  
  var body = '你好，\n\n'
    + '以下是自动生成的广告数据报表：\n\n'
    + '任务名称：' + task.name + '\n'
    + '发送频率：' + freqText + ' ' + task.timeOfDay + '\n'
    + '数据范围：' + dateRange.start + ' ~ ' + dateRange.end + '\n\n'
    + '包含报告：\n' + presetList + '\n\n'
    + '在线文档链接：\n' + sheetUrl + '\n\n'
    + '（每个报告对应文档中的一个 Sheet 标签页，Sheet 名称即报告名称）\n\n'
    + '---\n'
    + '此邮件由广告数据报告分析平台自动发送，请勿直接回复。';
  
  var htmlBody = '<div style="font-family: Arial, sans-serif; color: #333; max-width: 600px;">'
    + '<h2 style="color: #4a86e8; border-bottom: 2px solid #4a86e8; padding-bottom: 8px;">'
    + '广告数据报表 - ' + task.name + '</h2>'
    + '<table style="border-collapse: collapse; margin: 16px 0;">'
    + '<tr><td style="padding: 6px 12px; color: #666;">发送频率</td>'
    + '<td style="padding: 6px 12px; font-weight: bold;">' + freqText + ' ' + task.timeOfDay + '</td></tr>'
    + '<tr><td style="padding: 6px 12px; color: #666;">数据范围</td>'
    + '<td style="padding: 6px 12px; font-weight: bold;">' + dateRange.start + ' ~ ' + dateRange.end + '</td></tr>'
    + '</table>'
    + '<h3 style="color: #333;">包含报告</h3>'
    + '<ul style="margin: 8px 0;">';
  
  for (var i = 0; i < presetNames.length; i++) {
    htmlBody += '<li style="margin: 4px 0;">' + presetNames[i] + '</li>';
  }
  
  htmlBody += '</ul>'
    + '<div style="margin: 24px 0;">'
    + '<a href="' + sheetUrl + '" style="display: inline-block; padding: 12px 24px; '
    + 'background-color: #4a86e8; color: #fff; text-decoration: none; border-radius: 6px; '
    + 'font-weight: bold;">查看在线报表文档</a>'
    + '</div>'
    + '<p style="color: #999; font-size: 12px; margin-top: 32px; border-top: 1px solid #eee; padding-top: 12px;">'
    + '每个报告对应文档中的一个 Sheet 标签页，Sheet 名称即报告名称。<br>'
    + '此邮件由广告数据报告分析平台自动发送。</p>'
    + '</div>';
  
  // 发送给所有收件人
  var recipients = task.emails.join(',');
  
  MailApp.sendEmail({
    to: recipients,
    subject: subject,
    body: body,
    htmlBody: htmlBody
  });
  
  Logger.log('邮件已发送至: ' + recipients);
}

// ==================== UserConfigs 读写辅助 ====================

/**
 * 读取 UserConfigs 工作表全部数据
 * 假设列结构为: user | projectId | type | data
 */
function getAllUserConfigs(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  
  var data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  var configs = [];
  
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (!row[0] && !row[1]) continue;
    
    var dataVal = row[3];
    if (typeof dataVal === 'string' && dataVal.trim()) {
      try {
        dataVal = JSON.parse(dataVal);
      } catch (e) {
        // 保持字符串
      }
    }
    
    configs.push({
      user: String(row[0]),
      projectId: String(row[1]),
      type: String(row[2]),
      data: dataVal,
      rowIndex: i + 2 // 实际 sheet 行号（1-based，含表头）
    });
  }
  
  return configs;
}

/**
 * 更新指定 user + projectId + type 的配置
 */
function updateUserConfig(sheet, user, projectId, type, data) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  
  var allData = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  
  for (var i = 0; i < allData.length; i++) {
    if (String(allData[i][0]) === String(user)
      && String(allData[i][1]) === String(projectId)
      && String(allData[i][2]) === String(type)) {
      // 找到对应行，更新 data 列
      sheet.getRange(i + 2, 4).setValue(JSON.stringify(data));
      return;
    }
  }
  
  // 未找到则追加新行
  sheet.appendRow([user, projectId, type, JSON.stringify(data)]);
}
