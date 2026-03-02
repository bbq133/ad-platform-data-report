import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  Plus,
  Trash2,
  Edit3,
  Mail,
  Check,
  X,
  Play,
  Pause,
  AlertTriangle,
  RefreshCcw,
  Send,
  History,
  Filter,
  Target,
  Clock,
  ChevronDown,
  ChevronUp,
  Bell
} from 'lucide-react';
import { fetchUserConfig, saveUserConfig } from './api-service';
import type { ProjectOption } from './api-config';
import type { UserInfo } from './auth-service';

// --- Types ---

export interface AlertFilterRule {
  field: 'Campaign Name' | 'Ad Set Name' | 'Ad Name';
  operator: 'contains' | 'not_contains' | 'equals' | 'not_equals';
  value: string;
}

export interface AlertRule {
  id: string;
  active: boolean;
  name: string;
  platform: 'meta' | 'google';
  segmentMode: string;
  dimension: 'campaign' | 'adSet' | 'ad';
  metricKey: string;
  timeRangeValue: number;
  timeRangeUnit: 'days' | 'weeks' | 'months';
  triggerCondition: 'above_target' | 'below_target';
  targetValue: number;
  runAtTime: string;
  emails: string[];
  alertContentTemplate: string;
  filters: AlertFilterRule[];
  filterLogic: 'and' | 'or';
  lastRunAt?: string;
  createdAt: string;
}

export interface AlertLog {
  ruleId: string;
  ruleName: string;
  metricKey: string;
  currentValue: number;
  targetValue: number;
  triggerCondition: string;
  emails: string;
  triggeredAt: string;
  status: 'TRIGGERED' | 'OK' | 'FAIL';
  errorMessage?: string;
}

interface FormulaOption {
  id: string;
  name: string;
}

interface Props {
  currentUser: UserInfo;
  selectedProject: ProjectOption;
}

// --- Constants ---

const PLATFORM_OPTIONS = [
  { value: 'meta' as const, label: 'Meta (Facebook)' },
  { value: 'google' as const, label: 'Google' },
];

const DIMENSION_OPTIONS = [
  { value: 'campaign' as const, label: 'Campaign' },
  { value: 'adSet' as const, label: 'Ad Set' },
  { value: 'ad' as const, label: 'Ad' },
];

const TIME_UNIT_OPTIONS = [
  { value: 'days' as const, label: '天' },
  { value: 'weeks' as const, label: '周' },
  { value: 'months' as const, label: '月' },
];

const TRIGGER_OPTIONS = [
  { value: 'above_target' as const, label: '高于目标值' },
  { value: 'below_target' as const, label: '低于目标值' },
];

const FILTER_FIELD_OPTIONS = [
  { value: 'Campaign Name' as const, label: 'Campaign Name' },
  { value: 'Ad Set Name' as const, label: 'Ad Set Name' },
  { value: 'Ad Name' as const, label: 'Ad Name' },
];

const FILTER_OPERATOR_OPTIONS = [
  { value: 'contains' as const, label: '包含' },
  { value: 'not_contains' as const, label: '不包含' },
  { value: 'equals' as const, label: '等于' },
  { value: 'not_equals' as const, label: '不等于' },
];

const RUN_TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, '0');
  const m = i % 2 === 0 ? '00' : '30';
  return `${h}:${m}`;
});

// --- Helpers ---

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

function getDimensionLabel(dim: string) {
  return DIMENSION_OPTIONS.find(d => d.value === dim)?.label ?? dim;
}

function getPlatformLabel(p: string) {
  return PLATFORM_OPTIONS.find(o => o.value === p)?.label ?? p;
}

function getTriggerLabel(t: string) {
  return TRIGGER_OPTIONS.find(o => o.value === t)?.label ?? t;
}

function getTimeUnitLabel(u: string) {
  return TIME_UNIT_OPTIONS.find(o => o.value === u)?.label ?? u;
}

function getOperatorLabel(op: string) {
  return FILTER_OPERATOR_OPTIONS.find(o => o.value === op)?.label ?? op;
}

// --- Component ---

