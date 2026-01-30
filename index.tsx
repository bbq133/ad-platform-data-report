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
  LogOut
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
import { fetchAllPlatformsData, transformApiDataToRawData, fetchProjectList, extractUniqueAccounts } from './api-service';
import LoginPage from './LoginPage'; // New: Import LoginPage
import { getUserSession, saveUserSession, clearUserSession, filterProjectsByKeywords, UserInfo, fetchSystemConfig, saveSystemConfig, getSystemConfig } from './auth-service'; // New: Import auth services

// --- Types ---

interface RawDataRow {
  [key: string]: any;
}

interface MappingConfig {
  [key: string]: string | undefined;
}

interface FormulaField {
  id: string;
  name: string;
  formula: string;
  unit: '' | '%' | '$';
  isDefault?: boolean;
}

interface DimensionConfig {
  label: string;
  source: 'campaign' | 'adSet' | 'ad' | 'platform';
  index: number;
  delimiter?: string;
}

const INITIAL_DIMENSIONS = [
  "国家", "广告类型", "AI vs AO",
  "兴趣组人群", "素材类型", "素材内容", "折扣类型", "视觉类型", "视觉细节"
];

const BASE_METRICS = [
  'cost', 'leads', 'impressions', 'reach', 'clicks', 'linkClicks',
  'conversionValue', 'conversion', 'addToCart',
  'landingPageViews', 'checkout', 'subscribe'
];

const OPERATORS = ['(', ')', '+', '-', '*', '/', '1000', '100'];

// MOCK_PROJECTS 已由 API 替代
const MOCK_ACCOUNTS: { id: string; name: string; type: string }[] = [];

