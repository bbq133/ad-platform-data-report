/**
 * ======================================================================
 * 飞书通讯录 - 部门与用户查询
 * ======================================================================
 * 权限要求（在飞书开放平台为应用开通）：
 *   - 以应用身份读取通讯录（或「获取部门组织架构信息」）
 *   - 获取用户邮箱信息
 *   - 获取部门基础信息（用于获取部门名称）
 * ======================================================================
 */

/**
 * 获取子部门列表（含递归选项）
 * 统一使用 open_department_id 作为部门标识
 * @param {string} parentDepartmentId 父部门 open_department_id，根部门传 '0'
 * @param {boolean} fetchChildren 是否递归获取下级部门（默认 false，只取直属子部门）
 * @return {Array} 部门列表 [{ open_department_id, name, parent_department_id, member_count }]
 */
function getFeishuDepartments(parentDepartmentId, fetchChildren) {
  parentDepartmentId = parentDepartmentId || '0';
  var departments = [];
  var pageToken = '';

  do {
    var url = FEISHU_API_BASE + '/contact/v3/departments/' + parentDepartmentId + '/children'
      + '?department_id_type=open_department_id'
      + '&page_size=50'
      + (pageToken ? '&page_token=' + pageToken : '');

    var response = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: feishuHeaders(),
      muteHttpExceptions: true
    });

    var result = JSON.parse(response.getContentText());
    if (result.code !== 0) {
      Logger.log('获取部门列表失败: ' + (result.msg || JSON.stringify(result)));
      break;
    }

    var items = (result.data && result.data.items) || [];
    for (var i = 0; i < items.length; i++) {
      departments.push({
        open_department_id: items[i].open_department_id || '',
        name: items[i].name || '',
        parent_department_id: items[i].parent_department_id || '',
        member_count: items[i].member_count || 0
      });
    }

    pageToken = (result.data && result.data.page_token) || '';
  } while (pageToken);

  if (fetchChildren) {
    var childDepts = [];
    for (var d = 0; d < departments.length; d++) {
      var subDepts = getFeishuDepartments(departments[d].open_department_id, true);
      childDepts = childDepts.concat(subDepts);
    }
    departments = departments.concat(childDepts);
  }

  return departments;
}

/**
 * 递归收集部门 ID（含自身及子部门），用于按 open_id 反查用户时遍历部门
 * @param {string} parentId 父部门 open_department_id
 * @param {number} maxDepth 最大递归深度
 * @param {number} maxDepts 最多部门数，防止过多请求
 * @return {string[]} 部门 id 数组
 */
function collectDepartmentIdsRecursive(parentId, maxDepth, maxDepts) {
  var out = [];
  var queue = [{ id: parentId, depth: 0 }];
  while (queue.length > 0 && out.length < (maxDepts || 200)) {
    var cur = queue.shift();
    out.push(cur.id);
    if (cur.depth >= (maxDepth || 5)) continue;
    var children = getFeishuDepartments(cur.id, false);
    for (var i = 0; i < children.length; i++) {
      if (out.length >= (maxDepts || 200)) break;
      queue.push({ id: children[i].open_department_id, depth: cur.depth + 1 });
    }
  }
  return out;
}

/**
 * 获取指定部门的直属用户列表（含邮箱）
 * @param {string} departmentId 部门 open_department_id，根部门传 '0'
 * @return {Array} 用户列表 [{ open_id, name, email, ... }]
 */
function getFeishuUsersByDepartment(departmentId) {
  departmentId = departmentId || '0';
  var users = [];
  var pageToken = '';

  do {
    var url = FEISHU_API_BASE + '/contact/v3/users/find_by_department'
      + '?department_id=' + departmentId
      + '&department_id_type=open_department_id'
      + '&user_id_type=open_id'
      + '&page_size=50'
      + (pageToken ? '&page_token=' + pageToken : '');

    var response = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: feishuHeaders(),
      muteHttpExceptions: true
    });

    var result = JSON.parse(response.getContentText());
    if (result.code !== 0) {
      Logger.log('获取用户列表失败 (dept=' + departmentId + '): ' + (result.msg || JSON.stringify(result)));
      break;
    }

    var items = (result.data && result.data.items) || [];
    for (var i = 0; i < items.length; i++) {
      var u = items[i];
      users.push({
        open_id: u.open_id || '',
        user_id: u.user_id || '',
        name: u.name || '',
        email: u.email || '',
        mobile: u.mobile || '',
        department_ids: u.department_ids || [],
        avatar_url: (u.avatar && u.avatar.avatar_72) || ''
      });
    }

    pageToken = (result.data && result.data.page_token) || '';
  } while (pageToken);

  return users;
}

/**
 * 获取根部门下全部用户（含所有子部门），用于前端收件人筛选框一次性加载
 * 递归收集部门 ID 后逐部门拉取用户，按 open_id 去重
 * @return {Array} 用户列表 [{ open_id, name, email, department_ids, ... }]
 */
