/**
 * API 配置文件
 * 用于 getAllFilterData 接口对接
 */

export const API_CONFIG = {
    BASE_URL: 'https://api.globaloneclick.org',
    ENDPOINTS: {
        GET_ALL_FILTER_DATA: '/project/adsData/getAllFilterData',
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

// API 请求参数类型
export interface ApiRequestParams {
    projectId: number;
    startDate: string; // YYYY-MM-DD
    endDate: string;   // YYYY-MM-DD
    platform: 'facebook' | 'google';
    filterCampaignIdList?: string[];
    filterAccountIdList?: string[];
    /** 分段维度：传 age_date 可返回年龄，传 gender_adset_date 可返回性别（BiSegmentEnum） */
    segmentList?: string[];
}

// API 返回数据行类型
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
    campaignBudget: number;
    adsetId: string;
    adsetName: string;
    adsetStatus: string;
    adsetType: string;
    adId: string;
    adName: string;
    adStrength: string;
    adType: string;
    adStatus: string;
    adImageUrl: string;
    finalUrls: string;
    adTags: string;
    audienceSegments: string;
    country: string;
    region: string;
    device: string;
    genderType: string;
    ageRange: string;
    // 核心指标
    impressions: number;
    clicks: number;
    cost: number;
    costUsd: number;
    currency: string;
    reach: number;
    engagements: number;
    // 转化指标
    conversion: number;
    conversionValue: number;
    allConversions: number;
    addToCart: number;
    addToWishlist: number;
    checkout: number;
    leads: number;
    subscribe: number;
    // 互动指标
    linkClicks: number;
    landingPageViews: number;
    postComments: number;
    postReactions: number;
    postSaves: number;
    postShares: number;
    // 视频指标
    videoViews: number;
    videoViews100: number;
    watchTimeDuration: number;
    // GA4 指标
    users: number;
    sessions: number;
    averagePageViews: number;
    bounceRate: number;
    averageViewTime: number;
    gaCurrency: string;
    gaConvertedRevenue: number;
    // 其他
    dashboardCount: number;
    dashboardRevenue: number;
    dashboardRevisitCount: number;
    category: string;
    productSeries: string;
    extra: string;
}

// API 响应类型
export interface ApiResponse {
    code: number;
    msg: string;
    data: ApiDataRow[];
}

// 获取默认日期范围 (最近7天)
export function getDefaultDateRange(): { start: string; end: string } {
    const today = new Date();
    const endDate = today.toISOString().split('T')[0];

    const startDateObj = new Date(today);
    startDateObj.setDate(startDateObj.getDate() - 6); // 最近7天
    const startDate = startDateObj.toISOString().split('T')[0];

    return { start: startDate, end: endDate };
}
