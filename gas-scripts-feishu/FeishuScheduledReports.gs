/**
 * ======================================================================
 * 飞书定时报表 - 核心调度
 * ======================================================================
 * 流程：
 *   1. 读取 UserConfigs 中 type='feishuScheduledReports' 的配置
 *   2. 根据 frequency/timeOfDay/weekDay 判断是否执行
 *   3. 读取 pivotPresets + formulas，调用广告数据 API 拉取数据
 *   4. 生成飞书电子表格（每个报告一个工作表 Tab）
 *   5. 从飞书通讯录解析收件人邮箱
 *   6. 通过 MailApp 发送邮件（含飞书文档链接）
 *   7. 将发送结果写回 logs 字段
 *
 * 触发器：
 *   在新 GAS 项目中创建 Time-driven Trigger，
 *   定期调用 processFeishuScheduledReports()
 * ======================================================================
 */

// ==================== 主入口 ====================

/**
 * 定时触发器入口
 */
function processFeishuScheduledReports() {
  processFeishuScheduledReportsCore(false);
}

/**
 * 手动强制执行（调试用，不受时间窗口限制）
 */
function processFeishuScheduledReportsForce() {
  processFeishuScheduledReportsCore(true);
}

function processFeishuScheduledReportsCore(forceRun) {
  var now = new Date();
  var nowStr = Utilities.formatDate(now, TIMEZONE, 'HH:mm');
  var nowHour = parseInt(nowStr.split(':')[0], 10);
  var nowMin = parseInt(nowStr.split(':')[1], 10);
  var dayOfWeek = getDayOfWeekNumber(now);

  Logger.log('[飞书] 定时报表开始执行: ' + nowStr + ', 星期' + dayOfWeek);

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var configSheet = ss.getSheetByName(USER_CONFIGS_SHEET);
  if (!configSheet) {
    Logger.log('[飞书] 找不到 ' + USER_CONFIGS_SHEET + ' 工作表');
    return;
  }

  var allConfigs = getAllUserConfigs(configSheet);

  var scheduledConfigs = allConfigs.filter(function(c) {
    return c.type === FEISHU_CONFIG_TYPE;
  });

  Logger.log('[飞书] 找到 ' + scheduledConfigs.length + ' 条 feishuScheduledReports 配置');

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
          if (!shouldRunNow(task, nowHour, nowMin, dayOfWeek)) continue;
          if (hasRunRecently(task, now)) continue;
        }

        Logger.log('[飞书] 执行任务: ' + task.name + ' (用户=' + config.user + ', 项目=' + config.projectId + ')');

        var logEntry = executeFeishuTask(task, config, allConfigs);
        logs.push(logEntry);
        task.lastRunAt = new Date().toISOString();
        changed = true;
      }

      if (logs.length > 100) {
        logs = logs.slice(logs.length - 100);
      }

      if (changed) {
        payload.tasks = tasks;
        payload.logs = logs;
        updateUserConfig(configSheet, config.user, config.projectId, FEISHU_CONFIG_TYPE, payload);
        Logger.log('[飞书] 已更新配置 (user=' + config.user + ', project=' + config.projectId + ')');
      }
    } catch (e) {
      Logger.log('[飞书] 处理配置出错 (user=' + config.user + '): ' + e.message);
    }
  }

  Logger.log('[飞书] 定时报表执行完毕');
}

// ==================== 任务执行 ====================

