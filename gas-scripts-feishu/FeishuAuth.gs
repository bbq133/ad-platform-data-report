/**
 * ======================================================================
 * 飞书鉴权 - 获取 tenant_access_token
 * ======================================================================
 * token 有效期 2 小时，使用 CacheService 缓存避免频繁请求。
 * ======================================================================
 */

/**
 * 获取飞书 tenant_access_token（带缓存）
 * @return {string} token
 */
function getFeishuTenantAccessToken() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('feishu_tenant_access_token');
  if (cached) return cached;

  var appId = getFeishuAppId();
  var appSecret = getFeishuAppSecret();
  if (!appId || !appSecret) {
    throw new Error('飞书凭证未配置，请在「脚本属性」中设置 FEISHU_APP_ID 和 FEISHU_APP_SECRET');
  }

  var url = FEISHU_API_BASE + '/auth/v3/tenant_access_token/internal';
  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    muteHttpExceptions: true
  });

  var result = JSON.parse(response.getContentText());
  if (result.code !== 0 || !result.tenant_access_token) {
    throw new Error('获取飞书 token 失败: ' + (result.msg || JSON.stringify(result)));
  }

  var token = result.tenant_access_token;
  // 缓存 6900 秒（略低于 2 小时有效期，留 300 秒余量）
  cache.put('feishu_tenant_access_token', token, 6900);
  return token;
}

/**
 * 构建飞书 API 请求头
 */
function feishuHeaders() {
  return {
    'Authorization': 'Bearer ' + getFeishuTenantAccessToken(),
    'Content-Type': 'application/json; charset=utf-8'
  };
}
