/**
 * ======================================================================
 * 数据服务 - 广告数据拉取、转换、透视聚合
 * ======================================================================
 * 此文件包含与原 ScheduledReports.gs 完全一致的数据处理逻辑：
 *   - 广告数据 API 拉取
 *   - 数据转换（字段映射）
 *   - 透视聚合（维度分组 + 指标求和 + 公式计算）
 *   - UserConfigs 读写
 * 复制到新 GAS 项目即可独立运行，不依赖原项目。
 * ======================================================================
 */

// ==================== UserConfigs 读写 ====================

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
      try { dataVal = JSON.parse(dataVal); } catch (e) { /* keep string */ }
    }

    configs.push({
      user: String(row[0]),
      projectId: String(row[1]),
      type: String(row[2]),
      data: dataVal,
      rowIndex: i + 2
    });
  }

  return configs;
}

function updateUserConfig(sheet, user, projectId, type, data) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    sheet.appendRow([user, projectId, type, JSON.stringify(data)]);
    return;
  }

  var allData = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  for (var i = 0; i < allData.length; i++) {
    if (String(allData[i][0]) === String(user)
      && String(allData[i][1]) === String(projectId)
      && String(allData[i][2]) === String(type)) {
      sheet.getRange(i + 2, 4).setValue(JSON.stringify(data));
      return;
    }
  }

  sheet.appendRow([user, projectId, type, JSON.stringify(data)]);
}

// ==================== 时间判断 ====================

function getDayOfWeekNumber(date) {
  var d = parseInt(Utilities.formatDate(date, TIMEZONE, 'u'), 10);
  return d;
}

function shouldRunNow(task, nowHour, nowMin, dayOfWeek) {
  var parts = (task.timeOfDay || '09:00').split(':');
  var targetHour = parseInt(parts[0], 10);
  var targetMin = parseInt(parts[1], 10);

  var nowTotal = nowHour * 60 + nowMin;
  var targetTotal = targetHour * 60 + targetMin;
  if (Math.abs(nowTotal - targetTotal) > 15) return false;

  if (task.frequency === 'weekly') {
    return task.weekDay === dayOfWeek;
  }
  return true;
}

function hasRunRecently(task, now) {
  if (!task.lastRunAt) return false;
  var lastRun = new Date(task.lastRunAt);
  var diffMs = now.getTime() - lastRun.getTime();
  return diffMs < 6 * 60 * 60 * 1000;
}

// ==================== 日期范围 ====================

