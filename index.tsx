import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Upload,
  BarChart3,
  Settings2,
  ChevronDown,
  Download,
  Calendar,
  Filter,
  ArrowRight,
  Database,
  Layers,
  LayoutDashboard,
  Check,
  Zap,
  Target,
  Lightbulb,
  User,
  Split,
  Settings,
  Plus,
  Trash2,
  Globe,
  Facebook,
  Table as TableIcon,
  ArrowUpDown,
  X,
  Search,
  Box,
  UserCheck,
  CalendarRange,
  ChevronRight,
  Calculator,
  Edit3,
  Activity,
  MousePointer2,
  PlayCircle,
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  DollarSign,
  RefreshCcw,
  Delete,
  Menu,
  ChevronUp,
  Settings as SettingsIcon,
  GripVertical,
  LogOut,
  Save,
  AlertTriangle,
  CheckSquare,
  HelpCircle
} from 'lucide-react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Legend
} from 'recharts';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { GoogleGenAI } from "@google/genai";
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { AI_CONFIG, generateAnalysisPrompt, cleanAiResponseText } from './ai-config';
import { API_CONFIG, getDefaultDateRange, ProjectOption } from './api-config';
import { fetchAllPlatformsData, transformApiDataToRawData, fetchProjectList, extractUniqueAccounts, fetchUserConfig, saveUserConfig } from './api-service';
import LoginPage from './LoginPage'; // New: Import LoginPage
import { getUserSession, saveUserSession, clearUserSession, filterProjectsByKeywords, UserInfo, fetchSystemConfig, saveSystemConfig, getSystemConfig } from './auth-service'; // New: Import auth services

// --- Types ---

interface RawDataRow {
  [key: string]: any;
}

interface MappingConfig {
  [key: string]: string | undefined;
}

type GoogleType = 'SEARCH' | 'DEMAND_GEN' | 'PERFORMANCE_MAX';
type PivotPlatformScope = 'meta' | 'google_search' | 'google_demand_gen' | 'google_performance_max';

interface FormulaField {
  id: string;
  name: string;
  formula: string;
  unit: '' | '%' | '$';
  isDefault?: boolean;
}

interface DimensionConfig {
  label: string;
  source: 'campaign' | 'adSet' | 'ad' | 'platform' | 'age' | 'gender';
  index: number;
  delimiter?: string;
}

/** 单条透视筛选器配置（用于保存到预设） */
interface PivotFilterPreset {
  fieldKey: string;
  label: string;
  mode: 'multi' | 'contains' | 'not_contains' | 'date_range';
  selectedValues: string[];
  textValue: string;
  dateRange: { start: string; end: string };
}

/** 透视报告预设：用户保存的命名配置 */
interface PivotPreset {
  id: string;
  name: string;
  filters: PivotFilterPreset[];
  rows: string[];
  columns: string[];
  values: string[];
  display: { showSubtotal: boolean; showGrandTotal: boolean; totalAxis: 'row' | 'column' };
  platformScopes: PivotPlatformScope[];
}

const PIVOT_PRESETS_STORAGE_PREFIX = 'pivotPresets_';

/** 数据透视可选维度：campaign、ad set、ad、gender、age，仅在字段列表中供选择，不默认应用到筛选器/行/列 */
const DEFAULT_PIVOT_DIMENSION_LABELS = ['Campaign', 'Ad Set', 'Ad', 'Gender', 'Age'] as const;

/** 维度解析配置：index -1 为直接取值，否则按 delimiter 分段取第 index 段；取值方式（直接取值/下划线/中划线）在配置中统一可选 */
/** 未保存维度配置的账号项目：Campaign、Ad Set、Ad、Gender、Age 均默认直接取值 */
const DEFAULT_PIVOT_DIM_CONFIGS: DimensionConfig[] = [
  { label: 'Campaign', source: 'campaign', index: -1, delimiter: '_' },
  { label: 'Ad Set', source: 'adSet', index: -1, delimiter: '_' },
  { label: 'Ad', source: 'ad', index: -1, delimiter: '_' },
  { label: 'Gender', source: 'gender', index: -1, delimiter: '_' },
  { label: 'Age', source: 'age', index: -1, delimiter: '_' },
];

const INITIAL_DIMENSIONS = [
  ...DEFAULT_PIVOT_DIMENSION_LABELS,
  "国家", "广告类型", "AI vs AO",
  "兴趣组人群", "素材类型", "素材内容", "折扣类型", "视觉类型", "视觉细节"
];

const BUILTIN_BI_CARD_OPTIONS = [
  { id: 'kpi:total_cost', label: 'Total Cost' },
  { id: 'kpi:total_leads', label: 'Total Leads' },
  { id: 'kpi:avg_cpl', label: 'Avg CPL' },
  { id: 'kpi:avg_ctr', label: 'Avg CTR' },
  { id: 'kpi:sub_rate', label: 'Sub Rate' }
] as const;
type BiCardKey = string;
const DEFAULT_BI_CARD_ORDER: BiCardKey[] = BUILTIN_BI_CARD_OPTIONS.map(o => o.id);

const GOOGLE_TYPES: GoogleType[] = ['SEARCH', 'DEMAND_GEN', 'PERFORMANCE_MAX'];
const PIVOT_PLATFORM_OPTIONS: Array<{ key: PivotPlatformScope; label: string }> = [
  { key: 'meta', label: 'Meta' },
  { key: 'google_search', label: 'Google Search' },
  { key: 'google_demand_gen', label: 'Google Demand Gen' },
  { key: 'google_performance_max', label: 'Google Performance Max' },
];
const DEFAULT_PIVOT_PLATFORM_SCOPES: PivotPlatformScope[] = PIVOT_PLATFORM_OPTIONS.map(o => o.key);

const BASE_METRICS = [
  'cost', 'leads', 'impressions', 'reach', 'clicks', 'linkClicks',
  'conversionValue', 'conversion', 'addToCart',
  'landingPageViews', 'checkout', 'subscribe'
];

const OPERATORS = ['(', ')', '+', '-', '*', '/', '1000', '100'];

// MOCK_PROJECTS 已由 API 替代
const MOCK_ACCOUNTS: { id: string; name: string; type: string }[] = [];

const DEFAULT_FORMULAS: FormulaField[] = [
  { id: 'f_cpm', name: 'CPM', formula: '(cost / impressions) * 1000', unit: '$', isDefault: true },
  { id: 'f_cpc', name: 'CPC', formula: 'cost / linkClicks', unit: '$', isDefault: true },
  { id: 'f_ctr', name: 'CTR', formula: 'linkClicks / impressions', unit: '%', isDefault: true },
  { id: 'f_cpa', name: 'CPA', formula: 'cost / conversion', unit: '$', isDefault: true },
  { id: 'f_cpatc', name: 'CPATC', formula: 'cost / addToCart', unit: '$', isDefault: true },
  { id: 'f_freq', name: 'Frequency', formula: 'impressions / reach', unit: '', isDefault: true },
  { id: 'f_aov', name: 'AOV', formula: 'conversionValue / conversion', unit: '$', isDefault: true },
  { id: 'f_roi', name: 'ROI', formula: 'conversionValue / cost', unit: '', isDefault: true },
  { id: 'f_cpc_checkout', name: 'Cost per checkout', formula: 'cost / checkout', unit: '$', isDefault: true },
  { id: 'f_cps', name: 'Cost per subscription', formula: 'cost / subscribe', unit: '$', isDefault: true },
];

const DEFAULT_ROI_FORMULA: FormulaField = { id: 'f_roi', name: 'ROI', formula: 'conversionValue / cost', unit: '', isDefault: true };

const METRIC_COLORS: Record<string, string> = {
  'cost': '#3b82f6',
  'leads': '#10b981',
  'CPM': '#ec4899',
  'CTR': '#f59e0b',
  'AOV': '#8b5cf6',
  'linkClicks': '#6366f1',
  'impressions': '#94a3b8'
};

const getMetricColor = (key: string, index: number) => {
  if (METRIC_COLORS[key]) return METRIC_COLORS[key];
  const colors = ['#f43f5e', '#8b5cf6', '#06b6d4', '#eab308', '#ec4899', '#10b981', '#3b82f6'];
  return colors[index % colors.length];
};

// --- Global Helpers ---

const parseMetricValue = (val: any): number => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const cleaned = String(val).replace(/[$,%]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};

const evalFormula = (formula: string, context: Record<string, number>): number => {
  try {
    let expr = formula;
    const keys = Object.keys(context).sort((a, b) => b.length - a.length);
    keys.forEach(key => {
      const re = new RegExp(`\\b${key}\\b`, 'g');
      expr = expr.replace(re, `(${context[key] || 0})`);
    });
    if (/[^0-9\+\-\*\/\(\)\. ]/.test(expr)) return 0;
    const result = Function(`"use strict"; return (${expr})`)();
    return isFinite(result) ? result : 0;
  } catch (e) {
    return 0;
  }
};

const formatReportHtml = (rawText: string) => {
  if (!rawText) return '';
  return rawText.split('\n').map(line => `<p class="mb-4">${line}</p>`).join('');
};

const normalizeDimConfigs = (input: any): DimensionConfig[] => {
  let data = input;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(data)) return [];
  const allowedSources = new Set(['campaign', 'adSet', 'ad', 'platform', 'age', 'gender']);
  return data
    .map((item: any) => {
      if (!item || typeof item.label !== 'string') return null;
      const source = String(item.source || '').trim();
      if (!allowedSources.has(source)) return null;
      const index = Number.isFinite(item.index) ? Number(item.index) : 0;
      const delimiter = typeof item.delimiter === 'string' && item.delimiter.length > 0 ? item.delimiter : '_';
      return { label: item.label.trim(), source: source as DimensionConfig['source'], index, delimiter };
    })
    .filter(Boolean) as DimensionConfig[];
};

/** 合并云端维度配置与默认透视维度，保证 Campaign/Ad Set/Ad/Gender/Age 始终存在 */
const mergeDimConfigsWithPivotDefaults = (fromCloud: DimensionConfig[]): DimensionConfig[] => {
  const hasLabel = new Set(fromCloud.map(d => d.label));
  const append = DEFAULT_PIVOT_DIM_CONFIGS.filter(d => !hasLabel.has(d.label));
  return append.length ? [...fromCloud, ...append] : fromCloud;
};

// --- Main App ---

