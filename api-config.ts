/**
 * API 配置文件
 * 对接《BI 广告数据查询与导出接口文档_字段完整版》：
 * 查询 GET /project/adsData/getAllFilterData，导出 GET /project/adsData/exportFilterData
 */

export const API_CONFIG = {
    BASE_URL: 'https://api.globaloneclick.org',
    ENDPOINTS: {
        /** 广告数据查询，返回 JSON 列表 */
        GET_ALL_FILTER_DATA: '/project/adsData/getAllFilterData',
        /** 广告数据导出，返回 Excel (.xlsx)，请求参数与查询接口一致 */
        EXPORT_FILTER_DATA: '/project/adsData/exportFilterData',
        USER_REPORT_OPTION: '/project/project/userReportOption'
    },
    AUTH_TOKEN: 'globaloneclick',
    CLIENT_ID: 'dce41dca2ad7cfaa5c3e306472571f0d',
    DEFAULT_PROJECT_ID: 47
};

// Google Sheets 权限配置
export const GOOGLE_SHEETS_CONFIG = {
    SHEET_ID: '1rdNtMU_IfrhKPDl6xqXPFVn1vf-rm85zTVvR5ArSmWc', // 替换为实际的 Google Sheets ID
    SHEET_NAME: 'UserPermissions',
    CONFIG_SHEET_NAME: 'SystemConfig',
    // 替换为您部署的 Google Apps Script Web App URL
    GAS_API_URL: 'https://script.google.com/macros/s/AKfycbwSZZd6UW7nnMnW6Ey5glNNhjhEOZ47zmRjBTrQk9xBIp2FFzmefGg8z7Fa0kB9der4og/exec',
    get API_URL() {
        return `https://docs.google.com/spreadsheets/d/${this.SHEET_ID}/gviz/tq?tqx=out:json`;
    }
};

// 项目信息类型
export interface ProjectOption {
    projectId: number;
    projectName: string;
    iconUrl: string;
    adsCostReport: boolean;
    biReport: boolean;
    hasWaring: boolean;
}

// 项目列表响应类型
export interface ProjectListResponse {
    code: number;
    msg: string;
    data: {
        projectList: ProjectOption[];
    };
}

// API 请求参数类型（与 bi_ads_data 接口文档一致）
export interface ApiRequestParams {
    projectId: number;
    startDate: string; // YYYY-MM-DD
    endDate: string;   // YYYY-MM-DD
    platform: 'facebook' | 'google' | 'all'; // GOOGLE / FACEBOOK / ALL
    filterCampaignIdList?: string[];
    filterAccountIdList?: string[];
}

/**
 * API 返回数据行类型（BiAdsDataVo 完整字段，与 bi_ads_data 接口文档一致）
 * 未返回的字段可能为 null/undefined；按平台/广告类型对接新增字段见 api-service transform
 */
export interface ApiDataRow {
    id: number;
    platform: string;
    segments: string;
    recordDate: string;
    projectId: number;
    projectDisplayName: string;
    accountId: string;
    accountName: string;
    source: string;
    medium: string;
    campaignId: string;
    campaignName: string;
    campaignObjective: string;
    campaignAdvertisingType: string;
    campaignBudget?: number;
    adsetId: string;
    adsetName: string;
    adsetStatus: string;
    adsetType: string;
    adId: string;
    keywordId?: string;
    keyword?: string;
    searchTerm?: string;
    adName: string;
    adStrength: string;
    finalUrls: string;
    adImageUrl: string;
    adType: string;
    adStatus: string;
    audienceSegments: string;
    country: string;
    device: string;
    region: string;
    genderType: string;
    ageRange: string;
    adTags: string;
    addToCart?: number;
    addToWishlist?: number;
    checkout?: number;
    averagePageViews?: number;
    bounceRate?: number;
    clicks: number;
    conversionValue?: number;
    conversion?: number;
    allConversions?: number;
    cost?: number;
    currency: string;
    costUsd?: number;
    engagements?: number;
    impressions: number;
    landingPageViews?: number;
    linkClicks?: number;
    postComments?: number;
    postReactions?: number;
    postSaves?: number;
    postShares?: number;
    videoViews?: number;
    videoViews25?: number;
    videoViews50?: number;
    videoViews75?: number;
    videoViews100?: number;
    reach?: number;
    leads?: number;
    subscribe?: number;
    users?: number;
    sessions?: number;
    averageViewTime?: number;
    dashboardCount?: number;
    dashboardRevenue?: number;
    dashboardRevisitCount?: number;
    gaCurrency?: string;
    gaConvertedRevenue?: number;
    category: string;
    productSeries: string;
    extra: string;
    watchTimeDuration?: number;
    longHeadline?: string;
    descriptions?: string;
    businessName?: string;
    landscapeImageIds?: string;
    squareImageIds?: string;
    portraitImageIds?: string;
    logoImageIds?: string;
    videoIds?: string;
    callToActionText?: string;
    callToActionHeadline?: string;
    appFinalUrl?: string;
    displayUrl?: string;
    trackingUrlTemplate?: string;
    finalUrlSuffix?: string;
    customerParam?: string;
    devicePreference?: string;
    previewLink?: string;
    headline?: string;
    linkUrl?: string;
    addsPaymentInfo?: number;
    costPerAddPaymentInfo?: number;
}

// API 响应类型
export interface ApiResponse {
    code: number;
    msg: string;
    data: ApiDataRow[];
}

// 获取默认日期范围 (最近15天)
export function getDefaultDateRange(): { start: string; end: string } {
    const today = new Date();
    const endDate = today.toISOString().split('T')[0];

    const startDateObj = new Date(today);
    startDateObj.setDate(startDateObj.getDate() - 14); // 最近15天
    const startDate = startDateObj.toISOString().split('T')[0];

    return { start: startDate, end: endDate };
}