function getTaskDateRange(task) {
  var preset = task.dateRangePreset || 'last3';

  if (preset === 'custom' && task.customDateStart && task.customDateEnd) {
    return { start: task.customDateStart, end: task.customDateEnd };
  }

  var daysMap = { 'last3': 3, 'last7': 7, 'last15': 15, 'last30': 30 };
  var days = daysMap[preset] || 3;

  var today = new Date();
  var endDate = Utilities.formatDate(today, TIMEZONE, 'yyyy-MM-dd');
  var startDateObj = new Date(today.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  var startDate = Utilities.formatDate(startDateObj, TIMEZONE, 'yyyy-MM-dd');
  return { start: startDate, end: endDate };
}

// ==================== 广告数据 API ====================

function fetchAdDataFromApi(projectId, startDate, endDate) {
  var allData = [];
  var platforms = ['facebook', 'google'];

  for (var p = 0; p < platforms.length; p++) {
    try {
      var url = AD_API_BASE + '/project/adsData/getAllFilterData'
        + '?projectId=' + projectId
        + '&startDate=' + startDate
        + '&endDate=' + endDate
        + '&platform=' + platforms[p].toUpperCase();

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

// ==================== 数据转换 ====================

function transformApiData(apiData) {
  function parseExtra(extra) {
    if (!extra) return null;
    if (typeof extra === 'object') return extra;
    if (typeof extra !== 'string') return null;
    try { return JSON.parse(extra); } catch (e) { return null; }
  }

  function getAge(row) {
    var extra = parseExtra(row.extra);
    return (
      row.ageRange || row.age_range || row.age ||
      (extra && (extra.ageRange || extra.age_range || extra.age)) || ''
    );
  }

  function getGender(row) {
    var extra = parseExtra(row.extra);
    return (
      row.genderType || row.gender_type || row.gender ||
      (extra && (extra.genderType || extra.gender_type || extra.gender)) || ''
    );
  }

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
      'Age': getAge(row),
      'Gender': getGender(row),
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

// ==================== Segment / Filter ====================

var SEGMENT_MODE_MAP = {
  'age': 'age_date',
  'gender': 'gender_adset_date',
  'country': 'country_campaign_date',
  'keyword': 'keyword_date',
  'search_term': 'search_term_date',
  'age_gender': 'age_gender_date'
};

function isDefaultSegmentRow(row) {
  var seg = (row['__segments'] || '').toLowerCase();
  var platform = (row['__platform'] || '').toLowerCase();
  var campaignType = (row['__campaignType'] || '').toUpperCase();
  if (platform.indexOf('google') >= 0 && campaignType === 'PERFORMANCE_MAX') {
    return seg === 'asset_group_date';
  }
  return seg === 'ad_date';
}

function filterBySegmentMode(data, segmentMode) {
  if (!segmentMode || segmentMode === 'default') {
    return data.filter(function(row) { return isDefaultSegmentRow(row); });
  }
  var targetSeg = SEGMENT_MODE_MAP[segmentMode];
  if (!targetSeg) {
    return data.filter(function(row) { return isDefaultSegmentRow(row); });
  }
  return data.filter(function(row) {
    var seg = (row['__segments'] || '').toLowerCase();
    var platform = (row['__platform'] || '').toLowerCase();
    var campaignType = (row['__campaignType'] || '').toUpperCase();
    if ((segmentMode === 'keyword' || segmentMode === 'search_term') &&
      !(platform.indexOf('google') >= 0 && campaignType === 'SEARCH')) {
      return isDefaultSegmentRow(row);
    }
    return seg === targetSeg;
  });
}

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

function applyPresetFilters(allData, preset) {
  var filtered = allData;
  filtered = filterBySegmentMode(filtered, preset.segmentMode);

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

  if (preset.filters && preset.filters.length > 0) {
    for (var f = 0; f < preset.filters.length; f++) {
      filtered = applyOneFilter(filtered, preset.filters[f]);
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

// ==================== 报告 Preset ====================

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
    var seen = {};
    allPresets = allPresets.filter(function(p) {
      if (p.id && seen[p.id]) return false;
      if (p.id) seen[p.id] = true;
      return true;
    });
  }
  return allPresets;
}

// ==================== 透视聚合 ====================

function getReferencedMetricKeys(formulaStr) {
  if (!formulaStr || typeof formulaStr !== 'string') return [];
  var knownKeys = Object.keys(METRIC_KEY_MAP);
  var found = [];
  for (var i = 0; i < knownKeys.length; i++) {
    var k = knownKeys[i];
    if (new RegExp('\\b' + k + '\\b').test(formulaStr)) found.push(k);
  }
  return found;
}

function evalFormulaForSheet(formula, context) {
  try {
    var expr = String(formula || '');
    var keys = Object.keys(context || {}).sort(function(a, b) {
      return b.length - a.length;
    });
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var re = new RegExp('\\b' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g');
      expr = expr.replace(re, '(' + (context[key] || 0) + ')');
    }
    if (/[^0-9\+\-\*\/\(\)\. ]/.test(expr)) return 0;
    var result = eval(expr);
    if (typeof result !== 'number' || !isFinite(result)) return 0;
    return result;
  } catch (e) {
    return 0;
  }
}

function getDisplayColumns(preset, data) {
  var columns = [];
  if (preset.rows) {
    preset.rows.forEach(function(key) {
      var col = DIMENSION_KEY_MAP[key] || key;
      if (columns.indexOf(col) < 0) columns.push(col);
    });
  }
  if (preset.columns) {
    preset.columns.forEach(function(key) {
      var col = DIMENSION_KEY_MAP[key] || key;
      if (columns.indexOf(col) < 0) columns.push(col);
    });
  }
  if (preset.values) {
    preset.values.forEach(function(key) {
      var col = METRIC_KEY_MAP[key] || key;
      if (columns.indexOf(col) < 0) columns.push(col);
    });
  }
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

function buildPivotSheetData(data, preset, formulas) {
  var rowDimKeys = (preset.rows || []);
  var colDimKeys = (preset.columns || []);
  var valueKeys = (preset.values || []);

  var rowDimCols = rowDimKeys.map(function(k) { return DIMENSION_KEY_MAP[k] || k; });
  var colDimCols = colDimKeys.map(function(k) { return DIMENSION_KEY_MAP[k] || k; });

  var formulaByName = {};
  if (formulas && formulas.length) {
    for (var fi = 0; fi < formulas.length; fi++) {
      var f = formulas[fi];
      if (f && f.name) formulaByName[f.name] = f;
    }
  }

  var baseValueKeys = [];
  var formulaKeys = [];
  for (var vk = 0; vk < valueKeys.length; vk++) {
    var k = valueKeys[vk];
    if (formulaByName[k]) formulaKeys.push(k);
    else baseValueKeys.push(k);
  }

  var requiredKeys = baseValueKeys.slice();
  for (var fi2 = 0; fi2 < formulaKeys.length; fi2++) {
    var fDef = formulaByName[formulaKeys[fi2]];
    if (!fDef || !fDef.formula) continue;
    var refs = getReferencedMetricKeys(fDef.formula);
    for (var ri = 0; ri < refs.length; ri++) {
      if (requiredKeys.indexOf(refs[ri]) === -1) requiredKeys.push(refs[ri]);
    }
  }
  var requiredCols = requiredKeys.map(function(k) { return METRIC_KEY_MAP[k] || null; }).filter(Boolean);
  var baseValueCols = baseValueKeys.map(function(k) { return METRIC_KEY_MAP[k] || k; });

  var allDimCols = rowDimCols.concat(colDimCols);

  if (allDimCols.length === 0 && valueKeys.length === 0) {
    return buildSheetData(data, getDisplayColumns(preset, data));
  }

  if (allDimCols.length === 0) {
    var totals = {};
    requiredCols.forEach(function(col) { totals[col] = 0; });
    data.forEach(function(row) {
      requiredCols.forEach(function(col) {
        totals[col] += (parseFloat(row[col]) || 0);
      });
    });
    var header = baseValueCols.slice();
    var totalRow = baseValueCols.map(function(col) {
      return Math.round((totals[col] || 0) * 100) / 100;
    });
    if (formulaKeys.length > 0) {
      var ctxTotals = {};
      requiredKeys.forEach(function(key) {
        var colName = METRIC_KEY_MAP[key];
        ctxTotals[key] = colName ? (totals[colName] || 0) : 0;
      });
      for (var fk = 0; fk < formulaKeys.length; fk++) {
        var fName = formulaKeys[fk];
        var fDef2 = formulaByName[fName];
        if (!fDef2) continue;
        header.push(fName);
        var val = evalFormulaForSheet(fDef2.formula, ctxTotals);
        totalRow.push(Math.round(val * 100) / 100);
      }
    }
    return [header, totalRow];
  }

  var groups = {};
  var groupOrder = [];

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var groupKeyParts = allDimCols.map(function(col) { return String(row[col] || ''); });
    var groupKey = groupKeyParts.join('|||');
    if (!groups[groupKey]) {
      groups[groupKey] = { dims: groupKeyParts, values: {} };
      requiredCols.forEach(function(col) { groups[groupKey].values[col] = 0; });
      groupOrder.push(groupKey);
    }
    requiredCols.forEach(function(col) {
      groups[groupKey].values[col] += (parseFloat(row[col]) || 0);
    });
  }

  groupOrder.sort(function(a, b) {
    var da = groups[a].dims;
    var db = groups[b].dims;
    for (var i = 0; i < da.length; i++) {
      var cmp = String(da[i]).localeCompare(String(db[i]));
      if (cmp !== 0) return cmp;
    }
    return 0;
  });

  var header2 = allDimCols.concat(baseValueCols, formulaKeys);
  var result = [header2];

  var lastDims = [];
  for (var g = 0; g < groupOrder.length; g++) {
    var group = groups[groupOrder[g]];
    var displayDims = group.dims.slice();
    if (allDimCols.length > 1) {
      for (var d = 0; d < displayDims.length; d++) {
        var samePrefix = true;
        for (var kk = 0; kk <= d; kk++) {
          if (group.dims[kk] !== lastDims[kk]) { samePrefix = false; break; }
        }
        if (samePrefix) displayDims[d] = '';
      }
      lastDims = group.dims.slice();
    }

    var metricValues = baseValueCols.map(function(col) {
      return Math.round((group.values[col] || 0) * 100) / 100;
    });

    var ctx = {};
    for (var ri2 = 0; ri2 < requiredKeys.length; ri2++) {
      var key2 = requiredKeys[ri2];
      var colName2 = METRIC_KEY_MAP[key2];
      ctx[key2] = colName2 ? (group.values[colName2] || 0) : 0;
    }
    var formulaValues = [];
    for (var fk2 = 0; fk2 < formulaKeys.length; fk2++) {
      var fname = formulaKeys[fk2];
      var fdef = formulaByName[fname];
      if (!fdef) { formulaValues.push(0); }
      else {
        var fv = evalFormulaForSheet(fdef.formula, ctx);
        formulaValues.push(Math.round(fv * 100) / 100);
      }
    }

    result.push(displayDims.concat(metricValues, formulaValues));
  }

  if (!preset.display || preset.display.showGrandTotal !== false) {
    var grandTotal = allDimCols.map(function(_, idx) { return idx === 0 ? '总计' : ''; });
    baseValueCols.forEach(function(col) {
      var sum = 0;
      for (var g2 = 0; g2 < groupOrder.length; g2++) {
        sum += groups[groupOrder[g2]].values[col];
      }
      grandTotal.push(Math.round(sum * 100) / 100);
    });
    if (formulaKeys.length > 0) {
      var ctxGrand = {};
      for (var ri3 = 0; ri3 < requiredKeys.length; ri3++) {
        var key3 = requiredKeys[ri3];
        var colName3 = METRIC_KEY_MAP[key3];
        if (!colName3) continue;
        var sumMetric = 0;
        for (var g3 = 0; g3 < groupOrder.length; g3++) {
          sumMetric += groups[groupOrder[g3]].values[colName3] || 0;
        }
        ctxGrand[key3] = sumMetric;
      }
      for (var fk3 = 0; fk3 < formulaKeys.length; fk3++) {
        var fname3 = formulaKeys[fk3];
        var fdef3 = formulaByName[fname3];
        if (!fdef3) { grandTotal.push(0); }
        else {
          var gv = evalFormulaForSheet(fdef3.formula, ctxGrand);
          grandTotal.push(Math.round(gv * 100) / 100);
        }
      }
    }
    result.push(grandTotal);
  }

  return result;
}
