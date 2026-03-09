/**
 * ======================================================================
 * 飞书电子表格 - 创建、写入、权限设置
 * ======================================================================
 * 权限要求（在飞书开放平台为应用开通）：
 *   - 查看、编辑和管理电子表格
 *   - 查看、评论和管理云空间中所有文件（用于设置分享权限）
 * ======================================================================
 */

/**
 * 创建飞书电子表格
 * @param {string} title 表格标题
 * @return {{ spreadsheetToken: string, url: string }} token 和 URL
 */
function createFeishuSpreadsheet(title) {
  var url = FEISHU_API_BASE + '/sheets/v3/spreadsheets';
  var body = { title: title };
  // #region agent log
  var folderToken = getFeishuFolderToken();
  Logger.log('[createFeishuSpreadsheet] FEISHU_FOLDER_TOKEN from props: ' + (folderToken ? folderToken : '(empty)'));
  // #endregion
  if (folderToken) {
    body.folder_token = folderToken;
  }
  // #region agent log
  Logger.log('[createFeishuSpreadsheet] request body: ' + JSON.stringify(body));
  // #endregion

  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: feishuHeaders(),
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });

  var result = JSON.parse(response.getContentText());
  // #region agent log
  if (result.code !== 0) {
    Logger.log('[createFeishuSpreadsheet] API error code=' + result.code + ' msg=' + (result.msg || '') + ' full=' + JSON.stringify(result));
  }
  // #endregion
  if (result.code !== 0 || !result.data || !result.data.spreadsheet) {
    throw new Error('创建飞书表格失败: ' + (result.msg || JSON.stringify(result)));
  }
  // #region agent log
  Logger.log('[createFeishuSpreadsheet] created with folder_token: ' + (body.folder_token ? body.folder_token : '(none)'));
  Logger.log('[createFeishuSpreadsheet] response spreadsheet: ' + JSON.stringify(result.data.spreadsheet));
  // #endregion

  var ss = result.data.spreadsheet;
  return {
    spreadsheetToken: ss.spreadsheet_token,
    url: ss.url || ('https://feishu.cn/sheets/' + ss.spreadsheet_token)
  };
}

/**
 * 获取飞书表格元数据（所有工作表信息）
 * @param {string} spreadsheetToken
 * @return {Array} [{ sheetId, title, index }]
 */
function getFeishuSheetMeta(spreadsheetToken) {
  var url = FEISHU_API_BASE + '/sheets/v2/spreadsheets/' + spreadsheetToken + '/metainfo';
  var response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: feishuHeaders(),
    muteHttpExceptions: true
  });

  var result = JSON.parse(response.getContentText());
  if (result.code !== 0) {
    throw new Error('获取表格元数据失败: ' + (result.msg || JSON.stringify(result)));
  }

  var sheets = (result.data && result.data.sheets) || [];
  return sheets.map(function(s) {
    return {
      sheetId: s.sheetId,
      title: s.title,
      index: s.index
    };
  });
}

/**
 * 在飞书表格中新增一个工作表
 * @param {string} spreadsheetToken
 * @param {string} sheetTitle 工作表标题
 * @return {string} 新建工作表的 sheetId
 */
function addFeishuSheet(spreadsheetToken, sheetTitle) {
  var url = FEISHU_API_BASE + '/sheets/v2/spreadsheets/' + spreadsheetToken + '/sheets_batch_update';
  var body = {
    requests: [{
      addSheet: {
        properties: { title: sheetTitle }
      }
    }]
  };

  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: feishuHeaders(),
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });

  var result = JSON.parse(response.getContentText());
  if (result.code !== 0) {
    throw new Error('新增工作表失败 (' + sheetTitle + '): ' + (result.msg || JSON.stringify(result)));
  }

  var replies = (result.data && result.data.replies) || [];
  if (replies.length > 0 && replies[0].addSheet && replies[0].addSheet.properties) {
    return replies[0].addSheet.properties.sheetId;
  }
  throw new Error('新增工作表后未返回 sheetId');
}

/**
 * 删除飞书表格中的指定工作表
 * @param {string} spreadsheetToken
 * @param {string} sheetId
 */
function deleteFeishuSheet(spreadsheetToken, sheetId) {
  var url = FEISHU_API_BASE + '/sheets/v2/spreadsheets/' + spreadsheetToken + '/sheets_batch_update';
  var body = {
    requests: [{
      deleteSheet: { sheetId: sheetId }
    }]
  };

  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: feishuHeaders(),
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  var result = JSON.parse(response.getContentText());
  if (result.code !== 0) {
    throw new Error('删除工作表失败: ' + (result.msg || JSON.stringify(result)));
  }
}

/**
 * 向飞书工作表写入二维数据
 * @param {string} spreadsheetToken
 * @param {string} sheetId
 * @param {Array[]} data 二维数组 [[header...], [row1...], ...]
 */