function executeFeishuTask(task, config, allConfigs) {
  var logEntry = {
    taskId: task.id,
    taskName: task.name,
    presetNames: '',
    recipients: '',
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

    // 1.1 获取用户自定义公式
    var formulaConfig = allConfigs.filter(function(c) {
      return c.user === config.user && c.projectId === config.projectId && c.type === 'formulas';
    })[0];
    var formulas = [];
    if (formulaConfig && formulaConfig.data) {
      var formulaData = typeof formulaConfig.data === 'string' ? JSON.parse(formulaConfig.data) : formulaConfig.data;
      if (Array.isArray(formulaData)) formulas = formulaData;
    }

    // 2. 筛选选中的报告
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

    // 3. 拉取广告数据
    var dateRange = getTaskDateRange(task);
    var adData = fetchAdDataFromApi(config.projectId, dateRange.start, dateRange.end);

    if (!adData || adData.length === 0) {
      throw new Error('API 未返回数据（项目=' + config.projectId + '）');
    }

    // 4. 转换数据
    var transformedData = transformApiData(adData);

    // 5. 创建 / 更新飞书电子表格
    var feishuResult = createOrUpdateFeishuReport(task, selectedPresets, transformedData, formulas);
    logEntry.sheetUrl = feishuResult.url;

    // 6. 解析收件人邮箱
    var recipientInfo = resolveFeishuRecipientEmails(task);
    logEntry.recipients = recipientInfo.names.join(', ');

    // 7. 发送邮件
    sendFeishuReportEmail(task, feishuResult.url, presetNames, dateRange, recipientInfo.emails);

    logEntry.status = 'SUCCESS';
    Logger.log('[飞书] 任务执行成功: ' + task.name);

  } catch (e) {
    logEntry.errorMessage = e.message || String(e);
    Logger.log('[飞书] 任务执行失败: ' + task.name + ' - ' + e.message);
  }

  return logEntry;
}

// ==================== 飞书表格创建 ====================

function createOrUpdateFeishuReport(task, presets, allData, formulas) {
  var spreadsheetToken = task.feishuSpreadsheetToken || '';
  var sheetUrl = '';

  // 尝试复用已有表格
  if (spreadsheetToken) {
    try {
      var meta = getFeishuSheetMeta(spreadsheetToken);
      // 删除所有已有工作表（除第一个），清空第一个用于复用
      if (meta.length > 1) {
        for (var m = 1; m < meta.length; m++) {
          deleteFeishuSheet(spreadsheetToken, meta[m].sheetId);
        }
      }
      // 创建新工作表并写入数据
      writePresetsToFeishuSpreadsheet(spreadsheetToken, presets, allData, formulas, meta[0] ? meta[0].sheetId : null);
      sheetUrl = 'https://feishu.cn/sheets/' + spreadsheetToken;
      return { token: spreadsheetToken, url: sheetUrl };
    } catch (e) {
      Logger.log('[飞书] 无法复用已有表格 (' + spreadsheetToken + ')，将创建新的: ' + e.message);
      spreadsheetToken = '';
    }
  }

  // 创建新表格（若未配置 FEISHU_FOLDER_TOKEN 则创建到应用根目录，不会出现在指定文件夹）
  var folderToken = getFeishuFolderToken();
  Logger.log('[飞书] 创建新表格，FEISHU_FOLDER_TOKEN=' + (folderToken ? folderToken : '(未配置，表格将创建到应用根目录)'));
  var title = '定时报表 - ' + task.name + ' - ' + Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
  var createResult = createFeishuSpreadsheet(title);
  spreadsheetToken = createResult.spreadsheetToken;
  sheetUrl = createResult.url;
  task.feishuSpreadsheetToken = spreadsheetToken;

  // 设置链接为可编辑（获得链接的人可直接编辑，无需申请权限）
  setFeishuSheetPublicEditable(spreadsheetToken);

  // 新表格：复用默认第一个工作表并重命名为第一个报告名，其余报告新建工作表（不删除默认表，避免删除失败导致仍显示 Sheet1）
  var defaultMeta = getFeishuSheetMeta(spreadsheetToken);
  var firstSheetId = defaultMeta.length > 0 ? defaultMeta[0].sheetId : null;
  // #region agent log
  Logger.log('[飞书] 新表格 defaultMeta.length=' + (defaultMeta ? defaultMeta.length : 0) + ' firstSheetId=' + (firstSheetId || 'null') + ' firstPresetName=' + (presets.length > 0 ? (presets[0].name || '') : ''));
  // #endregion
  writePresetsToFeishuSpreadsheet(spreadsheetToken, presets, allData, formulas, firstSheetId);

  return { token: spreadsheetToken, url: sheetUrl };
}

