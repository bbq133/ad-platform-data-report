/**
 * API 服务层
 * 负责数据获取和格式转换
 */

import { API_CONFIG, GOOGLE_SHEETS_CONFIG, ApiRequestParams, ApiDataRow, ApiResponse, ProjectOption, ProjectListResponse } from './api-config';

/**
 * 从 API 获取广告数据
 */
export async function fetchAdData(params: ApiRequestParams): Promise<ApiDataRow[]> {
    const queryParams = new URLSearchParams({
        projectId: params.projectId.toString(),
        startDate: params.startDate,
        endDate: params.endDate,
        platform: params.platform
    });

    // 添加 Campaign ID 筛选
    params.filterCampaignIdList?.forEach(id =>
        queryParams.append('filterCampaignIdList', id)
    );

    // 添加 Account ID 筛选
    params.filterAccountIdList?.forEach(id =>
        queryParams.append('filterAccountIdList', id)
    );

    // 分段维度：age_date 返回年龄，gender_adset_date 返回性别（接口需带 segment 才有对应字段）
    params.segmentList?.forEach(seg =>
        queryParams.append('segment', seg)
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
 * @param segmentList 分段维度：传 ['age_date'] 可返回年龄，['gender_adset_date'] 可返回性别，两者都传则都有
 */
export async function fetchAllPlatformsData(
    projectId: number,
    startDate: string,
    endDate: string,
    filterAccountIdList?: string[],
    segmentList?: string[]
): Promise<ApiDataRow[]> {
    const baseParams = {
        projectId,
        startDate,
        endDate,
        filterAccountIdList,
        segmentList
    };

    // 并行请求两个平台的数据
    const [facebookData, googleData] = await Promise.all([
        fetchAdData({ ...baseParams, platform: 'facebook' }).catch(() => []),
        fetchAdData({ ...baseParams, platform: 'google' }).catch(() => [])
    ]);

    return [...facebookData, ...googleData];
}

/**
 * 将 API 数据转换为系统内部格式 (RawDataRow)
 * 保持与原有 Excel/CSV 导入格式兼容
 */
export function transformApiDataToRawData(apiData: ApiDataRow[]): Record<string, any>[] {
    return apiData.map(row => {
        const isGoogle = row.platform?.toLowerCase().includes('google');
        const commonData = {
            // 内部标识字段 (不用于映射下拉)
            '__platform': row.platform ? String(row.platform).toLowerCase() : '',
            '__campaignAdvertisingType': row.campaignAdvertisingType ? String(row.campaignAdvertisingType).toUpperCase() : '',

            // 基础标识字段
            'Campaign Name': row.campaignName || '',
            'Ad Set Name': row.adsetName || '',
            'Ad Name': row.adName || '',
            'Day': row.recordDate || '',

            // ID 字段 (额外)
            'Campaign ID': row.campaignId || '',
            'Ad Set ID': row.adsetId || '',
            'Ad ID': row.adId || '',
            'Account ID': row.accountId || '',
            'Account Name': row.accountName || '',

            // 核心花费指标
            'Amount spent (USD)': row.costUsd ?? row.cost ?? 0,
            'Spend': row.cost ?? 0,

            // 曝光与触达
            'Impressions': row.impressions ?? 0,
            'Reach': row.reach ?? 0,

            // 点击指标
            'Clicks (all)': row.clicks ?? 0,
            'Link clicks': row.linkClicks ?? 0,

            // 通用转化指标
            'Purchases': row.conversion ?? 0,
            'Purchases conversion value': row.conversionValue ?? 0,
            'Add to Cart': row.addToCart ?? 0,
            'Landing page views': row.landingPageViews ?? 0,

            // GA 指标
            'Total site sale value': row.gaConvertedRevenue ?? 0,

            // 年龄/性别（需接口传 segment=age_date、segment=gender_adset_date 才有值）
            'Age': row.ageRange ?? '',
            'Gender': row.genderType ?? '',

            // 原始数据保留 (用于高级分析)
            '_raw': row
        };

        if (isGoogle) {
            return commonData;
        }

        return {
            ...commonData,
            'Leads': row.leads ?? 0,
            'Checkouts initiated': row.checkout ?? 0,
            'Subscriptions': row.subscribe ?? 0,
        };
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
export async function fetchUserConfig(
    username: string,
    projectId: string | number,
    type: 'metrics' | 'dimensions' | 'formulas' | 'pivotPresets' | 'bi'
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
    type: 'metrics' | 'dimensions' | 'formulas' | 'pivotPresets' | 'bi',
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