function writeDataToFeishuSheet(spreadsheetToken, sheetId, data) {
  if (!data || data.length === 0 || data[0].length === 0) return;

  var numRows = data.length;
  var numCols = data[0].length;
  var endCol = colIndexToLetter(numCols - 1);
  var range = sheetId + '!A1:' + endCol + numRows;

  var url = FEISHU_API_BASE + '/sheets/v2/spreadsheets/' + spreadsheetToken + '/values';
  var body = {
    valueRange: {
      range: range,
      values: data
    }
  };

  var response = UrlFetchApp.fetch(url, {
    method: 'put',
    headers: feishuHeaders(),
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });

  var result = JSON.parse(response.getContentText());
  if (result.code !== 0) {
    throw new Error('写入飞书表格数据失败: ' + (result.msg || JSON.stringify(result)));
  }
}

/**
 * 设置飞书工作表表头样式（加粗、蓝底白字）+ 冻结首行
 * @param {string} spreadsheetToken
 * @param {string} sheetId
 * @param {number} numCols 列数
 */
function formatFeishuSheetHeader(spreadsheetToken, sheetId, numCols) {
  var endCol = colIndexToLetter(numCols - 1);
  var range = sheetId + '!A1:' + endCol + '1';

  // 设置样式
  try {
    var styleUrl = FEISHU_API_BASE + '/sheets/v2/spreadsheets/' + spreadsheetToken + '/styles_batch_update';
    var styleBody = {
      data: [{
        ranges: range,
        style: {
          font: { bold: true },
          backColor: '#4A86E8',
          foreColor: '#FFFFFF'
        }
      }]
    };

    UrlFetchApp.fetch(styleUrl, {
      method: 'put',
      headers: feishuHeaders(),
      payload: JSON.stringify(styleBody),
      muteHttpExceptions: true
    });
  } catch (e) {
    Logger.log('设置表头样式失败（不影响数据）: ' + e.message);
  }

  // 冻结首行
  try {
    var freezeUrl = FEISHU_API_BASE + '/sheets/v2/spreadsheets/' + spreadsheetToken + '/sheets_batch_update';
    var freezeBody = {
      requests: [{
        updateSheet: {
          properties: {
            sheetId: String(sheetId),
            frozenRowCount: 1
          }
        }
      }]
    };

    UrlFetchApp.fetch(freezeUrl, {
      method: 'post',
      headers: feishuHeaders(),
      payload: JSON.stringify(freezeBody),
      muteHttpExceptions: true
    });
  } catch (e) {
    Logger.log('冻结首行失败（不影响数据）: ' + e.message);
  }
}

/**
 * 设置飞书文档的分享权限：获得链接的人可阅读
 * @param {string} spreadsheetToken
 */
function setFeishuSheetPublicReadable(spreadsheetToken) {
  try {
    var url = FEISHU_API_BASE + '/drive/v1/permissions/' + spreadsheetToken + '/public?type=sheet';
    var body = {
      external_access_entity: 'open',
      link_share_entity: 'anyone_readable'
    };

    UrlFetchApp.fetch(url, {
      method: 'patch',
      headers: feishuHeaders(),
      payload: JSON.stringify(body),
      muteHttpExceptions: true
    });
  } catch (e) {
    Logger.log('设置分享权限失败（收件人可能需要手动请求权限）: ' + e.message);
  }
}

/**
 * 设置飞书文档的分享权限：获得链接的人可编辑
 * @param {string} spreadsheetToken
 */
function setFeishuSheetPublicEditable(spreadsheetToken) {
  try {
    var url = FEISHU_API_BASE + '/drive/v1/permissions/' + spreadsheetToken + '/public?type=sheet';
    var body = {
      external_access_entity: 'open',
      link_share_entity: 'anyone_editable'
    };

    UrlFetchApp.fetch(url, {
      method: 'patch',
      headers: feishuHeaders(),
      payload: JSON.stringify(body),
      muteHttpExceptions: true
    });
  } catch (e) {
    Logger.log('设置可编辑权限失败: ' + e.message);
  }
}

// ==================== 工具函数 ====================

/**
 * 列索引（0-based）转字母: 0→A, 1→B, ..., 25→Z, 26→AA, ...
 */
function colIndexToLetter(index) {
  var letter = '';
  var n = index;
  while (n >= 0) {
    letter = String.fromCharCode(65 + (n % 26)) + letter;
    n = Math.floor(n / 26) - 1;
  }
  return letter;
}

/**
 * 清理工作表名称：飞书 Sheet 名不能包含特殊字符
 */
function sanitizeFeishuSheetName(name) {
  var clean = (name || 'Report').replace(/[\/\\?*\[\]:]/g, '_');
  return clean.substring(0, 100);
}
