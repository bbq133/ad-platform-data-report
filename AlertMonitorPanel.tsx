import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  AlertTriangle,
  Plus,
  Trash2,
  Edit3,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Play,
  Pause,
  Clock,
  Bell,
  History,
  Search,
  Users,
  FolderOpen,
  Send,
  Filter,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import {
  fetchFeishuDepartments, fetchFeishuUsers, fetchFeishuAllUsers, fetchFeishuUsersByIds,
  saveFeishuUserConfig, testAlertRule,
  type FeishuDepartment, type FeishuUser, type AlertRulePayload,
} from './api-service';
import type { ProjectOption } from './api-config';
import type { UserInfo } from './auth-service';
import { trackAlertRuleCreate, trackAlertRuleEdit, trackAlertRuleDelete, trackAlertRuleToggle, trackAlertRuleTest } from './tracking-service';

// --- Types ---

export interface AlertFilterRule {
  field: 'campaignName' | 'adsetName' | 'adName';
  operator: 'contains' | 'not_contains' | 'equals' | 'not_equals';
  value: string;
}

export interface AlertRule {
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
  filterRules: AlertFilterRule[];
  filterLogic: 'AND' | 'OR';
  lastTriggeredAt?: string;
  createdAt: string;
}

export interface AlertLog {
  ruleId: string;
  ruleName: string;
  triggeredAt: string;
  metric: string;
  dimension: string;
  matchedItems: { name: string; value: number }[];
  status: 'TRIGGERED' | 'SENT' | 'FAIL';
  recipients: string;
  errorMessage?: string;
}

export interface FormulaInfo {
  id: string;
  name: string;
  formula: string;
  unit: '' | '%' | '$';
}

interface Props {
  currentUser: UserInfo;
  selectedProject: ProjectOption;
  formulas: FormulaInfo[];
  rules: AlertRule[];
  setRules: React.Dispatch<React.SetStateAction<AlertRule[]>>;
  logs: AlertLog[];
  setLogs: React.Dispatch<React.SetStateAction<AlertLog[]>>;
  isLoading?: boolean;
}

// --- Constants ---

const PLATFORM_OPTIONS = [
  { value: 'facebook' as const, label: 'Meta (Facebook)' },
  { value: 'google' as const, label: 'Google' },
];

const DIMENSION_OPTIONS = [
  { value: 'campaign' as const, label: 'Campaign' },
  { value: 'adset' as const, label: 'Ad Set' },
  { value: 'ad' as const, label: 'Ad' },
];

const FILTER_FIELD_OPTIONS = [
  { value: 'campaignName' as const, label: 'Campaign Name' },
  { value: 'adsetName' as const, label: 'Ad Set Name' },
  { value: 'adName' as const, label: 'Ad Name' },
];

const FILTER_OPERATOR_OPTIONS = [
  { value: 'contains' as const, label: 'Contains' },
  { value: 'not_contains' as const, label: 'Not Contains' },
  { value: 'equals' as const, label: 'Equals' },
  { value: 'not_equals' as const, label: 'Not Equals' },
];

const BASE_METRIC_OPTIONS = [
  { value: 'cost', label: 'Cost (花费)' },
  { value: 'impressions', label: 'Impressions (展示)' },
  { value: 'clicks', label: 'Clicks (点击)' },
  { value: 'linkClicks', label: 'Link Clicks (链接点击)' },
  { value: 'conversion', label: 'Conversions (转化)' },
  { value: 'conversionValue', label: 'Conversion Value (转化价值)' },
  { value: 'reach', label: 'Reach (触达)' },
  { value: 'addToCart', label: 'Add to Cart (加购)' },
  { value: 'leads', label: 'Leads (线索)' },
];

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, '0');
  const m = i % 2 === 0 ? '00' : '30';
  return `${h}:${m}`;
});