const AlertRulesPanel: React.FC<Props> = ({ currentUser, selectedProject }) => {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [logs, setLogs] = useState<AlertLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'rules' | 'history'>('rules');
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [formulaOptions, setFormulaOptions] = useState<FormulaOption[]>([]);

  // --- Form state ---
  const [formName, setFormName] = useState('');
  const [formPlatform, setFormPlatform] = useState<'meta' | 'google'>('meta');
  const [formDimension, setFormDimension] = useState<'campaign' | 'adSet' | 'ad'>('campaign');
  const [formMetricKey, setFormMetricKey] = useState('');
  const [formTimeRangeValue, setFormTimeRangeValue] = useState(7);
  const [formTimeRangeUnit, setFormTimeRangeUnit] = useState<'days' | 'weeks' | 'months'>('days');
  const [formTriggerCondition, setFormTriggerCondition] = useState<'above_target' | 'below_target'>('below_target');
  const [formTargetValue, setFormTargetValue] = useState<number | ''>('');
  const [formRunAtTime, setFormRunAtTime] = useState('09:00');
  const [formEmails, setFormEmails] = useState('');
  const [formAlertContent, setFormAlertContent] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [formFilters, setFormFilters] = useState<AlertFilterRule[]>([]);
  const [formFilterLogic, setFormFilterLogic] = useState<'and' | 'or'>('and');

  // --- Load formulas for metric dropdown ---
  const loadFormulas = useCallback(async () => {
    try {
      const savedFormulas = await fetchUserConfig(currentUser.username, selectedProject.projectId, 'formulas');
      if (savedFormulas && Array.isArray(savedFormulas)) {
        setFormulaOptions(savedFormulas.map((f: any) => ({ id: f.id || f.name, name: f.name })));
      } else {
        setFormulaOptions([
          { id: 'ROI', name: 'ROI' },
          { id: 'CPM', name: 'CPM' },
          { id: 'CPC', name: 'CPC' },
          { id: 'CTR', name: 'CTR' },
          { id: 'CPA', name: 'CPA' },
        ]);
      }
    } catch {
      setFormulaOptions([]);
    }
  }, [currentUser.username, selectedProject.projectId]);

  // --- Load rules ---
  const loadRules = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchUserConfig(currentUser.username, selectedProject.projectId, 'alertRules');
      if (data) {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        setRules(parsed.rules || []);
        setLogs(parsed.logs || []);
      } else {
        setRules([]);
        setLogs([]);
      }
    } catch (e) {
      console.error('Failed to load alert rules:', e);
      setRules([]);
      setLogs([]);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser.username, selectedProject.projectId]);

  useEffect(() => {
    loadRules();
    loadFormulas();
  }, [loadRules, loadFormulas]);

  // --- Save rules ---
  const saveRules = async (updatedRules: AlertRule[], updatedLogs?: AlertLog[]) => {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      const payload = { rules: updatedRules, logs: updatedLogs ?? logs };
      const ok = await saveUserConfig(currentUser.username, selectedProject.projectId, 'alertRules', payload);
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
  const resetForm = () => {
    setFormName('');
    setFormPlatform('meta');
    setFormDimension('campaign');
    setFormMetricKey('');
    setFormTimeRangeValue(7);
    setFormTimeRangeUnit('days');
    setFormTriggerCondition('below_target');
    setFormTargetValue('');
    setFormRunAtTime('09:00');
    setFormEmails('');
    setFormAlertContent('');
    setFormActive(true);
    setFormFilters([]);
    setFormFilterLogic('and');
    setEditingRule(null);
  };

  const openCreateForm = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const openEditForm = (rule: AlertRule) => {
    setEditingRule(rule);
    setFormName(rule.name);
    setFormPlatform(rule.platform);
    setFormDimension(rule.dimension);
    setFormMetricKey(rule.metricKey);
    setFormTimeRangeValue(rule.timeRangeValue);
    setFormTimeRangeUnit(rule.timeRangeUnit);
    setFormTriggerCondition(rule.triggerCondition);
    setFormTargetValue(rule.targetValue);
    setFormRunAtTime(rule.runAtTime);
    setFormEmails(rule.emails.join(', '));
    setFormAlertContent(rule.alertContentTemplate || '');
    setFormActive(rule.active);
    setFormFilters(rule.filters ? [...rule.filters] : []);
    setFormFilterLogic(rule.filterLogic || 'and');
    setIsFormOpen(true);
  };

  const handleFormSubmit = () => {
    if (!formName.trim()) return;
    if (!formMetricKey) return;
    if (formTargetValue === '' || isNaN(Number(formTargetValue))) return;
    const emailList = formEmails.split(/[,;\n]+/).map(e => e.trim()).filter(Boolean);
    if (emailList.length === 0) return;

    const ruleData: AlertRule = {
      id: editingRule?.id ?? generateId(),
      active: formActive,
      name: formName.trim(),
      platform: formPlatform,
      segmentMode: 'default',
      dimension: formDimension,
      metricKey: formMetricKey,
      timeRangeValue: formTimeRangeValue,
      timeRangeUnit: formTimeRangeUnit,
      triggerCondition: formTriggerCondition,
      targetValue: Number(formTargetValue),
      runAtTime: formRunAtTime,
      emails: emailList,
      alertContentTemplate: formAlertContent.trim(),
      filters: formFilters.filter(f => f.value.trim() !== ''),
      filterLogic: formFilterLogic,
      lastRunAt: editingRule?.lastRunAt,
      createdAt: editingRule?.createdAt ?? new Date().toISOString(),
    };

    let updatedRules: AlertRule[];
    if (editingRule) {
      updatedRules = rules.map(r => r.id === editingRule.id ? ruleData : r);
    } else {
      updatedRules = [...rules, ruleData];
    }
    saveRules(updatedRules);
    setIsFormOpen(false);
    resetForm();
  };

  const handleDeleteRule = (id: string) => {
    const updatedRules = rules.filter(r => r.id !== id);
    saveRules(updatedRules);
  };

  const handleToggleActive = (id: string) => {
    const updatedRules = rules.map(r => r.id === id ? { ...r, active: !r.active } : r);
    saveRules(updatedRules);
  };

  // --- Filter helpers ---
  const addFilter = () => {
    setFormFilters([...formFilters, { field: 'Campaign Name', operator: 'contains', value: '' }]);
  };

  const updateFilter = (index: number, patch: Partial<AlertFilterRule>) => {
    setFormFilters(formFilters.map((f, i) => i === index ? { ...f, ...patch } : f));
  };

  const removeFilter = (index: number) => {
    setFormFilters(formFilters.filter((_, i) => i !== index));
  };

  const isFormValid = formName.trim() && formMetricKey && formTargetValue !== '' && !isNaN(Number(formTargetValue)) && formEmails.trim();

  // --- Render ---
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Sub-tab: Rules vs History */}
      <div className="flex items-center gap-2 mb-2">
        {[
          { id: 'rules' as const, label: '预警规则', icon: Bell },
          { id: 'history' as const, label: '预警记录', icon: History },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${activeTab === id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/30' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {saveMessage && (
            <span className={`text-xs font-bold px-3 py-1 rounded-lg ${saveMessage.type === 'success' ? 'bg-emerald-900/30 text-emerald-400' : 'bg-red-900/30 text-red-400'}`}>
              {saveMessage.text}
            </span>
          )}
          <button
            onClick={() => { loadRules(); loadFormulas(); }}
            disabled={isLoading}
            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors disabled:opacity-50"
            title="刷新"
          >
            <RefreshCcw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-3 text-indigo-400 animate-pulse">
            <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      )}

      {/* === Rules Tab === */}
      {!isLoading && activeTab === 'rules' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={openCreateForm}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-indigo-900/30"
            >
              <Plus className="w-4 h-4" />
              新建预警规则
            </button>
          </div>

          {/* Empty state */}
          {rules.length === 0 && !isFormOpen && (
            <div className="bg-slate-900/50 rounded-3xl border border-slate-800 p-16 text-center">
              <Bell className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400 font-bold text-lg mb-2">暂无预警规则</p>
              <p className="text-slate-500 text-sm mb-6">创建预警规则后，系统将按设定时间自动拉取数据并在指标触发条件时发送预警邮件</p>
              <button
                onClick={openCreateForm}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm rounded-xl transition-all"
              >
                <Plus className="w-4 h-4" />
                创建第一个预警规则
              </button>
            </div>
          )}

          {/* Rule list */}
          {rules.map(rule => (
            <div
              key={rule.id}
              className={`bg-slate-900/50 rounded-2xl border p-5 transition-all ${rule.active ? 'border-slate-800' : 'border-slate-800/50 opacity-60'}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider ${rule.active ? 'bg-emerald-900/30 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                      {rule.active ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                      {rule.active ? '运行中' : '已暂停'}
                    </span>
                    <h4 className="font-bold text-white text-lg truncate">{rule.name}</h4>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5" />
                      {getPlatformLabel(rule.platform)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Target className="w-3.5 h-3.5" />
                      {getDimensionLabel(rule.dimension)} · {rule.metricKey}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {getTriggerLabel(rule.triggerCondition)} {rule.targetValue}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      最近 {rule.timeRangeValue} {getTimeUnitLabel(rule.timeRangeUnit)} · 每天 {rule.runAtTime}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5" />
                      {rule.emails.length > 1 ? `${rule.emails[0]} +${rule.emails.length - 1}` : rule.emails[0]}
                    </span>
                  </div>

                  {/* Filter tags */}
                  {rule.filters && rule.filters.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-3">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider mr-1">
                        <Filter className="w-3 h-3 inline" /> 筛选 ({rule.filterLogic === 'and' ? 'AND' : 'OR'})
                      </span>
                      {rule.filters.map((f, i) => (
                        <span key={i} className="px-2 py-0.5 bg-slate-800 text-slate-300 text-xs rounded-lg border border-slate-700">
                          {f.field} {getOperatorLabel(f.operator)} "{f.value}"
                        </span>
                      ))}
                    </div>
                  )}

                  {rule.lastRunAt && (
                    <p className="text-xs text-slate-500 mt-2">上次运行: {formatDateTime(rule.lastRunAt)}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleToggleActive(rule.id)}
                    className={`p-2 rounded-lg transition-colors ${rule.active ? 'text-emerald-400 hover:bg-emerald-900/20' : 'text-slate-500 hover:bg-slate-800'}`}
                    title={rule.active ? '暂停' : '启用'}
                  >
                    {rule.active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => openEditForm(rule)}
                    className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    title="编辑"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteRule(rule.id)}
                    className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-900/20 transition-colors"
                    title="删除"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* === Create / Edit Form Modal === */}
          {isFormOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setIsFormOpen(false); resetForm(); }}>
              <div
                className="bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-8"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-black text-white">
                    {editingRule ? '编辑预警规则' : '新建预警规则'}
                  </h3>
                  <button onClick={() => { setIsFormOpen(false); resetForm(); }} className="p-2 hover:bg-slate-800 rounded-xl transition-colors text-slate-400 hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-6">
                  {/* Rule Name */}
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">预警规则名称</label>
                    <input
                      type="text"
                      value={formName}
                      onChange={e => setFormName(e.target.value)}
                      placeholder="例如：ROI 低于目标预警"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white font-medium outline-none focus:border-indigo-500 transition placeholder-slate-600"
                    />
                  </div>

                  {/* Platform */}
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">广告平台</label>
                    <div className="flex gap-3">
                      {PLATFORM_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setFormPlatform(opt.value)}
                          className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all border ${formPlatform === opt.value ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'}`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Segment (read-only) */}
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">广告 Segment</label>
                    <div className="bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-400 text-sm">
                      使用默认数据源 (Default)
                    </div>
                  </div>

                  {/* Dimension */}
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">广告维度</label>
                    <div className="flex gap-3">
                      {DIMENSION_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setFormDimension(opt.value)}
                          className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all border ${formDimension === opt.value ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'}`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Metric */}
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">预警指标</label>
                    <select
                      value={formMetricKey}
                      onChange={e => setFormMetricKey(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white font-medium outline-none focus:border-indigo-500 transition appearance-none"
                    >
                      <option value="">请选择指标</option>
                      {formulaOptions.map(f => (
                        <option key={f.id} value={f.name}>{f.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Time Range */}
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">时间范围</label>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-slate-400 font-bold shrink-0">最近</span>
                      <input
                        type="number"
                        min={1}
                        value={formTimeRangeValue}
                        onChange={e => setFormTimeRangeValue(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-24 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white font-medium outline-none focus:border-indigo-500 transition text-center"
                      />
                      <select
                        value={formTimeRangeUnit}
                        onChange={e => setFormTimeRangeUnit(e.target.value as any)}
                        className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white font-medium outline-none focus:border-indigo-500 transition appearance-none"
                      >
                        {TIME_UNIT_OPTIONS.map(u => (
                          <option key={u.value} value={u.value}>{u.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Trigger Condition */}
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">触发条件</label>
                    <div className="flex items-center gap-3">
                      <select
                        value={formTriggerCondition}
                        onChange={e => setFormTriggerCondition(e.target.value as any)}
                        className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white font-medium outline-none focus:border-indigo-500 transition appearance-none"
                      >
                        {TRIGGER_OPTIONS.map(t => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        step="any"
                        value={formTargetValue}
                        onChange={e => setFormTargetValue(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="目标值"
                        className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white font-medium outline-none focus:border-indigo-500 transition placeholder-slate-600"
                      />
                    </div>
                    <p className="text-[10px] text-slate-500 mt-2">
                      当聚合后的 {formMetricKey || '指标'} {formTriggerCondition === 'above_target' ? '高于' : '低于'} 目标值时触发预警
                    </p>
                  </div>

                  {/* === Filtering Rules === */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">筛选规则</label>
                      <button
                        onClick={addFilter}
                        className="flex items-center gap-1 text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        添加规则
                      </button>
                    </div>

                    {formFilters.length === 0 ? (
                      <div className="bg-slate-800/30 rounded-xl border border-dashed border-slate-700 p-4 text-center text-slate-500 text-sm">
                        暂无筛选规则，将对全部数据进行预警监控
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {formFilters.map((filter, idx) => (
                          <div key={idx} className="flex items-center gap-2 bg-slate-800/50 rounded-xl border border-slate-700 p-3">
                            <select
                              value={filter.field}
                              onChange={e => updateFilter(idx, { field: e.target.value as any })}
                              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm font-medium outline-none focus:border-indigo-500 transition appearance-none"
                            >
                              {FILTER_FIELD_OPTIONS.map(f => (
                                <option key={f.value} value={f.value}>{f.label}</option>
                              ))}
                            </select>
                            <select
                              value={filter.operator}
                              onChange={e => updateFilter(idx, { operator: e.target.value as any })}
                              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm font-medium outline-none focus:border-indigo-500 transition appearance-none"
                            >
                              {FILTER_OPERATOR_OPTIONS.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                            <input
                              type="text"
                              value={filter.value}
                              onChange={e => updateFilter(idx, { value: e.target.value })}
                              placeholder="关键字"
                              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm font-medium outline-none focus:border-indigo-500 transition placeholder-slate-600"
                            />
                            <button
                              onClick={() => removeFilter(idx)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-900/20 transition-colors shrink-0"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}

                        {/* Filter Logic */}
                        <div className="flex items-center gap-3 pt-2 pl-1">
                          <span className="text-xs font-bold text-slate-400">规则逻辑:</span>
                          <button
                            onClick={() => setFormFilterLogic('and')}
                            className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase transition-all border ${formFilterLogic === 'and' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'}`}
                          >
                            AND
                          </button>
                          <button
                            onClick={() => setFormFilterLogic('or')}
                            className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase transition-all border ${formFilterLogic === 'or' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'}`}
                          >
                            OR
                          </button>
                          <span className="text-[10px] text-slate-500">
                            {formFilterLogic === 'and' ? '满足全部规则' : '满足任一规则即可'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Run at time */}
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">监控频次 (每天执行时间, GMT+8)</label>
                    <select
                      value={formRunAtTime}
                      onChange={e => setFormRunAtTime(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white font-medium outline-none focus:border-indigo-500 transition appearance-none"
                    >
                      {RUN_TIME_OPTIONS.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  {/* Emails */}
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">预警提醒邮箱</label>
                    <textarea
                      value={formEmails}
                      onChange={e => setFormEmails(e.target.value)}
                      placeholder="输入邮箱地址，多个邮箱用逗号或换行分隔"
                      rows={3}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white font-medium outline-none focus:border-indigo-500 transition placeholder-slate-600 resize-none"
                    />
                  </div>

                  {/* Alert content template */}
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">预警内容提示 <span className="text-slate-500">(可选)</span></label>
                    <textarea
                      value={formAlertContent}
                      onChange={e => setFormAlertContent(e.target.value)}
                      placeholder="预警触发时邮件中附带的补充说明"
                      rows={2}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white font-medium outline-none focus:border-indigo-500 transition placeholder-slate-600 resize-none"
                    />
                  </div>

                  {/* Active Toggle */}
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-bold text-slate-300">启用此规则</label>
                    <button
                      onClick={() => setFormActive(!formActive)}
                      className={`relative w-12 h-7 rounded-full transition-colors ${formActive ? 'bg-indigo-600' : 'bg-slate-700'}`}
                    >
                      <div className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${formActive ? 'translate-x-5' : ''}`} />
                    </button>
                  </div>

                  {/* Submit */}
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={handleFormSubmit}
                      disabled={!isFormValid || isSaving}
                      className="flex-1 flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold rounded-xl transition-all"
                    >
                      <Send className="w-4 h-4" />
                      {isSaving ? '保存中...' : (editingRule ? '更新规则' : '创建规则')}
                    </button>
                    <button
                      onClick={() => { setIsFormOpen(false); resetForm(); }}
                      className="px-5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-all"
                    >
                      取消
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* === History Tab === */}
      {!isLoading && activeTab === 'history' && (
        <div className="space-y-4">
          {logs.length === 0 ? (
            <div className="bg-slate-900/50 rounded-3xl border border-slate-800 p-16 text-center">
              <History className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400 font-bold text-lg mb-2">暂无预警记录</p>
              <p className="text-slate-500 text-sm">预警规则触发后，记录将在这里展示</p>
            </div>
          ) : (
            <div className="bg-slate-900/50 rounded-2xl border border-slate-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">时间</th>
                    <th className="text-left px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">规则名称</th>
                    <th className="text-left px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">指标</th>
                    <th className="text-left px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">当前值</th>
                    <th className="text-left px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">目标值</th>
                    <th className="text-left px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">收件人</th>
                    <th className="text-left px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {[...logs].reverse().map((log, idx) => (
                    <tr key={idx} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                      <td className="px-5 py-3 text-slate-400 whitespace-nowrap">{formatDateTime(log.triggeredAt)}</td>
                      <td className="px-5 py-3 text-white font-medium">{log.ruleName}</td>
                      <td className="px-5 py-3 text-slate-400">{log.metricKey}</td>
                      <td className="px-5 py-3 text-slate-400">{typeof log.currentValue === 'number' ? log.currentValue.toFixed(2) : '-'}</td>
                      <td className="px-5 py-3 text-slate-400">{typeof log.targetValue === 'number' ? log.targetValue.toFixed(2) : '-'}</td>
                      <td className="px-5 py-3 text-slate-400 max-w-[180px] truncate" title={log.emails}>{log.emails}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase ${log.status === 'TRIGGERED' ? 'bg-amber-900/30 text-amber-400' : log.status === 'OK' ? 'bg-emerald-900/30 text-emerald-400' : 'bg-red-900/30 text-red-400'}`}>
                          {log.status === 'TRIGGERED' ? <AlertTriangle className="w-3 h-3" /> : log.status === 'OK' ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                          {log.status === 'TRIGGERED' ? '已触发' : log.status === 'OK' ? '正常' : '失败'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AlertRulesPanel;