/**
 * 向飞书表格写入所有 preset 的报告数据
 * @param {string} spreadsheetToken
 * @param {Array} presets 选中的报告配置
 * @param {Array} allData 转换后的广告数据
 * @param {Array} formulas 用户自定义公式
 * @param {string|null} firstSheetId 第一个工作表 ID（可复用，避免多一个空白 Sheet）
 */
function writePresetsToFeishuSpreadsheet(spreadsheetToken, presets, allData, formulas, firstSheetId) {
  for (var i = 0; i < presets.length; i++) {
    var preset = presets[i];
    var sheetName = sanitizeFeishuSheetName(preset.name);

    // 过滤 + 透视聚合
    var filteredData = applyPresetFilters(allData, preset);
    var sheetData = buildPivotSheetData(filteredData, preset, formulas);

    var sheetId;
    if (i === 0 && firstSheetId) {
      // 复用已有表格时：复用第一个工作表并重命名为报告名
      sheetId = firstSheetId;
      // #region agent log
      Logger.log('[飞书] 重命名第一个工作表 i=0 firstSheetId=' + firstSheetId + ' sheetName="' + sheetName + '" preset.name="' + (preset.name || '') + '"');
      // #endregion
      renameFeishuSheet(spreadsheetToken, sheetId, sheetName);
      // 刷新服务端 meta，避免后续 addFeishuSheet 时飞书 snapshot 仍含旧表名导致 "sheetTitle already exist in snapshot"
      getFeishuSheetMeta(spreadsheetToken);
    } else {
      // 新建工作表（名称即为报告名，如 test、campaign +AO+country）
      sheetId = addFeishuSheet(spreadsheetToken, sheetName);
    }

    // 写入数据
    writeDataToFeishuSheet(spreadsheetToken, sheetId, sheetData);

    // 格式化表头
    if (sheetData.length > 0 && sheetData[0].length > 0) {
      formatFeishuSheetHeader(spreadsheetToken, sheetId, sheetData[0].length);
    }
  }
}

/**
 * 重命名飞书工作表
 */
function renameFeishuSheet(spreadsheetToken, sheetId, newTitle) {
  var url = FEISHU_API_BASE + '/sheets/v2/spreadsheets/' + spreadsheetToken + '/sheets_batch_update';
  var body = {
    requests: [{
      updateSheet: {
        properties: {
          sheetId: String(sheetId),
          title: newTitle
        }
      }
    }]
  };

  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: feishuHeaders(),
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  // #region agent log
  var code = response.getResponseCode();
  var content = response.getContentText();
  Logger.log('[飞书] renameFeishuSheet response code=' + code + ' body=' + content);
  if (code !== 200) {
    Logger.log('[飞书] renameFeishuSheet 失败 sheetId=' + sheetId + ' newTitle="' + newTitle + '"');
  }
  // #endregion
}

// ==================== 邮件发送 ====================

function sendFeishuReportEmail(task, sheetUrl, presetNames, dateRange, recipientEmails) {
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
    + '在线文档链接（飞书电子表格）：\n' + sheetUrl + '\n\n'
    + '（每个报告对应文档中的一个工作表标签页）\n\n'
    + '---\n'
    + '此邮件由广告数据报告分析平台自动发送，请勿直接回复。';

  var htmlBody = '<div style="font-family: Arial, sans-serif; color: #333; max-width: 600px;">'
    + '<h2 style="color: #3370ff; border-bottom: 2px solid #3370ff; padding-bottom: 8px;">'
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
    + 'background-color: #3370ff; color: #fff; text-decoration: none; border-radius: 6px; '
    + 'font-weight: bold;">查看飞书在线报表</a>'
    + '</div>'
    + '<p style="color: #999; font-size: 12px; margin-top: 32px; border-top: 1px solid #eee; padding-top: 12px;">'
    + '每个报告对应文档中的一个工作表标签页。<br>'
    + '此邮件由广告数据报告分析平台自动发送。</p>'
    + '</div>';

  var recipients = recipientEmails.join(',');

  MailApp.sendEmail({
    to: recipients,
    subject: subject,
    body: body,
    htmlBody: htmlBody
  });

  Logger.log('[飞书] 邮件已发送至: ' + recipients);
}