function generateId() {
  return `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatDateTime(iso: string) {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

// --- Component ---

const AlertMonitorPanel: React.FC<Props> = ({
  currentUser,
  selectedProject,
  formulas,
  rules,
  setRules,
  logs,
  setLogs,
  isLoading = false,
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'rules' | 'history'>('rules');
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [testMessage, setTestMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formPlatform, setFormPlatform] = useState<'facebook' | 'google'>('facebook');
  const [formDimension, setFormDimension] = useState<'campaign' | 'adset' | 'ad'>('campaign');
  const [formMetric, setFormMetric] = useState('');
  const [formTriggerDirection, setFormTriggerDirection] = useState<'above' | 'below'>('below');
  const [formTriggerValue, setFormTriggerValue] = useState<string>('0');
  const [formLookbackDays, setFormLookbackDays] = useState<string>('7');
  const [formCheckTime, setFormCheckTime] = useState('09:00');
  const [formActive, setFormActive] = useState(true);
  const [formFilterRules, setFormFilterRules] = useState<AlertFilterRule[]>([]);
  const [formFilterLogic, setFormFilterLogic] = useState<'AND' | 'OR'>('OR');

  // Feishu user picker
  const [formFeishuUserIds, setFormFeishuUserIds] = useState<string[]>([]);
  const [feishuSubDepts, setFeishuSubDepts] = useState<FeishuDepartment[]>([]);
  const [feishuUsers, setFeishuUsers] = useState<FeishuUser[]>([]);
  const [feishuAllUsers, setFeishuAllUsers] = useState<FeishuUser[]>([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [feishuUserSearch, setFeishuUserSearch] = useState('');
  const [deptBreadcrumb, setDeptBreadcrumb] = useState<{ id: string; name: string }[]>([{ id: '0', name: '全公司' }]);
  const [selectedUserCache, setSelectedUserCache] = useState<Map<string, FeishuUser>>(new Map());

  const metricOptions = useMemo(() => {
    const formulaOpts = formulas.map(f => ({ value: f.name, label: f.name }));
    return [...BASE_METRIC_OPTIONS, ...formulaOpts];
  }, [formulas]);

  // --- Feishu contacts ---
  const loadDeptContents = async (deptId: string) => {
    setIsLoadingContacts(true);
    const [depts, users] = await Promise.all([
      fetchFeishuDepartments(deptId),
      fetchFeishuUsers(deptId),
    ]);
    setFeishuSubDepts(depts);
    setFeishuUsers(users);
    setSelectedUserCache(prev => {
      const next = new Map(prev);
      users.forEach(u => next.set(u.open_id, u));
      return next;
    });
    setIsLoadingContacts(false);
  };

  const navigateToDept = (dept: FeishuDepartment) => {
    setDeptBreadcrumb(prev => [...prev, { id: dept.open_department_id, name: dept.name || dept.open_department_id }]);
    setFeishuUserSearch('');
    loadDeptContents(dept.open_department_id);
  };

  const navigateBreadcrumb = (index: number) => {
    const target = deptBreadcrumb[index];
    setDeptBreadcrumb(prev => prev.slice(0, index + 1));
    setFeishuUserSearch('');
    loadDeptContents(target.id);
  };

  useEffect(() => {
    if (isFormOpen) {
      setDeptBreadcrumb([{ id: '0', name: '全公司' }]);
      loadDeptContents('0');
      fetchFeishuAllUsers().then(setFeishuAllUsers);
    }
  }, [isFormOpen]);

  // --- Save ---
  const saveRules = async (updatedRules: AlertRule[], updatedLogs?: AlertLog[]) => {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      const logsToSave = updatedLogs ?? logs;
      const payload = { rules: updatedRules, logs: logsToSave };
      const ok = await saveFeishuUserConfig(currentUser.username, selectedProject.projectId, 'dataAlerts', payload);
      if (ok) {
        setRules(updatedRules);
        if (updatedLogs) setLogs(updatedLogs);
        setSaveMessage({ type: 'success', text: '保存成功' });
      } else {
        setSaveMessage({ type: 'error', text: '保存失败，请重试' });
      }
    } catch (e) {
      console.error('Failed to save alert rules:', e);
      setSaveMessage({ type: 'error', text: '保存出错' });
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  // --- Form helpers ---
  const parseTriggerValue = (s: string): number => {
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  };
  const parseLookbackDays = (s: string): number => {
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? Math.min(90, Math.max(1, n)) : 7;
  };

  const resetForm = () => {
    setFormName('');
    setFormPlatform('facebook');
    setFormDimension('campaign');
    setFormMetric(metricOptions[0]?.value || '');
    setFormTriggerDirection('below');
    setFormTriggerValue('0');
    setFormLookbackDays('7');
    setFormCheckTime('09:00');
    setFormActive(true);
    setFormFilterRules([]);
    setFormFilterLogic('OR');
    setFormFeishuUserIds([]);
    setEditingRule(null);
  };

  const openNewForm = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const openEditForm = (rule: AlertRule) => {
    setEditingRule(rule);
    setFormName(rule.name);
    setFormPlatform(rule.platform);
    setFormDimension(rule.dimension);
    setFormMetric(rule.metric);
    setFormTriggerDirection(rule.triggerDirection);
    setFormTriggerValue(String(rule.triggerValue));
    setFormLookbackDays(String(rule.lookbackDays));
    setFormCheckTime(rule.checkTime);
    setFormActive(rule.active);
    setFormFilterRules(rule.filterRules.map(r => ({ ...r })));
    setFormFilterLogic(rule.filterLogic);
    setFormFeishuUserIds([...rule.feishuUserIds]);
    setIsFormOpen(true);
    // 按 open_id 拉取收件人姓名，避免重新进入时只显示 ID
    if (rule.feishuUserIds.length > 0) {
      fetchFeishuUsersByIds(rule.feishuUserIds).then(users => {
        setSelectedUserCache(prev => {
          const next = new Map(prev);
          users.forEach(u => next.set(u.open_id, u));
          return next;
        });
      }).catch(() => {});
    }
  };

  const handleSaveForm = async () => {
    if (!formName.trim()) return;
    if (formFeishuUserIds.length === 0) {
      setSaveMessage({ type: 'error', text: '请选择至少一个飞书收件人' });
      setTimeout(() => setSaveMessage(null), 3000);
      return;
    }

    const ruleData: AlertRule = {
      id: editingRule?.id || generateId(),
      active: formActive,
      name: formName.trim(),
      platform: formPlatform,
      dimension: formDimension,
      metric: formMetric,
      triggerDirection: formTriggerDirection,
      triggerValue: parseTriggerValue(formTriggerValue),
      lookbackDays: parseLookbackDays(formLookbackDays),
      checkTime: formCheckTime,
      feishuUserIds: formFeishuUserIds,
      filterRules: formFilterRules.filter(r => r.value.trim()),
      filterLogic: formFilterLogic,
      lastTriggeredAt: editingRule?.lastTriggeredAt,
      createdAt: editingRule?.createdAt || new Date().toISOString(),
    };

    let updated: AlertRule[];
    if (editingRule) {
      trackAlertRuleEdit(currentUser.username, ruleData.name);
      updated = rules.map(r => r.id === editingRule.id ? ruleData : r);
    } else {
      trackAlertRuleCreate(currentUser.username, ruleData.name);
      updated = [...rules, ruleData];
    }

    await saveRules(updated);
    setIsFormOpen(false);
    resetForm();
  };

  const handleDeleteRule = async (ruleId: string) => {
    const rule = rules.find(r => r.id === ruleId);
    if (rule) trackAlertRuleDelete(currentUser.username, rule.name);
    const updated = rules.filter(r => r.id !== ruleId);
    await saveRules(updated);
  };

  const handleToggleActive = async (ruleId: string) => {
    const rule = rules.find(r => r.id === ruleId);
    if (rule) trackAlertRuleToggle(currentUser.username, rule.name, !rule.active);
    const updated = rules.map(r => r.id === ruleId ? { ...r, active: !r.active } : r);
    await saveRules(updated);
  };

  // --- Test alert ---
  const handleTestAlert = async () => {
    if (!formName.trim()) return;
    setIsTesting(true);
    setTestMessage(null);
    try {
      const payload: AlertRulePayload = {
        id: editingRule?.id || 'test_' + Date.now(),
        active: true,
        name: formName.trim(),
        platform: formPlatform,
        dimension: formDimension,
        metric: formMetric,
        triggerDirection: formTriggerDirection,
        triggerValue: parseTriggerValue(formTriggerValue),
        lookbackDays: parseLookbackDays(formLookbackDays),
        checkTime: formCheckTime,
        feishuUserIds: formFeishuUserIds,
        filterRules: formFilterRules.filter(r => r.value.trim()),
        filterLogic: formFilterLogic,
        createdAt: new Date().toISOString(),
      };
      const result = await testAlertRule(currentUser.username, selectedProject.projectId, payload);
      trackAlertRuleTest(currentUser.username, formName.trim(), !!result.triggered);
      if (result.triggered) {
        const count = result.matchedItems?.length || 0;
        setTestMessage({ type: 'success', text: `预警触发！共 ${count} 项匹配，飞书消息已发送` });
      } else {
        setTestMessage({ type: 'success', text: '未触发预警（当前数据未满足触发条件）' });
      }
    } catch (e: any) {
      setTestMessage({ type: 'error', text: e.message || '测试失败' });
    } finally {
      setIsTesting(false);
      setTimeout(() => setTestMessage(null), 5000);
    }
  };

  // --- Filter rules helpers ---
  const addFilterRule = () => {
    setFormFilterRules(prev => [...prev, { field: 'campaignName', operator: 'contains', value: '' }]);
  };

  const updateFilterRule = (index: number, updates: Partial<AlertFilterRule>) => {
    setFormFilterRules(prev => prev.map((r, i) => i === index ? { ...r, ...updates } : r));
  };

  const removeFilterRule = (index: number) => {
    setFormFilterRules(prev => prev.filter((_, i) => i !== index));
  };

  const toggleFeishuUser = (userId: string) => {
    setFormFeishuUserIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const currentDeptId = deptBreadcrumb[deptBreadcrumb.length - 1]?.id ?? '0';
  const feishuListSource = feishuAllUsers.length > 0 ? feishuAllUsers : feishuUsers;
  const filteredFeishuUsers = useMemo(() => {
    let list = feishuListSource;
    if (currentDeptId !== '0') {
      list = list.filter(u => u.department_ids && u.department_ids.includes(currentDeptId));
    }
    if (!feishuUserSearch.trim()) return list;
    const q = feishuUserSearch.toLowerCase();
    return list.filter(u =>
      (u.name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q)
    );
  }, [feishuListSource, currentDeptId, feishuUserSearch]);

  const getDimensionLabel = (d: string) => DIMENSION_OPTIONS.find(o => o.value === d)?.label ?? d;
  const getPlatformLabel = (p: string) => PLATFORM_OPTIONS.find(o => o.value === p)?.label ?? p;
  const getDirectionLabel = (d: string) => d === 'above' ? '高于' : '低于';
  const getOperatorLabel = (op: string) => FILTER_OPERATOR_OPTIONS.find(o => o.value === op)?.label ?? op;
  const getFieldLabel = (f: string) => FILTER_FIELD_OPTIONS.find(o => o.value === f)?.label ?? f;

  // --- Render ---

  if (isLoading) {
    return (
      <div className="bg-slate-900/50 p-10 rounded-[48px] border border-slate-800 shadow-sm">
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-400" />
          <span className="ml-3 text-slate-400 text-sm">加载预警规则...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/50 p-8 rounded-[48px] border border-slate-800 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-amber-400" />
            广告预警监控
          </h3>
          <p className="text-slate-400 text-[11px] font-black uppercase tracking-[0.2em] mt-1">
            Alert Monitor · Rules / Filters / Feishu Notification
          </p>
        </div>
        <button
          onClick={openNewForm}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-500 transition"
        >
          <Plus size={16} />
          新建预警规则
        </button>
      </div>

      {/* Save message */}
      {saveMessage && (
        <div className={`mb-4 px-4 py-2.5 rounded-xl text-sm font-bold ${saveMessage.type === 'success' ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-800' : 'bg-red-900/50 text-red-300 border border-red-800'}`}>
          {saveMessage.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 bg-slate-800/50 p-1 rounded-xl w-fit">
        {[
          { id: 'rules' as const, label: '预警规则', icon: Bell },
          { id: 'history' as const, label: '触发记录', icon: History },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === id ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <Icon size={14} />
            {label}
            {id === 'rules' && rules.length > 0 && (
              <span className="bg-indigo-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">{rules.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* --- Rules Tab --- */}
      {activeTab === 'rules' && (
        <div className="space-y-3">
          {rules.length === 0 && !isFormOpen && (
            <div className="text-center py-16 text-slate-500">
              <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="text-sm font-bold">暂无预警规则</p>
              <p className="text-xs mt-1">点击「新建预警规则」开始配置</p>
            </div>
          )}

          {rules.map(rule => (
            <div key={rule.id} className="bg-slate-800/60 rounded-2xl p-5 border border-slate-700/50 hover:border-slate-600 transition">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${rule.active ? 'bg-emerald-900/50 text-emerald-400' : 'bg-slate-700 text-slate-500'}`}>
                      {rule.active ? <Play size={10} /> : <Pause size={10} />}
                      {rule.active ? '运行中' : '已暂停'}
                    </span>
                    <h4 className="text-white font-bold text-sm truncate">{rule.name}</h4>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[11px]">
                    <span className="px-2 py-0.5 bg-slate-700/80 text-slate-300 rounded-md">{getPlatformLabel(rule.platform)}</span>
                    <span className="px-2 py-0.5 bg-slate-700/80 text-slate-300 rounded-md">{getDimensionLabel(rule.dimension)}</span>
                    <span className="px-2 py-0.5 bg-slate-700/80 text-slate-300 rounded-md">
                      {rule.metric} {getDirectionLabel(rule.triggerDirection)} {rule.triggerValue}
                    </span>
                    <span className="px-2 py-0.5 bg-slate-700/80 text-slate-300 rounded-md">近 {rule.lookbackDays} 天</span>
                    <span className="px-2 py-0.5 bg-slate-700/80 text-slate-300 rounded-md">每天 {rule.checkTime}</span>
                    {rule.filterRules.length > 0 && (
                      <span className="px-2 py-0.5 bg-indigo-900/40 text-indigo-300 rounded-md">
                        {rule.filterRules.length} 条筛选 ({rule.filterLogic})
                      </span>
                    )}
                    <span className="px-2 py-0.5 bg-blue-900/40 text-blue-300 rounded-md">
                      {rule.feishuUserIds.length} 位收件人
                    </span>
                  </div>
                  {rule.lastTriggeredAt && (
                    <p className="text-[10px] text-slate-500 mt-2">上次触发: {formatDateTime(rule.lastTriggeredAt)}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => handleToggleActive(rule.id)} className="p-2 text-slate-400 hover:text-amber-400 rounded-lg hover:bg-slate-700 transition" title={rule.active ? '暂停' : '启用'}>
                    {rule.active ? <Pause size={14} /> : <Play size={14} />}
                  </button>
                  <button onClick={() => openEditForm(rule)} className="p-2 text-slate-400 hover:text-indigo-400 rounded-lg hover:bg-slate-700 transition" title="编辑">
                    <Edit3 size={14} />
                  </button>
                  <button onClick={() => handleDeleteRule(rule.id)} className="p-2 text-slate-400 hover:text-red-400 rounded-lg hover:bg-slate-700 transition" title="删除">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* --- Form --- */}
          {isFormOpen && (
            <div className="bg-slate-800/80 rounded-2xl p-6 border border-indigo-500/30 mt-4">
              <div className="flex items-center justify-between mb-6">
                <h4 className="text-lg font-black text-white">{editingRule ? '编辑预警规则' : '新建预警规则'}</h4>
                <button onClick={() => { setIsFormOpen(false); resetForm(); }} className="p-2 hover:bg-slate-700 rounded-lg transition text-slate-400">
                  <X size={18} />
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left column */}
                <div className="space-y-5">
                  {/* Rule name */}
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">预警规则名称</label>
                    <input
                      type="text"
                      value={formName}
                      onChange={e => setFormName(e.target.value)}
                      placeholder="例如: ROI 低于目标值"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white font-bold outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Platform + Dimension */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">广告平台</label>
                      <select
                        value={formPlatform}
                        onChange={e => setFormPlatform(e.target.value as any)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white font-bold outline-none focus:border-indigo-500"
                      >
                        {PLATFORM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">广告维度</label>
                      <select
                        value={formDimension}
                        onChange={e => setFormDimension(e.target.value as any)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white font-bold outline-none focus:border-indigo-500"
                      >
                        {DIMENSION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Segment note */}
                  <div className="px-3 py-2 bg-slate-900/50 rounded-lg border border-slate-700/50">
                    <p className="text-[10px] text-slate-500">数据源: 使用默认 Segment（Ad Date / Asset Group Date）</p>
                  </div>

                  {/* Metric + Trigger */}
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">预警指标</label>
                    <select
                      value={formMetric}
                      onChange={e => setFormMetric(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white font-bold outline-none focus:border-indigo-500"
                    >
                      <option value="">选择指标...</option>
                      <optgroup label="基础指标">
                        {BASE_METRIC_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </optgroup>
                      {formulas.length > 0 && (
                        <optgroup label="计算指标 (公式)">
                          {formulas.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
                        </optgroup>
                      )}
                    </select>
                  </div>

                  {/* Trigger condition */}
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">触发条件</label>
                    <div className="flex items-center gap-3">
                      <select
                        value={formTriggerDirection}
                        onChange={e => setFormTriggerDirection(e.target.value as any)}
                        className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white font-bold outline-none focus:border-indigo-500"
                      >
                        <option value="below">低于</option>
                        <option value="above">高于</option>
                      </select>
                      <span className="text-slate-400 text-sm font-bold">目标值</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={formTriggerValue}
                        onChange={e => setFormTriggerValue(e.target.value)}
                        placeholder="目标值"
                        className="w-32 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white font-bold outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  {/* Time range + Check time */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">时间范围</label>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 text-xs font-bold shrink-0">Last</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={formLookbackDays}
                          onChange={e => setFormLookbackDays(e.target.value)}
                          placeholder="天数"
                          className="w-20 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white font-bold outline-none focus:border-indigo-500"
                        />
                        <span className="text-slate-400 text-xs font-bold shrink-0">Days</span>
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 block">每日检查时间</label>
                      <select
                        value={formCheckTime}
                        onChange={e => setFormCheckTime(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white font-bold outline-none focus:border-indigo-500"
                      >
                        {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Enabled toggle */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setFormActive(!formActive)}
                      className={`relative w-11 h-6 rounded-full transition ${formActive ? 'bg-indigo-600' : 'bg-slate-700'}`}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${formActive ? 'translate-x-5' : ''}`} />
                    </button>
                    <span className="text-sm text-slate-300 font-bold">{formActive ? '启用' : '暂停'}</span>
                  </div>
                </div>

                {/* Right column */}
                <div className="space-y-5">
                  {/* Filtering rules */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Filtering Rules</label>
                      <button
                        onClick={addFilterRule}
                        className="flex items-center gap-1 text-[11px] font-bold text-indigo-400 hover:text-indigo-300 transition"
                      >
                        <Plus size={12} />
                        Add Rule
                      </button>
                    </div>
                    <div className="space-y-2">
                      {formFilterRules.length === 0 && (
                        <p className="text-[11px] text-slate-500 py-3 text-center border border-dashed border-slate-700 rounded-xl">
                          无筛选条件（将对所有数据进行预警检测）
                        </p>
                      )}
                      {formFilterRules.map((fr, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <select
                            value={fr.field}
                            onChange={e => updateFilterRule(idx, { field: e.target.value as any })}
                            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-bold outline-none focus:border-indigo-500 w-40"
                          >
                            {FILTER_FIELD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                          <select
                            value={fr.operator}
                            onChange={e => updateFilterRule(idx, { operator: e.target.value as any })}
                            className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-bold outline-none focus:border-indigo-500 w-36"
                          >
                            {FILTER_OPERATOR_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                          <input
                            type="text"
                            value={fr.value}
                            onChange={e => updateFilterRule(idx, { value: e.target.value })}
                            placeholder="关键字..."
                            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-bold outline-none focus:border-indigo-500"
                          />
                          <button
                            onClick={() => removeFilterRule(idx)}
                            className="p-2 text-slate-500 hover:text-red-400 transition shrink-0"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>

                    {formFilterRules.length > 1 && (
                      <div className="flex items-center gap-3 mt-3 pl-1">
                        <span className="text-[10px] text-slate-500 font-bold">规则逻辑:</span>
                        <div className="flex items-center bg-slate-900 rounded-lg border border-slate-700 overflow-hidden">
                          <button
                            onClick={() => setFormFilterLogic('AND')}
                            className={`px-3 py-1.5 text-xs font-black transition ${formFilterLogic === 'AND' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                          >
                            AND
                          </button>
                          <button
                            onClick={() => setFormFilterLogic('OR')}
                            className={`px-3 py-1.5 text-xs font-black transition ${formFilterLogic === 'OR' ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                          >
                            OR
                          </button>
                        </div>
                        <span className="text-[10px] text-slate-500">
                          {formFilterLogic === 'OR' ? '满足任一规则即可' : '需满足全部规则'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Feishu user picker */}
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">预警收件人（飞书用户）</label>

                    {/* Selected users */}
                    {formFeishuUserIds.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {formFeishuUserIds.map(uid => {
                          const u = selectedUserCache.get(uid);
                          return (
                            <span key={uid} className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-900/40 text-indigo-300 rounded-lg text-[11px] font-bold">
                              {u?.name || uid}
                              <button onClick={() => toggleFeishuUser(uid)} className="hover:text-red-400 transition">
                                <X size={10} />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {/* Department breadcrumb */}
                    <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
                      <div className="flex items-center gap-1 px-3 py-2 border-b border-slate-700 overflow-x-auto text-[11px]">
                        {deptBreadcrumb.map((bc, i) => (
                          <React.Fragment key={bc.id}>
                            {i > 0 && <ChevronRight size={10} className="text-slate-600 shrink-0" />}
                            <button
                              onClick={() => navigateBreadcrumb(i)}
                              className={`shrink-0 font-bold transition ${i === deptBreadcrumb.length - 1 ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                              {bc.name}
                            </button>
                          </React.Fragment>
                        ))}
                      </div>

                      {/* Search */}
                      <div className="px-3 py-2 border-b border-slate-700">
                        <div className="relative">
                          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                          <input
                            type="text"
                            value={feishuUserSearch}
                            onChange={e => setFeishuUserSearch(e.target.value)}
                            placeholder="搜索用户..."
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-7 pr-3 py-1.5 text-[11px] text-white outline-none focus:border-indigo-500"
                          />
                        </div>
                      </div>

                      {/* Content */}
                      <div className="max-h-40 overflow-y-auto custom-scrollbar">
                        {isLoadingContacts ? (
                          <div className="flex items-center justify-center py-6">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-400" />
                            <span className="ml-2 text-[11px] text-slate-500">加载中...</span>
                          </div>
                        ) : (
                          <>
                            {feishuSubDepts.map(dept => (
                              <button
                                key={dept.open_department_id}
                                onClick={() => navigateToDept(dept)}
                                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-800 transition text-left"
                              >
                                <FolderOpen size={13} className="text-amber-500 shrink-0" />
                                <span className="text-[11px] font-bold text-slate-300 truncate">{dept.name}</span>
                                <span className="text-[10px] text-slate-600 ml-auto shrink-0">{dept.member_count} 人</span>
                                <ChevronRight size={12} className="text-slate-600 shrink-0" />
                              </button>
                            ))}
                            {filteredFeishuUsers.map(user => (
                              <button
                                key={user.open_id}
                                onClick={() => toggleFeishuUser(user.open_id)}
                                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-800 transition text-left"
                              >
                                <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${formFeishuUserIds.includes(user.open_id) ? 'bg-indigo-600 border-indigo-600' : 'border-slate-600'}`}>
                                  {formFeishuUserIds.includes(user.open_id) && <Check size={10} className="text-white" />}
                                </div>
                                <span className="text-[11px] font-bold text-slate-300 truncate">{user.name}</span>
                                {user.email && <span className="text-[10px] text-slate-600 ml-auto truncate">{user.email}</span>}
                              </button>
                            ))}
                            {feishuSubDepts.length === 0 && filteredFeishuUsers.length === 0 && (
                              <p className="text-[11px] text-slate-500 text-center py-4">无数据</p>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Test message */}
              {testMessage && (
                <div className={`mt-4 px-4 py-2.5 rounded-xl text-sm font-bold ${testMessage.type === 'success' ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-800' : 'bg-red-900/50 text-red-300 border border-red-800'}`}>
                  {testMessage.text}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-slate-700">
                <button
                  onClick={handleTestAlert}
                  disabled={isTesting || !formName.trim() || !formMetric || formFeishuUserIds.length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-600/20 text-amber-400 text-sm font-bold rounded-xl hover:bg-amber-600/30 transition border border-amber-600/30 disabled:opacity-40"
                >
                  <Send size={14} />
                  {isTesting ? '测试中...' : '测试预警'}
                </button>
                <button
                  onClick={() => { setIsFormOpen(false); resetForm(); }}
                  className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-white transition"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveForm}
                  disabled={isSaving || !formName.trim() || !formMetric || formFeishuUserIds.length === 0}
                  className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-500 transition disabled:opacity-40"
                >
                  <Check size={14} />
                  {isSaving ? '保存中...' : (editingRule ? '更新规则' : '保存规则')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- History Tab --- */}
      {activeTab === 'history' && (
        <div>
          {logs.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              <History className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="text-sm font-bold">暂无触发记录</p>
              <p className="text-xs mt-1">预警规则触发后，记录将显示在这里</p>
            </div>
          ) : (
            <div className="space-y-2">
              {[...logs].reverse().map((log, idx) => (
                <div key={idx} className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${log.status === 'SENT' ? 'bg-emerald-900/50 text-emerald-400' : log.status === 'TRIGGERED' ? 'bg-amber-900/50 text-amber-400' : 'bg-red-900/50 text-red-400'}`}>
                          {log.status}
                        </span>
                        <span className="text-sm font-bold text-white truncate">{log.ruleName}</span>
                      </div>
                      <div className="flex flex-wrap gap-2 text-[11px] mb-1.5">
                        <span className="text-slate-400">指标: <span className="text-slate-200 font-bold">{log.metric}</span></span>
                        <span className="text-slate-400">维度: <span className="text-slate-200 font-bold">{log.dimension}</span></span>
                        <span className="text-slate-400">收件人: <span className="text-slate-200 font-bold">{log.recipients}</span></span>
                      </div>
                      {log.matchedItems && log.matchedItems.length > 0 && (
                        <div className="mt-1.5">
                          <p className="text-[10px] text-slate-500 mb-1">触发项:</p>
                          <div className="flex flex-wrap gap-1">
                            {log.matchedItems.slice(0, 5).map((item, j) => (
                              <span key={j} className="px-2 py-0.5 bg-amber-900/30 text-amber-300 rounded text-[10px] font-bold">
                                {item.name}: {typeof item.value === 'number' ? item.value.toFixed(2) : item.value}
                              </span>
                            ))}
                            {log.matchedItems.length > 5 && (
                              <span className="px-2 py-0.5 text-slate-500 text-[10px]">+{log.matchedItems.length - 5} 项</span>
                            )}
                          </div>
                        </div>
                      )}
                      {log.errorMessage && (
                        <p className="text-[10px] text-red-400 mt-1">错误: {log.errorMessage}</p>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 shrink-0">{formatDateTime(log.triggeredAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AlertMonitorPanel;