const App = () => {
  // --- Login State ---
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserInfo | null>(null);

  // Check for existing session on mount
  useEffect(() => {
    const user = getUserSession();
    if (user) {
      setCurrentUser(user);
      setIsLoggedIn(true);

      // Ensure SystemConfig is present, if not, fetch it background
      const cachedConfig = getSystemConfig();
      if (!cachedConfig || Object.keys(cachedConfig).length === 0) {
        fetchSystemConfig().then(config => {
          if (config && Object.keys(config).length > 0) {
            saveSystemConfig(config);
          }
        }).catch(err => console.error("Background config fetch failed", err));
      }
    }
  }, []);

  const handleLogin = async (userInfo: UserInfo) => {
    saveUserSession(userInfo); // Save session on successful login
    setCurrentUser(userInfo);
    setIsLoggedIn(true);

    // Fetch System Config (Dynamic API Keys)
    const systemConfig = await fetchSystemConfig();
    if (systemConfig) {
      saveSystemConfig(systemConfig);
    }
  };

  const handleLogout = () => {
    clearUserSession();
    setCurrentUser(null);
    setIsLoggedIn(false);
    // Reset other states if needed
    setProjectList([]);
    setSelectedProject(null);
    setRawData([]);
    setHeadersBySource({ facebook: [], google: { SEARCH: [], DEMAND_GEN: [], PERFORMANCE_MAX: [] } });
    setDimConfigs([]);
    setActiveDashboardDim('');
    setAvailableDates([]);
    setDateRange({ start: '', end: '' });
    setApiError('');
    setIsLoadingData(false);
    setIsLoadingProjects(false);
    setIsLoadingAccounts(false);
    setAvailableAccounts([]);
    setApiDateRange(getDefaultDateRange());
    setReportDateRangeBounds(null);
    setFormulas(DEFAULT_FORMULAS);
    setCustomMetricLabels({});
    setMappings({
      facebook: {
        campaign: '', adSet: '', ad: '', cost: '', leads: '', impressions: '', reach: '', clicks: '', linkClicks: '', date: '',
        conversionValue: '', conversion: '', addToCart: '', landingPageViews: '', checkout: '', subscribe: ''
      },
      google: {
        SEARCH: {
          campaign: '', adSet: '', ad: '', cost: '', impressions: '', reach: '', clicks: '', linkClicks: '', date: '',
          conversionValue: '', conversion: '', addToCart: '', landingPageViews: ''
        },
        DEMAND_GEN: {
          campaign: '', adSet: '', ad: '', cost: '', impressions: '', reach: '', clicks: '', linkClicks: '', date: '',
          conversionValue: '', conversion: '', addToCart: '', landingPageViews: ''
        },
        PERFORMANCE_MAX: {
          campaign: '', adSet: '', ad: '', cost: '', impressions: '', reach: '', clicks: '', linkClicks: '', date: '',
          conversionValue: '', conversion: '', addToCart: '', landingPageViews: ''
        }
      }
    });
  };

  // --- State for App ---
  const [step, setStep] = useState<'upload' | 'mapping' | 'dashboard' | 'dataSourceConfig'>('upload'); // Added dataSourceConfig step
  const [mappingTab, setMappingTab] = useState<'metrics' | 'dimensions' | 'quality'>('metrics');
  const [rawData, setRawData] = useState<RawDataRow[]>([]);
  const [headersBySource, setHeadersBySource] = useState<{
    facebook: string[];
    google: Record<GoogleType, string[]>;
  }>({
    facebook: [],
    google: { SEARCH: [], DEMAND_GEN: [], PERFORMANCE_MAX: [] }
  });

  // States
  const [selectedProject, setSelectedProject] = useState<ProjectOption | null>(null); // Changed to store full ProjectOption
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [accountSearchTerm, setAccountSearchTerm] = useState('');

  // API Loading States
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [apiError, setApiError] = useState<string>('');
  const [availableAccounts, setAvailableAccounts] = useState<{ id: string; name: string }[]>([]);
  const [apiDateRange, setApiDateRange] = useState(getDefaultDateRange());
  // 首次获取报告时的时间范围，报告面板内的时间选择只能在此范围内
  const [reportDateRangeBounds, setReportDateRangeBounds] = useState<{ start: string; end: string } | null>(null);

  // Project Selector States
  const [projectList, setProjectList] = useState<ProjectOption[]>([]);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [projectSearchTerm, setProjectSearchTerm] = useState('');
  const [searchTerm, setSearchTerm] = useState(''); // For project selection hero

  const filteredMockAccounts = useMemo(() => {
    return MOCK_ACCOUNTS.filter(acc =>
      acc.name.toLowerCase().includes(accountSearchTerm.toLowerCase()) ||
      acc.type.toLowerCase().includes(accountSearchTerm.toLowerCase())
    );
  }, [accountSearchTerm]);

  const [formulas, setFormulas] = useState<FormulaField[]>(DEFAULT_FORMULAS);
  const [isFormulaModalOpen, setIsFormulaModalOpen] = useState(false);
  const [formulaToEdit, setFormulaToEdit] = useState<FormulaField | null>(null);

  const [formulaInputName, setFormulaInputName] = useState('');
  const [formulaInputText, setFormulaInputText] = useState('');
  const [formulaInputUnit, setFormulaInputUnit] = useState<'' | '$' | '%'>('');

  const [dashboardPlatformFilter, setDashboardPlatformFilter] = useState<'all' | 'facebook' | 'google'>('all');
  const [activePlatformTab, setActivePlatformTab] = useState<'facebook' | 'google'>('facebook');
  const [activeGoogleType, setActiveGoogleType] = useState<GoogleType>('SEARCH');

  const [customMetricLabels, setCustomMetricLabels] = useState<Record<string, string>>({});
  const [newMetricName, setNewMetricName] = useState('');
  const [isAddingMetric, setIsAddingMetric] = useState(false);

  const getLabelForKey = (key: string) => {
    const labels: Record<string, string> = {
      campaign: 'Campaign Name', adSet: 'Ad Set Name', ad: 'Ad Name', age: 'Age', gender: 'Gender', cost: 'Cost', leads: 'Leads',
      impressions: 'Impressions', reach: 'Reach', clicks: 'Clicks', linkClicks: 'Link clicks', date: 'Day',
      conversionValue: 'Conversion Value',
      conversion: 'Conversions',
      addToCart: 'Add to Cart',
      landingPageViews: 'Landing Page Views',
      checkout: 'Checkouts',
      subscribe: 'Subscriptions',
      ...customMetricLabels
    };
    return labels[key] || key;
  };

  const normalizeGoogleType = (value: string): GoogleType => {
    const upper = value.toUpperCase();
    if (upper === 'SEARCH' || upper === 'DEMAND_GEN' || upper === 'PERFORMANCE_MAX') {
      return upper as GoogleType;
    }
    return 'PERFORMANCE_MAX';
  };

  const inferPlatformFromRow = (row: RawDataRow): '' | 'facebook' | 'google' => {
    const candidate = row.__platform
      || row['Platform Identification']
      || row['platform']
      || row['Platform']
      || row._raw?.platform
      || '';
    const value = String(candidate).toLowerCase();
    if (value.includes('google')) return 'google';
    if (value.includes('facebook') || value.includes('meta')) return 'facebook';
    const hasGoogleType = row.__campaignAdvertisingType
      || row['campaignAdvertisingType']
      || row['campaign_advertising_type']
      || row._raw?.campaignAdvertisingType;
    if (hasGoogleType) return 'google';
    return '';
  };

  const inferGoogleTypeFromRow = (row: RawDataRow): GoogleType => {
    const candidate = row.__campaignAdvertisingType
      || row['campaignAdvertisingType']
      || row['campaign_advertising_type']
      || row['Campaign Advertising Type']
      || row._raw?.campaignAdvertisingType
      || '';
    return normalizeGoogleType(String(candidate));
  };

  const computeHeadersBySource = (rows: RawDataRow[]) => {
    const excluded = new Set(['__platform', '__campaignAdvertisingType', '_raw', 'Platform Identification']);
    const facebookSet = new Set<string>();
    const googleSets: Record<GoogleType, Set<string>> = {
      SEARCH: new Set(),
      DEMAND_GEN: new Set(),
      PERFORMANCE_MAX: new Set()
    };

    rows.forEach(row => {
      const platform = inferPlatformFromRow(row);
      const keys = Object.keys(row).filter(key => !excluded.has(key));
      if (platform === 'facebook') {
        keys.forEach(k => facebookSet.add(k));
      } else if (platform === 'google') {
        const type = inferGoogleTypeFromRow(row);
        keys.forEach(k => googleSets[type].add(k));
      }
    });

    const sortKeys = (set: Set<string>) => Array.from(set).sort();
    return {
      facebook: sortKeys(facebookSet),
      google: {
        SEARCH: sortKeys(googleSets.SEARCH),
        DEMAND_GEN: sortKeys(googleSets.DEMAND_GEN),
        PERFORMANCE_MAX: sortKeys(googleSets.PERFORMANCE_MAX)
      }
    };
  };

  const stripPlatformKey = (mapping: MappingConfig = {}) => {
    const { platform, ...rest } = mapping as any;
    return rest as MappingConfig;
  };

  const migrateMappings = (data: any) => {
    if (!data || typeof data !== 'object') return mappings;
    const facebook = stripPlatformKey(data.facebook || {});

    if (data.google && (data.google.SEARCH || data.google.DEMAND_GEN || data.google.PERFORMANCE_MAX)) {
      return {
        facebook,
        google: {
          SEARCH: stripPlatformKey(data.google.SEARCH || {}),
          DEMAND_GEN: stripPlatformKey(data.google.DEMAND_GEN || {}),
          PERFORMANCE_MAX: stripPlatformKey(data.google.PERFORMANCE_MAX || {})
        }
      };
    }

    const legacyGoogle = stripPlatformKey(data.google || {});
    return {
      facebook,
      google: {
        SEARCH: { ...legacyGoogle },
        DEMAND_GEN: { ...legacyGoogle },
        PERFORMANCE_MAX: { ...legacyGoogle }
      }
    };
  };

  const [mappings, setMappings] = useState<{
    facebook: MappingConfig;
    google: Record<GoogleType, MappingConfig>;
  }>({
    facebook: {
      campaign: '', adSet: '', ad: '', cost: '', leads: '', impressions: '', reach: '', clicks: '', linkClicks: '', date: '',
      conversionValue: '', conversion: '', addToCart: '', landingPageViews: '', checkout: '', subscribe: ''
    },
    google: {
      SEARCH: {
        campaign: '', adSet: '', ad: '', cost: '', impressions: '', reach: '', clicks: '', linkClicks: '', date: '',
        conversionValue: '', conversion: '', addToCart: '', landingPageViews: ''
      },
      DEMAND_GEN: {
        campaign: '', adSet: '', ad: '', cost: '', impressions: '', reach: '', clicks: '', linkClicks: '', date: '',
        conversionValue: '', conversion: '', addToCart: '', landingPageViews: ''
      },
      PERFORMANCE_MAX: {
        campaign: '', adSet: '', ad: '', cost: '', impressions: '', reach: '', clicks: '', linkClicks: '', date: '',
        conversionValue: '', conversion: '', addToCart: '', landingPageViews: ''
      }
    }
  });

  const handleAddMetric = () => {
    if (!newMetricName.trim()) return;
    const key = `custom_${Date.now()}`;
    setCustomMetricLabels(prev => ({ ...prev, [key]: newMetricName.trim() }));
    // 为所有平台增加这个对齐槽位
    setMappings(prev => ({
      facebook: { ...prev.facebook, [key]: '' },
      google: {
        SEARCH: { ...prev.google.SEARCH, [key]: '' },
        DEMAND_GEN: { ...prev.google.DEMAND_GEN, [key]: '' },
        PERFORMANCE_MAX: { ...prev.google.PERFORMANCE_MAX, [key]: '' }
      }
    }));
    setNewMetricName('');
    setIsAddingMetric(false);
  };

  const handleRemoveMetric = (key: string) => {
    setCustomMetricLabels(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setMappings(prev => ({
      facebook: { ...prev.facebook, [key]: undefined },
      google: {
        SEARCH: { ...prev.google.SEARCH, [key]: undefined },
        DEMAND_GEN: { ...prev.google.DEMAND_GEN, [key]: undefined },
        PERFORMANCE_MAX: { ...prev.google.PERFORMANCE_MAX, [key]: undefined }
      }
    }));
  };

  const [allDimensions, setAllDimensions] = useState<string[]>(INITIAL_DIMENSIONS);
  const [dimConfigs, setDimConfigs] = useState<DimensionConfig[]>(() => [...DEFAULT_PIVOT_DIM_CONFIGS]);
  const [activeDashboardDim, setActiveDashboardDim] = useState<string>('');
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string>('');
  const [activeTrendMetrics, setActiveTrendMetrics] = useState<string[]>(['cost']);
  const [isMetricDropdownOpen, setIsMetricDropdownOpen] = useState(false);
  // delimiter state removed, moved to DimensionConfig

  // --- New Dashboard Features States ---
  const [newDimensionName, setNewDimensionName] = useState('');
  const [isAddingDimension, setIsAddingDimension] = useState(false);
  
  // Data Quality Report States
  const [selectedQualityDimension, setSelectedQualityDimension] = useState<string>('');
  const [qualitySearchTerm, setQualitySearchTerm] = useState<string>('');
  const [qualityPlatformFilter, setQualityPlatformFilter] = useState<'all' | 'facebook' | 'google'>('all');
  const [qualitySort, setQualitySort] = useState<'cost_desc' | 'date_desc'>('cost_desc');
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
  const [isFieldConfigOpen, setIsFieldConfigOpen] = useState(false);
  const [fieldSearchTerm, setFieldSearchTerm] = useState('');
  const [activeTableMetrics, setActiveTableMetrics] = useState<string[]>(['cost', 'leads', 'CPM', 'CTR', 'linkClicks']);
  const [dimFilters, setDimFilters] = useState<Record<string, string[]>>({});
  const [isDimFilterOpen, setIsDimFilterOpen] = useState(false);
  const [dimValueSearch, setDimValueSearch] = useState('');
  // 报告面板 Tab：bi | pivot | ai
  const [activeReportTab, setActiveReportTab] = useState<'bi' | 'pivot' | 'ai'>('bi');
  // 数据透视配置
  const [pivotFilters, setPivotFilters] = useState<Array<{
    id: string;
    fieldKey: string;
    label: string;
    mode: 'multi' | 'contains' | 'not_contains' | 'date_range';
    selectedValues: string[];
    search: string;
    textValue: string;
    dateRange: { start: string; end: string };
  }>>(() => []);
  const [pivotRows, setPivotRows] = useState<string[]>(() => []);
  const [pivotColumns, setPivotColumns] = useState<string[]>(() => []);
  const [pivotValues, setPivotValues] = useState<string[]>(() => ['cost']);
  const [pivotPlatformScopes, setPivotPlatformScopes] = useState<PivotPlatformScope[]>(DEFAULT_PIVOT_PLATFORM_SCOPES);
  const [pivotDisplay, setPivotDisplay] = useState({
    showSubtotal: false,
    showGrandTotal: true,
    totalAxis: 'row' as 'row' | 'column',
  });
  const [pivotSort, setPivotSort] = useState<{ colKey: string; valueKey: string; dir: 'asc' | 'desc' } | null>(null);
  const [isPivotDrawerOpen, setIsPivotDrawerOpen] = useState(false);
  const [isPivotExportOpen, setIsPivotExportOpen] = useState(false);
  // BI 指标卡配置
  const [isBiConfigOpen, setIsBiConfigOpen] = useState(false);
  const [biCardOrder, setBiCardOrder] = useState<BiCardKey[]>(DEFAULT_BI_CARD_ORDER);
  const [biCardDraft, setBiCardDraft] = useState<BiCardKey[]>(DEFAULT_BI_CARD_ORDER);
  // 透视报告预设：保存/加载命名配置
  const [pivotPresets, setPivotPresets] = useState<PivotPreset[]>([]);
  const [pivotPresetNameInput, setPivotPresetNameInput] = useState('');
  const [isSavePivotModalOpen, setIsSavePivotModalOpen] = useState(false);
  const [isPivotPresetDropdownOpen, setIsPivotPresetDropdownOpen] = useState(false);
  /** 当前选中的已保存报告 id，用于显示「当前报告」并启用「更新当前报告设置」 */
  const [activePivotPresetId, setActivePivotPresetId] = useState<string | null>(null);
  /** 更新当前报告设置完成后的弱提示 */
  const [pivotUpdateHintVisible, setPivotUpdateHintVisible] = useState(false);

  const dashboardRef = useRef<HTMLDivElement>(null);
  const metricDropdownRef = useRef<HTMLDivElement>(null);
  const fieldConfigRef = useRef<HTMLDivElement>(null);
  const dimFilterRef = useRef<HTMLDivElement>(null);
  const pivotExportRef = useRef<HTMLDivElement>(null);
  const pivotPresetDropdownRef = useRef<HTMLDivElement>(null);

  const allAvailableMetrics = useMemo(() => {
    const baseKeys = [...BASE_METRICS, ...Object.keys(customMetricLabels)];
    const base = baseKeys.map(m => ({ key: m, label: getLabelForKey(m) }));
    const calc = formulas.map(f => ({ key: f.name, label: f.name }));
    return [...base, ...calc];
  }, [formulas, customMetricLabels]);

  const biCardOptions = useMemo(() => {
    const metricOptions = allAvailableMetrics.map(m => ({ id: `metric:${m.key}`, label: m.label }));
    return [...BUILTIN_BI_CARD_OPTIONS, ...metricOptions];
  }, [allAvailableMetrics]);

  // Set initial dashboard dim when configs are ready
  useEffect(() => {
    if (dimConfigs.length > 0 && !activeDashboardDim) {
      setActiveDashboardDim(dimConfigs[0].label);
    }
  }, [dimConfigs]);

  // 加载项目列表
  useEffect(() => {
    const loadProjects = async () => {
      setIsLoadingProjects(true);
      try {
        const list = await fetchProjectList();

        // Filter projects based on user permissions
        if (currentUser && currentUser.projectKeywords) {
          const filteredList = filterProjectsByKeywords(list, currentUser.projectKeywords);
          setProjectList(filteredList);
        } else {
          // If no user or no keywords, show empty or all?
          // Based on logic, if logged in, we should have keywords.
          // Safety fallback: if no keywords, maybe they are admin or see nothing?
          // Current logic: strict filtering.
          setProjectList([]);
        }
      } catch (error) {
        console.error('Failed to load projects:', error);
        setApiError('加载项目列表失败');
      } finally {
        setIsLoadingProjects(false);
      }
    };

    // Reload projects when user changes
    if (isLoggedIn && currentUser) {
      loadProjects();
    } else {
      setProjectList([]); // Clear projects if not logged in or no user
    }
  }, [isLoggedIn, currentUser]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (metricDropdownRef.current && !metricDropdownRef.current.contains(event.target as Node)) {
        setIsMetricDropdownOpen(false);
      }
      if (fieldConfigRef.current && !fieldConfigRef.current.contains(event.target as Node)) {
        setIsFieldConfigOpen(false);
      }
      if (dimFilterRef.current && !dimFilterRef.current.contains(event.target as Node)) {
        setIsDimFilterOpen(false);
      }
      if (pivotExportRef.current && !pivotExportRef.current.contains(event.target as Node)) {
        setIsPivotExportOpen(false);
      }
      if (pivotPresetDropdownRef.current && !pivotPresetDropdownRef.current.contains(event.target as Node)) {
        setIsPivotPresetDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);


  // --- Auto-Load User Configuration ---
  useEffect(() => {
    if (isLoggedIn && currentUser && selectedProject?.projectId) {
      const loadUserConfigs = async () => {
        setIsLoadingData(true);
        try {
          // 1. Load Metric Mappings
          const savedMappings = await fetchUserConfig(currentUser.username, selectedProject.projectId, 'metrics');
          if (savedMappings) {
            setMappings(migrateMappings(savedMappings));
            console.log('Loaded metric mappings from cloud');
          }

          // 2. Load Dimension Configs（无云端配置时用默认透视维度；有则合并默认项）
          const savedDimConfigs = await fetchUserConfig(currentUser.username, selectedProject.projectId, 'dimensions');
          const normalizedDimConfigs = normalizeDimConfigs(savedDimConfigs);
          const mergedDimConfigs = normalizedDimConfigs.length > 0
            ? mergeDimConfigsWithPivotDefaults(normalizedDimConfigs)
            : DEFAULT_PIVOT_DIM_CONFIGS;
          setDimConfigs(mergedDimConfigs);
          setAllDimensions(prev => {
            const fromConfig = mergedDimConfigs.map(d => d.label).filter(Boolean);
            const allLabels = Array.from(new Set([...fromConfig, ...INITIAL_DIMENSIONS]));
            // 默认顺序：Campaign / Ad Set / Ad / Gender / Age 在前，国家在 Age 下方，其余按 INITIAL_DIMENSIONS
            const orderIndex = new Map(INITIAL_DIMENSIONS.map((d, i) => [d, i]));
            const atEnd = allLabels.filter(d => !orderIndex.has(d));
            const ordered = allLabels.filter(d => orderIndex.has(d)).sort((a, b) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0));
            return [...ordered, ...atEnd];
          });
          if (normalizedDimConfigs.length > 0) console.log('Loaded dimension configs from cloud');
          else console.log('Using default pivot dimension configs');

          // 3. Load Formula Configs（若云端没有 ROI 则自动补上默认 ROI）
          const savedFormulas = await fetchUserConfig(currentUser.username, selectedProject.projectId, 'formulas');
          if (savedFormulas && Array.isArray(savedFormulas)) {
            const hasRoi = savedFormulas.some((f: FormulaField) => f.name === 'ROI');
            setFormulas(hasRoi ? savedFormulas : [...savedFormulas, DEFAULT_ROI_FORMULA]);
            console.log('Loaded formula configs from cloud');
          }
        } catch (e) {
          console.error("Failed to auto-load configs:", e);
        } finally {
          setIsLoadingData(false);
        }
      };
      loadUserConfigs();
    }
  }, [selectedProject?.projectId, isLoggedIn, currentUser]);

  // --- 透视报告预设：localStorage / 云端 读写 ---
  const getPivotAccountKey = () => {
    if (!selectedAccounts.length) return 'all';
    return [...selectedAccounts].sort().join('|');
  };

  const normalizePivotPresetsPayload = (data: any) => {
    if (!data) return { byAccountKey: {} as Record<string, PivotPreset[]> };
    if (Array.isArray(data)) return { byAccountKey: { all: data as PivotPreset[] } };
    if (data.byAccountKey && typeof data.byAccountKey === 'object') {
      return { byAccountKey: data.byAccountKey as Record<string, PivotPreset[]> };
    }
    if (data.accountKey && Array.isArray(data.presets)) {
      return { byAccountKey: { [data.accountKey]: data.presets as PivotPreset[] } };
    }
    return { byAccountKey: {} as Record<string, PivotPreset[]> };
  };

  const getPivotPresetsStorageKey = () => {
    if (!currentUser?.username || !selectedProject?.projectId) return null;
    const accountKey = getPivotAccountKey();
    return `${PIVOT_PRESETS_STORAGE_PREFIX}${currentUser.username}_${selectedProject.projectId}_${accountKey}`;
  };

  const savePivotPresetsToCloud = async (list: PivotPreset[]) => {
    if (!currentUser?.username || !selectedProject?.projectId) return;
    try {
      const accountKey = getPivotAccountKey();
      const existing = await fetchUserConfig(currentUser.username, selectedProject.projectId, 'pivotPresets');
      const store = normalizePivotPresetsPayload(existing);
      store.byAccountKey[accountKey] = list;
      const ok = await saveUserConfig(currentUser.username, selectedProject.projectId, 'pivotPresets', store);
      if (!ok) console.warn('Failed to save pivot presets to cloud');
    } catch (e) {
      console.error('Failed to save pivot presets to cloud', e);
    }
  };

  useEffect(() => {
    const key = getPivotPresetsStorageKey();
    if (!key) {
      setPivotPresets([]);
      return;
    }

    // 1) 先读本地
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const list = JSON.parse(raw) as PivotPreset[];
        setPivotPresets(Array.isArray(list) ? list : []);
      } else {
        setPivotPresets([]);
      }
    } catch {
      setPivotPresets([]);
    }

    // 2) 再读云端（覆盖本地）
    let cancelled = false;
    const loadFromCloud = async () => {
      if (!currentUser?.username || !selectedProject?.projectId) return;
      const cloud = await fetchUserConfig(currentUser.username, selectedProject.projectId, 'pivotPresets');
      const store = normalizePivotPresetsPayload(cloud);
      const accountKey = getPivotAccountKey();
      // 优先用当前 accountKey 的预设；若无则合并所有 accountKey 的预设，确保已保存报告能展示
      let list = store.byAccountKey[accountKey] || [];
      if (list.length === 0 && store.byAccountKey && Object.keys(store.byAccountKey).length > 0) {
        const seen = new Set<string>();
        list = ([] as PivotPreset[]).concat(...Object.values(store.byAccountKey)).filter(p => {
          if (p.id && seen.has(p.id)) return false;
          if (p.id) seen.add(p.id);
          return true;
        });
      }
      if (cancelled) return;
      setPivotPresets(list);
      try {
        localStorage.setItem(key, JSON.stringify(list));
      } catch (e) {
        console.error('Failed to persist pivot presets', e);
      }
    };
    loadFromCloud();

    return () => {
      cancelled = true;
    };
  }, [currentUser?.username, selectedProject?.projectId, selectedAccounts.join('|')]);

  // --- BI 指标卡配置：云端读写（按账号维度存储） ---
  const getBiAccountKey = () => {
    if (!selectedAccounts.length) return 'all';
    return [...selectedAccounts].sort().join('|');
  };

  const normalizeBiConfigPayload = (data: any) => {
    if (!data) return { byAccountKey: {} as Record<string, BiCardKey[]> };
    if (Array.isArray(data)) return { byAccountKey: { all: data as BiCardKey[] } };
    if (data.byAccountKey && typeof data.byAccountKey === 'object') {
      return { byAccountKey: data.byAccountKey as Record<string, BiCardKey[]> };
    }
    if (data.accountKey && Array.isArray(data.cards)) {
      return { byAccountKey: { [data.accountKey]: data.cards as BiCardKey[] } };
    }
    return { byAccountKey: {} as Record<string, BiCardKey[]> };
  };

  const saveBiConfigToCloud = async (cards: BiCardKey[]) => {
    if (!currentUser?.username || !selectedProject?.projectId) return;
    try {
      const accountKey = getBiAccountKey();
      const existing = await fetchUserConfig(currentUser.username, selectedProject.projectId, 'bi');
      const store = normalizeBiConfigPayload(existing);
      store.byAccountKey[accountKey] = cards;
      const ok = await saveUserConfig(currentUser.username, selectedProject.projectId, 'bi', store);
      if (!ok) console.warn('Failed to save BI config to cloud');
    } catch (e) {
      console.error('Failed to save BI config to cloud', e);
    }
  };

  useEffect(() => {
    if (!currentUser?.username || !selectedProject?.projectId) return;
    let cancelled = false;
    const loadBiConfig = async () => {
      const cloud = await fetchUserConfig(currentUser.username, selectedProject.projectId, 'bi');
      const store = normalizeBiConfigPayload(cloud);
      const accountKey = getBiAccountKey();
      let list = store.byAccountKey[accountKey] || store.byAccountKey.all || DEFAULT_BI_CARD_ORDER;
      const allowed = new Set(biCardOptions.map(o => o.id));
      list = (list || []).filter(id => allowed.has(id as BiCardKey)) as BiCardKey[];
      if (!list.length) list = DEFAULT_BI_CARD_ORDER;
      if (cancelled) return;
      setBiCardOrder(list);
    };
    loadBiConfig();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.username, selectedProject?.projectId, selectedAccounts.join('|'), biCardOptions]);

  const persistPivotPresets = (list: PivotPreset[]) => {
    const key = getPivotPresetsStorageKey();
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify(list));
    } catch (e) {
      console.error('Failed to persist pivot presets', e);
    }
    void savePivotPresetsToCloud(list);
  };

  // --- Save Configuration Handler ---
  const handleSaveConfig = async () => {
    if (!currentUser || !selectedProject?.projectId) return;

    setIsLoadingData(true);
    try {
      const p1 = saveUserConfig(currentUser.username, selectedProject.projectId, 'metrics', mappings);
      const p2 = saveUserConfig(currentUser.username, selectedProject.projectId, 'dimensions', dimConfigs);
      const p3 = saveUserConfig(currentUser.username, selectedProject.projectId, 'formulas', formulas);

      const [res1, res2, res3] = await Promise.all([p1, p2, p3]);

      if (res1 && res2 && res3) {
        alert('配置已保存到云端 (Google Sheets) ✅');
      } else {
        alert('保存失败，请重试 ❌');
      }
    } catch (e) {
      console.error(e);
      alert('保存出错');
    } finally {
      setIsLoadingData(false);
    }
  };
  // Extract samples for the current platform
  const namingSamples = useMemo(() => {
    if (!rawData.length) return { campaign: '', adSet: '', ad: '', age: '', gender: '' };
    const curMap = activePlatformTab === 'facebook'
      ? mappings.facebook
      : mappings.google[activeGoogleType];
    const sampleRow = rawData.find(row => {
      const platform = inferPlatformFromRow(row);
      if (activePlatformTab === 'facebook') return platform === 'facebook';
      if (platform !== 'google') return false;
      return inferGoogleTypeFromRow(row) === activeGoogleType;
    }) || rawData[0];
    return {
      campaign: String(sampleRow[curMap.campaign] || ''),
      adSet: String(sampleRow[curMap.adSet] || ''),
      ad: String(sampleRow[curMap.ad] || ''),
      age: String(sampleRow[curMap.age] || ''),
      gender: String(sampleRow[curMap.gender] || '')
    };
  }, [rawData, mappings, activePlatformTab, activeGoogleType]);

  const activeMapping = activePlatformTab === 'facebook'
    ? mappings.facebook
    : mappings.google[activeGoogleType];

  const activeHeaders = activePlatformTab === 'facebook'
    ? headersBySource.facebook
    : headersBySource.google[activeGoogleType];

  // Core Data Processing with Global Filter Support
  const baseProcessedData = useMemo(() => {
    if (!rawData.length) return [];
    const dates = new Set<string>();

    const processed = rawData.map(row => {
      const platformValue = inferPlatformFromRow(row);
      const isGoogleRow = platformValue === 'google';
      const googleType = isGoogleRow ? inferGoogleTypeFromRow(row) : 'PERFORMANCE_MAX';
      const curMap = isGoogleRow ? mappings.google[googleType] : mappings.facebook;

      const context: Record<string, number> = {};
      Object.keys(curMap).forEach(key => {
        if (['campaign', 'adSet', 'ad', 'date'].includes(key)) return;
        const colName = (curMap as any)[key];
        context[key] = colName ? parseMetricValue(row[colName]) : 0;
      });

      const formulaResults: Record<string, number> = {};
      formulas.forEach(f => {
        formulaResults[f.name] = evalFormula(f.formula, context);
      });

      const dateVal = String(row[curMap.date] || '');
      if (dateVal) dates.add(dateVal);

      const dims: Record<string, string> = {};
      dimConfigs.forEach(conf => {
        if (conf.source === 'platform') {
          if (platformValue === 'google') {
            dims[conf.label] = `Google - ${googleType}`;
          } else if (platformValue === 'facebook') {
            dims[conf.label] = 'Facebook';
          } else {
            dims[conf.label] = 'N/A';
          }
        } else if (conf.source === 'age' || conf.source === 'gender') {
          const sourceCol = curMap[conf.source] || (conf.source === 'age' ? 'Age' : 'Gender');
          const sourceVal = String(row[sourceCol] ?? row[conf.source === 'age' ? 'Age' : 'Gender'] ?? '');
          dims[conf.label] = sourceVal || 'N/A';
        } else {
          const sourceCol = curMap[conf.source as keyof MappingConfig];
          const sourceVal = String(row[sourceCol] || '');
          // index === -1 表示直接取值（不按分隔符拆段），与 gender/age 一致
          if (conf.index === -1) {
            dims[conf.label] = sourceVal || 'N/A';
          } else {
            const parts = sourceVal.split(conf.delimiter || '_');
            dims[conf.label] = parts[conf.index] ?? 'N/A';
          }
        }
      });

      return {
        _date: dateVal,
        _isGoogle: isGoogleRow,
        _platform: platformValue,
        _googleType: googleType,
        _dims: dims,
        _names: {
          campaign: String(row[curMap.campaign] || ''),
          adSet: String(row[curMap.adSet] || ''),
          ad: String(row[curMap.ad] || '')
        },
        _metrics: { ...context, ...formulaResults },
      };
    });

    const uniqueDates = Array.from(dates).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    setAvailableDates(uniqueDates);

    // Set initial date range if empty
    if (!dateRange.start && uniqueDates.length > 0) {
      setDateRange({ start: uniqueDates[0], end: uniqueDates[uniqueDates.length - 1] });
    }

    return processed;
  }, [rawData, mappings, formulas, dimConfigs]);

  const filteredData = useMemo(() => {
    let data = baseProcessedData;

    // 1. Date & Platform Filter
    if (dateRange.start || dateRange.end) {
      data = data.filter(row => {
        if (dateRange.start && row._date < dateRange.start) return false;
        if (dateRange.end && row._date > dateRange.end) return false;
        return true;
      });
    }
    if (dashboardPlatformFilter !== 'all') {
      const isGoogleTarget = dashboardPlatformFilter === 'google';
      data = data.filter(row => row._isGoogle === isGoogleTarget);
    }

    // 2. Global Dimension Filters
    (Object.entries(dimFilters) as [string, string[]][]).forEach(([dimLabel, activeValues]) => {
      if (activeValues.length > 0) {
        data = data.filter(row => activeValues.includes(row._dims[dimLabel] || 'Other'));
      }
    });

    return data;
  }, [baseProcessedData, dateRange, dashboardPlatformFilter, dimFilters]);

  // --- Data Quality Report Logic ---
  const qualityDimensionLabels = useMemo(() =>
    dimConfigs.map(d => d.label),
    [dimConfigs]
  );

  /** Meta 行层级：Campaign 层级 = Ad Set / Ad 均为空；Ad Set 层级 = Ad 为空且 Ad Set 非空；Ad 层级 = Ad 非空 */
  const isMetaRow = (row: { _platform?: string }) => row._platform === 'facebook';
  const isCampaignLevelRow = (row: { _dims?: Record<string, string> }) =>
    (row._dims?.['Ad Set'] || 'N/A') === 'N/A' && (row._dims?.['Ad'] || 'N/A') === 'N/A';
  const isAdSetLevelRow = (row: { _dims?: Record<string, string> }) =>
    (row._dims?.['Ad'] || 'N/A') === 'N/A' && (row._dims?.['Ad Set'] || 'N/A') !== 'N/A';
  const isAdLevelRow = (row: { _dims?: Record<string, string> }) =>
    (row._dims?.['Ad'] || 'N/A') !== 'N/A';

  /** 行是否落入某维度的数据源（仅 Meta 按规则：age=Campaign 层级，gender=Ad Set 层级，其他=Ad 层级；非 Meta 全部行） */
  const isInDimensionDataSource = (row: any, source: string): boolean => {
    if (!isMetaRow(row)) return true;
    if (source === 'age') return isCampaignLevelRow(row);
    if (source === 'gender') return isAdSetLevelRow(row);
    return isAdLevelRow(row);
  };

  // Auto-select first dimension when configs change
  useEffect(() => {
    if (qualityDimensionLabels.length > 0 && !selectedQualityDimension) {
      setSelectedQualityDimension(qualityDimensionLabels[0]);
    }
    if (!qualityDimensionLabels.includes(selectedQualityDimension)) {
      setSelectedQualityDimension(qualityDimensionLabels[0] || '');
    }
  }, [qualityDimensionLabels, selectedQualityDimension]);

  // Overall quality stats（Meta：age 仅看 campaign 层级，gender 仅看 ad set 层级，其他维度仅看 ad name 非空；非 Meta 全量）
  const qualityStats = useMemo(() => {
    const total = baseProcessedData.length;
    if (!total || qualityDimensionLabels.length === 0) {
      return { total, matched: 0, unmatched: 0, matchRate: 0 };
    }
    let unmatched = 0;
    baseProcessedData.forEach(row => {
      const hasMissing = qualityDimensionLabels.some(label => {
        const conf = dimConfigs.find(c => c.label === label);
        const source = conf?.source ?? '';
        const inSource = isInDimensionDataSource(row, source);
        const valueNA = (row._dims[label] || 'N/A') === 'N/A';
        return inSource && valueNA;
      });
      if (hasMissing) unmatched += 1;
    });
    const matched = total - unmatched;
    const matchRate = total ? matched / total : 0;
    return { total, matched, unmatched, matchRate };
  }, [baseProcessedData, qualityDimensionLabels, dimConfigs]);

  // Per-dimension match stats（Meta：age 数据源=campaign 层级，gender=ad set 层级，其他=ad name 非空；非 Meta 全量）
  const dimensionMatchStats = useMemo(() => {
    if (qualityDimensionLabels.length === 0 || baseProcessedData.length === 0) return [];

    return qualityDimensionLabels.map(dimLabel => {
      const conf = dimConfigs.find(c => c.label === dimLabel);
      const source = conf?.source ?? '';
      const dataSourceRows = baseProcessedData.filter(row => isInDimensionDataSource(row, source));
      const total = dataSourceRows.length;
      let missing = 0;
      dataSourceRows.forEach(row => {
        if ((row._dims[dimLabel] || 'N/A') === 'N/A') missing += 1;
      });
      const matched = total - missing;
      const matchRate = total ? matched / total : 0;

      return {
        label: dimLabel,
        total,
        matched,
        missing,
        matchRate
      };
    }).sort((a, b) => a.matchRate - b.matchRate); // Sort by match rate ascending (worst first)
  }, [baseProcessedData, qualityDimensionLabels, dimConfigs]);

  // Unmatched data list for selected dimension（仅展示该维度数据源内且值为 N/A 的行）
  const qualityUnmatchedData = useMemo(() => {
    if (!selectedQualityDimension || baseProcessedData.length === 0) return [];

    const conf = dimConfigs.find(c => c.label === selectedQualityDimension);
    const source = conf?.source ?? '';
    const issues = baseProcessedData
      .filter(row => isInDimensionDataSource(row, source) && (row._dims[selectedQualityDimension] || 'N/A') === 'N/A')
      .map(row => ({
        row,
        campaignName: row._names?.campaign || 'N/A',
        date: row._date || 'N/A',
        platform: row._platform === 'google' ? `Google (${row._googleType || 'PERFORMANCE_MAX'})` : 'Meta',
        cost: Number(row._metrics?.cost || 0)
      }));

    return issues;
  }, [baseProcessedData, selectedQualityDimension, dimConfigs]);

  // Filtered and sorted unmatched data
  const filteredQualityData = useMemo(() => {
    let list = qualityUnmatchedData;
    
    // Platform filter
    if (qualityPlatformFilter !== 'all') {
      list = list.filter(item => item.row._platform === qualityPlatformFilter);
    }
    
    // Search filter
    if (qualitySearchTerm.trim()) {
      const term = qualitySearchTerm.toLowerCase();
      list = list.filter(item => item.campaignName.toLowerCase().includes(term));
    }
    
    // Sort
    const sorted = [...list].sort((a, b) => {
      if (qualitySort === 'date_desc') {
        return String(b.date).localeCompare(String(a.date));
      }
      return b.cost - a.cost; // cost_desc
    });
    
    return sorted;
  }, [qualityUnmatchedData, qualityPlatformFilter, qualitySearchTerm, qualitySort]);

  // 上期数据：与 dateRange 等长、紧挨着的前一段，用于 BI 看板环比
  const lastPeriodFilteredData = useMemo(() => {
    if (!dateRange.start || !dateRange.end) return [];
    const startD = new Date(dateRange.start);
    const endD = new Date(dateRange.end);
    const days = Math.round((endD.getTime() - startD.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    const lastEndD = new Date(startD);
    lastEndD.setDate(lastEndD.getDate() - 1);
    const lastStartD = new Date(lastEndD);
    lastStartD.setDate(lastStartD.getDate() - days + 1);
    const lastPeriodStart = lastStartD.toISOString().split('T')[0];
    const lastPeriodEnd = lastEndD.toISOString().split('T')[0];

    let data = baseProcessedData.filter(row => row._date >= lastPeriodStart && row._date <= lastPeriodEnd);
    if (dashboardPlatformFilter !== 'all') {
      const isGoogleTarget = dashboardPlatformFilter === 'google';
      data = data.filter(row => row._isGoogle === isGoogleTarget);
    }
    (Object.entries(dimFilters) as [string, string[]][]).forEach(([dimLabel, activeValues]) => {
      if (activeValues.length > 0) {
        data = data.filter(row => activeValues.includes(row._dims[dimLabel] || 'Other'));
      }
    });
    return data;
  }, [baseProcessedData, dateRange.start, dateRange.end, dashboardPlatformFilter, dimFilters]);

  const aggregatedTrendData = useMemo(() => {
    const daily: Record<string, any> = {};
    const baseKeys = [...BASE_METRICS, ...Object.keys(customMetricLabels)];

    filteredData.forEach(row => {
      const d = row._date;
      if (!daily[d]) {
        daily[d] = { _date: d };
        baseKeys.forEach(k => daily[d][k] = 0);
      }
      baseKeys.forEach(k => {
        daily[d][k] = (daily[d][k] || 0) + (row._metrics[k] || 0);
      });
    });

    const result = Object.values(daily).map(dayData => {
      const formulaResults: Record<string, number> = {};
      formulas.forEach(f => {
        formulaResults[f.name] = evalFormula(f.formula, dayData);
      });
      return { ...dayData, ...formulaResults };
    });

    return result.sort((a, b) => new Date(a._date).getTime() - new Date(b._date).getTime());
  }, [filteredData, formulas, customMetricLabels]);

  const aggregateBy = (dimName: string) => {
    const groups: Record<string, any> = {};
    const baseKeys = [...BASE_METRICS, ...Object.keys(customMetricLabels)];

    filteredData.forEach(row => {
      const key = row._dims[dimName] || 'Other';
      if (!groups[key]) {
        groups[key] = { label: key };
        baseKeys.forEach(k => groups[key][k] = 0);
      }
      baseKeys.forEach(k => {
        groups[key][k] = (groups[key][k] || 0) + (row._metrics[k] || 0);
      });
    });

    return Object.values(groups).map(groupData => {
      const formulaResults: Record<string, number> = {};
      formulas.forEach(f => {
        formulaResults[f.name] = evalFormula(f.formula, groupData);
      });
      return { ...groupData, ...formulaResults };
    });
  };

  const tableData = useMemo(() => {
    if (!activeDashboardDim) return [];
    return aggregateBy(activeDashboardDim);
  }, [filteredData, activeDashboardDim]);

  const currentDimValues = useMemo(() => {
    if (!activeDashboardDim) return [];
    const values = new Set<string>();
    baseProcessedData.forEach(row => {
      values.add(row._dims[activeDashboardDim] || 'Other');
    });
    return Array.from(values).sort();
  }, [baseProcessedData, activeDashboardDim]);

  // --- 数据透视分析：字段与计算 ---
  const pivotDimensionFields = useMemo(() => {
    const dims = dimConfigs.map(d => ({
      key: d.label,
      label: d.label,
      type: (/日期|date|day/i.test(d.label) ? 'date' : 'text') as 'date' | 'text',
    }));
    const hasDate = dims.some(d => d.key === '__date' || d.type === 'date');
    const dateField = { key: '__date', label: '日期', type: 'date' as const };
    return hasDate ? dims : [dateField, ...dims];
  }, [dimConfigs]);

  const formulaByName = useMemo(() => {
    const map = new Map<string, FormulaField>();
    formulas.forEach(f => map.set(f.name, f));
    return map;
  }, [formulas]);

  const pivotValueOptions = useMemo(() => {
    return allAvailableMetrics.map(m => {
      const formula = formulaByName.get(m.key);
      const unit = formula?.unit;
      const format = unit === '$' ? 'currency' : unit === '%' ? 'percent' : 'number';
      return { key: m.key, label: m.label, isFormula: !!formula, format };
    });
  }, [allAvailableMetrics, formulaByName]);

  const getPivotDimValue = (row: any, fieldKey: string) => {
    if (fieldKey === '__date') return row._date || 'N/A';
    return row._dims[fieldKey] || 'Other';
  };

  const pivotPlatformScopedData = useMemo(() => {
    if (pivotPlatformScopes.length === 0) return [];
    const scopeSet = new Set(pivotPlatformScopes);
    return filteredData.filter(row => {
      if (row._platform === 'facebook') {
        if (!scopeSet.has('meta')) return false;
        // Meta 透视表默认仅使用 Ad 层级数据，避免与 age_date/gender_adset_date 混算导致重复或 N/A
        if ((row._dims?.['Ad'] || 'N/A') === 'N/A') return false;
        return true;
      }
      if (row._platform === 'google') {
        const gType: GoogleType = row._googleType || 'PERFORMANCE_MAX';
        if (gType === 'SEARCH') return scopeSet.has('google_search');
        if (gType === 'DEMAND_GEN') return scopeSet.has('google_demand_gen');
        return scopeSet.has('google_performance_max');
      }
      return pivotPlatformScopes.length === DEFAULT_PIVOT_PLATFORM_SCOPES.length;
    });
  }, [filteredData, pivotPlatformScopes]);

  const pivotDimensionValueOptions = useMemo(() => {
    const sets: Record<string, Set<string>> = {};
    pivotDimensionFields.forEach(f => { sets[f.key] = new Set(); });
    pivotPlatformScopedData.forEach(row => {
      pivotDimensionFields.forEach(f => {
        sets[f.key].add(String(getPivotDimValue(row, f.key)));
      });
    });
    const result: Record<string, string[]> = {};
    Object.keys(sets).forEach(k => {
      result[k] = Array.from(sets[k]).sort();
    });
    return result;
  }, [pivotPlatformScopedData, pivotDimensionFields]);

  const pivotFilteredData = useMemo(() => {
    if (!pivotFilters.length) return pivotPlatformScopedData;
    return pivotPlatformScopedData.filter(row => {
      return pivotFilters.every(f => {
        const rawVal = String(getPivotDimValue(row, f.fieldKey) || '');
        if (f.mode === 'date_range') {
          if (f.dateRange.start && rawVal < f.dateRange.start) return false;
          if (f.dateRange.end && rawVal > f.dateRange.end) return false;
          return true;
        }
        if (f.mode === 'multi') {
          if (f.selectedValues.length === 0) return true;
          return f.selectedValues.includes(rawVal);
        }
        if (!f.textValue) return true;
        const needle = f.textValue.toLowerCase();
        const hay = rawVal.toLowerCase();
        if (f.mode === 'contains') return hay.includes(needle);
        if (f.mode === 'not_contains') return !hay.includes(needle);
        return true;
      });
    });
  }, [pivotPlatformScopedData, pivotFilters]);

  const pivotResult = useMemo(() => {
    if (pivotValues.length === 0) return null;

    const rowDims = pivotRows;
    const colDims = pivotColumns;
    const valueKeys = pivotValues;
    const baseKeys = [...BASE_METRICS, ...Object.keys(customMetricLabels)];
    const baseKeySet = new Set(baseKeys);
    const makeKey = (arr: string[]) => arr.join('||');

    const rowKeyMap = new Map<string, string[]>();
    const colKeyMap = new Map<string, string[]>();
    const rowOrder: string[] = [];
    const colOrder: string[] = [];
    const cellBaseAgg = new Map<string, Record<string, number>>();

    const ensureKey = (key: string, map: Map<string, string[]>, order: string[], arr: string[]) => {
      if (!map.has(key)) {
        map.set(key, arr);
        order.push(key);
      }
    };

    pivotFilteredData.forEach(row => {
      const rowArr = rowDims.length ? rowDims.map(d => String(getPivotDimValue(row, d))) : [];
      const colArr = colDims.length ? colDims.map(d => String(getPivotDimValue(row, d))) : [];
      const rowKey = rowDims.length ? makeKey(rowArr) : '__all__';
      const colKey = colDims.length ? makeKey(colArr) : '__all__';
      ensureKey(rowKey, rowKeyMap, rowOrder, rowArr);
      ensureKey(colKey, colKeyMap, colOrder, colArr);
      const cellKey = `${rowKey}|||${colKey}`;
      if (!cellBaseAgg.has(cellKey)) {
        const init: Record<string, number> = { __count: 0 };
        baseKeys.forEach(k => { init[k] = 0; });
        cellBaseAgg.set(cellKey, init);
      }
      const agg = cellBaseAgg.get(cellKey)!;
      agg.__count = (agg.__count || 0) + 1;
      baseKeys.forEach(k => {
        agg[k] = (agg[k] || 0) + (row._metrics[k] || 0);
      });
    });

    if (rowOrder.length === 0) rowOrder.push('__all__');
    if (colOrder.length === 0) colOrder.push('__all__');

    const colKeys = [...colOrder];
    if (pivotDisplay.showGrandTotal && pivotDisplay.totalAxis === 'column') {
      colKeys.push('__grand_total__');
    }

    const colLabels: Record<string, string> = {};
    colKeys.forEach(key => {
      if (key === '__all__') colLabels[key] = '全部';
      else if (key === '__grand_total__') colLabels[key] = '总计';
      else colLabels[key] = (colKeyMap.get(key) || []).join(' / ') || '全部';
    });

    const rowKeyArrs = rowOrder.map(k => rowKeyMap.get(k) || []);
    const rowEntries: Array<{
      type: 'data' | 'subtotal' | 'grand_total';
      key: string;
      rowArr: string[];
      depth: number;
      displayCells: string[];
    }> = [];

    if (rowDims.length === 0) {
      rowEntries.push({ type: 'data', key: '__all__', rowArr: [], depth: 0, displayCells: ['全部'] });
    } else {
      const build = (level: number, items: Array<{ key: string; rowArr: string[] }>) => {
        const groups = new Map<string, Array<{ key: string; rowArr: string[] }>>();
        items.forEach(item => {
          const val = item.rowArr[level] || 'Other';
          if (!groups.has(val)) groups.set(val, []);
          groups.get(val)!.push(item);
        });
        for (const [val, groupItems] of groups) {
          if (level === rowDims.length - 1) {
            groupItems.forEach(item => {
              rowEntries.push({ type: 'data', key: item.key, rowArr: item.rowArr, depth: level, displayCells: item.rowArr });
            });
          } else {
            build(level + 1, groupItems);
          }
          // 仅非叶子层级显示小计，避免每个叶子行后都重复一行“XXX 小计”
          if (pivotDisplay.showSubtotal && level < rowDims.length - 1) {
            const displayCells = [...(groupItems[0]?.rowArr || [])];
            displayCells[level] = `${val} 小计`;
            for (let i = level + 1; i < rowDims.length; i += 1) displayCells[i] = '';
            rowEntries.push({
              type: 'subtotal',
              key: `subtotal-${groupItems[0]?.rowArr?.slice(0, level + 1).join('||')}`,
              rowArr: groupItems[0]?.rowArr?.slice(0, level + 1) || [],
              depth: level,
              displayCells,
            });
          }
        }
      };
      build(0, rowOrder.map((k, i) => ({ key: k, rowArr: rowKeyArrs[i] })));
    }

    if (pivotDisplay.showGrandTotal && pivotDisplay.totalAxis === 'row') {
      rowEntries.push({ type: 'grand_total', key: '__grand_total__', rowArr: [], depth: 0, displayCells: ['总计'] });
    }

    const rowMatchesPrefix = (rowArr: string[], prefix: string[]) => {
      return prefix.every((v, idx) => rowArr[idx] === v);
    };

    const getBaseAggForRowCol = (rowKeyStrs: string[], colKeyStr: string) => {
      const agg: Record<string, number> = { __count: 0 };
      baseKeys.forEach(k => { agg[k] = 0; });
      rowKeyStrs.forEach(rk => {
        if (colKeyStr === '__grand_total__') {
          colOrder.forEach(ck => {
            const cellKey = `${rk}|||${ck}`;
            const cellAgg = cellBaseAgg.get(cellKey);
            if (cellAgg) {
              agg.__count += cellAgg.__count || 0;
              baseKeys.forEach(k => { agg[k] += cellAgg[k] || 0; });
            }
          });
        } else {
          const cellKey = `${rk}|||${colKeyStr}`;
          const cellAgg = cellBaseAgg.get(cellKey);
          if (cellAgg) {
            agg.__count += cellAgg.__count || 0;
            baseKeys.forEach(k => { agg[k] += cellAgg[k] || 0; });
          }
        }
      });
      return agg;
    };

    const computeValue = (agg: Record<string, number>, key: string) => {
      if (!agg.__count) return null;
      if (formulaByName.has(key)) {
        return evalFormula(formulaByName.get(key)!.formula, agg);
      }
      return agg[key] || 0;
    };

    const rowsForRender = rowEntries.map(entry => {
      let rowKeyStrs: string[] = [];
      if (entry.type === 'data') rowKeyStrs = [entry.key];
      else if (entry.type === 'grand_total') rowKeyStrs = rowOrder;
      else {
        rowKeyStrs = rowOrder.filter((rk, idx) => rowMatchesPrefix(rowKeyArrs[idx], entry.rowArr));
      }

      const cells: Record<string, Record<string, number | null>> = {};
      colKeys.forEach(colKey => {
        const agg = getBaseAggForRowCol(rowKeyStrs, colKey);
        const valueMap: Record<string, number | null> = {};
        valueKeys.forEach(vk => { valueMap[vk] = computeValue(agg, vk); });
        cells[colKey] = valueMap;
      });
      return { ...entry, cells };
    });

    return {
      rowDims,
      colDims,
      valueKeys,
      colKeys,
      colLabels,
      rows: rowsForRender,
      baseKeySet,
    };
  }, [pivotValues, pivotRows, pivotColumns, pivotFilteredData, pivotDisplay, formulaByName, customMetricLabels]);

  const pivotValueMeta = useMemo(() => {
    const map = new Map<string, { format: 'currency' | 'percent' | 'number'; label: string }>();
    pivotValueOptions.forEach(v => map.set(v.key, { format: v.format, label: v.label }));
    return map;
  }, [pivotValueOptions]);

  const pivotDisplayRows = useMemo(() => {
    if (!pivotResult?.rows.length) return [];
    if (!pivotSort) return pivotResult.rows;
    const dataRows = pivotResult.rows.filter((r: { type: string }) => r.type === 'data');
    const grandTotalRows = pivotResult.rows.filter((r: { type: string }) => r.type === 'grand_total');
    const { colKey, valueKey, dir } = pivotSort;
    const sorted = [...dataRows].sort((a: { cells: Record<string, Record<string, number | null>> }, b: { cells: Record<string, Record<string, number | null>> }) => {
      const va = a.cells[colKey]?.[valueKey] ?? null;
      const vb = b.cells[colKey]?.[valueKey] ?? null;
      const numA = typeof va === 'number' ? va : NaN;
      const numB = typeof vb === 'number' ? vb : NaN;
      if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
        return dir === 'asc' ? numA - numB : numB - numA;
      }
      const sa = String(va ?? '');
      const sb = String(vb ?? '');
      return dir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });
    return [...sorted, ...grandTotalRows];
  }, [pivotResult, pivotSort]);

  const formatPivotValue = (val: number | null, key: string) => {
    if (val === null || val === undefined) return '';
    const n = Number(val);
    // 小数点后为 .00 时显示整数，否则保留小数
    const opts: Intl.NumberFormatOptions = { minimumFractionDigits: 0, maximumFractionDigits: 2 };
    const meta = pivotValueMeta.get(key);
    if (meta?.format === 'currency') {
      return `$${n.toLocaleString(undefined, opts)}`;
    }
    if (meta?.format === 'percent') {
      return `${n.toLocaleString(undefined, opts)}%`;
    }
    return n.toLocaleString(undefined, opts);
  };

  const autoMap = (hdrsBySource: {
    facebook: string[];
    google: Record<GoogleType, string[]>;
  }) => {
    const findMatch = (hdrs: string[], targets: string[], exclude?: (h: string) => boolean) => {
      for (const t of targets) {
        const found = hdrs.find(k => {
          if (!k.toLowerCase().includes(t.toLowerCase())) return false;
          if (exclude && exclude(k)) return false;
          return true;
        });
        if (found) return found;
      }
      return '';
    };

    // 若云端已有非空映射且该列仍在新表头中，则保留；否则用自动匹配。这样拉数后不会覆盖已保存的 metrics 配置
    const pick = (hdrs: string[], targets: string[], existing: string | undefined, exclude?: (h: string) => boolean): string => {
      const existingVal = (existing || '').trim();
      if (existingVal && hdrs.includes(existingVal)) return existingVal;
      return findMatch(hdrs, targets, exclude);
    };

    // Facebook campaign 必须对应 Campaign Name，不能对应 Campaign ID
    const excludeCampaignId = (h: string) => /campaign\s*id|campaignid/i.test(h);

    const buildBaseMapping = (hdrs: string[], existing: MappingConfig) => ({
      campaign: pick(hdrs, ['campaign name'], existing.campaign, excludeCampaignId),
      adSet: pick(hdrs, ['ad set name', 'adset'], existing.adSet, (h) => /ad\s*set\s*id|adsetid/i.test(h)),
      ad: pick(hdrs, ['ad name', 'creative'], existing.ad, (h) => /\bad\s*id\b|^adid$/i.test(h)),
      age: pick(hdrs, ['age'], existing.age),
      gender: pick(hdrs, ['gender'], existing.gender),
      cost: pick(hdrs, ['amount spent', 'spend', 'cost'], existing.cost),
      impressions: pick(hdrs, ['impressions'], existing.impressions),
      reach: pick(hdrs, ['reach'], existing.reach),
      clicks: pick(hdrs, ['all clicks', 'clicks (all)'], existing.clicks),
      linkClicks: pick(hdrs, ['link clicks', 'clicks'], existing.linkClicks),
      date: pick(hdrs, ['day', 'date'], existing.date),
      conversionValue: pick(hdrs, ['conversion value', 'purchase value', 'conversionvalue'], existing.conversionValue),
      conversion: pick(hdrs, ['conversion', 'conversions', 'purchases', 'purchase'], existing.conversion),
      addToCart: pick(hdrs, ['add to cart', 'atc', 'addtocart'], existing.addToCart),
      landingPageViews: pick(hdrs, ['landing page views', 'landingpageviews'], existing.landingPageViews),
    });

    const baseFacebook = buildBaseMapping(hdrsBySource.facebook, mappings.facebook);
    const facebookMapping: MappingConfig = {
      ...baseFacebook,
      leads: pick(hdrsBySource.facebook, ['leads', 'results'], mappings.facebook.leads),
      checkout: pick(hdrsBySource.facebook, ['checkout', 'checkouts'], mappings.facebook.checkout),
      subscribe: pick(hdrsBySource.facebook, ['subscribe', 'subscription', 'subscriptions'], mappings.facebook.subscribe),
    };

    const googleMappingByType: Record<GoogleType, MappingConfig> = {
      SEARCH: buildBaseMapping(hdrsBySource.google.SEARCH, mappings.google.SEARCH),
      DEMAND_GEN: buildBaseMapping(hdrsBySource.google.DEMAND_GEN, mappings.google.DEMAND_GEN),
      PERFORMANCE_MAX: buildBaseMapping(hdrsBySource.google.PERFORMANCE_MAX, mappings.google.PERFORMANCE_MAX)
    };

    Object.keys(customMetricLabels).forEach(key => {
      facebookMapping[key] = mappings.facebook[key] || '';
      GOOGLE_TYPES.forEach(type => {
        googleMappingByType[type][key] = mappings.google[type][key] || '';
      });
    });

    setMappings({ facebook: facebookMapping, google: googleMappingByType });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    const processData = (data: RawDataRow[]) => {
      setRawData(data);
      if (data.length > 0) {
        const hdrsBySource = computeHeadersBySource(data);
        setHeadersBySource(hdrsBySource);
        autoMap(hdrsBySource);
        setStep('mapping'); // Changed from dataSourceConfig to mapping directly
      }
    };
    if (fileExt === 'csv') {
      Papa.parse(file, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (results) => {
          processData(results.data as RawDataRow[]);
        }
      });
    } else if (fileExt === 'xlsx' || fileExt === 'xls') {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as RawDataRow[];
        processData(data);
      };
      reader.readAsBinaryString(file);
    }
  };

  const toggleAccountSelection = (accId: string) => {
    setSelectedAccounts(prev => prev.includes(accId) ? prev.filter(id => id !== accId) : [...prev, accId]);
  };

  const handleProjectSelect = async (project: ProjectOption) => {
    setSelectedProject(project); // Store full project object
    setIsProjectModalOpen(false);
    setProjectSearchTerm('');
    setApiError('');
    setAvailableAccounts([]); // Clear previous accounts
    setStep('dataSourceConfig'); // Set step to dataSourceConfig after project selection

    if (project.adsCostReport) {
      setIsLoadingAccounts(true);
      try {
        // Fetch accounts for the selected project
        const apiData = await fetchAllPlatformsData(
          project.projectId,
          apiDateRange.start,
          apiDateRange.end,
          undefined // Fetch all accounts for initial list
        );
        const accounts = extractUniqueAccounts(apiData);
        setAvailableAccounts(accounts);
      } catch (error) {
        console.error('Failed to load accounts for project:', error);
        setApiError('加载项目账号失败');
      } finally {
        setIsLoadingAccounts(false);
      }
    }
  };

  // 从 API 加载数据
  const handleLoadDataFromApi = async () => {
    if (!selectedProject) {
      setApiError('请先选择一个项目');
      return;
    }
    setIsLoadingData(true);
    setApiError('');

    try {
      // 方案 A：拉数时扩大日期范围（上期+本期），用于 BI 看板环比
      const startD = new Date(apiDateRange.start);
      const endD = new Date(apiDateRange.end);
      const days = Math.round((endD.getTime() - startD.getTime()) / (24 * 60 * 60 * 1000)) + 1;
      const expandedStartD = new Date(startD);
      expandedStartD.setDate(expandedStartD.getDate() - days);
      const expandedStart = expandedStartD.toISOString().split('T')[0];

      const segmentList = ['age_date', 'gender_adset_date'];

      const apiData = await fetchAllPlatformsData(
        selectedProject.projectId,
        expandedStart,
        apiDateRange.end,
        selectedAccounts.length > 0 ? selectedAccounts : undefined,
        segmentList
      );

      if (apiData.length === 0) {
        setApiError('未获取到数据，请检查筛选条件或选择其他日期范围');
        setIsLoadingData(false);
        return;
      }

      const transformed = transformApiDataToRawData(apiData);
      const ageCount = transformed.filter(row => String(row['Age'] || '').trim()).length;
      const genderCount = transformed.filter(row => String(row['Gender'] || '').trim()).length;
      if (!ageCount || !genderCount) {
        console.warn('Age/Gender 数据为空或缺失', {
          ageCount,
          genderCount,
          sample: apiData[0]
        });
      }
      setRawData(transformed);

      if (transformed.length > 0) {
        const hdrsBySource = computeHeadersBySource(transformed);
        setHeadersBySource(hdrsBySource);
        autoMap(hdrsBySource);

        const accounts = extractUniqueAccounts(apiData);
        setAvailableAccounts(accounts);

        // 数据范围 = 扩大后的范围；报告默认展示“本期”（用户选的日期）
        setReportDateRangeBounds({ start: expandedStart, end: apiDateRange.end });
        setDateRange({ start: apiDateRange.start, end: apiDateRange.end });

        // 直接跳转到 mapping 步骤
        setStep('mapping');
      }
    } catch (error) {
      console.error('API Error:', error);
      setApiError(error instanceof Error ? error.message : '数据获取失败');
    } finally {
      setIsLoadingData(false);
    }
  };

  const handleSaveFormula = () => {
    const f: FormulaField = {
      id: formulaToEdit?.id || Math.random().toString(),
      name: formulaInputName,
      formula: formulaInputText,
      unit: formulaInputUnit,
      isDefault: formulaToEdit?.isDefault
    };
    if (formulaToEdit) setFormulas(prev => prev.map(item => item.id === f.id ? f : item));
    else setFormulas(prev => [...prev, f]);
    setIsFormulaModalOpen(false);
    setFormulaToEdit(null);
  };

  const openFormulaModal = (f: FormulaField | null = null) => {
    setFormulaToEdit(f);
    setFormulaInputName(f?.name || '');
    setFormulaInputText(f?.formula || '');
    setFormulaInputUnit(f?.unit || '');
    setIsFormulaModalOpen(true);
  };

  const appendToFormula = (val: string) => {
    setFormulaInputText(prev => prev + (prev.length > 0 && !['(', ')', '+', '-', '*', '/'].includes(val) && !prev.endsWith(' ') ? ' ' : '') + val + ' ');
  };

  const handleAiAnalysis = async () => {
    if (tableData.length === 0) return;
    setIsAnalyzing(true);
    setAiAnalysis('');

    // Get API Key from System Config
    const systemConfig = getSystemConfig();
    const apiKey = systemConfig?.['GOOGLE_AI_KEY'];

    if (!apiKey) {
      setAiAnalysis('错误：未配置 Google AI API Key，请联系管理员检查 SystemConfig 表格。');
      setIsAnalyzing(false);
      return;
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const dimensionLabels = dimConfigs.map(d => d.label);
      const contextJson = JSON.stringify(tableData.slice(0, 20));
      const prompt = generateAnalysisPrompt(
        dateRange.start || availableDates[0] || 'N/A',
        dateRange.end || availableDates[availableDates.length - 1] || 'N/A',
        dimensionLabels,
        contextJson
      );
      const response = await ai.models.generateContent({
        model: AI_CONFIG.MODEL_NAME,
        contents: prompt,
        config: { thinkingConfig: { thinkingBudget: AI_CONFIG.THINKING_BUDGET } }
      });
      const responseText = response.text || '';
      setAiAnalysis(cleanAiResponseText(responseText));
    } catch (error) {
      console.error('AI analysis failed:', error);
      setAiAnalysis('AI 分析生成失败，请稍后重试。');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const toggleTrendMetric = (key: string) => {
    setActiveTrendMetrics(prev => {
      if (prev.includes(key)) {
        if (prev.length === 1) return prev;
        return prev.filter(k => k !== key);
      } else return [...prev, key];
    });
  };

  const toggleTableMetric = (key: string) => {
    setActiveTableMetrics(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const toggleDimValueFilter = (val: string) => {
    setDimFilters(prev => {
      const current = prev[activeDashboardDim] || [];
      const updated = current.includes(val) ? current.filter(v => v !== val) : [...current, val];
      return { ...prev, [activeDashboardDim]: updated };
    });
  };

  const toggleSelectAllDimValues = () => {
    const currentActive = dimFilters[activeDashboardDim] || [];
    if (currentActive.length === currentDimValues.length) setDimFilters(prev => ({ ...prev, [activeDashboardDim]: [] }));
    else setDimFilters(prev => ({ ...prev, [activeDashboardDim]: [...currentDimValues] }));
  };

  // --- 数据透视配置操作 ---
  const addPivotListItem = (list: string[], setter: (v: string[]) => void, key: string) => {
    if (!key) return;
    if (list.includes(key)) return;
    setter([...list, key]);
  };
  const removePivotListItem = (list: string[], setter: (v: string[]) => void, key: string) => {
    setter(list.filter(k => k !== key));
  };
  const movePivotListItem = (list: string[], setter: (v: string[]) => void, key: string, dir: 'up' | 'down') => {
    const idx = list.indexOf(key);
    if (idx === -1) return;
    const nextIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (nextIdx < 0 || nextIdx >= list.length) return;
    const next = [...list];
    [next[idx], next[nextIdx]] = [next[nextIdx], next[idx]];
    setter(next);
  };

  const togglePivotPlatformScope = (key: PivotPlatformScope) => {
    setPivotPlatformScopes(prev => (
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    ));
  };

  const togglePivotPlatformAll = () => {
    setPivotPlatformScopes(prev => (
      prev.length === DEFAULT_PIVOT_PLATFORM_SCOPES.length ? [] : [...DEFAULT_PIVOT_PLATFORM_SCOPES]
    ));
  };

  const handleAddPivotFilter = (fieldKey: string) => {
    const field = pivotDimensionFields.find(f => f.key === fieldKey);
    if (!field) return;
    setPivotFilters(prev => {
      if (prev.some(p => p.fieldKey === fieldKey)) return prev;
      return [
        ...prev,
        {
          id: `${fieldKey}-${Date.now()}`,
          fieldKey,
          label: field.label,
          mode: field.type === 'date' ? 'date_range' : 'multi',
          selectedValues: [],
          search: '',
          textValue: '',
          dateRange: { start: '', end: '' },
        },
      ];
    });
  };

  const updatePivotFilter = (id: string, patch: Partial<{
    mode: 'multi' | 'contains' | 'not_contains' | 'date_range';
    selectedValues: string[];
    search: string;
    textValue: string;
    dateRange: { start: string; end: string };
  }>) => {
    setPivotFilters(prev => prev.map(f => (f.id === id ? { ...f, ...patch } : f)));
  };

  const removePivotFilter = (id: string) => {
    setPivotFilters(prev => prev.filter(f => f.id !== id));
  };

  // --- 透视报告预设：保存 / 应用 / 删除 ---
  const handleSavePivotPreset = () => {
    const name = pivotPresetNameInput.trim();
    if (!name) return;
    const preset: PivotPreset = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `preset_${Date.now()}`,
      name,
      filters: pivotFilters.map(f => ({
        fieldKey: f.fieldKey,
        label: f.label,
        mode: f.mode,
        selectedValues: f.selectedValues,
        textValue: f.textValue,
        dateRange: f.dateRange,
      })),
      rows: [...pivotRows],
      columns: [...pivotColumns],
      values: [...pivotValues],
      display: { ...pivotDisplay },
      platformScopes: [...pivotPlatformScopes],
    };
    setPivotPresets(prev => {
      const next = [...prev, preset];
      persistPivotPresets(next);
      return next;
    });
    setActivePivotPresetId(preset.id);
    setPivotPresetNameInput('');
    setIsSavePivotModalOpen(false);
  };

  const handleApplyPivotPreset = (preset: PivotPreset) => {
    const validDimKeys = new Set(pivotDimensionFields.map(f => f.key));
    const validValueKeys = new Set(allAvailableMetrics.map(m => m.key));
    const validPlatformScopes = new Set(PIVOT_PLATFORM_OPTIONS.map(p => p.key));
    const safeFilters = preset.filters.filter(f => validDimKeys.has(f.fieldKey));
    setPivotFilters(
      safeFilters.map(f => ({
        id: `${f.fieldKey}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        fieldKey: f.fieldKey,
        label: f.label,
        mode: f.mode,
        selectedValues: f.selectedValues,
        search: '',
        textValue: f.textValue,
        dateRange: f.dateRange,
      }))
    );
    const safePlatformScopes = (preset.platformScopes || DEFAULT_PIVOT_PLATFORM_SCOPES)
      .filter(k => validPlatformScopes.has(k));
    setPivotPlatformScopes(safePlatformScopes.length ? safePlatformScopes : DEFAULT_PIVOT_PLATFORM_SCOPES);
    const filteredRows = preset.rows.filter(k => validDimKeys.has(k));
    const filteredCols = preset.columns.filter(k => validDimKeys.has(k));
    const filteredVals = preset.values.filter(k => validValueKeys.has(k));
    const finalRows = filteredRows.length ? filteredRows : preset.rows;
    const finalCols = filteredCols.length ? filteredCols : preset.columns;
    const finalVals = filteredVals.length ? filteredVals : preset.values;
    setPivotRows(finalRows);
    setPivotColumns(finalCols);
    setPivotValues(finalVals);
    setPivotDisplay({ ...preset.display });
    // 先提交行/列/值，再关闭下拉，避免同批 setState 时下拉卸载影响透视状态生效
    queueMicrotask(() => {
      setIsPivotPresetDropdownOpen(false);
      setActivePivotPresetId(preset.id);
    });
  };

  /** 用当前透视配置覆盖指定 id 的已保存报告 */
  const handleUpdatePivotPreset = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation?.();
    const preset = pivotPresets.find(p => p.id === id);
    if (!preset) return;
    const updated: PivotPreset = {
      id: preset.id,
      name: preset.name,
      filters: pivotFilters.map(f => ({
        fieldKey: f.fieldKey,
        label: f.label,
        mode: f.mode,
        selectedValues: f.selectedValues,
        textValue: f.textValue,
        dateRange: f.dateRange,
      })),
      rows: [...pivotRows],
      columns: [...pivotColumns],
      values: [...pivotValues],
      display: { ...pivotDisplay },
      platformScopes: [...pivotPlatformScopes],
    };
    setPivotPresets(prev => {
      const next = prev.map(p => (p.id === id ? updated : p));
      persistPivotPresets(next);
      return next;
    });
    setIsPivotPresetDropdownOpen(false);
    setPivotUpdateHintVisible(true);
    window.setTimeout(() => setPivotUpdateHintVisible(false), 2500);
  };

  const handleRemovePivotPreset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (id === activePivotPresetId) setActivePivotPresetId(null);
    setPivotPresets(prev => {
      const next = prev.filter(p => p.id !== id);
      persistPivotPresets(next);
      return next;
    });
  };

  const handleAddDimension = () => {
    if (!newDimensionName.trim()) return;
    if (allDimensions.includes(newDimensionName.trim())) return;
    setAllDimensions(prev => [...prev, newDimensionName.trim()]);
    setNewDimensionName('');
    setIsAddingDimension(false);
  };

  const handleRemoveDimension = (dim: string) => {
    setAllDimensions(prev => prev.filter(d => d !== dim));
    setDimConfigs(prev => prev.filter(c => c.label !== dim));
  };

  const exportPivotData = (type: 'csv' | 'xlsx') => {
    if (!pivotResult) return;
    const rowHeaders = pivotResult.rowDims.length ? pivotResult.rowDims : ['维度'];
    const colKeys = pivotResult.colKeys;
    const valueKeys = pivotResult.valueKeys;
    const header = [
      ...rowHeaders,
      ...colKeys.flatMap(colKey => {
        const colLabel = pivotResult.colLabels[colKey];
        const isAll = colKey === '__all__';
        if (valueKeys.length === 1) {
          const valueLabel = pivotValueMeta.get(valueKeys[0])?.label || valueKeys[0];
          return [isAll ? valueLabel : colLabel];
        }
        return valueKeys.map(vk => `${colLabel} · ${pivotValueMeta.get(vk)?.label || vk}`);
      }),
    ];
    const rows = pivotResult.rows.map(r => {
      const rowCells = rowHeaders.map((_, idx) => r.displayCells[idx] || '');
      const values = colKeys.flatMap(colKey =>
        valueKeys.map(vk => (r.cells[colKey]?.[vk] ?? ''))
      );
      return [...rowCells, ...values];
    });
    const matrix = [header, ...rows];
    const fileSuffix = new Date().toISOString().slice(0, 10);
    if (type === 'csv') {
      const csv = Papa.unparse(matrix);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `pivot_${fileSuffix}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      return;
    }
    const ws = XLSX.utils.aoa_to_sheet(matrix);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pivot');
    XLSX.writeFile(wb, `pivot_${fileSuffix}.xlsx`);
  };

  const copyPivotToClipboard = async () => {
    if (!pivotResult) return;
    const rowHeaders = pivotResult.rowDims.length ? pivotResult.rowDims : ['维度'];
    const colKeys = pivotResult.colKeys;
    const valueKeys = pivotResult.valueKeys;
    const headerRow1 = [
      ...rowHeaders,
      ...colKeys.flatMap(colKey => {
        const colLabel = pivotResult.colLabels[colKey];
        const isAll = colKey === '__all__';
        if (valueKeys.length === 1) {
          const valueLabel = pivotValueMeta.get(valueKeys[0])?.label || valueKeys[0];
          return [isAll ? valueLabel : colLabel];
        }
        return [colLabel];
      }),
    ];
    const headerRow2 = valueKeys.length > 1
      ? [
        ...rowHeaders.map(() => ''),
        ...colKeys.flatMap(() => valueKeys.map(vk => pivotValueMeta.get(vk)?.label || vk)),
      ]
      : [];
    const rows = pivotResult.rows.map(r => {
      const rowCells = rowHeaders.map((_, idx) => r.displayCells[idx] || '');
      const values = colKeys.flatMap(colKey =>
        valueKeys.map(vk => formatPivotValue(r.cells[colKey]?.[vk] ?? null, vk))
      );
      return [...rowCells, ...values];
    });
    const matrix = headerRow2.length ? [headerRow1, headerRow2, ...rows] : [headerRow1, ...rows];
    const text = matrix.map(row => row.join('\t')).join('\n');
    const htmlRows: string[] = [];
    const makeTh = (content: string, attrs = '') => `<th ${attrs} style="border:1px solid #e5e7eb;padding:6px 8px;font-weight:700;font-size:12px;background:#f8fafc;text-align:center;white-space:nowrap;">${content || ''}</th>`;
    const makeTd = (content: string, attrs = '') => `<td ${attrs} style="border:1px solid #e5e7eb;padding:6px 8px;font-size:12px;text-align:right;">${content || ''}</td>`;
    const makeTdLeft = (content: string, attrs = '') => `<td ${attrs} style="border:1px solid #e5e7eb;padding:6px 8px;font-size:12px;text-align:left;font-weight:700;">${content || ''}</td>`;
    // Header row 1 with colSpan
    const header1Cells: string[] = [];
    rowHeaders.forEach(label => {
      header1Cells.push(makeTh(label, `rowspan="${headerRow2.length ? 2 : 1}"`));
    });
    colKeys.forEach(colKey => {
      const colLabel = pivotResult.colLabels[colKey];
      if (valueKeys.length === 1) {
        header1Cells.push(makeTh(colLabel, ''));
      } else {
        header1Cells.push(makeTh(colLabel, `colspan="${valueKeys.length}"`));
      }
    });
    htmlRows.push(`<tr>${header1Cells.join('')}</tr>`);
    if (headerRow2.length) {
      const header2Cells: string[] = [];
      valueKeys.forEach(vk => {
        // placeholder, we will repeat for each colKey below
      });
      const valueLabels = valueKeys.map(vk => pivotValueMeta.get(vk)?.label || vk);
      const row2Cells = colKeys.flatMap(() => valueLabels.map(vl => makeTh(vl)));
      htmlRows.push(`<tr>${row2Cells.join('')}</tr>`);
    }
    rows.forEach(r => {
      const rowCells: string[] = [];
      rowHeaders.forEach((_, idx) => rowCells.push(makeTdLeft(r[idx] || '')));
      const valueCells = r.slice(rowHeaders.length).map(v => makeTd(String(v || '')));
      htmlRows.push(`<tr>${[...rowCells, ...valueCells].join('')}</tr>`);
    });
    const html = `<table style="border-collapse:collapse;">${htmlRows.join('')}</table>`;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        })
      ]);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
  };

  const activeFiltersCount = useMemo(() => {
    return (Object.values(dimFilters) as string[][]).reduce((acc: number, curr: string[]) => acc + (curr.length > 0 ? 1 : 0), 0);
  }, [dimFilters]);

  // BI 看板 KPI 卡片：本期 vs 上期真实环比（方案 A）
  const biKpiCards = useMemo(() => {
    const cur = filteredData;
    const last = lastPeriodFilteredData;
    const baseKeys = [...BASE_METRICS, ...Object.keys(customMetricLabels)];
    const sumContext = (data: typeof cur) => {
      const ctx: Record<string, number> = {};
      baseKeys.forEach(k => { ctx[k] = 0; });
      data.forEach(r => {
        baseKeys.forEach(k => { ctx[k] += r._metrics[k] || 0; });
      });
      return ctx;
    };
    const curCtx = sumContext(cur);
    const lastCtx = sumContext(last);
    const pct = (curr: number, prev: number) =>
      prev !== 0 ? ((curr - prev) / prev) * 100 : (curr !== 0 ? 100 : 0);
    const subStr = (change: number) => `${change >= 0 ? '+' : ''}${change.toFixed(1)}% vs last period`;
    const downIsGood = (key: string) => /cost|cpc|cpm|cpa|cpatc|cps|cpl/i.test(key);
    const metricLabelMap = new Map(allAvailableMetrics.map(m => [m.key, m.label]));
    const getMetricValue = (key: string, ctx: Record<string, number>) => {
      if (formulaByName.has(key)) {
        return evalFormula(formulaByName.get(key)!.formula, ctx);
      }
      return ctx[key] || 0;
    };

    const cards: Array<{ id: BiCardKey; label: string; value: string; sub: string; isImprovement: boolean; trend: 'up' | 'down' }> = [];

    // 内置 KPI
    const curCost = curCtx.cost || 0;
    const lastCost = lastCtx.cost || 0;
    const curLeads = curCtx.leads || 0;
    const lastLeads = lastCtx.leads || 0;
    const curClicks = curCtx.linkClicks || 0;
    const lastClicks = lastCtx.linkClicks || 0;
    const curImpr = curCtx.impressions || 0;
    const lastImpr = lastCtx.impressions || 0;
    const curCpl = curCost / (curLeads || 1);
    const lastCpl = lastCost / (lastLeads || 1);
    const curCtr = (curClicks / (curImpr || 1)) * 100;
    const lastCtr = (lastClicks / (lastImpr || 1)) * 100;
    const curSubRate = (curLeads / (curClicks || 1)) * 100;
    const lastSubRate = (lastLeads / (lastClicks || 1)) * 100;

    cards.push(
      { id: 'kpi:total_cost', label: 'Total Cost', value: formatPivotValue(curCost, 'cost'), sub: subStr(pct(curCost, lastCost)), isImprovement: curCost <= lastCost, trend: curCost >= lastCost ? 'up' : 'down' },
      { id: 'kpi:total_leads', label: 'Total Leads', value: formatPivotValue(curLeads, 'leads'), sub: subStr(pct(curLeads, lastLeads)), isImprovement: curLeads >= lastLeads, trend: curLeads >= lastLeads ? 'up' : 'down' },
      { id: 'kpi:avg_cpl', label: 'Avg CPL', value: `$${curCpl.toFixed(2)}`, sub: subStr(pct(curCpl, lastCpl)), isImprovement: curCpl <= lastCpl, trend: curCpl >= lastCpl ? 'up' : 'down' },
      { id: 'kpi:avg_ctr', label: 'Avg CTR', value: `${curCtr.toFixed(2)}%`, sub: subStr(pct(curCtr, lastCtr)), isImprovement: curCtr >= lastCtr, trend: curCtr >= lastCtr ? 'up' : 'down' },
      { id: 'kpi:sub_rate', label: 'Sub Rate', value: `${curSubRate.toFixed(2)}%`, sub: subStr(pct(curSubRate, lastSubRate)), isImprovement: curSubRate >= lastSubRate, trend: curSubRate >= lastSubRate ? 'up' : 'down' }
    );

    // 指标对齐 + 公式计算
    biCardOptions.forEach(opt => {
      if (!opt.id.startsWith('metric:')) return;
      const metricKey = opt.id.replace('metric:', '');
      const curVal = getMetricValue(metricKey, curCtx);
      const lastVal = getMetricValue(metricKey, lastCtx);
      const isDownGood = downIsGood(metricKey);
      cards.push({
        id: opt.id,
        label: metricLabelMap.get(metricKey) || metricKey,
        value: formatPivotValue(curVal, metricKey),
        sub: subStr(pct(curVal, lastVal)),
        isImprovement: isDownGood ? curVal <= lastVal : curVal >= lastVal,
        trend: curVal >= lastVal ? 'up' : 'down'
      });
    });

    const byId = new Map(cards.map(c => [c.id, c]));
    return biCardOrder.map(id => byId.get(id)).filter(Boolean) as typeof cards;
  }, [filteredData, lastPeriodFilteredData, biCardOrder, allAvailableMetrics, formulaByName, customMetricLabels, biCardOptions]);

  // Conditional rendering for LoginPage
  if (!isLoggedIn) {
    return <LoginPage onLoginSuccess={handleLogin} />;
  }

  // Helper function to render the dashboard content（三个模块：BI看板、数据透视分析、智能全维度诊断报告）
  const renderDashboardContent = () => (
    <div ref={dashboardRef} className="pb-24 animate-in fade-in duration-1000">
      {activeReportTab === 'bi' && (
      <section id="report-module-bi" className="scroll-mt-32">
        <div className="space-y-12">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-black uppercase tracking-widest text-slate-400">BI 指标卡</div>
        <button
          onClick={() => { setBiCardDraft(biCardOrder); setIsBiConfigOpen(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 text-slate-200 text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition"
        >
          <Settings2 size={12} /> 指标设置
        </button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-6">
        {biKpiCards.map((k, idx) => (
          <div key={idx} className="bg-slate-900/50 p-8 rounded-[40px] border border-slate-800 shadow-sm flex flex-col justify-between h-44 hover:shadow-xl transition-all group">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{k.label}</span>
            <div>
              <span className="text-3xl font-black text-white tracking-tight">{k.value}</span>
              <p className={`text-[10px] font-black mt-2 flex items-center gap-1 ${k.isImprovement ? 'text-emerald-500' : 'text-rose-500'}`}>
                {k.trend === 'up' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {k.sub}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-slate-900/50 p-12 rounded-[56px] border border-slate-800 shadow-sm relative overflow-visible">
        <div className="flex flex-col md:flex-row md:items-start justify-between mb-12 gap-8 border-b border-slate-800 pb-8 relative overflow-visible">
          <div className="flex flex-col gap-1">
            <h3 className="text-3xl font-black text-white tracking-tight leading-tight">核心指标趋势洞察</h3>
            <p className="text-slate-400 text-[11px] font-black uppercase tracking-[0.2em]">Single-Metric Focus Trend</p>
          </div>

          {/* Multi-Select Metric Dropdown */}
          <div className="relative z-[50]" ref={metricDropdownRef}>
            <button
              onClick={() => setIsMetricDropdownOpen(!isMetricDropdownOpen)}
              className="flex items-center gap-4 bg-slate-800 hover:bg-slate-700 transition-all px-6 py-3.5 rounded-[24px] shadow-sm border border-slate-700"
            >
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-200">
                  {activeTrendMetrics.length === 1 ? allAvailableMetrics.find(m => m.key === activeTrendMetrics[0])?.label : `${activeTrendMetrics.length} Metrics Selected`}
                </span>
              </div>
              <ChevronDown size={14} className={`text-slate-400 transition-transform duration-300 ${isMetricDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            {isMetricDropdownOpen && (
              <div className="absolute top-full right-0 mt-3 w-72 bg-slate-900 rounded-[32px] shadow-2xl border border-slate-800 p-4 animate-in fade-in zoom-in duration-200 origin-top-right overflow-hidden flex flex-col">
                <div className="flex items-center justify-between mb-4 px-2">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Select Metrics</span>
                  <button onClick={() => setActiveTrendMetrics(['cost'])} className="text-[8px] font-black uppercase tracking-widest text-indigo-400 hover:underline">Reset</button>
                </div>
                <div className="max-h-80 overflow-y-auto custom-scrollbar pr-1 space-y-1">
                  {allAvailableMetrics.map((m, idx) => (
                    <button key={m.key} onClick={() => toggleTrendMetric(m.key)} className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all ${activeTrendMetrics.includes(m.key) ? 'bg-slate-800' : 'hover:bg-slate-800'}`}>
                      <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${activeTrendMetrics.includes(m.key) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-700'}`}>
                        {activeTrendMetrics.includes(m.key) && <Check size={12} className="text-white" strokeWidth={4} />}
                      </div>
                      <div className="flex items-center gap-2 flex-1">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: getMetricColor(m.key, allAvailableMetrics.findIndex(a => a.key === m.key)) }}></div>
                        <span className={`text-[11px] font-bold text-left ${activeTrendMetrics.includes(m.key) ? 'text-white' : 'text-slate-400'}`}>{m.label}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="h-[450px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={aggregatedTrendData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
              <XAxis dataKey="_date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold', fill: '#94a3b8' }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 'bold', fill: '#64748b' }} />
              <RechartsTooltip contentStyle={{ borderRadius: '24px', border: 'none', boxShadow: '0 25px 50px rgba(0,0,0,0.1)', backgroundColor: '#1e293b', color: '#e2e8f0' }} />
              <Legend verticalAlign="top" align="left" height={36} iconType="circle" wrapperStyle={{ paddingBottom: '20px', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#e2e8f0' }} />
              {activeTrendMetrics.map((mKey, idx) => (
                <Area key={mKey} type="monotone" dataKey={mKey} name={allAvailableMetrics.find(m => m.key === mKey)?.label || mKey} stroke={getMetricColor(mKey, allAvailableMetrics.findIndex(a => a.key === mKey))} strokeWidth={activeTrendMetrics.length > 3 ? 2 : 4} fillOpacity={0.08} fill={getMetricColor(mKey, allAvailableMetrics.findIndex(a => a.key === mKey))} animationDuration={1000} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
        </div>
      </section>
      )}

      {activeReportTab === 'pivot' && (
      <section id="report-module-pivot" className="scroll-mt-32">
      <div className="bg-slate-900/50 p-10 rounded-[48px] border border-slate-800 shadow-sm relative overflow-visible">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
          <div>
            <h3 className="text-2xl font-black text-white tracking-tight">数据透视分析</h3>
            <p className="text-slate-400 text-[11px] font-black uppercase tracking-[0.2em]">Pivot · Rows / Columns / Values / Filters</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setIsSavePivotModalOpen(true)} className="px-4 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs font-black hover:bg-slate-700 transition">【保存为新的报告】</button>
            <div className="relative" ref={pivotPresetDropdownRef}>
              <button
                type="button"
                onClick={() => setIsPivotPresetDropdownOpen(v => !v)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs font-black hover:bg-slate-700 transition flex items-center gap-2"
                aria-expanded={isPivotPresetDropdownOpen}
                aria-haspopup="listbox"
              >
                已保存报告
                {pivotPresets.length > 0 && <span className="bg-indigo-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">{pivotPresets.length}</span>}
                <ChevronDown size={12} className={`transition-transform ${isPivotPresetDropdownOpen ? 'rotate-180' : ''}`} />
              </button>
              {isPivotPresetDropdownOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-slate-900 border border-slate-800 rounded-xl shadow-xl p-2 z-[50] max-h-64 overflow-y-auto custom-scrollbar" role="listbox">
                  {pivotPresets.length === 0 ? (
                    <p className="px-3 py-4 text-xs text-slate-500 text-center">暂无已保存报告</p>
                  ) : (
                    pivotPresets.map(p => (
                      <div
                        key={p.id}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-800 transition group cursor-pointer"
                        onClick={() => handleApplyPivotPreset(p)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleApplyPivotPreset(p); }}
                      >
                        <span className="flex-1 text-left text-xs font-bold text-slate-200 truncate min-w-0">
                          {p.name}
                        </span>
                        <button onClick={(e) => handleUpdatePivotPreset(p.id, e)} className="p-1 text-slate-500 hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition shrink-0" title="用当前配置覆盖">
                          <Edit3 size={12} />
                        </button>
                        <button onClick={(e) => handleRemovePivotPreset(p.id, e)} className="p-1 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition shrink-0" title="删除">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            {activePivotPresetId && (
              <button
                onClick={() => handleUpdatePivotPreset(activePivotPresetId)}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-black hover:bg-indigo-500 transition flex items-center gap-2"
                title="将当前字段配置保存到当前报告"
              >
                【更新当前报告设置】
              </button>
            )}
            <button onClick={copyPivotToClipboard} className="px-4 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs font-black hover:bg-slate-700 transition">复制表格</button>
            <div className="relative" ref={pivotExportRef}>
              <button
                onClick={() => setIsPivotExportOpen(v => !v)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs font-black hover:bg-slate-700 transition flex items-center gap-2"
              >
                导出
                <ChevronDown size={12} className={`transition-transform ${isPivotExportOpen ? 'rotate-180' : ''}`} />
              </button>
              {isPivotExportOpen && (
                <div className="absolute right-0 mt-2 w-36 bg-slate-900 border border-slate-800 rounded-xl shadow-xl p-2 z-20">
                  <button onClick={() => { exportPivotData('csv'); setIsPivotExportOpen(false); }} className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 rounded-lg">导出 CSV</button>
                  <button onClick={() => { exportPivotData('xlsx'); setIsPivotExportOpen(false); }} className="w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 rounded-lg">导出 Excel</button>
                </div>
              )}
            </div>
            <button onClick={() => setIsPivotDrawerOpen(v => !v)} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-black hover:bg-indigo-700 transition">
              {isPivotDrawerOpen ? '收起字段配置' : '字段配置'}
            </button>
          </div>
        </div>
        {pivotUpdateHintVisible && (
          <p className="text-[11px] text-emerald-400/90 mt-1 mb-2 animate-in fade-in duration-200" role="status">
            已更新当前报告设置
          </p>
        )}

        <div className={`grid gap-6 ${isPivotDrawerOpen ? 'lg:grid-cols-[1fr_360px]' : 'grid-cols-1'}`}>
          <div className="min-w-0">
            {pivotValues.length === 0 ? (
              <div className="h-80 flex flex-col items-center justify-center border-2 border-dashed border-slate-800 rounded-[32px] bg-slate-800/30 text-center px-6">
                <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-4">
                  <TableIcon size={24} className="text-indigo-400" />
                </div>
                <p className="text-slate-300 font-black text-sm mb-2">请先配置透视字段</p>
                <p className="text-slate-500 text-xs">添加 行 / 列 / 值 字段后即可生成透视结果</p>
                <button onClick={() => setIsPivotDrawerOpen(true)} className="mt-4 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-black hover:bg-indigo-700 transition">打开字段配置</button>
              </div>
            ) : (
              <div className="overflow-x-auto custom-scrollbar no-scrollbar-at-small pb-4">
                <table className="w-full text-left border-separate border-spacing-y-2 min-w-[900px]">
                  <thead>
                    <tr>
                      {(pivotResult?.rowDims.length ? pivotResult.rowDims : ['维度']).map((h, idx) => (
                        <th key={idx} rowSpan={pivotResult?.valueKeys.length && pivotResult.valueKeys.length > 1 ? 2 : 1} className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-900/50 sticky left-0 z-20 min-w-[140px]">
                          {h}
                        </th>
                      ))}
                      {pivotResult?.colKeys.map(colKey => (
                        pivotResult.valueKeys.length === 1 ? (
                          <th
                            key={colKey}
                            className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center cursor-pointer hover:bg-slate-700/50 select-none"
                            onClick={() => {
                              const vk = pivotResult.valueKeys[0];
                              setPivotSort(prev => prev?.colKey === colKey && prev?.valueKey === vk && prev.dir === 'asc' ? { colKey, valueKey: vk, dir: 'desc' } : { colKey, valueKey: vk, dir: 'asc' });
                            }}
                          >
                            <span className="inline-flex items-center gap-1">
                              {pivotResult.colLabels[colKey]}
                              {pivotSort?.colKey === colKey && pivotSort?.valueKey === pivotResult.valueKeys[0] && (pivotSort.dir === 'asc' ? <ChevronUp size={12} className="opacity-80" /> : <ChevronDown size={12} className="opacity-80" />)}
                            </span>
                          </th>
                        ) : (
                          <th key={colKey} colSpan={pivotResult.valueKeys.length} className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">
                            {pivotResult.colLabels[colKey]}
                          </th>
                        )
                      ))}
                    </tr>
                    {pivotResult?.valueKeys.length && pivotResult.valueKeys.length > 1 && (
                      <tr>
                        {pivotResult.colKeys.map(colKey => (
                          pivotResult.valueKeys.map(vk => (
                            <th
                              key={`${colKey}-${vk}`}
                              className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right whitespace-nowrap cursor-pointer hover:bg-slate-700/50 select-none"
                              onClick={() => setPivotSort(prev => prev?.colKey === colKey && prev?.valueKey === vk && prev.dir === 'asc' ? { colKey, valueKey: vk, dir: 'desc' } : { colKey, valueKey: vk, dir: 'asc' })}
                            >
                              <span className="inline-flex items-center gap-1 justify-end w-full">
                                {pivotValueMeta.get(vk)?.label || vk}
                                {pivotSort?.colKey === colKey && pivotSort?.valueKey === vk && (pivotSort.dir === 'asc' ? <ChevronUp size={12} className="opacity-80" /> : <ChevronDown size={12} className="opacity-80" />)}
                              </span>
                            </th>
                          ))
                        ))}
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {(() => {
                      let lastRowLabels: string[] = [];
                      return pivotDisplayRows.map((row, idx) => {
                        const isSubtotal = row.type === 'subtotal';
                        const isGrand = row.type === 'grand_total';
                        let displayCells = row.displayCells;
                        if (row.type === 'data' && (pivotResult.rowDims.length || 0) > 1) {
                          displayCells = row.displayCells.map((val, i) => {
                            const samePrefix = row.displayCells.slice(0, i + 1).every((v, idx2) => v === lastRowLabels[idx2]);
                            return samePrefix ? '' : val;
                          });
                          lastRowLabels = row.displayCells;
                        } else if (row.type !== 'data') {
                          lastRowLabels = [];
                        }
                        return (
                          <tr key={row.key + idx} className={`border border-transparent ${isGrand ? 'bg-indigo-900/20' : isSubtotal ? 'bg-slate-800/60' : 'bg-slate-800/40'} rounded-3xl`}>
                            {(pivotResult.rowDims.length ? pivotResult.rowDims : ['维度']).map((_, i) => (
                              <td key={i} className={`px-4 py-3 text-xs font-black ${isGrand ? 'text-indigo-300' : isSubtotal ? 'text-slate-200' : 'text-white'} sticky left-0 bg-inherit z-10`}>
                                {displayCells[i] || ''}
                              </td>
                            ))}
                            {pivotResult.colKeys.map(colKey => (
                              pivotResult.valueKeys.map(vk => (
                                <td key={`${row.key}-${colKey}-${vk}`} className={`px-4 py-3 text-right text-xs ${isGrand ? 'text-indigo-200 font-black' : isSubtotal ? 'text-slate-200 font-black' : 'text-slate-300 font-bold'}`}>
                                  {formatPivotValue(row.cells[colKey]?.[vk] ?? null, vk)}
                                </td>
                              ))
                            ))}
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {isPivotDrawerOpen && (
            <div className="bg-slate-900/70 border border-slate-800 rounded-[32px] p-4 space-y-6">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[11px] font-black uppercase tracking-widest text-slate-400">平台范围</div>
                  <button
                    onClick={togglePivotPlatformAll}
                    className="text-[10px] font-black text-slate-400 hover:text-slate-200 transition"
                  >
                    {pivotPlatformScopes.length === DEFAULT_PIVOT_PLATFORM_SCOPES.length ? '清空' : '全选'}
                  </button>
                </div>
                <div className="space-y-2">
                  {PIVOT_PLATFORM_OPTIONS.map(opt => {
                    const active = pivotPlatformScopes.includes(opt.key);
                    return (
                      <label key={opt.key} className="flex items-center gap-2 text-xs text-slate-200">
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={() => togglePivotPlatformScope(opt.key)}
                        />
                        <span>{opt.label}</span>
                      </label>
                    );
                  })}
                </div>
                {pivotPlatformScopes.length === 0 && (
                  <div className="text-[10px] text-slate-500 mt-2">未选择平台将无数据展示</div>
                )}
              </div>

              <div>
                <div className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3">筛选器</div>
                <select
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white mb-3"
                  onChange={e => {
                    handleAddPivotFilter(e.target.value);
                    e.currentTarget.value = '';
                  }}
                  defaultValue=""
                >
                  <option value="">添加筛选字段</option>
                  {pivotDimensionFields
                    .filter(f => !pivotFilters.some(p => p.fieldKey === f.key))
                    .map(f => (
                      <option key={f.key} value={f.key}>{f.label}</option>
                    ))}
                </select>
                <div className="space-y-3">
                  {pivotFilters.map(f => {
                    const field = pivotDimensionFields.find(df => df.key === f.fieldKey);
                    const isDate = field?.type === 'date';
                    const options = pivotDimensionValueOptions[f.fieldKey] || [];
                    const filteredOptions = options.filter(v => v.toLowerCase().includes((f.search || '').toLowerCase()));
                    return (
                      <div key={f.id} className="bg-slate-800/60 border border-slate-700 rounded-2xl p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-white">{f.label}</span>
                          <button onClick={() => removePivotFilter(f.id)} className="text-slate-400 hover:text-red-400">
                            <X size={14} />
                          </button>
                        </div>
                        {!isDate && (
                          <select
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] text-white mt-2"
                            value={f.mode}
                            onChange={e => updatePivotFilter(f.id, { mode: e.target.value as any, selectedValues: [] })}
                          >
                            <option value="multi">多选</option>
                            <option value="contains">包含</option>
                            <option value="not_contains">不包含</option>
                          </select>
                        )}
                        {isDate ? (
                          <div className="grid grid-cols-2 gap-2 mt-2">
                            <input type="date" className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] text-white" value={f.dateRange.start} onChange={e => updatePivotFilter(f.id, { dateRange: { ...f.dateRange, start: e.target.value } })} />
                            <input type="date" className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] text-white" value={f.dateRange.end} onChange={e => updatePivotFilter(f.id, { dateRange: { ...f.dateRange, end: e.target.value } })} />
                          </div>
                        ) : f.mode === 'multi' ? (
                          <div className="mt-2">
                            <input
                              type="text"
                              placeholder="搜索..."
                              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] text-white mb-2"
                              value={f.search}
                              onChange={e => updatePivotFilter(f.id, { search: e.target.value })}
                            />
                            <div className="max-h-40 overflow-y-auto custom-scrollbar pr-1 space-y-1">
                              {filteredOptions.map(v => {
                                const active = f.selectedValues.includes(v);
                                return (
                                  <button
                                    key={v}
                                    onClick={() => {
                                      const next = active ? f.selectedValues.filter(x => x !== v) : [...f.selectedValues, v];
                                      updatePivotFilter(f.id, { selectedValues: next });
                                    }}
                                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left ${active ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                                  >
                                    <div className={`w-3 h-3 rounded border ${active ? 'bg-white border-white' : 'border-slate-500'}`} />
                                    <span className="text-[11px] truncate">{v}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <input
                            type="text"
                            placeholder={f.mode === 'contains' ? '包含关键词' : '不包含关键词'}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] text-white mt-2"
                            value={f.textValue}
                            onChange={e => updatePivotFilter(f.id, { textValue: e.target.value })}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3">行</div>
                <select
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white mb-3"
                  onChange={e => {
                    addPivotListItem(pivotRows, setPivotRows, e.target.value);
                    e.currentTarget.value = '';
                  }}
                  defaultValue=""
                >
                  <option value="">添加行维度</option>
                  {pivotDimensionFields.filter(f => !pivotRows.includes(f.key)).map(f => (
                    <option key={f.key} value={f.key}>{f.label}</option>
                  ))}
                </select>
                <div className="space-y-2">
                  {pivotRows.map(k => (
                    <div key={k} className="flex items-center gap-2 bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2">
                      <span className="text-xs font-bold text-white flex-1">{pivotDimensionFields.find(f => f.key === k)?.label || k}</span>
                      <button onClick={() => movePivotListItem(pivotRows, setPivotRows, k, 'up')} className="text-slate-400 hover:text-white"><ChevronUp size={14} /></button>
                      <button onClick={() => movePivotListItem(pivotRows, setPivotRows, k, 'down')} className="text-slate-400 hover:text-white"><ChevronDown size={14} /></button>
                      <button onClick={() => removePivotListItem(pivotRows, setPivotRows, k)} className="text-slate-400 hover:text-red-400"><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3">列</div>
                <select
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white mb-3"
                  onChange={e => {
                    addPivotListItem(pivotColumns, setPivotColumns, e.target.value);
                    e.currentTarget.value = '';
                  }}
                  defaultValue=""
                >
                  <option value="">添加列维度</option>
                  {pivotDimensionFields.filter(f => !pivotColumns.includes(f.key)).map(f => (
                    <option key={f.key} value={f.key}>{f.label}</option>
                  ))}
                </select>
                <div className="space-y-2">
                  {pivotColumns.map(k => (
                    <div key={k} className="flex items-center gap-2 bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2">
                      <span className="text-xs font-bold text-white flex-1">{pivotDimensionFields.find(f => f.key === k)?.label || k}</span>
                      <button onClick={() => movePivotListItem(pivotColumns, setPivotColumns, k, 'up')} className="text-slate-400 hover:text-white"><ChevronUp size={14} /></button>
                      <button onClick={() => movePivotListItem(pivotColumns, setPivotColumns, k, 'down')} className="text-slate-400 hover:text-white"><ChevronDown size={14} /></button>
                      <button onClick={() => removePivotListItem(pivotColumns, setPivotColumns, k)} className="text-slate-400 hover:text-red-400"><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3">值</div>
                <select
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white mb-3"
                  onChange={e => {
                    addPivotListItem(pivotValues, setPivotValues, e.target.value);
                    e.currentTarget.value = '';
                  }}
                  defaultValue=""
                >
                  <option value="">添加指标或公式</option>
                  {pivotValueOptions.filter(v => !pivotValues.includes(v.key)).map(v => (
                    <option key={v.key} value={v.key}>{v.label}</option>
                  ))}
                </select>
                <div className="space-y-2">
                  {pivotValues.map(k => (
                    <div key={k} className="flex items-center gap-2 bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2">
                      <span className="text-xs font-bold text-white flex-1">{pivotValueMeta.get(k)?.label || k}</span>
                      <button onClick={() => movePivotListItem(pivotValues, setPivotValues, k, 'up')} className="text-slate-400 hover:text-white"><ChevronUp size={14} /></button>
                      <button onClick={() => movePivotListItem(pivotValues, setPivotValues, k, 'down')} className="text-slate-400 hover:text-white"><ChevronDown size={14} /></button>
                      <button onClick={() => removePivotListItem(pivotValues, setPivotValues, k)} className="text-slate-400 hover:text-red-400"><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-[10px] text-slate-500">汇总方式默认：求和；公式字段按因子汇总后再计算。</div>
              </div>

              <div>
                <div className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-3">展示配置</div>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-xs text-slate-200">
                    <input type="checkbox" checked={pivotDisplay.showSubtotal} onChange={e => setPivotDisplay(prev => ({ ...prev, showSubtotal: e.target.checked }))} />
                    显示小计（按行维度层级）
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-200">
                    <input type="checkbox" checked={pivotDisplay.showGrandTotal} onChange={e => setPivotDisplay(prev => ({ ...prev, showGrandTotal: e.target.checked }))} />
                    显示合计（行/列二选一）
                  </label>
                  {pivotDisplay.showGrandTotal && (
                    <select
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                      value={pivotDisplay.totalAxis}
                      onChange={e => setPivotDisplay(prev => ({ ...prev, totalAxis: e.target.value as 'row' | 'column' }))}
                    >
                      <option value="row">行合计</option>
                      <option value="column">列合计</option>
                    </select>
                  )}
                  <div className="text-[10px] text-slate-500">空单元格显示：空白</div>
                  <div className="text-[10px] text-slate-500">金额：$ + 2 位小数；比例：% + 2 位小数</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      </section>
      )}

      {activeReportTab === 'ai' && (
      <section id="report-module-ai" className="scroll-mt-32">
      <div className="bg-slate-900/50 p-12 rounded-[56px] border border-slate-800 shadow-sm overflow-hidden relative">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-indigo-900/50 text-indigo-400 rounded-2xl flex items-center justify-center"><Zap size={20} /></div>
            <div>
              <h3 className="text-xl font-black text-white tracking-tight">AI 智能全维度诊断报告</h3>
              <p className="text-slate-400 text-[10px] font-black uppercase tracking-wider">Aetherion Standard • Growth Scientist Insight</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {activeFiltersCount > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-900/20 border border-amber-900/40 rounded-full">
                <Filter size={10} className="text-amber-400" />
                <span className="text-[10px] font-black text-amber-400 uppercase">已过滤 {activeFiltersCount} 个维度</span>
              </div>
            )}
            <button onClick={handleAiAnalysis} disabled={isAnalyzing} className="bg-indigo-600 text-white px-8 py-3.5 rounded-2xl flex items-center gap-2 hover:bg-indigo-700 transition font-black text-xs shadow-xl shadow-indigo-900/20 disabled:opacity-50 active:scale-95">
              {isAnalyzing ? <RefreshCcw className="animate-spin" size={16} /> : <Lightbulb size={16} />}
              {isAnalyzing ? '智核分析中...' : '基于当前筛选生成报告'}
            </button>
          </div>
        </div>
        {aiAnalysis ? (
          <div className="prose prose-slate max-w-none animate-in fade-in slide-in-from-bottom-4 duration-1000">
            <div className="bg-slate-800 rounded-[40px] p-10 border border-slate-700 text-slate-200 leading-relaxed font-medium" dangerouslySetInnerHTML={{ __html: formatReportHtml(aiAnalysis) }} />
          </div>
        ) : (
          <div className="h-64 flex flex-col items-center justify-center border-2 border-dashed border-slate-700 rounded-[40px] bg-slate-800/30">
            <div className="w-16 h-16 bg-slate-900 rounded-3xl shadow-sm flex items-center justify-center mb-6"><Activity size={32} className="text-indigo-400" /></div>
            <p className="text-slate-500 font-black uppercase tracking-[0.3em] text-[10px]">点击上方按钮 开启 AI 深度归因与投放建议</p>
          </div>
        )}
      </div>
      </section>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500/30">

      {/* --- Top Navigation Bar --- */}
      <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-[1600px] mx-auto px-4 h-16 flex items-center justify-between">

          {/* Left: Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                AdIntel <span className="font-light text-slate-500">Growth Scientist</span>
              </h1>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-4">
            {/* Edit Config Button (Visible in Dashboard Step) */}
            {step === 'dashboard' && (
              <button
                onClick={() => setStep('mapping')}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-5 py-2.5 rounded-xl text-xs font-black transition-all shadow-sm active:scale-95 mr-2"
              >
                <Settings2 size={14} />
                调整指标配置
              </button>
            )}

            {/* Save Config Button (Visible in Mapping Step) */}
            {/* Save Config Button (Visible in Mapping Step) */}
            {step === 'mapping' && (
              <button
                onClick={handleSaveConfig}
                disabled={isLoadingData}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl text-xs font-black transition-all shadow-lg shadow-indigo-500/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed mr-2"
              >
                {isLoadingData ? <RefreshCcw className="animate-spin" size={14} /> : <Save size={14} />}
                {isLoadingData ? '保存中...' : '【保存指标与维度参数配置】'}
              </button>
            )}
            {/* User Profile & Logout */}
            <div className="flex items-center gap-3 pl-4 border-l border-slate-800">
              <div className="flex flex-col items-end">
                <span className="text-sm font-medium text-slate-200">
                  {currentUser?.displayName || 'User'}
                </span>
                <span className="text-xs text-slate-500">
                  {currentUser?.username || ''}
                </span>
              </div>
              <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
                <User className="w-4 h-4 text-slate-400" />
              </div>
              <button
                onClick={handleLogout}
                className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-red-400 transition-colors"
                title="登出"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-[1600px] mx-auto px-4 py-8">

        {/* Project Selection Hero */}
        {!selectedProject ? (
          <div className="flex flex-col items-center justify-center py-20 animate-in fade-in zoom-in duration-500">
            <div className="w-20 h-20 bg-slate-900 rounded-3xl flex items-center justify-center mb-8 border border-slate-800 shadow-2xl shadow-indigo-900/20 relative group">
              <div className="absolute inset-0 bg-indigo-500/20 blur-xl rounded-full group-hover:bg-indigo-500/30 transition-all duration-500"></div>
              <Layers className="w-10 h-10 text-indigo-400 relative z-10" />
            </div>
            <h2 className="text-3xl font-bold text-white mb-3 text-center">Select a Project</h2>
            <p className="text-slate-400 mb-8 text-center max-w-md">
              Choose a project to access its Growth Scientist report and AI diagnostics.
            </p>

            <div className="relative w-full max-w-md">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                <Filter className="w-5 h-5 text-slate-500" />
              </div>
              <input
                type="text"
                placeholder="Search projects..."
                className="w-full pl-10 pr-4 py-3 bg-slate-900/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all placeholder-slate-600 text-white"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-10 w-full max-w-4xl px-4">
              {projectList
                .filter(p => !searchTerm || p.projectName.toLowerCase().includes(searchTerm.toLowerCase()))
                .map(project => (
                  <button
                    key={project.projectId}
                    onClick={() => handleProjectSelect(project)}
                    className="group flex items-start gap-4 p-4 bg-slate-900/50 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/50 rounded-2xl transition-all duration-300 hover:shadow-lg hover:shadow-indigo-900/10 text-left relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <ArrowRight className="w-4 h-4 text-indigo-400" />
                    </div>

                    <div className="w-12 h-12 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-300">
                      {project.iconUrl ? (
                        <img src={project.iconUrl} alt={project.projectName} className="w-8 h-8 object-contain" />
                      ) : (
                        <span className="text-xl font-bold text-slate-700 group-hover:text-indigo-500 transition-colors">
                          {project.projectName.charAt(0)}
                        </span>
                      )}
                    </div>
                    <div>
                      <div className="font-semibold text-slate-200 group-hover:text-white mb-1 pr-6">
                        {project.projectName}
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Tags for reports */}
                        {project.adsCostReport && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Ads Report</span>
                        )}
                        {project.biReport && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20">BI Report</span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
            </div>

            {projectList.length === 0 && !isLoadingProjects && (
              <div className="mt-8 text-slate-500 flex flex-col items-center gap-2">
                <Database className="w-8 h-8 opacity-50" />
                <p>No projects found matching your permissions.</p>
              </div>
            )}

            {isLoadingProjects && (
              <div className="mt-10 flex items-center gap-2 text-indigo-400 animate-pulse">
                <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            )}
          </div>
        ) : (
          /* --- Report View --- */
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* 吸顶：项目信息 + 时间范围选择 */}
            <div className="sticky top-16 z-30 -mx-4 px-4 py-4 mb-6 bg-slate-950/95 backdrop-blur-md border-b border-slate-800">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <button
                    onClick={() => setSelectedProject(null)}
                    className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors group shrink-0"
                  >
                    <ArrowRight className="w-4 h-4 rotate-180 group-hover:-translate-x-1 transition-transform" />
                    Back to Projects
                  </button>
                  <div className="flex items-center gap-3 border-l border-slate-800 pl-4">
                    {selectedProject.iconUrl && <img src={selectedProject.iconUrl} className="w-8 h-8 rounded-lg" alt="" />}
                    <div>
                      <h2 className="text-xl font-bold text-white">{selectedProject.projectName}</h2>
                      <p className="text-slate-400 text-xs mt-0.5">Growth Scientist Analysis Report</p>
                      {activeReportTab === 'pivot' && (
                        <p className="text-slate-500 text-[11px] mt-1.5 flex items-center gap-1.5">
                          <span>当前报告：</span>
                          <span className={activePivotPresetId ? 'text-indigo-400 font-semibold' : 'text-slate-500'}>
                            {activePivotPresetId
                              ? (pivotPresets.find(p => p.id === activePivotPresetId)?.name ?? '未知')
                              : '未选择'}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 bg-slate-900/50 p-1.5 rounded-xl border border-slate-800">
                  {/* 报告时间范围：仅在首次获取数据的时间范围内可选 */}
                  {(() => {
                    const bounds = reportDateRangeBounds ?? (availableDates.length
                      ? { start: availableDates[0], end: availableDates[availableDates.length - 1] }
                      : null);
                    if (!bounds) {
                      return (
                        <div className="flex items-center gap-2 px-3 py-2 bg-slate-800 rounded-lg border border-slate-700">
                          <Calendar className="w-4 h-4 text-slate-400" />
                          <span className="text-sm text-slate-500">请先获取数据以选择报告时间范围</span>
                        </div>
                      );
                    }
                    const startVal = dateRange.start || bounds.start;
                    const endVal = dateRange.end || bounds.end;
                    return (
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-2 px-2 py-1.5 bg-slate-800 rounded-lg border border-slate-700">
                          <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                          <label className="text-[10px] text-slate-500 uppercase tracking-wider shrink-0">开始</label>
                          <input
                            type="date"
                            value={startVal}
                            min={bounds.start}
                            max={endVal}
                            onChange={e => {
                              const v = e.target.value;
                              setDateRange(prev => {
                                const end = prev.end || bounds.end;
                                return { ...prev, start: v, end: v > end ? v : end };
                              });
                            }}
                            className="bg-transparent text-sm font-medium text-white outline-none focus:ring-0 border-0 p-0 min-w-0"
                          />
                        </div>
                        <ArrowRight className="w-3 h-3 text-slate-600 shrink-0" />
                        <div className="flex items-center gap-2 px-2 py-1.5 bg-slate-800 rounded-lg border border-slate-700">
                          <label className="text-[10px] text-slate-500 uppercase tracking-wider shrink-0">结束</label>
                          <input
                            type="date"
                            value={endVal}
                            min={startVal}
                            max={bounds.end}
                            onChange={e => {
                              const v = e.target.value;
                              setDateRange(prev => {
                                const start = prev.start || bounds.start;
                                return { ...prev, end: v, start: v < start ? v : start };
                              });
                            }}
                            className="bg-transparent text-sm font-medium text-white outline-none focus:ring-0 border-0 p-0 min-w-0"
                          />
                        </div>
                        <span className="text-[10px] text-slate-500">（可选范围 {bounds.start} ~ {bounds.end}）</span>
                      </div>
                    );
                  })()}
                  {/* Refresh Button */}
                  <button
                    onClick={handleLoadDataFromApi}
                    disabled={isLoadingData}
                    className="p-2 hover:bg-indigo-600 hover:text-white rounded-lg text-indigo-400 transition-colors disabled:opacity-50"
                    title="重新获取数据"
                  >
                    <div className={isLoadingData ? "animate-spin" : ""}>
                      <Database className="w-4 h-4" />
                    </div>
                  </button>
                </div>
              </div>
              {/* Tab 栏：仅在 dashboard 步骤显示 */}
              {step === 'dashboard' && (
                <div className="flex items-center gap-1.5 mt-4 pt-4 border-t border-slate-800">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mr-2">模块</span>
                  {[
                    { id: 'bi' as const, label: 'BI 看板', icon: LayoutDashboard },
                    { id: 'pivot' as const, label: '数据透视分析', icon: TableIcon },
                    { id: 'ai' as const, label: '智能全维度诊断报告', icon: Zap },
                  ].map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      onClick={() => setActiveReportTab(id)}
                      className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${activeReportTab === id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/30' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* --- 报告主体：按 Tab 切换模块 --- */}
            <div className="space-y-6">

              {/* 1. Account Selection (if multiple accounts) */}
              {/* ... */}

              {/* Placeholder for existing dashboard content */}
              {step === 'dataSourceConfig' && (
                <div className="bg-slate-900/50 text-white rounded-[48px] p-16 relative overflow-hidden shadow-2xl">
                  <div className="absolute inset-0 bg-gradient-to-br from-[#3b82f6]/20 to-[#fbbf24]/10 pointer-events-none"></div>

                  {/* Header */}
                  <div className="text-center mb-12 relative z-10">
                    <div className="inline-flex bg-white/10 backdrop-blur-md p-6 rounded-3xl mb-8 border border-white/5 shadow-inner">
                      <Database size={48} className="text-blue-400" />
                    </div>
                    <h2 className="text-4xl font-black mb-4 tracking-tighter">配置数据源</h2>
                    <p className="text-slate-300 max-w-xl mx-auto font-medium leading-relaxed opacity-70">
                      选择项目、账号和时间范围，系统将自动从 API 获取 Facebook 和 Google 广告数据
                    </p>
                  </div>

                  {/* Configuration Form */}
                  <div className="max-w-2xl mx-auto space-y-8 relative z-10">
                    {/* Project Selector */}
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">1. 选择项目</label>
                      <button
                        onClick={() => setIsProjectModalOpen(true)}
                        className="w-full bg-white/10 border border-white/20 rounded-2xl p-4 text-white font-black text-lg backdrop-blur-md outline-none hover:border-blue-400 transition text-left flex items-center justify-between"
                      >
                        <span>{selectedProject?.projectName || '点击选择项目'}</span>
                        <ChevronDown size={20} className="text-slate-400" />
                      </button>
                    </div>

                    {/* Date Range */}
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">2. 选择时间范围 (最近7天)</label>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <span className="text-[9px] text-slate-500 uppercase block mb-1">开始日期</span>
                          <input
                            type="date"
                            value={apiDateRange.start}
                            onChange={e => setApiDateRange(prev => ({ ...prev, start: e.target.value }))}
                            className="w-full bg-white/10 border border-white/20 rounded-xl p-4 text-white font-bold backdrop-blur-md outline-none focus:border-blue-400 transition"
                          />
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-500 uppercase block mb-1">结束日期</span>
                          <input
                            type="date"
                            value={apiDateRange.end}
                            onChange={e => setApiDateRange(prev => ({ ...prev, end: e.target.value }))}
                            className="w-full bg-white/10 border border-white/20 rounded-xl p-4 text-white font-bold backdrop-blur-md outline-none focus:border-blue-400 transition"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Account Selector (Optional) */}
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">
                        3. 选择账号 <span className="text-slate-500">(可选，留空获取全部)</span>
                      </label>
                      {isLoadingAccounts ? (
                        <div className="bg-white/5 rounded-2xl p-6 text-center flex items-center justify-center gap-2">
                          <RefreshCcw size={16} className="animate-spin text-blue-400" />
                          <p className="text-slate-400 text-sm">加载账号中...</p>
                        </div>
                      ) : availableAccounts.length > 0 ? (
                        <div className="bg-white/5 rounded-2xl p-4 max-h-40 overflow-y-auto space-y-2">
                          {availableAccounts.map(acc => (
                            <button
                              key={acc.id}
                              onClick={() => toggleAccountSelection(acc.id)}
                              className={`w-full flex items-center gap-3 p-3 rounded-xl transition ${selectedAccounts.includes(acc.id) ? 'bg-blue-600' : 'bg-white/10 hover:bg-white/20'}`}
                            >
                              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${selectedAccounts.includes(acc.id) ? 'bg-white border-white' : 'border-white/40'}`}>
                                {selectedAccounts.includes(acc.id) && <Check size={12} className="text-blue-600" strokeWidth={4} />}
                              </div>
                              <span className="text-sm font-bold truncate">{acc.name}</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="bg-white/5 rounded-2xl p-6 text-center">
                          <p className="text-slate-400 text-sm">首次获取数据后将显示可用账号列表</p>
                        </div>
                      )}
                    </div>

                    {/* Error Message */}
                    {apiError && (
                      <div className="bg-rose-500/20 border border-rose-500/40 rounded-2xl p-4 text-rose-300 text-sm font-bold text-center">
                        {apiError}
                      </div>
                    )}

                    {/* Load Button */}
                    <button
                      onClick={handleLoadDataFromApi}
                      disabled={!selectedProject || isLoadingData || isLoadingAccounts}
                      className={`w-full py-6 rounded-3xl font-black text-lg flex items-center justify-center gap-3 transition-all ${!selectedProject || isLoadingData || isLoadingAccounts
                        ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                        : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:shadow-2xl hover:scale-[1.02]'
                        }`}
                    >  {isLoadingData ? (
                      <>
                        <RefreshCcw size={20} className="animate-spin" />
                        加载中...
                      </>
                    ) : (
                      <>
                        <Database size={20} />
                        获取广告数据
                      </>
                    )}
                    </button>

                    <p className="text-center text-slate-500 font-bold text-xs uppercase tracking-widest">
                      同时加载 Facebook 和 Google 平台数据
                    </p>
                  </div>
                </div>
              )}


              {step === 'mapping' && (
                <div className="space-y-8 animate-in fade-in duration-700">
                  {/* Mapping Tabs + 红框操作区（与 tab 栏齐平） */}
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mr-2">配置模块</span>
                      {[
                        { id: 'metrics' as const, label: '指标与公式' },
                        { id: 'dimensions' as const, label: '维度参数配置' },
                        { id: 'quality' as const, label: '数据质量报告' }
                      ].map(tab => (
                        <button
                          key={tab.id}
                          onClick={() => setMappingTab(tab.id)}
                          className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all ${mappingTab === tab.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/30' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                    {/* 红框区域：按当前 tab 显示操作按钮 */}
                    <div className="flex items-center gap-2">
                      {mappingTab === 'metrics' && (
                        <button
                          onClick={() => setMappingTab('dimensions')}
                          className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-black hover:bg-indigo-500 transition-all shrink-0"
                        >
                          下一步进入到维度参数配置
                        </button>
                      )}
                      {mappingTab === 'dimensions' && (
                        <>
                          <button
                            onClick={() => setMappingTab('metrics')}
                            className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-black hover:bg-slate-700 transition-all shrink-0"
                          >
                            返回上一步
                          </button>
                          <button
                            onClick={() => setStep('dashboard')}
                            className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-black hover:bg-indigo-500 transition-all shrink-0"
                          >
                            生成智投分析面板
                          </button>
                        </>
                      )}
                      {mappingTab === 'quality' && (
                        <button
                          onClick={() => setStep('dashboard')}
                          className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-black hover:bg-indigo-500 transition-all shrink-0"
                        >
                          生成智投分析面板
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Top Row: Metrics & Formulas */}
                  {mappingTab === 'metrics' && (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">

                    {/* Left: Metric Mapping */}
                    <div className="bg-slate-900/50 border border-slate-800 rounded-[40px] p-10 shadow-2xl space-y-10">
                      <div className="flex items-center justify-between">
                        <h3 className="text-2xl font-black flex items-center gap-4 text-white"><Layers className="text-blue-400" /> 指标字段对齐</h3>

                        <div className="flex items-center gap-4">

                          <div className="flex bg-slate-800 p-1 rounded-xl">
                            {['facebook', 'google'].map(p => (
                              <button key={p} onClick={() => setActivePlatformTab(p as any)} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activePlatformTab === p ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400'}`}>
                                {p}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      {activePlatformTab === 'google' && (
                        <div className="flex items-center gap-2">
                          {GOOGLE_TYPES.map(t => (
                            <button
                              key={t}
                              onClick={() => setActiveGoogleType(t)}
                              className={`px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeGoogleType === t ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 bg-slate-800'}`}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="grid grid-cols-1 gap-4">
                        {activeHeaders.length === 0 && (
                          <div className="px-4 py-3 rounded-2xl border border-dashed border-slate-700 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                            请先获取广告数据
                          </div>
                        )}
                        {Object.keys(activeMapping).map(key => {
                          const val = (activeMapping as any)[key];
                          if (val === undefined) return null;
                          return (
                            <div key={key} className="grid grid-cols-12 items-center gap-3 group">
                              <div className="col-span-12 md:col-span-4 flex items-center justify-between">
                                <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest">{getLabelForKey(key)}</label>
                                {key.startsWith('custom_') && (
                                  <button onClick={() => handleRemoveMetric(key)} className="opacity-0 group-hover:opacity-100 text-slate-700 hover:text-red-500 transition-all p-1">
                                    <Trash2 size={10} />
                                  </button>
                                )}
                              </div>
                              <div className="col-span-12 md:col-span-8 min-w-0">
                                <select className="w-full bg-slate-800 border-2 border-slate-700 rounded-2xl px-4 py-3 text-[11px] font-black outline-none text-white" value={val || ''} onChange={e => {
                                  const val = e.target.value;
                                  if (activePlatformTab === 'facebook') {
                                    setMappings(p => ({ ...p, facebook: { ...p.facebook, [key]: val } }));
                                  } else {
                                    setMappings(p => ({
                                      ...p,
                                      google: {
                                        ...p.google,
                                        [activeGoogleType]: { ...p.google[activeGoogleType], [key]: val }
                                      }
                                    }));
                                  }
                                }}>
                                  <option value="">未选择 (Unmapped)</option>
                                  {activeHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                </select>
                              </div>
                            </div>
                          );
                        })}

                        {/* Inline Add Metric Card */}
                        <div className="space-y-2">
                          <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest">新增基础指标</label>
                          {isAddingMetric ? (
                            <div className="flex items-center gap-2">
                              <input
                                autoFocus
                                className="flex-1 min-w-0 bg-slate-900 border-2 border-indigo-400 rounded-2xl p-3 text-[11px] font-black outline-none shadow-lg text-white"
                                placeholder="输入指标名称..."
                                value={newMetricName}
                                onChange={e => setNewMetricName(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleAddMetric();
                                  if (e.key === 'Escape') setIsAddingMetric(false);
                                }}
                              />
                              <button onClick={handleAddMetric} className="bg-indigo-600 text-white p-3 rounded-2xl hover:bg-indigo-700 shadow-md">
                                <Check size={14} />
                              </button>
                              <button onClick={() => setIsAddingMetric(false)} className="bg-slate-800 text-slate-400 p-3 rounded-2xl hover:bg-slate-700">
                                <X size={14} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setIsAddingMetric(true)}
                              className="w-full border-2 border-dashed border-slate-700 rounded-2xl p-4 flex items-center justify-center gap-2 text-slate-400 hover:border-indigo-400 hover:text-indigo-400 hover:bg-indigo-900/20 transition-all text-[11px] font-black"
                            >
                              <Plus size={14} /> 新增对齐指标
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Formula Config */}
                    <div className="bg-slate-900/50 border border-slate-800 rounded-[40px] p-10 shadow-2xl space-y-8 flex flex-col">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xl font-black flex items-center gap-4 text-white"><Calculator className="text-indigo-400" /> 公式字段配置</h3>
                        <button className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-[10px] font-black hover:bg-indigo-700 transition" onClick={() => openFormulaModal()}>+ 新增公式</button>
                      </div>
                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 flex-1 content-start">
                        {formulas.map(f => (
                          <div key={f.id} className="p-6 bg-slate-800 rounded-3xl border border-slate-700 flex items-center justify-between group">
                            <div>
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{f.name}</p>
                              <p className="text-xs font-mono font-bold text-slate-200">{f.formula}</p>
                            </div>
                            <div className="flex items-center gap-3">
                              <button onClick={() => openFormulaModal(f)} className="p-2 bg-slate-900 rounded-lg shadow-sm text-slate-400 hover:text-indigo-400 transition"><Edit3 size={14} /></button>
                              {!f.isDefault && <button onClick={() => setFormulas(formulas.filter(x => x.id !== f.id))} className="p-2 bg-slate-900 rounded-lg shadow-sm text-slate-400 hover:text-red-500 transition"><Trash2 size={14} /></button>}
                            </div>
                          </div>
                        ))}
                        {formulas.length === 0 && (
                          <div className="h-full flex flex-col items-center justify-center text-slate-500 opacity-50 space-y-2 py-12 border-2 border-dashed border-slate-800 rounded-3xl">
                            <Calculator size={32} />
                            <p className="text-xs font-bold">暂无公式，点击右上角添加</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  )}

                  {/* Bottom Row: Dimensions */}
                  {mappingTab === 'dimensions' && (
                  <div className="bg-slate-900/50 border border-slate-800 rounded-[40px] p-10 shadow-2xl space-y-10">
                    <div>
                      <h3 className="text-2xl font-black flex items-center gap-4 text-white"><Split className="text-purple-400" /> 维度参数配置</h3>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                      {/* Left Side: Samples */}
                      <div className="lg:col-span-1 bg-slate-800 rounded-3xl p-6 space-y-6 border border-slate-700 shadow-inner h-fit">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2"><TableIcon size={12} /> NAMING CONVENTION SAMPLES</p>
                        </div>
                        
                        {/* Platform Selector */}
                        <div className="flex bg-slate-900 p-1 rounded-xl">
                          {['facebook', 'google'].map(p => (
                            <button 
                              key={p} 
                              onClick={() => setActivePlatformTab(p as any)} 
                              className={`flex-1 px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${activePlatformTab === p ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
                            >
                              {p === 'facebook' ? 'Meta' : 'Google'}
                            </button>
                          ))}
                        </div>

                        {/* Google Type Selector */}
                        {activePlatformTab === 'google' && (
                          <div className="space-y-2">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Google Ad Type</p>
                            <div className="flex flex-col gap-1.5">
                              {GOOGLE_TYPES.map(t => (
                                <button
                                  key={t}
                                  onClick={() => setActiveGoogleType(t)}
                                  className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all text-left ${activeGoogleType === t ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 bg-slate-900 hover:text-slate-200 hover:bg-slate-900/70'}`}
                                >
                                  {t.replace('_', ' ')}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="space-y-4">
                          <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
                            <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Campaign Name Sample</label>
                            <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 text-[11px] font-medium text-slate-200 overflow-hidden text-ellipsis whitespace-nowrap shadow-sm" title={namingSamples.campaign}>{namingSamples.campaign || 'N/A'}</div>
                          </div>
                          <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
                            <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Ad Set Name Sample</label>
                            <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 text-[11px] font-medium text-slate-200 overflow-hidden text-ellipsis whitespace-nowrap shadow-sm" title={namingSamples.adSet}>{namingSamples.adSet || 'N/A'}</div>
                          </div>
                          <div className="bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
                            <label className="text-[9px] font-black text-slate-400 uppercase block mb-1">Ad Name Sample</label>
                            <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 text-[11px] font-medium text-slate-200 overflow-hidden text-ellipsis whitespace-nowrap shadow-sm" title={namingSamples.ad}>{namingSamples.ad || 'N/A'}</div>
                          </div>
                        </div>
                      </div>

                      {/* Right Side: Dimension Rules（行高参考左侧 NAMING CONVENTION SAMPLE） */}
                      <div className="lg:col-span-2 space-y-2 max-h-[520px] overflow-y-auto overflow-x-hidden pr-2 custom-scrollbar">
                        {allDimensions.map(dim => {
                          const existing = dimConfigs.find(d => d.label === dim);
                          const currentSource = existing?.source || 'campaign';
                          const currentDelimiter = existing?.delimiter || '_';
                          const isDirect = existing != null && existing.index === -1;
                          /** 取值方式：直接取值 | 下划线 | 中划线，统一在一个列表中供用户选择 */
                          const segmentStyle = isDirect ? 'direct' : (currentDelimiter === '-' ? '-' : '_');
                          const sampleStr = namingSamples[currentSource as 'campaign' | 'adSet' | 'ad' | 'age' | 'gender'] || '';
                          const sampleParts = sampleStr ? sampleStr.split(currentDelimiter) : [];
                          const showIndexDropdown = !isDirect;
                          return (
                            <div key={dim} className="flex flex-col md:flex-row md:items-center gap-2 p-3 bg-slate-800 rounded-2xl border border-slate-700 shadow-sm group hover:border-purple-700 transition-all relative">
                              <div className="md:w-36 flex items-center justify-between shrink-0">
                                <span className="text-[10px] font-black text-slate-200 uppercase tracking-widest">{dim}</span>
                                <button onClick={() => handleRemoveDimension(dim)} className="opacity-0 group-hover:opacity-100 text-slate-700 hover:text-red-500 transition-all p-1 mr-1">
                                  <Trash2 size={10} />
                                </button>
                              </div>
                              <div className="grid grid-cols-12 gap-2 flex-1 w-full min-w-0">
                                <select className="col-span-12 lg:col-span-5 min-w-0 bg-slate-900 text-[10px] font-black px-3 py-2.5 rounded-xl border border-slate-700 outline-none appearance-none cursor-pointer focus:border-indigo-400 transition-colors text-white" value={existing?.source || ''} onChange={e => {
                                  const source = e.target.value as any;
                                  if (source) setDimConfigs(p => [...p.filter(x => x.label !== dim), { label: dim, source, index: existing?.index ?? 0, delimiter: existing?.delimiter || '_' }]);
                                }}>
                                  <option value="">来源字段 (Source)</option>
                                  <option value="campaign">Campaign (Naming)</option>
                                  <option value="adSet">Ad Set (Naming)</option>
                                  <option value="ad">Ad (Naming)</option>
                                  <option value="age">Age</option>
                                  <option value="gender">Gender</option>
                                  <option value="platform">Platform</option>
                                </select>
                                <select className={`${showIndexDropdown ? 'col-span-6 lg:col-span-3' : 'col-span-12 lg:col-span-7'} min-w-0 bg-slate-900 text-[10px] font-black px-2 py-2.5 rounded-xl border border-slate-700 outline-none appearance-none cursor-pointer focus:border-indigo-400 transition-colors text-center text-white`} value={segmentStyle} onChange={e => {
                                  const v = e.target.value;
                                  if (v === 'direct') {
                                    if (existing) setDimConfigs(p => [...p.filter(x => x.label !== dim), { ...existing, index: -1 }]);
                                    else setDimConfigs(p => [...p, { label: dim, source: currentSource as any, index: -1, delimiter: '_' }]);
                                  } else {
                                    const delimiter = v as string;
                                    const index = existing && existing.index !== -1 ? existing.index : 0;
                                    if (existing) setDimConfigs(p => [...p.filter(x => x.label !== dim), { ...existing, delimiter, index }]);
                                    else setDimConfigs(p => [...p, { label: dim, source: currentSource as any, index, delimiter }]);
                                  }
                                }}>
                                  <option value="direct">直接取值</option>
                                  <option value="_">_ (下划线 | Underscore)</option>
                                  <option value="-">- (中划线 | Hyphen)</option>
                                </select>
                                {showIndexDropdown && (
                                  <select className="col-span-6 lg:col-span-4 min-w-0 bg-slate-900 text-[10px] font-black px-2 py-2.5 rounded-xl border border-slate-700 outline-none appearance-none cursor-pointer focus:border-indigo-400 transition-colors text-white" value={existing?.index ?? 0} onChange={e => {
                                    const index = parseInt(e.target.value, 10);
                                    if (!isNaN(index) && existing) setDimConfigs(p => [...p.filter(x => x.label !== dim), { ...existing, index }]);
                                    else if (!isNaN(index)) setDimConfigs(p => [...p, { label: dim, source: currentSource as any, index, delimiter: currentDelimiter }]);
                                  }}>
                                    {sampleParts.length > 0 ? (
                                      sampleParts.map((part, i) => (
                                        <option key={i} value={i}>Part {i} ({part})</option>
                                      ))
                                    ) : (
                                      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => <option key={i} value={i}>{i}</option>)
                                    )}
                                  </select>
                                )}
                              </div>
                            </div>
                          );
                        })}

                        <div className="p-1">
                          {isAddingDimension ? (
                            <div className="flex items-center gap-2 p-3 bg-slate-800 rounded-2xl border-2 border-indigo-700 border-dashed animate-in fade-in zoom-in duration-300">
                              <span className="md:w-28 text-[9px] font-black text-indigo-400 uppercase tracking-widest shrink-0">New Dimension</span>
                              <div className="flex flex-1 gap-2 min-w-0">
                                <input
                                  autoFocus
                                  className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-[10px] font-black outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-900/20 transition-all text-white"
                                  placeholder="输入自定义维度名称..."
                                  value={newDimensionName}
                                  onChange={e => setNewDimensionName(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') handleAddDimension();
                                    if (e.key === 'Escape') setIsAddingDimension(false);
                                  }}
                                />
                                <button onClick={handleAddDimension} className="bg-indigo-600 text-white px-4 py-2.5 rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-900/20 transition-all font-black text-[10px] min-w-[64px] shrink-0">确认</button>
                                <button onClick={() => setIsAddingDimension(false)} className="bg-slate-900 text-slate-400 px-4 py-2.5 rounded-xl hover:bg-slate-800 border border-slate-700 transition-all font-black text-[10px] min-w-[64px] shrink-0">取消</button>
                              </div>
                            </div>
                          ) : (
                            <button onClick={() => setIsAddingDimension(true)} className="w-full py-3 border-2 border-dashed border-slate-700 rounded-2xl flex items-center justify-center gap-2 text-slate-400 hover:text-indigo-400 hover:border-indigo-700 hover:bg-indigo-900/20 transition-all font-black text-[10px] uppercase tracking-widest group">
                              <Plus size={16} className="group-hover:scale-110 transition-transform" /> 增加自定义维度
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                  </div>
                  )}

                  {/* Data Quality Report */}
                  {mappingTab === 'quality' && (
                  <div className="space-y-8">
                    {/* Top Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">总数据量</p>
                        <p className="text-3xl font-black text-white mt-3">{qualityStats.total.toLocaleString()}</p>
                      </div>
                      <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">匹配成功</p>
                        <p className="text-3xl font-black text-emerald-400 mt-3">{qualityStats.matched.toLocaleString()}</p>
                        <p className="text-[11px] font-black text-emerald-300/80 mt-2">{(qualityStats.matchRate * 100).toFixed(1)}%</p>
                      </div>
                      <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">匹配失败</p>
                        <p className="text-3xl font-black text-amber-400 mt-3">{qualityStats.unmatched.toLocaleString()}</p>
                        <p className="text-[11px] font-black text-amber-300/80 mt-2">{((1 - qualityStats.matchRate) * 100).toFixed(1)}%</p>
                      </div>
                    </div>

                    {/* Overall Progress Bar */}
                    <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-6">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">整体匹配率</p>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-black text-slate-300">{(qualityStats.matchRate * 100).toFixed(1)}%</span>
                          <button
                            onClick={() => setIsRulesModalOpen(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-[10px] font-bold text-slate-300 hover:text-white transition-all"
                            title="查看匹配规则说明"
                          >
                            <HelpCircle size={12} />
                            规则说明
                          </button>
                        </div>
                      </div>
                      <div className="h-2 rounded-full bg-slate-900 overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-500 ${qualityStats.matchRate >= 0.95 ? 'bg-emerald-500' : qualityStats.matchRate >= 0.8 ? 'bg-yellow-500' : 'bg-red-500'}`} 
                          style={{ width: `${Math.round(qualityStats.matchRate * 100)}%` }} 
                        />
                      </div>
                    </div>

                    {/* Main Content: Left Sidebar + Right Details */}
                    {baseProcessedData.length === 0 && (
                      <div className="bg-slate-800/60 border border-slate-700 rounded-3xl p-8 text-center text-slate-400 text-sm font-bold">
                        暂无数据，请先获取广告数据
                      </div>
                    )}

                    {baseProcessedData.length > 0 && qualityDimensionLabels.length === 0 && (
                      <div className="bg-slate-800/60 border border-slate-700 rounded-3xl p-8 text-center text-slate-400 text-sm font-bold">
                        暂未配置维度，请先在维度参数配置中设置规则
                      </div>
                    )}

                    {baseProcessedData.length > 0 && qualityDimensionLabels.length > 0 && (
                      <div className="flex gap-6 h-[600px]">
                        {/* Left Sidebar: Dimension List */}
                        <div className="w-60 flex-shrink-0 bg-slate-900/50 border border-slate-800 rounded-3xl flex flex-col overflow-hidden">
                          <div className="p-4 border-b border-slate-800">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                              <Target size={12} className="text-purple-400" /> 维度列表
                            </h4>
                          </div>
                          <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                            {dimensionMatchStats.map(stat => {
                              const isSelected = selectedQualityDimension === stat.label;
                              const colorClass = stat.matchRate >= 0.95 ? 'text-emerald-400' : stat.matchRate >= 0.8 ? 'text-yellow-400' : 'text-red-400';
                              const bgClass = stat.matchRate >= 0.95 ? 'bg-emerald-500/10' : stat.matchRate >= 0.8 ? 'bg-yellow-500/10' : 'bg-red-500/10';
                              
                              return (
                                <button
                                  key={stat.label}
                                  onClick={() => setSelectedQualityDimension(stat.label)}
                                  className={`w-full p-3 rounded-2xl text-left transition-all ${
                                    isSelected 
                                      ? 'bg-indigo-600 text-white shadow-lg' 
                                      : `${bgClass} text-slate-300 hover:bg-slate-800`
                                  }`}
                                >
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-[11px] font-black">{stat.label}</span>
                                    {stat.matchRate < 0.8 && !isSelected && (
                                      <AlertTriangle size={12} className="text-red-400" />
                                    )}
                                  </div>
                                  <div className={`text-xl font-black ${isSelected ? 'text-white' : colorClass}`}>
                                    {(stat.matchRate * 100).toFixed(1)}%
                                  </div>
                                  <div className={`text-[10px] font-bold mt-1 ${isSelected ? 'text-indigo-200' : 'text-slate-500'}`}>
                                    {stat.missing.toLocaleString()} 条缺失
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Right: Details for Selected Dimension */}
                        <div className="flex-1 bg-slate-900/50 border border-slate-800 rounded-3xl flex flex-col overflow-hidden">
                          {/* Header */}
                          <div className="p-4 border-b border-slate-800">
                            <div className="flex flex-col md:flex-row md:items-center gap-4">
                              <div className="flex-1 relative">
                                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                                <input
                                  type="text"
                                  placeholder="搜索 Campaign Name..."
                                  className="w-full pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                  value={qualitySearchTerm}
                                  onChange={e => setQualitySearchTerm(e.target.value)}
                                />
                              </div>
                              <select 
                                className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                value={qualityPlatformFilter}
                                onChange={e => setQualityPlatformFilter(e.target.value as any)}
                              >
                                <option value="all">全部平台</option>
                                <option value="facebook">Meta</option>
                                <option value="google">Google</option>
                              </select>
                              <select 
                                className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                value={qualitySort}
                                onChange={e => setQualitySort(e.target.value as any)}
                              >
                                <option value="cost_desc">按花费降序</option>
                                <option value="date_desc">按日期降序</option>
                              </select>
                            </div>
                            <div className="mt-3 flex items-center justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest">
                              <span>未匹配数据 · {selectedQualityDimension}</span>
                              <span>{filteredQualityData.length.toLocaleString()} 条</span>
                            </div>
                          </div>

                          {/* List */}
                          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                            {filteredQualityData.length === 0 && (
                              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                                <CheckSquare className="w-12 h-12 mb-2 opacity-20" />
                                <p className="text-sm font-medium">暂无未匹配数据</p>
                              </div>
                            )}

                            {filteredQualityData.slice(0, 100).map((item, idx) => (
                              <div 
                                key={`${item.date}_${idx}`} 
                                className="bg-slate-800/70 border border-slate-700 rounded-2xl p-4 hover:border-slate-600 transition-all"
                              >
                                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                                  <div className="space-y-1 min-w-0 flex-1">
                                    <p className="text-xs font-black text-white truncate" title={item.campaignName}>
                                      {item.campaignName}
                                    </p>
                                    <div className="text-[11px] font-bold text-slate-400">
                                      {item.platform} · {item.date} · 花费 ${item.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </div>
                                    <div className="text-[11px] font-black text-amber-300">
                                      缺失维度：{selectedQualityDimension}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}

                            {filteredQualityData.length > 100 && (
                              <div className="text-center text-[10px] font-black text-slate-500 uppercase tracking-widest py-4">
                                仅展示前 100 条，请使用搜索和筛选功能
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  )}
                </div>
              )}

              {step === 'dashboard' && renderDashboardContent()}

            </div>
          </div>
        )}
      </main>
      <footer className="max-w-[1600px] mx-auto mt-24 pb-20 text-center text-slate-500 text-[10px] font-black border-t border-slate-800 pt-16">
        <p className="tracking-[0.4em] uppercase opacity-50">© 2025 Meta、Google Growth Scientist · Intelligence Suite · Aetherion Standard</p>
      </footer>
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #475569; border-radius: 10px; }
        .no-scrollbar-at-small::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* Formula Modal Overlay */}
      {isFormulaModalOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 w-full max-w-xl rounded-[32px] shadow-2xl p-8 animate-in fade-in zoom-in duration-300 border border-slate-800">
            <div className="flex items-center justify-between mb-6">
              <h4 className="text-xl font-black text-white">{formulaToEdit ? '编辑专家公式' : '构建全新公式'}</h4>
              <button onClick={() => { setIsFormulaModalOpen(false); setFormulaToEdit(null); }} className="p-2 hover:bg-slate-800 rounded-full transition text-slate-400"><X size={20} /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
              <div className="md:col-span-12 space-y-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block tracking-widest">指标名称</label>
                  <input type="text" className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 font-black outline-none focus:border-indigo-500 text-base text-white" placeholder="例如: ROAS" value={formulaInputName} onChange={e => setFormulaInputName(e.target.value)} />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase block tracking-widest">公式内容</label>
                    <button onClick={() => setFormulaInputText('')} className="text-[10px] font-black text-rose-400 uppercase hover:underline">清空</button>
                  </div>
                  <textarea className="w-full bg-slate-950 text-indigo-400 border border-slate-800 rounded-2xl p-5 font-mono font-bold outline-none focus:border-indigo-500 text-lg h-28 resize-none shadow-inner" placeholder="点击下方字段或符号开始构建..." value={formulaInputText} onChange={e => setFormulaInputText(e.target.value)} />
                </div>
              </div>
              <div className="md:col-span-7 space-y-3">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">基础指标 (Metrics)</p>
                <div className="grid grid-cols-2 gap-2 h-40 overflow-y-auto custom-scrollbar pr-1">
                  {BASE_METRICS.map(m => (
                    <button key={m} onClick={() => appendToFormula(m)} className="p-2 bg-slate-800 hover:bg-indigo-900/20 text-slate-200 hover:text-indigo-400 border border-slate-700 rounded-xl text-[7.5px] font-black uppercase text-left leading-tight min-h-[38px] transition-all">
                      {getLabelForKey(m)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="md:col-span-5 space-y-3">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">符号 (Ops)</p>
                <div className="grid grid-cols-3 gap-2">
                  {OPERATORS.map(op => (
                    <button key={op} onClick={() => appendToFormula(op)} className="flex h-10 items-center justify-center bg-slate-800 hover:bg-indigo-600 text-slate-200 hover:text-white rounded-xl font-black text-base transition-all">
                      {op}
                    </button>
                  ))}
                  <button onClick={() => {
                    const parts = formulaInputText.trim().split(' ');
                    parts.pop();
                    setFormulaInputText(parts.join(' ') + (parts.length > 0 ? ' ' : ''));
                  }} className="flex h-10 items-center justify-center bg-rose-900/20 hover:bg-rose-500 text-rose-400 hover:text-white rounded-xl font-black transition-all">
                    <Delete size={18} />
                  </button>
                </div>
              </div>
              <div className="md:col-span-12">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">数值单位 (Unit)</p>
                <div className="flex gap-3">
                  {['None', '$', '%'].map(unit => {
                    const val = unit === 'None' ? '' : unit;
                    return (
                      <button key={unit} onClick={() => setFormulaInputUnit(val as any)} className={`flex-1 py-3 rounded-xl text-xs font-black border-2 transition-all ${formulaInputUnit === val ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600'}`}>
                        {unit}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="mt-8 pt-6 border-t border-slate-800 flex gap-4">
              <button onClick={() => { setIsFormulaModalOpen(false); setFormulaToEdit(null); }} className="flex-1 py-4 font-black text-slate-400 text-xs hover:text-slate-200 transition">取消</button>
              <button onClick={handleSaveFormula} className="flex-[2] bg-indigo-600 text-white py-4 rounded-2xl font-black text-sm shadow-xl hover:bg-indigo-700 transition-all active:scale-95">保存配置</button>
            </div>
          </div>
        </div>
      )}

      {/* Rules Explanation Modal */}
      {isRulesModalOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 w-full max-w-2xl rounded-[32px] shadow-2xl p-8 animate-in fade-in zoom-in duration-300 border border-slate-800 max-h-[80vh] overflow-y-auto custom-scrollbar">
            <div className="flex items-center justify-between mb-6">
              <h4 className="text-xl font-black text-white flex items-center gap-3">
                <HelpCircle className="text-indigo-400" size={24} />
                匹配规则说明
              </h4>
              <button onClick={() => setIsRulesModalOpen(false)} className="p-2 hover:bg-slate-800 rounded-full transition text-slate-400">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-6">
              {/* Intro */}
              <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-5">
                <p className="text-sm text-slate-300 leading-relaxed">
                  每个维度可选择 <span className="font-black text-indigo-400">直接取值</span>，或按 <span className="font-black text-indigo-400">下划线 _</span> / <span className="font-black text-indigo-400">中划线 -</span> 分段并指定索引位置来解析 Campaign/Ad Set/Ad 名称。
                </p>
              </div>

              {/* Current Rules */}
              {dimConfigs.length > 0 && (
                <div>
                  <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">当前配置的维度规则</h5>
                  <div className="space-y-3">
                    {dimConfigs.map((conf, idx) => (
                      <div key={idx} className="bg-slate-800/70 border border-slate-700 rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-black text-white">{conf.label}</span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase bg-slate-900 px-2 py-1 rounded">
                            {conf.source === 'platform' ? '平台' : conf.source === 'age' ? '年龄' : conf.source === 'gender' ? '性别' : conf.source.toUpperCase()}
                          </span>
                        </div>
                        {conf.source !== 'platform' && conf.source !== 'age' && conf.source !== 'gender' && (
                          <div className="flex items-center gap-4 text-xs text-slate-400">
                            {conf.index === -1 ? (
                              <span>取值方式: <span className="font-mono text-indigo-300">直接取值</span></span>
                            ) : (
                              <>
                                <span>分隔符: <span className="font-mono text-indigo-300">{conf.delimiter || '_'}</span></span>
                                <span>索引位置: <span className="font-mono text-indigo-300">{conf.index}</span></span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Example */}
              {namingSamples.campaign && (
                <div>
                  <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">解析示例</h5>
                  <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 space-y-4">
                    <div>
                      <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Campaign Name 示例</p>
                      <p className="text-sm font-mono text-emerald-400 break-all">{namingSamples.campaign}</p>
                    </div>
                    
                        {dimConfigs.filter(c => c.source === 'campaign' && c.source !== 'platform' && c.source !== 'age' && c.source !== 'gender').length > 0 && (
                          <div className="space-y-2">
                            <p className="text-[10px] font-black text-slate-500 uppercase">解析结果</p>
                            {(() => {
                              const campaignConf = dimConfigs.find(c => c.source === 'campaign');
                              const parts = namingSamples.campaign.split(campaignConf?.delimiter || '_');
                              return dimConfigs
                                .filter(c => c.source === 'campaign')
                                .map((conf, idx) => {
                              const value = conf.index === -1 ? namingSamples.campaign : (parts[conf.index] ?? 'N/A');
                              const isValid = value !== 'N/A' && value !== '';
                              return (
                                <div key={idx} className="flex items-center gap-3">
                                  <span className="text-xs font-mono text-slate-400">{conf.index === -1 ? '直接取值' : `索引 ${conf.index}`}</span>
                                  <ArrowRight size={12} className="text-slate-600" />
                                  <span className="text-xs font-bold text-slate-300">{conf.label}:</span>
                                  <span className={`text-xs font-mono ${isValid ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {value}
                                  </span>
                                  {isValid ? (
                                    <Check size={12} className="text-emerald-400" />
                                  ) : (
                                    <X size={12} className="text-red-400" />
                                  )}
                                </div>
                              );
                            });
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tips */}
              <div className="bg-indigo-900/20 border border-indigo-700/30 rounded-2xl p-5">
                <h5 className="text-xs font-black text-indigo-300 uppercase mb-3 flex items-center gap-2">
                  <Lightbulb size={14} />
                  优化建议
                </h5>
                <ul className="space-y-2 text-xs text-slate-300">
                  <li className="flex items-start gap-2">
                    <span className="text-indigo-400 mt-0.5">•</span>
                    <span>确保 Campaign/Ad 命名遵循统一的分隔符规则（建议全部使用下划线或中划线）</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-indigo-400 mt-0.5">•</span>
                    <span>维度信息应放在固定的索引位置，避免随意变动结构</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-indigo-400 mt-0.5">•</span>
                    <span>若发现大量未匹配数据，请在维度参数配置标签页调整分隔符或索引配置</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-slate-800">
              <button 
                onClick={() => setIsRulesModalOpen(false)}
                className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black text-sm shadow-xl hover:bg-indigo-700 transition-all active:scale-95"
              >
                知道了
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 保存透视报告弹窗 */}
      {isSavePivotModalOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 w-full max-w-md rounded-[32px] shadow-2xl p-8 animate-in fade-in zoom-in duration-300 border border-slate-800">
            <div className="flex items-center justify-between mb-6">
              <h4 className="text-xl font-black text-white">保存为新的报告</h4>
              <button onClick={() => { setIsSavePivotModalOpen(false); setPivotPresetNameInput(''); }} className="p-2 hover:bg-slate-800 rounded-full transition text-slate-400"><X size={20} /></button>
            </div>
            <div className="mb-6">
              <label className="text-[10px] font-black text-slate-400 uppercase mb-2 block tracking-widest">报告名称</label>
              <input
                type="text"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 font-black outline-none focus:border-indigo-500 text-base text-white"
                placeholder="例如：按国家+Campaign 成本透视"
                value={pivotPresetNameInput}
                onChange={e => setPivotPresetNameInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSavePivotPreset(); }}
              />
            </div>
            <div className="flex gap-4">
              <button onClick={() => { setIsSavePivotModalOpen(false); setPivotPresetNameInput(''); }} className="flex-1 py-3 rounded-xl font-black text-slate-400 text-xs hover:text-slate-200 transition">取消</button>
              <button onClick={handleSavePivotPreset} disabled={!pivotPresetNameInput.trim()} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-black text-sm hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed">确定</button>
            </div>
          </div>
        </div>
      )}

      {/* BI 指标卡配置弹窗 */}
      {isBiConfigOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 w-full max-w-lg rounded-[32px] shadow-2xl p-8 animate-in fade-in zoom-in duration-300 border border-slate-800">
            <div className="flex items-center justify-between mb-6">
              <h4 className="text-xl font-black text-white">BI 指标卡设置</h4>
              <button onClick={() => setIsBiConfigOpen(false)} className="p-2 hover:bg-slate-800 rounded-full transition text-slate-400"><X size={20} /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">已选指标</div>
                <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-1">
                  {biCardDraft.map(id => {
                    const option = biCardOptions.find(o => o.id === id);
                    if (!option) return null;
                    return (
                      <div key={id} className="flex items-center gap-3 bg-slate-800/60 border border-slate-700 rounded-2xl px-3 py-2">
                        <input
                          type="checkbox"
                          checked
                          onChange={() => {
                            if (biCardDraft.length <= 1) return;
                            setBiCardDraft(prev => prev.filter(x => x !== id));
                          }}
                        />
                        <span className="text-xs font-bold text-white flex-1">{option.label}</span>
                        <button onClick={() => movePivotListItem(biCardDraft, setBiCardDraft, id, 'up')} className="text-slate-400 hover:text-white"><ChevronUp size={14} /></button>
                        <button onClick={() => movePivotListItem(biCardDraft, setBiCardDraft, id, 'down')} className="text-slate-400 hover:text-white"><ChevronDown size={14} /></button>
                      </div>
                    );
                  })}
                  {biCardDraft.length === 0 && (
                    <div className="text-[10px] text-slate-500 px-2 py-3">至少保留一个指标卡</div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">未选指标</div>
                <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-1">
                  {biCardOptions.filter(o => !biCardDraft.includes(o.id)).map(o => (
                    <div key={o.id} className="flex items-center gap-3 bg-slate-900/50 border border-slate-800 rounded-2xl px-3 py-2 opacity-80 hover:opacity-100 transition">
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={() => setBiCardDraft(prev => [...prev, o.id])}
                      />
                      <span className="text-xs font-bold text-slate-300 flex-1">{o.label}</span>
                    </div>
                  ))}
                  {biCardOptions.filter(o => !biCardDraft.includes(o.id)).length === 0 && (
                    <div className="text-[10px] text-slate-500 px-2 py-3">暂无可添加指标</div>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-8 pt-6 border-t border-slate-800 flex gap-4">
              <button onClick={() => setIsBiConfigOpen(false)} className="flex-1 py-4 font-black text-slate-400 text-xs hover:text-slate-200 transition">取消</button>
              <button
                onClick={() => {
                  setBiCardOrder(biCardDraft);
                  void saveBiConfigToCloud(biCardDraft);
                  setIsBiConfigOpen(false);
                }}
                className="flex-[2] bg-indigo-600 text-white py-4 rounded-2xl font-black text-sm shadow-xl hover:bg-indigo-700 transition-all active:scale-95"
              >
                保存配置
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Project Selector Modal */}
      {isProjectModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setIsProjectModalOpen(false)}>
          <div className="bg-slate-900 rounded-[32px] w-full max-w-lg mx-4 shadow-2xl overflow-hidden border border-slate-800" onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-xl font-black text-white">选择项目</h3>
              <button onClick={() => setIsProjectModalOpen(false)} className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center hover:bg-slate-700 transition text-slate-400">
                <X size={18} />
              </button>
            </div>

            {/* Search Input */}
            <div className="p-4 border-b border-slate-800">
              <div className="relative">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="搜索项目名称..."
                  value={projectSearchTerm}
                  onChange={e => setProjectSearchTerm(e.target.value)}
                  className="w-full bg-slate-800 rounded-2xl pl-12 pr-4 py-3 font-bold text-white outline-none focus:ring-2 focus:ring-indigo-900/50 transition"
                  autoFocus
                />
              </div>
            </div>

            {/* Project List */}
            <div className="max-h-[400px] overflow-y-auto">
              {isLoadingProjects ? (
                <div className="py-16 flex flex-col items-center justify-center">
                  <RefreshCcw size={24} className="animate-spin text-indigo-400 mb-4" />
                  <p className="text-slate-400 font-bold text-sm">加载项目列表...</p>
                </div>
              ) : projectList.length === 0 ? (
                <div className="py-16 text-center">
                  <p className="text-slate-400 font-bold">暂无可用项目</p>
                </div>
              ) : (
                <div className="p-2">
                  {projectList
                    .filter(p => p.projectName.toLowerCase().includes(projectSearchTerm.toLowerCase()))
                    .map(project => (
                      <button
                        key={project.projectId}
                        onClick={() => handleProjectSelect(project)}
                        className={`w-full flex items-center gap-4 p-4 rounded-2xl transition mb-1 text-left ${selectedProject?.projectId === project.projectId
                          ? 'bg-indigo-900/20 border-2 border-indigo-700'
                          : 'hover:bg-slate-800 border-2 border-transparent'
                          }`}
                      >
                        {/* Project Icon */}
                        {project.iconUrl ? (
                          <img src={project.iconUrl} alt="" className="w-12 h-12 rounded-xl object-cover bg-slate-800" />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-black text-lg">
                            {project.projectName.charAt(0).toUpperCase()}
                          </div>
                        )}
                        {/* Project Info */}
                        <div className="flex-1 min-w-0">
                          <p className="font-black text-white truncate">{project.projectName}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-bold text-slate-400">ID: {project.projectId}</span>
                            {project.adsCostReport && (
                              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-900/20 px-2 py-0.5 rounded">广告报告</span>
                            )}
                            {project.hasWaring && (
                              <span className="text-[10px] font-bold text-orange-400 bg-orange-900/20 px-2 py-0.5 rounded">有告警</span>
                            )}
                          </div>
                        </div>
                        {/* Check Mark */}
                        {selectedProject?.projectId === project.projectId && (
                          <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center">
                            <Check size={16} className="text-white" strokeWidth={3} />
                          </div>
                        )}
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
