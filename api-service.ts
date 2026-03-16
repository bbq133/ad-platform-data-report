/**
 * API 服务层
 * 负责数据获取和格式转换
 */

import { API_CONFIG, GOOGLE_SHEETS_CONFIG, FEISHU_GAS_CONFIG, ApiRequestParams, ApiDataRow, ApiResponse, ProjectOption, ProjectListResponse } from './api-config';

/**
 * 从 API 获取广告数据
 */
export async function fetchAdData(params: ApiRequestParams): Promise<ApiDataRow[]> {
    // Doris 要求平台参数大写：FACEBOOK / GOOGLE / ALL
    const queryParams = new URLSearchParams({
        projectId: params.projectId.toString(),
        startDate: params.startDate,
        endDate: params.endDate,
        platform: (params.platform || '').toUpperCase()
    });

    // 添加 Campaign ID 筛选
    params.filterCampaignIdList?.forEach(id =>
        queryParams.append('filterCampaignIdList', id)
    );

    // 添加 Account ID 筛选
    params.filterAccountIdList?.forEach(id =>
        queryParams.append('filterAccountIdList', id)
    );

    const url = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.GET_ALL_FILTER_DATA}?${queryParams}`;

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${API_CONFIG.AUTH_TOKEN}`,
            'clientid': API_CONFIG.CLIENT_ID,
            'Content-Type': 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const result: ApiResponse = await response.json();

    if (result.code !== 200) {
        throw new Error(result.msg || 'API 请求失败');
    }

    return result.data || [];
}

/**
 * 获取用户可查询的项目列表
 */
