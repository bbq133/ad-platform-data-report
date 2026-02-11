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

    // 并行请求两个平台的数据
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
            // 内部标识
            '__platform': row.platform ? String(row.platform).toLowerCase() : '',
            '__campaignAdvertisingType': adType || '',
            '__segments': row.segments || '',

            // 基础维度（与文档 Excel 列名对应）
            'Campaign Name': row.campaignName || '',
            'Ad Set Name': row.adsetName || '',
            'Ad Name': row.adName || '',
            'Day': row.recordDate || '',
            'Campaign ID': row.campaignId || '',
            'Ad Set ID': row.adsetId || '',
            'Ad ID': row.adId || '',
            'Account ID': row.accountId || '',
            'Account Name': row.accountName || '',
            'Campaign 目标': row.campaignObjective ?? '',
            'Campaign 类型': row.campaignAdvertisingType ?? '',
            'Adset 状态': row.adsetStatus ?? '',
            'Adset 类型': row.adsetType ?? '',
            '关键词 ID': row.keywordId ?? '',
            '关键词': row.keyword ?? '',
            '搜索词': row.searchTerm ?? '',
            '广告强度': row.adStrength ?? '',
            '最终落地页 URL': row.finalUrls ?? '',
            '广告素材 URL': row.adImageUrl ?? '',
            '广告类型': row.adType ?? '',
            '广告状态': row.adStatus ?? '',
            '广告受众': row.audienceSegments ?? '',
            '国家': row.country ?? '',
            '设备': row.device ?? '',
            '地区': row.region ?? '',
            '广告标签': row.adTags ?? '',
            '来源': row.source ?? '',
            '媒介': row.medium ?? '',
            'Campaign 预算': row.campaignBudget ?? 0,

            // 核心指标（与文档一致）
            'Amount spent (USD)': effectiveCostUsd,
            'Spend': costNum,
            '货币': row.currency ?? '',
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
            '平均浏览页数': row.averagePageViews ?? 0,
            '跳出率': row.bounceRate ?? 0,
            '总转化次数': row.allConversions ?? 0,
            '互动数': row.engagements ?? 0,
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
            '用户数': row.users ?? 0,
            '会话数': row.sessions ?? 0,
            '平均浏览时间': row.averageViewTime ?? 0,
            '浓度报告数量': row.dashboardCount ?? 0,
            '浓度报告收入': row.dashboardRevenue ?? 0,
            '浓度报告回访人数': row.dashboardRevisitCount ?? 0,
            'Total site sale value': row.gaConvertedRevenue ?? 0,
            'GA4 货币': row.gaCurrency ?? '',
            '广告所属大类': row.category ?? '',
            '产品系列': row.productSeries ?? '',
            '视频观看时长(秒)': row.watchTimeDuration ?? 0,

            // 年龄/性别
            'Age': getAge(row),
            'Gender': getGender(row),

            // Meta 常用维度/指标
            'Country': row.country ?? '',
            'Adds of payment info': row.addsPaymentInfo ?? 0,
            'Cost per add of payment info': row.costPerAddPaymentInfo ?? 0,
            'Link (ad settings)': row.linkUrl ?? '',
            'Headline': row.headline ?? '',

            // Google 维度与素材（按文档）
            'Search keyword': isGoogle ? (row.keyword ?? '') : '',
            'Search term': isGoogle ? (row.searchTerm ?? '') : '',
            'Ad status': isGoogle ? (row.adStatus ?? '') : '',
            'Ad type': isGoogle ? (row.adType ?? '') : '',
            'Device preference': isGoogle ? (row.devicePreference ?? '') : '',
            'Long headline': isGoogle ? (row.longHeadline ?? '') : '',
            'Description': isGoogle ? (row.descriptions ?? '') : '',
            'Business name': isGoogle ? (row.businessName ?? '') : '',
            'Square image ID': isGoogle ? (row.squareImageIds ?? '') : '',
            'Portrait image ID': isGoogle ? (row.portraitImageIds ?? '') : '',
            'Logo ID': isGoogle ? (row.logoImageIds ?? '') : '',
            'Landscape image ID': isGoogle ? (row.landscapeImageIds ?? '') : '',
            'Image ID': isGoogle ? (row.landscapeImageIds ?? '') : '',
            'Landscape logo ID': '',
            'Video ID': isGoogle ? (row.videoIds ?? '') : '',
            'Call to action text': isGoogle ? (row.callToActionText ?? '') : '',
            'Call to action headline': isGoogle ? (row.callToActionHeadline ?? '') : '',
            'Mobile final URL': isGoogle ? (row.appFinalUrl ?? '') : '',
            'Display URL': isGoogle ? (row.displayUrl ?? '') : '',
            'Tracking template': isGoogle ? (row.trackingUrlTemplate ?? '') : '',
            'Final URL suffix': isGoogle ? (row.finalUrlSuffix ?? '') : '',
            'Final URL': isGoogle ? (row.finalUrls ?? '') : '',
            'Custom parameter': isGoogle ? (row.customerParam ?? '') : '',
            '广告预览链接': row.previewLink ?? '',

            '_raw': row
        };

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