const DEFAULT_FORMULAS: FormulaField[] = [
  { id: 'f_cpm', name: 'CPM', formula: '(impressions / cost) * 1000', unit: '$', isDefault: true },
  { id: 'f_cpc', name: 'CPC', formula: 'cost / linkClicks', unit: '$', isDefault: true },
  { id: 'f_ctr', name: 'CTR', formula: 'linkClicks / impressions', unit: '%', isDefault: true },
  { id: 'f_cpatc', name: 'CPATC', formula: 'cost / addToCart', unit: '$', isDefault: true },
  { id: 'f_freq', name: 'Frequency', formula: 'impressions / reach', unit: '', isDefault: true },
  { id: 'f_aov', name: 'AOV', formula: 'conversionValue / conversion', unit: '$', isDefault: true },
  { id: 'f_cpc', name: 'Cost per checkout', formula: 'cost / checkout', unit: '$', isDefault: true },
  { id: 'f_cps', name: 'Cost per subscription', formula: 'cost / subscribe', unit: '$', isDefault: true },
];

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
    setHeaders([]);
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
    setFormulas(DEFAULT_FORMULAS);
    setCustomMetricLabels({});
    setMappings({
      facebook: {
        platform: '', campaign: '', adSet: '', ad: '', cost: '', leads: '', impressions: '', reach: '', clicks: '', linkClicks: '', date: '',
        conversionValue: '', conversion: '', addToCart: '', landingPageViews: '', checkout: '', subscribe: ''
      },
      google: {
        platform: '', campaign: '', adSet: '', ad: '', cost: '', impressions: '', reach: '', clicks: '', linkClicks: '', date: '',
        conversionValue: '', conversion: '', addToCart: '', landingPageViews: ''
      }
    });
  };

  // --- State for App ---
  const [step, setStep] = useState<'upload' | 'mapping' | 'dashboard' | 'dataSourceConfig'>('upload'); // Added dataSourceConfig step
  const [rawData, setRawData] = useState<RawDataRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);

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

  const [customMetricLabels, setCustomMetricLabels] = useState<Record<string, string>>({});
  const [newMetricName, setNewMetricName] = useState('');
  const [isAddingMetric, setIsAddingMetric] = useState(false);

  const getLabelForKey = (key: string) => {
    const labels: Record<string, string> = {
      platform: 'Platform Identification',
      campaign: 'Campaign Name', adSet: 'Ad Set Name', ad: 'Ad Name', cost: 'Amount spent (USD)', leads: 'Leads',
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

  const [mappings, setMappings] = useState<Record<'facebook' | 'google', MappingConfig>>({
    facebook: {
      platform: '', campaign: '', adSet: '', ad: '', cost: '', leads: '', impressions: '', reach: '', clicks: '', linkClicks: '', date: '',
      conversionValue: '', conversion: '', addToCart: '', landingPageViews: '', checkout: '', subscribe: ''
    },
    google: {
      platform: '', campaign: '', adSet: '', ad: '', cost: '', impressions: '', reach: '', clicks: '', linkClicks: '', date: '',
      conversionValue: '', conversion: '', addToCart: '', landingPageViews: ''
    }
  });

  const handleAddMetric = () => {
    if (!newMetricName.trim()) return;
    const key = `custom_${Date.now()}`;
    setCustomMetricLabels(prev => ({ ...prev, [key]: newMetricName.trim() }));
    // 为所有平台增加这个对齐槽位
    setMappings(prev => ({
      facebook: { ...prev.facebook, [key]: '' },
      google: { ...prev.google, [key]: '' }
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
      google: { ...prev.google, [key]: undefined }
    }));
  };

  const [allDimensions, setAllDimensions] = useState<string[]>(INITIAL_DIMENSIONS);
  const [dimConfigs, setDimConfigs] = useState<DimensionConfig[]>([]);
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
  const [isFieldConfigOpen, setIsFieldConfigOpen] = useState(false);
  const [fieldSearchTerm, setFieldSearchTerm] = useState('');
  const [activeTableMetrics, setActiveTableMetrics] = useState<string[]>(['cost', 'leads', 'CPM', 'CTR', 'linkClicks']);
  const [dimFilters, setDimFilters] = useState<Record<string, string[]>>({});
  const [isDimFilterOpen, setIsDimFilterOpen] = useState(false);
  const [dimValueSearch, setDimValueSearch] = useState('');

  const dashboardRef = useRef<HTMLDivElement>(null);
  const metricDropdownRef = useRef<HTMLDivElement>(null);
  const fieldConfigRef = useRef<HTMLDivElement>(null);
  const dimFilterRef = useRef<HTMLDivElement>(null);

  const allAvailableMetrics = useMemo(() => {
    const baseKeys = [...BASE_METRICS, ...Object.keys(customMetricLabels)];
    const base = baseKeys.map(m => ({ key: m, label: getLabelForKey(m) }));
    const calc = formulas.map(f => ({ key: f.name, label: f.name }));
    return [...base, ...calc];
  }, [formulas, customMetricLabels]);

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
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Extract samples for the current platform
  const namingSamples = useMemo(() => {
    if (!rawData.length) return { campaign: '', adSet: '', ad: '' };
    const curMap = mappings[activePlatformTab];
    return {
      campaign: String(rawData[0][curMap.campaign] || ''),
      adSet: String(rawData[0][curMap.adSet] || ''),
      ad: String(rawData[0][curMap.ad] || '')
    };
  }, [rawData, mappings, activePlatformTab]);

  // Core Data Processing with Global Filter Support
  const baseProcessedData = useMemo(() => {
    if (!rawData.length) return [];
    const platformHeader = mappings.facebook.platform || mappings.google.platform || '';
    const dates = new Set<string>();

    const processed = rawData.map(row => {
      const rowPlatformVal = platformHeader ? String(row[platformHeader] || '').toUpperCase() : '';
      const isGoogleRow = rowPlatformVal.includes('GOOGLE');
      const curMap = isGoogleRow ? mappings.google : mappings.facebook;

      const context: Record<string, number> = {};
      Object.keys(curMap).forEach(key => {
        if (['campaign', 'adSet', 'ad', 'date', 'platform'].includes(key)) return;
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
        const sourceCol = curMap[conf.source as keyof MappingConfig];
        const sourceVal = String(row[sourceCol] || '');
        if (conf.source === 'platform') {
          dims[conf.label] = sourceVal || 'N/A';
        } else {
          const parts = sourceVal.split(conf.delimiter || '_');
          dims[conf.label] = parts[conf.index] || 'N/A';
        }
      });

      return {
        _date: dateVal,
        _isGoogle: isGoogleRow,
        _dims: dims,
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

  const autoMap = (hdrs: string[]) => {
    const findMatch = (targets: string[]) =>
      hdrs.find(k => targets.some(t => k.toLowerCase().includes(t.toLowerCase()))) || '';

    const baseMapping = {
      platform: findMatch(['platform', 'source']),
      campaign: findMatch(['campaign name', 'campaign']),
      adSet: findMatch(['ad set name', 'adset']),
      ad: findMatch(['ad name', 'creative']),
      cost: findMatch(['amount spent', 'spend', 'cost']),
      impressions: findMatch(['impressions']),
      reach: findMatch(['reach']),
      clicks: findMatch(['all clicks', 'clicks (all)']),
      linkClicks: findMatch(['link clicks', 'clicks']),
      date: findMatch(['day', 'date']),
      conversionValue: findMatch(['conversion value', 'purchase value', 'conversionvalue']),
      conversion: findMatch(['conversion', 'conversions', 'purchases', 'purchase']),
      addToCart: findMatch(['add to cart', 'atc', 'addtocart']),
      landingPageViews: findMatch(['landing page views', 'landingpageviews']),
    };

    const facebookMapping = {
      ...baseMapping,
      leads: findMatch(['leads', 'results']),
      checkout: findMatch(['checkout', 'checkouts']),
      subscribe: findMatch(['subscribe', 'subscription', 'subscriptions']),
    } as MappingConfig;

    const googleMapping = {
      ...baseMapping
    } as MappingConfig;

    // Preserve existing custom metrics
    Object.keys(customMetricLabels).forEach(key => {
      facebookMapping[key] = mappings.facebook[key] || '';
      googleMapping[key] = mappings.google[key] || '';
    });

    setMappings({ facebook: facebookMapping, google: googleMapping });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    const processData = (data: RawDataRow[]) => {
      setRawData(data);
      if (data.length > 0) {
        const hdrs = Object.keys(data[0] || {});
        setHeaders(hdrs);
        autoMap(hdrs);
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
      const apiData = await fetchAllPlatformsData(
        selectedProject.projectId,
        apiDateRange.start,
        apiDateRange.end,
        selectedAccounts.length > 0 ? selectedAccounts : undefined
      );

      if (apiData.length === 0) {
        setApiError('未获取到数据，请检查筛选条件或选择其他日期范围');
        setIsLoadingData(false);
        return;
      }

      const transformed = transformApiDataToRawData(apiData);
      setRawData(transformed);

      if (transformed.length > 0) {
        const hdrs = Object.keys(transformed[0] || {});
        setHeaders(hdrs);
        autoMap(hdrs);

        const accounts = extractUniqueAccounts(apiData);
        setAvailableAccounts(accounts);

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

  const activeFiltersCount = useMemo(() => {
    return (Object.values(dimFilters) as string[][]).reduce((acc: number, curr: string[]) => acc + (curr.length > 0 ? 1 : 0), 0);
  }, [dimFilters]);

  // Conditional rendering for LoginPage
  if (!isLoggedIn) {
    return <LoginPage onLoginSuccess={handleLogin} />;
  }

  // Helper function to render the dashboard content
  const renderDashboardContent = () => (
    <div ref={dashboardRef} className="space-y-12 pb-24 animate-in fade-in duration-1000">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-6">
        {[
          { label: 'Total Cost', value: `$${filteredData.reduce((s, r) => s + (r._metrics.cost || 0), 0).toLocaleString()}`, sub: '-12.4% vs last period', trend: 'down' },
          { label: 'Total Leads', value: filteredData.reduce((s, r) => s + (r._metrics.leads || 0), 0).toLocaleString(), sub: '+8.2% vs last period', trend: 'up' },
          { label: 'Avg CPL', value: `$${(filteredData.reduce((s, r) => s + (r._metrics.cost || 0), 0) / (filteredData.reduce((s, r) => s + (r._metrics.leads || 0), 0) || 1)).toFixed(2)}`, sub: '-4.1% vs last period', trend: 'down' },
          { label: 'Avg CTR', value: `${(filteredData.reduce((s, r) => s + (r._metrics.linkClicks || 0), 0) / (filteredData.reduce((s, r) => s + (r._metrics.impressions || 0), 0) || 1) * 100).toFixed(2)}%`, sub: '-2.1% vs last period', trend: 'down' },
          { label: 'Sub Rate', value: `${(filteredData.reduce((s, r) => s + (r._metrics.leads || 0), 0) / (filteredData.reduce((s, r) => s + (r._metrics.linkClicks || 0), 0) || 1) * 100).toFixed(2)}%`, sub: '+0.4% vs last period', trend: 'up' },
        ].map((k, idx) => (
          <div key={idx} className="bg-slate-900/50 p-8 rounded-[40px] border border-slate-800 shadow-sm flex flex-col justify-between h-44 hover:shadow-xl transition-all group">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{k.label}</span>
            <div>
              <span className="text-3xl font-black text-white tracking-tight">{k.value}</span>
              <p className={`text-[10px] font-black mt-2 flex items-center gap-1 ${k.trend === 'up' ? 'text-emerald-500' : 'text-rose-500'}`}>
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

      {/* Dimension Analysis Section */}
      <div className="bg-slate-900/50 p-12 rounded-[56px] border border-slate-800 shadow-sm relative overflow-visible">
        <div className="flex flex-col md:flex-row md:items-start justify-between mb-10 gap-8 border-b border-slate-800 pb-10 relative overflow-visible">
          <div className="flex flex-col gap-1">
            <h3 className="text-3xl font-black text-white tracking-tight leading-tight">维度分析</h3>
            <p className="text-slate-400 text-[11px] font-black uppercase tracking-[0.2em]">Dimension-Wise Performance Table</p>
          </div>

          {/* Layout group for tabs and tool buttons */}
          <div className="flex items-center gap-4">
            {/* Dimension Tab Selector */}
            <div className="flex items-center gap-1.5 p-1.5 bg-slate-800 border border-slate-700 rounded-[32px] shadow-inner max-w-full overflow-x-auto no-scrollbar">
              {dimConfigs.map((dim) => (
                <button key={dim.label} onClick={() => setActiveDashboardDim(dim.label)} className={`px-6 py-2.5 rounded-[24px] text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${activeDashboardDim === dim.label ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'}`}>
                  {dim.label}
                </button>
              ))}
            </div>

            {/* Tool Buttons Container */}
            <div className="flex items-center gap-2">
              {/* Filter Button */}
              <div className="relative" ref={dimFilterRef}>
                <button onClick={() => setIsDimFilterOpen(!isDimFilterOpen)} className={`p-3 rounded-2xl border transition shadow-sm h-[44px] w-[44px] flex items-center justify-center ${(dimFilters[activeDashboardDim]?.length > 0) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'}`} title="筛选维度值">
                  <Filter size={18} />
                </button>
                {isDimFilterOpen && (
                  <div className="absolute top-full right-0 mt-3 w-72 bg-slate-900 rounded-[32px] shadow-2xl border border-slate-800 p-6 animate-in fade-in zoom-in duration-200 origin-top-right z-[100]">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[12px] font-black text-white">维度值筛选</span>
                      <button onClick={toggleSelectAllDimValues} className="text-[10px] font-black text-indigo-400 hover:underline">{dimFilters[activeDashboardDim]?.length === currentDimValues.length ? '取消全选' : '全选'}</button>
                    </div>
                    <div className="relative mb-4">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                      <input type="text" placeholder="搜索维度值..." className="w-full bg-slate-800 border border-slate-700 rounded-xl py-2 pl-9 pr-3 text-[11px] outline-none text-white" value={dimValueSearch} onChange={e => setDimValueSearch(e.target.value)} />
                    </div>
                    <div className="max-h-60 overflow-y-auto custom-scrollbar pr-1 space-y-1">
                      {currentDimValues.filter(v => v.toLowerCase().includes(dimValueSearch.toLowerCase())).map(val => (
                        <button key={val} onClick={() => toggleDimValueFilter(val)} className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-slate-800 transition text-left">
                          <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${(dimFilters[activeDashboardDim] || []).includes(val) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-700'}`}>
                            {(dimFilters[activeDashboardDim] || []).includes(val) && <Check size={10} className="text-white" strokeWidth={4} />}
                          </div>
                          <span className="text-[11px] font-bold text-slate-200 truncate">{val}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Settings Button */}
              <div className="relative" ref={fieldConfigRef}>
                <button onClick={() => setIsFieldConfigOpen(!isFieldConfigOpen)} className="bg-slate-800 p-3 rounded-2xl border border-slate-700 hover:bg-slate-700 transition shadow-sm text-slate-400 hover:text-slate-200 h-[44px] w-[44px] flex items-center justify-center" title="配置指标显示">
                  <SettingsIcon size={18} />
                </button>
                {isFieldConfigOpen && (
                  <div className="absolute top-full right-0 mt-3 w-80 bg-slate-900 rounded-[32px] shadow-2xl border border-slate-800 p-6 animate-in fade-in zoom-in duration-200 origin-top-right z-[100]">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${activeTableMetrics.length === allAvailableMetrics.length ? 'bg-indigo-600 border-indigo-600' : 'border-slate-700'}`}
                          onClick={() => {
                            if (activeTableMetrics.length === allAvailableMetrics.length) setActiveTableMetrics(['cost', 'leads']);
                            else setActiveTableMetrics(allAvailableMetrics.map(m => m.key));
                          }}>
                          <Check size={12} className="text-white" />
                        </div>
                        <span className="text-[13px] font-black text-white">已选列表</span>
                      </div>
                      <span className="text-[11px] font-black text-slate-400">({activeTableMetrics.length}/{allAvailableMetrics.length})</span>
                    </div>
                    <div className="relative mb-5">
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                      <input type="text" placeholder="搜索指标..." className="w-full bg-slate-800 border border-slate-700 rounded-xl py-3 pl-10 pr-4 text-[13px] outline-none focus:border-indigo-400 transition-all shadow-inner text-white" value={fieldSearchTerm} onChange={(e) => setFieldSearchTerm(e.target.value)} />
                    </div>
                    <div className="max-h-80 overflow-y-auto custom-scrollbar pr-2 space-y-1">
                      {allAvailableMetrics.filter(m => m.label.toLowerCase().includes(fieldSearchTerm.toLowerCase())).map((m) => (
                        <button key={m.key} onClick={() => toggleTableMetric(m.key)} className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-slate-800 transition-all group text-left">
                          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${activeTableMetrics.includes(m.key) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-700'}`}>
                            {activeTableMetrics.includes(m.key) && <Check size={12} className="text-white" strokeWidth={3} />}
                          </div>
                          <span className={`text-[12px] font-bold flex-1 truncate ${activeTableMetrics.includes(m.key) ? 'text-white' : 'text-slate-400'}`}>{m.label}</span>
                          <GripVertical size={14} className="text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto custom-scrollbar no-scrollbar-at-small pb-4">
          <table className="w-full text-left border-separate border-spacing-y-4 min-w-[1000px]">
            <thead>
              <tr>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest sticky left-0 bg-slate-900/50 z-20 min-w-[200px]">Dimension Value</th>
                {activeTableMetrics.map(mKey => (
                  <th key={mKey} className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right whitespace-nowrap">
                    {allAvailableMetrics.find(a => a.key === mKey)?.label || mKey}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableData.length > 0 ? (
                tableData.map((row, idx) => (
                  <tr key={idx} className="bg-slate-800/50 hover:bg-slate-800 transition-all group rounded-3xl border border-transparent hover:border-slate-700 hover:shadow-xl hover:shadow-slate-900/10">
                    <td className="px-6 py-6 font-black text-white text-xs rounded-l-[24px] sticky left-0 bg-inherit z-10 group-hover:bg-slate-800 shadow-[10px_0_15px_-10px_rgba(0,0,0,0.05)]">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-[10px] font-black text-slate-400">{idx + 1}</div>
                        <span className="truncate max-w-[240px]">{row.label}</span>
                      </div>
                    </td>
                    {activeTableMetrics.map((mKey, mIdx) => {
                      const val = row[mKey] || 0;
                      const isLast = mIdx === activeTableMetrics.length - 1;
                      const isFinancial = mKey.toLowerCase().includes('cost') || mKey.toLowerCase().includes('value') || mKey.toLowerCase().includes('cpm') || mKey.toLowerCase().includes('cpc');
                      return (
                        <td key={mKey} className={`px-6 py-6 text-right font-black text-xs ${isLast ? 'rounded-r-[24px]' : ''} ${isFinancial ? 'text-white' : 'text-slate-300'}`}>
                          {isFinancial ? `$${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : val.toLocaleString()}
                        </td>
                      );
                    })}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={activeTableMetrics.length + 1} className="px-6 py-20 text-center text-slate-500 font-black uppercase tracking-[0.2em] text-[10px]">No data available for the selected dimension and filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-slate-900/50 p-12 rounded-[56px] border border-slate-800 shadow-sm overflow-hidden relative">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-indigo-900/50 text-indigo-400 rounded-2xl flex items-center justify-center"><Zap size={20} /></div>
            <div>
              <h3 className="text-2xl font-black text-white tracking-tight">AI 智能全维度诊断报告</h3>
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
            {/* Header controls for report view */}
            <div className="flex flex-col gap-6 mb-8">
              <button
                onClick={() => setSelectedProject(null)}
                className="self-start flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors group mb-4"
              >
                <ArrowRight className="w-4 h-4 rotate-180 group-hover:-translate-x-1 transition-transform" />
                Back to Projects
              </button>

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                    {selectedProject.iconUrl && <img src={selectedProject.iconUrl} className="w-8 h-8" />}
                    {selectedProject.projectName}
                  </h2>
                  <p className="text-slate-400 text-sm mt-1">Growth Scientist Analysis Report</p>
                </div>

                <div className="flex items-center gap-3 bg-slate-900/50 p-1.5 rounded-xl border border-slate-800">
                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-800 rounded-lg border border-slate-700">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-medium">{dateRange.start}</span>
                    <ArrowRight className="w-3 h-3 text-slate-600" />
                    <span className="text-sm font-medium">{dateRange.end}</span>
                  </div>
                  {/* Refresh Button */}
                  <button
                    onClick={handleLoadDataFromApi}
                    disabled={isLoadingData}
                    className="p-2 hover:bg-indigo-600 hover:text-white rounded-lg text-indigo-400 transition-colors disabled:opacity-50"
                    title="Refresh Data"
                  >
                    <div className={isLoadingData ? "animate-spin" : ""}>
                      <Database className="w-4 h-4" />
                    </div>
                  </button>
                </div>
              </div>
            </div>

            {/* --- Data Source Config Removed as requested in previous task, integrating directly --- */}

            {/* --- Main Dashboard Content --- */}
            {/* Reuse existing dashboard layout but ensure it's wrapped properly */}
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

                  {/* Top Row: Metrics & Formulas */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                    {/* Left: Metric Mapping */}
                    <div className="bg-slate-900/50 border border-slate-800 rounded-[48px] p-12 shadow-2xl space-y-12">
                      <div className="flex items-center justify-between">
                        <h3 className="text-2xl font-black flex items-center gap-4 text-white"><Layers className="text-blue-400" /> 指标字段对齐</h3>
                        <div className="flex bg-slate-800 p-1 rounded-xl">
                          {['facebook', 'google'].map(p => (
                            <button key={p} onClick={() => setActivePlatformTab(p as any)} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${activePlatformTab === p ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400'}`}>
                              {p}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-6">
                        {Object.keys(mappings[activePlatformTab]).map(key => {
                          const val = (mappings[activePlatformTab] as any)[key];
                          if (val === undefined) return null;
                          return (
                            <div key={key} className="space-y-2 group relative">
                              <div className="flex items-center justify-between">
                                <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">{getLabelForKey(key)}</label>
                                {key.startsWith('custom_') && (
                                  <button onClick={() => handleRemoveMetric(key)} className="opacity-0 group-hover:opacity-100 text-slate-700 hover:text-red-500 transition-all p-1">
                                    <Trash2 size={10} />
                                  </button>
                                )}
                              </div>
                              <select className="w-full bg-slate-800 border-2 border-slate-700 rounded-2xl p-4 text-[11px] font-black outline-none text-white" value={val || ''} onChange={e => {
                                const val = e.target.value;
                                setMappings(p => ({ ...p, [activePlatformTab]: { ...p[activePlatformTab], [key]: val } }));
                              }}>
                                <option value="">未选择 (Unmapped)</option>
                                {headers.map(h => <option key={h} value={h}>{h}</option>)}
                              </select>
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
                                className="flex-1 bg-slate-900 border-2 border-indigo-400 rounded-2xl p-3 text-[11px] font-black outline-none shadow-lg text-white"
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
                    <div className="bg-slate-900/50 border border-slate-800 rounded-[48px] p-12 shadow-2xl space-y-8 flex flex-col">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xl font-black flex items-center gap-4 text-white"><Calculator className="text-indigo-400" /> 公式字段配置</h3>
                        <button className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-[10px] font-black hover:bg-indigo-700 transition" onClick={() => openFormulaModal()}>+ 新增公式</button>
                      </div>
                      <div className="grid grid-cols-1 gap-4 flex-1 content-start">
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

                  {/* Bottom Row: Dimensions */}
                  <div className="bg-slate-900/50 border border-slate-800 rounded-[48px] p-12 shadow-2xl space-y-12">
                    <div className="flex items-center justify-between">
                      <h3 className="text-2xl font-black flex items-center gap-4 text-white"><Split className="text-purple-400" /> 维度深度解析</h3>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                      {/* Left Side: Samples */}
                      <div className="lg:col-span-1 bg-slate-800 rounded-3xl p-6 space-y-6 border border-slate-700 shadow-inner h-fit">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2"><TableIcon size={12} /> NAMING CONVENTION SAMPLES</p>
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

                      {/* Right Side: Dimension Rules */}
                      <div className="lg:col-span-2 space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                        {allDimensions.map(dim => {
                          const existing = dimConfigs.find(d => d.label === dim);
                          const currentSource = existing?.source || 'campaign';
                          const currentDelimiter = existing?.delimiter || '_';
                          const sampleStr = namingSamples[currentSource as 'campaign' | 'adSet' | 'ad'] || '';
                          const sampleParts = sampleStr ? sampleStr.split(currentDelimiter) : [];
                          return (
                            <div key={dim} className="flex flex-col md:flex-row md:items-center gap-4 p-5 bg-slate-800 rounded-3xl border border-slate-700 shadow-sm group hover:border-purple-700 transition-all relative">
                              <div className="md:w-32 flex items-center justify-between shrink-0">
                                <span className="text-[11px] font-black text-slate-200 uppercase tracking-widest">{dim}</span>
                                <button onClick={() => handleRemoveDimension(dim)} className="opacity-0 group-hover:opacity-100 text-slate-700 hover:text-red-500 transition-all p-1 mr-2">
                                  <Trash2 size={12} />
                                </button>
                              </div>
                              <div className="flex flex-1 gap-3">
                                <select className="flex-[3] bg-slate-900 text-[11px] font-black px-5 py-4 rounded-2xl border border-slate-700 outline-none appearance-none cursor-pointer focus:border-indigo-400 transition-colors text-white" value={existing?.source || ''} onChange={e => {
                                  const source = e.target.value as any;
                                  if (source) setDimConfigs(p => [...p.filter(x => x.label !== dim), { label: dim, source, index: existing?.index || 0 }]);
                                }}>
                                  <option value="">来源字段 (Source)</option>
                                  <option value="campaign">Campaign (Naming)</option>
                                  <option value="adSet">Ad Set (Naming)</option>
                                  <option value="ad">Ad (Naming)</option>
                                  <option value="platform">Platform</option>
                                </select>
                                <select className="flex-[1] min-w-[80px] bg-slate-900 text-[11px] font-black px-3 py-4 rounded-2xl border border-slate-700 outline-none appearance-none cursor-pointer focus:border-indigo-400 transition-colors text-center text-white" value={existing?.delimiter || '_'} onChange={e => {
                                  const delimiter = e.target.value;
                                  if (existing) setDimConfigs(p => [...p.filter(x => x.label !== dim), { ...existing, delimiter }]);
                                  else setDimConfigs(p => [...p, { label: dim, source: 'campaign', index: 0, delimiter }]);
                                }}>
                                  <option value="_">_</option>
                                  <option value="-">-</option>
                                </select>
                                <select className="flex-[2] min-w-[140px] bg-slate-900 text-[11px] font-black px-5 py-4 rounded-2xl border border-slate-700 outline-none appearance-none cursor-pointer focus:border-indigo-400 transition-colors text-white" value={existing?.index ?? ''} onChange={e => {
                                  const index = parseInt(e.target.value);
                                  if (!isNaN(index) && existing) setDimConfigs(p => [...p.filter(x => x.label !== dim), { ...existing, index }]);
                                  else if (!isNaN(index)) setDimConfigs(p => [...p, { label: dim, source: 'campaign', index, delimiter: '_' }]);
                                }}>
                                  <option value="">索引 (Index)</option>
                                  {sampleParts.length > 0 ? (
                                    sampleParts.map((part, i) => (
                                      <option key={i} value={i}>Part {i} ({part})</option>
                                    ))
                                  ) : (
                                    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => <option key={i} value={i}>{i}</option>)
                                  )}
                                </select>
                              </div>
                            </div>
                          );
                        })}

                        <div className="p-2">
                          {isAddingDimension ? (
                            <div className="flex items-center gap-4 p-5 bg-slate-800 rounded-3xl border-2 border-indigo-700 border-dashed animate-in fade-in zoom-in duration-300">
                              <span className="md:w-32 text-[10px] font-black text-indigo-400 uppercase tracking-widest shrink-0">New Dimension</span>
                              <div className="flex flex-1 gap-3">
                                <input
                                  autoFocus
                                  className="flex-1 bg-slate-900 border border-slate-700 rounded-2xl px-5 py-4 text-[11px] font-black outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-900/20 transition-all text-white"
                                  placeholder="输入自定义维度名称..."
                                  value={newDimensionName}
                                  onChange={e => setNewDimensionName(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') handleAddDimension();
                                    if (e.key === 'Escape') setIsAddingDimension(false);
                                  }}
                                />
                                <button onClick={handleAddDimension} className="bg-indigo-600 text-white px-6 rounded-2xl hover:bg-indigo-700 shadow-lg shadow-indigo-900/20 transition-all font-black text-xs min-w-[80px]">确认</button>
                                <button onClick={() => setIsAddingDimension(false)} className="bg-slate-900 text-slate-400 px-6 rounded-2xl hover:bg-slate-800 border border-slate-700 transition-all font-black text-xs min-w-[80px]">取消</button>
                              </div>
                            </div>
                          ) : (
                            <button onClick={() => setIsAddingDimension(true)} className="w-full py-5 border-2 border-dashed border-slate-700 rounded-3xl flex items-center justify-center gap-2 text-slate-400 hover:text-indigo-400 hover:border-indigo-700 hover:bg-indigo-900/20 transition-all font-black text-xs uppercase tracking-widest group">
                              <Plus size={16} className="group-hover:scale-110 transition-transform" /> 增加自定义维度
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="pt-8 border-t border-slate-800 flex gap-4">
                      <button onClick={() => setStep('dataSourceConfig')} className="bg-slate-800 text-slate-400 px-8 py-4 rounded-[24px] text-xs font-black">返回上一步</button>
                      <button onClick={() => setStep('dashboard')} className="flex-1 bg-indigo-600 text-white py-4 rounded-[24px] text-xs font-black shadow-xl hover:bg-indigo-700 transition-all">生成智投分析面板</button>
                    </div>
                  </div>
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