export async function fetchProjectList(): Promise<ProjectOption[]> {
    const url = `${API_CONFIG.BASE_URL}${API_CONFIG.ENDPOINTS.USER_REPORT_OPTION}`;

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${API_CONFIG.AUTH_TOKEN}`,
            'clientid': API_CONFIG.CLIENT_ID,
            'Content-Type': 'application/json'
        }
    });

    if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const result: ProjectListResponse = await response.json();

    if (result.code !== 200) {
        throw new Error(result.msg || '获取项目列表失败');
    }

    return result.data?.projectList || [];
}

/**
 * 同时获取 Facebook 和 Google 数据
 */
export async function fetchAllPlatformsData(
    projectId: number,
    startDate: string,
    endDate: string,
    filterAccountIdList?: string[]
): Promise<ApiDataRow[]> {
    const baseParams = {
        projectId,
        startDate,
        endDate,
        filterAccountIdList
    };

    const [facebookData, googleData] = await Promise.all([
        fetchAdData({ ...baseParams, platform: 'facebook' }).catch(() => []),
        fetchAdData({ ...baseParams, platform: 'google' }).catch(() => [])
    ]);

    return [...facebookData, ...googleData];
}

/**
/**
 * 将 API 数据转换为系统内部格式 (RawDataRow)
 * 字段与《BI 广告数据查询与导出接口文档_字段完整版》一致，保持与 Excel/CSV 导入格式兼容
 */
export function transformApiDataToRawData(apiData: ApiDataRow[]): Record<string, any>[] {
    const parseExtra = (extra: unknown): Record<string, any> | null => {
        if (!extra) return null;
        if (typeof extra === 'object') return extra as Record<string, any>;
        if (typeof extra !== 'string') return null;
        try {
            return JSON.parse(extra) as Record<string, any>;
        } catch {
            return null;
        }
    };

    const getAge = (row: ApiDataRow) => {
        const extra = parseExtra(row.extra);
        return (
            row.ageRange
            || (row as any).age_range
            || (row as any).age
            || extra?.ageRange
            || extra?.age_range
            || extra?.age
            || ''
        );
    };

    const getGender = (row: ApiDataRow) => {
        const extra = parseExtra(row.extra);
        return (
            row.genderType
            || (row as any).gender_type
            || (row as any).gender
            || extra?.genderType
            || extra?.gender_type
            || extra?.gender
            || ''
        );
    };

    return apiData.map(row => {
        const isGoogle = row.platform?.toLowerCase().includes('google');
        const adType = (row.campaignAdvertisingType || '').toUpperCase();

        // costUsd 可能为字符串 "0.000000"（Google 后端未提供 USD 转换时），此时应回退到 cost
        const costUsdNum = parseFloat(String(row.costUsd ?? '0')) || 0;
        const costNum = parseFloat(String(row.cost ?? '0')) || 0;
        const effectiveCostUsd = costUsdNum > 0 ? costUsdNum : costNum;

        const commonData: Record<string, any> = {
            '__platform': row.platform ? String(row.platform).toLowerCase() : '',
            '__campaignAdvertisingType': adType || '',
            '__segments': row.segments || '',

            // 基础维度
            'Campaign Name': row.campaignName || '',
            'Ad Set Name': row.adsetName || '',
            'Ad Name': row.adName || '',
            'Day': row.recordDate || '',
            'Campaign ID': row.campaignId || '',
            'Ad Set ID': row.adsetId || '',
            'Ad ID': row.adId || '',
            'Account ID': row.accountId || '',
            'Account Name': row.accountName || '',
            'Campaign Objective': row.campaignObjective ?? '',
            'Campaign Type': row.campaignAdvertisingType ?? '',
            'Ad Set Status': row.adsetStatus ?? '',
            'Ad Set Type': row.adsetType ?? '',
            'Keyword ID': row.keywordId ?? '',
            'Ad Strength': row.adStrength ?? '',
            'Ad Image URL': row.adImageUrl ?? '',
            'Audience Segments': row.audienceSegments ?? '',
            'Country': row.country ?? '',
            'Device': row.device ?? '',
            'Region': row.region ?? '',
            'Ad Tags': row.adTags ?? '',
            'Source': row.source ?? '',
            'Medium': row.medium ?? '',
            'Campaign Budget': row.campaignBudget ?? 0,

            // 核心指标
            'Amount spent (USD)': effectiveCostUsd,
            'Spend': costNum,
            'Currency': row.currency ?? '',
            'Impressions': row.impressions ?? 0,
            'Reach': row.reach ?? 0,
            'Clicks (all)': row.clicks ?? 0,
            'Link clicks': row.linkClicks ?? 0,
            'Purchases': row.conversion ?? 0,
            'Purchases conversion value': row.conversionValue ?? 0,
            'Add to Cart': row.addToCart ?? 0,
            'Add to Wishlist': row.addToWishlist ?? 0,
            'Landing page views': row.landingPageViews ?? 0,
            'Checkouts initiated': row.checkout ?? 0,
            'Average Page Views': row.averagePageViews ?? 0,
            'Bounce Rate': row.bounceRate ?? 0,
            'All Conversions': row.allConversions ?? 0,
            'Engagements': row.engagements ?? 0,
            'Post comments': row.postComments ?? 0,
            'Post reactions': row.postReactions ?? 0,
            'Post saves': row.postSaves ?? 0,
            'Post shares': row.postShares ?? 0,
            'Video views': row.videoViews ?? 0,
            'Video views 25%': row.videoViews25 ?? 0,
            'Video views 50%': row.videoViews50 ?? 0,
            'Video views 75%': row.videoViews75 ?? 0,
            'Video views 100%': row.videoViews100 ?? 0,
            'Leads': row.leads ?? 0,
            'Subscriptions': row.subscribe ?? 0,
            'Users': row.users ?? 0,
            'Sessions': row.sessions ?? 0,
            'Average View Time': row.averageViewTime ?? 0,
            'Dashboard Count': row.dashboardCount ?? 0,
            'Dashboard Revenue': row.dashboardRevenue ?? 0,
            'Dashboard Revisit Count': row.dashboardRevisitCount ?? 0,
            'Total site sale value': row.gaConvertedRevenue ?? 0,
            'GA4 Currency': row.gaCurrency ?? '',
            'Category': row.category ?? '',
            'Product Series': row.productSeries ?? '',
            'Watch Time Duration': row.watchTimeDuration ?? 0,

            // 年龄/性别
            'Age': getAge(row),
            'Gender': getGender(row),

            // Meta 常用维度/指标
            'Adds of payment info': row.addsPaymentInfo ?? 0,
            'Cost per add of payment info': row.costPerAddPaymentInfo ?? 0,
            'Link (ad settings)': row.linkUrl ?? '',
            'Headline': row.headline ?? '',

            // 搜索/广告属性（所有平台统一输出，值为空则为空字符串）
            'Search keyword': row.keyword ?? '',
            'Search term': row.searchTerm ?? '',
            'Ad status': row.adStatus ?? '',
            'Ad type': row.adType ?? '',
            'Final URL': row.finalUrls ?? '',
            'Ad Preview Link': row.previewLink ?? '',

            // Google 素材字段
            'Device preference': isGoogle ? (row.devicePreference ?? '') : '',
            'Long headline': isGoogle ? (row.longHeadline ?? '') : '',
            'Description': isGoogle ? (row.descriptions ?? '') : '',
            'Business name': isGoogle ? (row.businessName ?? '') : '',
            'Square image ID': isGoogle ? (row.squareImageIds ?? '') : '',
            'Portrait image ID': isGoogle ? (row.portraitImageIds ?? '') : '',
            'Logo ID': isGoogle ? (row.logoImageIds ?? '') : '',
            'Landscape image ID': isGoogle ? (row.landscapeImageIds ?? '') : '',
            'Landscape logo ID': '',
            'Video ID': isGoogle ? (row.videoIds ?? '') : '',
            'Call to action text': isGoogle ? (row.callToActionText ?? '') : '',
            'Call to action headline': isGoogle ? (row.callToActionHeadline ?? '') : '',
            'Mobile final URL': isGoogle ? (row.appFinalUrl ?? '') : '',
            'Display URL': isGoogle ? (row.displayUrl ?? '') : '',
            'Tracking template': isGoogle ? (row.trackingUrlTemplate ?? '') : '',
            'Final URL suffix': isGoogle ? (row.finalUrlSuffix ?? '') : '',
            'Custom parameter': isGoogle ? (row.customerParam ?? '') : '',

            '_raw': row
        };

        if (!isGoogle && row.metaInsightsResultsJson) {
            let mrJson: any = row.metaInsightsResultsJson;
            if (typeof mrJson === 'string') {
                try { mrJson = JSON.parse(mrJson); } catch { mrJson = null; }
            }
            if (mrJson && typeof mrJson === 'object') {
                for (const [k, v] of Object.entries(mrJson)) {
                    commonData[`MR:${k}`] = parseFloat(String(v)) || 0;
                }
            }
        }

        if (isGoogle) {
            return commonData;
        }

        return { ...commonData };
    });
}

/**
 * 提取账号列表 (用于账号选择器)
 */
export function extractUniqueAccounts(data: ApiDataRow[]): { id: string; name: string }[] {
    const accountMap = new Map<string, string>();

    data.forEach(row => {
        if (row.accountId && !accountMap.has(row.accountId)) {
            accountMap.set(row.accountId, row.accountName || row.accountId);
        }
    });

    return Array.from(accountMap.entries()).map(([id, name]) => ({ id, name }));
}

/**
 * 获取用户配置 (Metrics Mapping 或 Dimension Configs)
 */
export type UserConfigType = 'metrics' | 'dimensions' | 'formulas' | 'pivotPresets' | 'bi' | 'scheduledReports' | 'dataAlerts';

export async function fetchUserConfig(
    username: string,
    projectId: string | number,
    type: UserConfigType
): Promise<any> {
    const url = `${GOOGLE_SHEETS_CONFIG.GAS_API_URL}?action=getConfig&user=${encodeURIComponent(username)}&projectId=${projectId}&type=${type}`;
    try {
        const response = await fetch(url);
        const result = await response.json();
        if (result.status === 'success') {
            return result.data;
        }
        return null;
    } catch (e) {
        console.error('Failed to fetch user config:', e);
        return null; // Fail gracefully
    }
}

/**
 * 保存用户配置
 */
export async function saveUserConfig(
    username: string,
    projectId: string | number,
    type: UserConfigType,
    data: any
): Promise<boolean> {
    const url = GOOGLE_SHEETS_CONFIG.GAS_API_URL;
    try {
        const payload = {
            user: username,
            projectId,
            type,
            data
        };
        const response = await fetch(url, {
            method: 'POST',
            // 使用 text/plain 避免 CORS 复杂请求 (preflight)
            headers: {
                'Content-Type': 'text/plain;charset=utf-8',
            },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        return result.status === 'success';
    } catch (e) {
        console.error('Failed to save user config:', e);
        return false;
    }
}

/**
 * 定时报表 - 前端测试发送任务 payload
 * 与 ScheduledReportsPanel 中的 ScheduledReportTask 结构保持一致的子集
 */
export interface ScheduledReportTaskPayload {
    id?: string;
    active: boolean;
    name: string;
    frequency: 'daily' | 'weekly';
    timeOfDay: string;
    weekDay?: number;
    dateRangePreset: 'last3' | 'last7' | 'last15' | 'last30' | 'custom';
    customDateStart?: string;
    customDateEnd?: string;
    pivotPresetIds: string[];
    emails: string[];
    updateOnly?: boolean;
}

/**
 * 触发一次性的定时报表测试发送
 * 依赖 Apps Script Web App 在 doPost 中实现 action = 'testScheduledReport'
 */
export async function testSendScheduledReport(
    username: string,
    projectId: string | number,
    task: ScheduledReportTaskPayload
): Promise<void> {
    const url = GOOGLE_SHEETS_CONFIG.GAS_API_URL;

    const payload = {
        action: 'testScheduledReport',
        user: username,
        projectId,
        task
    };

    try {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/c27d0ba6-23f9-43d9-8065-11770db1de6e', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Debug-Session-Id': '6554c0',
            },
            body: JSON.stringify({
                sessionId: '6554c0',
                runId: 'initial',
                hypothesisId: 'H2',
                location: 'api-service.ts:testSendScheduledReport',
                message: 'test send request',
                data: {
                    projectId,
                    hasTaskId: !!task.id,
                    emailsCount: task.emails?.length ?? 0,
                },
                timestamp: Date.now(),
            }),
        }).catch(() => {});
        // #endregion

        const response = await fetch(url, {
            method: 'POST',
            // 与 saveUserConfig 保持一致，避免复杂 CORS 预检
            headers: {
                'Content-Type': 'text/plain;charset=utf-8',
            },
            body: JSON.stringify(payload)
        });

        let result: any = null;
        try {
            result = await response.json();
        } catch {
            result = null;
        }

        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/c27d0ba6-23f9-43d9-8065-11770db1de6e', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Debug-Session-Id': '6554c0',
            },
            body: JSON.stringify({
                sessionId: '6554c0',
                runId: 'initial',
                hypothesisId: 'H3',
                location: 'api-service.ts:testSendScheduledReport',
                message: 'test send response',
                data: {
                    ok: response.ok,
                    status: response.status,
                    resultStatus: result && typeof result === 'object' ? (result.status ?? null) : null,
                    resultMessage: result && typeof result === 'object' ? (result.message ?? null) : null,
                },
                timestamp: Date.now(),
            }),
        }).catch(() => {});
        // #endregion

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        if (!result || result.status !== 'success') {
            throw new Error((result && result.message) || '测试发送失败');
        }
    } catch (e) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/c27d0ba6-23f9-43d9-8065-11770db1de6e', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Debug-Session-Id': '6554c0',
            },
            body: JSON.stringify({
                sessionId: '6554c0',
                runId: 'initial',
                hypothesisId: 'H4',
                location: 'api-service.ts:testSendScheduledReport',
                message: 'test send error',
                data: {
                    errorMessage: e instanceof Error ? e.message : String(e),
                },
                timestamp: Date.now(),
            }),
        }).catch(() => {});
        // #endregion

        console.error('Failed to test send scheduled report:', e);
        throw e;
    }
}

// ==================== 飞书定时报表 API ====================

export interface FeishuDepartment {
    open_department_id: string;
    name: string;
    parent_department_id: string;
    member_count: number;
}

export interface FeishuUser {
    open_id: string;
    user_id: string;
    name: string;
    email: string;
    mobile: string;
    department_ids: string[];
    avatar_url: string;
}

export interface FeishuScheduledReportTaskPayload {
    id?: string;
    active: boolean;
    name: string;
    frequency: 'daily' | 'weekly';
    timeOfDay: string;
    weekDay?: number;
    dateRangePreset: 'last3' | 'last7' | 'last15' | 'last30' | 'custom';
    customDateStart?: string;
    customDateEnd?: string;
    pivotPresetIds: string[];
    feishuRecipientType: 'users';
    feishuUserIds: string[];
    feishuSpreadsheetToken?: string;
    feishuCurrentSheetId?: string;
    feishuLastPresetIds?: string[];
    updateOnly?: boolean;
}

export async function fetchFeishuDepartments(parentDepartmentId = '0'): Promise<FeishuDepartment[]> {
    const url = `${FEISHU_GAS_CONFIG.GAS_API_URL}?action=feishuDepartments&parentDepartmentId=${encodeURIComponent(parentDepartmentId)}`;
    try {
        const response = await fetch(url);
        const result = await response.json();
        if (result.status === 'success') return result.data || [];
        console.error('fetchFeishuDepartments error:', result.message);
        return [];
    } catch (e) {
        console.error('fetchFeishuDepartments failed:', e);
        return [];
    }
}

export async function fetchFeishuUsers(departmentId = '0'): Promise<FeishuUser[]> {
    const url = `${FEISHU_GAS_CONFIG.GAS_API_URL}?action=feishuUsers&departmentId=${encodeURIComponent(departmentId)}`;
    try {
        const response = await fetch(url);
        const result = await response.json();
        if (result.status === 'success') return result.data || [];
        console.error('fetchFeishuUsers error:', result.message);
        return [];
    } catch (e) {
        console.error('fetchFeishuUsers failed:', e);
        return [];
    }
}

/** 全公司用户（含子部门），用于收件人筛选框一次性加载；后端 10 分钟缓存 */
export async function fetchFeishuAllUsers(): Promise<FeishuUser[]> {
    const url = `${FEISHU_GAS_CONFIG.GAS_API_URL}?action=feishuAllUsers`;
    try {
        const response = await fetch(url);
        const result = await response.json();
        if (result.status === 'success') return result.data || [];
        console.error('fetchFeishuAllUsers error:', result.message);
        return [];
    } catch (e) {
        console.error('fetchFeishuAllUsers failed:', e);
        return [];
    }
}

/** 按 open_id 批量获取飞书用户信息（用于编辑规则时展示收件人姓名） */
export async function fetchFeishuUsersByIds(openIds: string[]): Promise<FeishuUser[]> {
    if (!openIds.length) return [];
    const url = `${FEISHU_GAS_CONFIG.GAS_API_URL}?action=feishuUsersByIds&openIds=${encodeURIComponent(openIds.join(','))}`;
    try {
        const response = await fetch(url);
        const result = await response.json();
        if (result.status === 'success') return result.data || [];
        return [];
    } catch (e) {
        console.error('fetchFeishuUsersByIds failed:', e);
        return [];
    }
}

export async function fetchFeishuUserConfig(
    username: string,
    projectId: string | number,
    type: string
): Promise<any> {
    const url = `${FEISHU_GAS_CONFIG.GAS_API_URL}?action=getConfig&user=${encodeURIComponent(username)}&projectId=${encodeURIComponent(String(projectId))}&type=${encodeURIComponent(type)}`;
    try {
        const response = await fetch(url);
        const result = await response.json();
        return result.status === 'success' ? result.data : null;
    } catch (e) {
        console.error('fetchFeishuUserConfig failed:', e);
        return null;
    }
}

export async function saveFeishuUserConfig(
    username: string,
    projectId: string | number,
    type: string,
    data: any
): Promise<boolean> {
    try {
        const response = await fetch(FEISHU_GAS_CONFIG.GAS_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'saveConfig', user: username, projectId, type, data })
        });
        const result = await response.json();
        return result.status === 'success';
    } catch (e) {
        console.error('saveFeishuUserConfig failed:', e);
        return false;
    }
}

export async function testFeishuScheduledReport(
    username: string,
    projectId: string | number,
    task: FeishuScheduledReportTaskPayload
): Promise<void> {
    const response = await fetch(FEISHU_GAS_CONFIG.GAS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'testFeishuScheduledReport', user: username, projectId, task })
    });

    let result: any = null;
    try { result = await response.json(); } catch { result = null; }

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!result || result.status !== 'success') {
        throw new Error((result && result.message) || '飞书测试发送失败');
    }
}

// ==================== 广告预警监控 API ====================

export interface AlertRulePayload {
    id: string;
    active: boolean;
    name: string;
    platform: 'facebook' | 'google';
    dimension: 'campaign' | 'adset' | 'ad';
    metric: string;
    triggerDirection: 'above' | 'below';
    triggerValue: number;
    lookbackDays: number;
    checkTime: string;
    feishuUserIds: string[];
    filterRules: { field: string; operator: string; value: string }[];
    filterLogic: 'AND' | 'OR';
    lastTriggeredAt?: string;
    createdAt: string;
}

export async function testAlertRule(
    username: string,
    projectId: string | number,
    rule: AlertRulePayload
): Promise<{ triggered: boolean; matchedItems?: { name: string; value: number }[] }> {
    const response = await fetch(FEISHU_GAS_CONFIG.GAS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'testDataAlert', user: username, projectId, rule })
    });

    let result: any = null;
    try { result = await response.json(); } catch { result = null; }

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!result || result.status !== 'success') {
        throw new Error((result && result.message) || '预警测试失败');
    }
    return result.data || { triggered: false };
}