function getFeishuAllUsersUnderRoot() {
  var deptIds = collectDepartmentIdsRecursive('0', 5, 200);
  var seen = {};
  var users = [];
  for (var d = 0; d < deptIds.length; d++) {
    var list = getFeishuUsersByDepartment(deptIds[d]);
    for (var u = 0; u < list.length; u++) {
      var uid = list[u].open_id;
      if (uid && !seen[uid]) {
        seen[uid] = true;
        users.push(list[u]);
      }
    }
  }
  return users;
}

/**
 * 根据 open_id 列表批量获取用户信息（含邮箱）
 * 优先使用批量接口 GET /contact/v3/users/batch；若返回 0 人则按 open_id 逐个用 find_by_department 的部门反查（先根部门 0）匹配用户取邮箱
 * @param {string[]} openIds open_id 数组
 * @return {Array} 用户列表 [{ open_id, name, email }]
 */
function getFeishuUsersByIds(openIds) {
  if (!openIds || openIds.length === 0) return [];

  var users = [];
  var batchSize = 50;
  for (var offset = 0; offset < openIds.length; offset += batchSize) {
    var batch = openIds.slice(offset, offset + batchSize);
    var query = batch.map(function(id) { return 'user_ids=' + encodeURIComponent(id); }).join('&');
    var url = FEISHU_API_BASE + '/contact/v3/users/batch?user_id_type=open_id&' + query;

    try {
      var response = UrlFetchApp.fetch(url, {
        method: 'get',
        headers: feishuHeaders(),
        muteHttpExceptions: true
      });

      var result = JSON.parse(response.getContentText());
      if (result.code === 0 && result.data && result.data.items && result.data.items.length > 0) {
        var items = result.data.items;
        for (var i = 0; i < items.length; i++) {
          var u = items[i].user || items[i];
          if (!u) continue;
          users.push({
            open_id: u.open_id || '',
            name: u.name || '',
            email: u.email || ''
          });
        }
        continue;
      }

      // 批量接口未返回用户时，用「按部门获取用户」已证明可用的接口：递归子部门拉用户再按 open_id 匹配
      var idSet = {};
      for (var b = 0; b < batch.length; b++) { idSet[batch[b]] = true; }
      var deptIds = collectDepartmentIdsRecursive('0', 5, 200);
      var fetched = {};
      for (var d = 0; d < deptIds.length; d++) {
        var deptUsers = getFeishuUsersByDepartment(deptIds[d]);
        for (var u = 0; u < deptUsers.length; u++) {
          var uid = deptUsers[u].open_id;
          if (idSet[uid] && !fetched[uid]) {
            fetched[uid] = true;
            users.push({
              open_id: deptUsers[u].open_id || '',
              name: deptUsers[u].name || '',
              email: deptUsers[u].email || ''
            });
          }
        }
      }
    } catch (e) {
      Logger.log('批量获取用户信息失败: ' + e.message);
    }
  }
  return users;
}

/**
 * 根据任务配置解析收件人邮箱列表
 * 支持两种模式：
 *   - feishuRecipientType = 'department': 按部门 open_department_id 获取所有用户邮箱
 *   - feishuRecipientType = 'users': 按用户 open_id 获取邮箱
 *
 * @param {Object} task 任务配置
 * @return {{ emails: string[], names: string[] }} 邮箱与姓名列表
 */
function resolveFeishuRecipientEmails(task) {
  var emails = [];
  var names = [];
  var seen = {};
  var recipientType = task.feishuRecipientType || (task.feishuUserIds && task.feishuUserIds.length > 0 ? 'users' : '');

  if (recipientType === 'department' && task.feishuDepartmentIds && task.feishuDepartmentIds.length > 0) {
    for (var d = 0; d < task.feishuDepartmentIds.length; d++) {
      var deptUsers = getFeishuUsersByDepartment(task.feishuDepartmentIds[d]);
      for (var u = 0; u < deptUsers.length; u++) {
        if (deptUsers[u].email && !seen[deptUsers[u].email]) {
          seen[deptUsers[u].email] = true;
          emails.push(deptUsers[u].email);
          names.push(deptUsers[u].name);
        }
      }
    }
  } else if (recipientType === 'users' && task.feishuUserIds && task.feishuUserIds.length > 0) {
    var userInfos = getFeishuUsersByIds(task.feishuUserIds);
    var withEmail = 0;
    for (var i = 0; i < userInfos.length; i++) {
      if (userInfos[i].email && !seen[userInfos[i].email]) {
        seen[userInfos[i].email] = true;
        emails.push(userInfos[i].email);
        names.push(userInfos[i].name);
        withEmail++;
      }
    }
    if (emails.length === 0) {
      var reqCount = task.feishuUserIds.length;
      var retCount = userInfos.length;
      throw new Error('未能从飞书通讯录中解析到任何收件人邮箱（请求' + reqCount + '人，接口返回' + retCount + '人，有邮箱0人），请检查所选用户是否在飞书填写邮箱或应用是否开通「获取用户邮箱」权限');
    }
  }

  if (emails.length === 0) {
    throw new Error('未能从飞书通讯录中解析到任何收件人邮箱，请检查所选部门/用户是否有邮箱');
  }

  return { emails: emails, names: names };
}
