import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Clock,
  Plus,
  Trash2,
  Edit3,
  Mail,
  Calendar,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Play,
  Pause,
  FileSpreadsheet,
  ExternalLink,
  AlertTriangle,
  RefreshCcw,
  Send,
  History
} from 'lucide-react';
import { fetchUserConfig, saveUserConfig } from './api-service';
import type { ProjectOption } from './api-config';
import type { UserInfo } from './auth-service';
import { trackScheduledTaskCreate, trackScheduledTaskEdit, trackScheduledTaskDelete, trackScheduledTaskToggle, trackScheduledTaskSend } from './tracking-service';

// --- Types ---

export type DateRangePreset = 'last3' | 'last7' | 'last15' | 'last30' | 'custom';

export interface ScheduledReportTask {
  id: string;
  active: boolean;
  name: string;
  frequency: 'daily' | 'weekly';
  timeOfDay: string;
  weekDay?: number; // 1=Mon ... 7=Sun
  dateRangePreset: DateRangePreset;
  customDateStart?: string;
  customDateEnd?: string;
  pivotPresetIds: string[];
  emails: string[];
  lastRunAt?: string;
  sheetFileId?: string;
  createdAt: string;
}

export interface ScheduledReportLog {
  taskId: string;
  taskName: string;
  presetNames: string;
  emails: string;
  sentAt: string;
  status: 'SUCCESS' | 'FAIL';
  sheetUrl?: string;
  errorMessage?: string;
}

export interface PivotPresetInfo {
  id: string;
  name: string;
}

interface Props {
  currentUser: UserInfo;
  selectedProject: ProjectOption;
  pivotPresets: PivotPresetInfo[];
}

const WEEK_DAYS = [
  { value: 1, label: '周一' },
  { value: 2, label: '周二' },
  { value: 3, label: '周三' },
  { value: 4, label: '周四' },
  { value: 5, label: '周五' },
  { value: 6, label: '周六' },
  { value: 7, label: '周日' },
];

const DATE_RANGE_OPTIONS: { value: DateRangePreset; label: string }[] = [
  { value: 'last3', label: '近 3 天' },
  { value: 'last7', label: '近 7 天' },
  { value: 'last15', label: '近 15 天' },
  { value: 'last30', label: '近 30 天' },
  { value: 'custom', label: '自定义' },
];

function getDateRangeLabel(preset: DateRangePreset, customStart?: string, customEnd?: string) {
  if (preset === 'custom' && customStart && customEnd) return `${customStart} ~ ${customEnd}`;
  const opt = DATE_RANGE_OPTIONS.find(o => o.value === preset);
  return opt?.label ?? '近 3 天';
}

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, '0');
  const m = i % 2 === 0 ? '00' : '30';
  return `${h}:${m}`;
});

function generateId() {
  return `sr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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

const ScheduledReportsPanel: React.FC<Props> = ({ currentUser, selectedProject, pivotPresets }) => {
  const pivotPresetsRef = useRef(pivotPresets);
  useEffect(() => {
    pivotPresetsRef.current = pivotPresets;
  }, [pivotPresets]);

  const prevLogCountRef = useRef<number>(0);

  const [tasks, setTasks] = useState<ScheduledReportTask[]>([]);
  const [logs, setLogs] = useState<ScheduledReportLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingTask, setEditingTask] = useState<ScheduledReportTask | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'tasks' | 'history'>('tasks');
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // --- Form state ---
  const [formName, setFormName] = useState('');
  const [formFrequency, setFormFrequency] = useState<'daily' | 'weekly'>('daily');
  const [formTimeOfDay, setFormTimeOfDay] = useState('09:00');
  const [formWeekDay, setFormWeekDay] = useState(1);
  const [formPresetIds, setFormPresetIds] = useState<string[]>([]);
  const [formEmails, setFormEmails] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [formDateRangePreset, setFormDateRangePreset] = useState<DateRangePreset>('last3');
  const [formCustomDateStart, setFormCustomDateStart] = useState('');
  const [formCustomDateEnd, setFormCustomDateEnd] = useState('');

  // --- Load tasks ---
  const loadTasks = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchUserConfig(currentUser.username, selectedProject.projectId, 'scheduledReports');
      if (data) {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        const rawTasks: ScheduledReportTask[] = parsed.tasks || [];
        const validPresetIds = new Set((pivotPresetsRef.current || []).map(p => p.id));
        // 移除已删除报告的引用，避免定时任务/邮件/在线表格不一致
        const updatedTasks = rawTasks.map(t => ({
          ...t,
          pivotPresetIds: t.pivotPresetIds.filter(pid => validPresetIds.has(pid)),
        }));
        const hasStaleRefs = updatedTasks.some((t, i) => t.pivotPresetIds.length !== rawTasks[i].pivotPresetIds.length);
        setTasks(updatedTasks);
        const newLogs: ScheduledReportLog[] = parsed.logs || [];
        setLogs(newLogs);

        if (prevLogCountRef.current > 0 && newLogs.length > prevLogCountRef.current) {
          const addedLogs = newLogs.slice(prevLogCountRef.current);
          addedLogs.forEach(log => {
            trackScheduledTaskSend(currentUser.username, log.taskName, log.status);
          });
        }
        prevLogCountRef.current = newLogs.length;

        if (hasStaleRefs) {
          const payload = { tasks: updatedTasks, logs: parsed.logs || [] };
          await saveUserConfig(currentUser.username, selectedProject.projectId, 'scheduledReports', payload);
        }
      } else {
        setTasks([]);
        setLogs([]);
      }
    } catch (e) {
      console.error('Failed to load scheduled reports config:', e);
      setTasks([]);
      setLogs([]);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser.username, selectedProject.projectId]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // --- Save tasks ---
  const saveTasks = async (updatedTasks: ScheduledReportTask[], updatedLogs?: ScheduledReportLog[]) => {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      const payload = { tasks: updatedTasks, logs: updatedLogs ?? logs };
      const ok = await saveUserConfig(currentUser.username, selectedProject.projectId, 'scheduledReports', payload);
      if (ok) {
        setTasks(updatedTasks);
        if (updatedLogs) setLogs(updatedLogs);
        setSaveMessage({ type: 'success', text: '保存成功' });
      } else {
        setSaveMessage({ type: 'error', text: '保存失败，请重试' });
      }
    } catch (e) {
      console.error('Failed to save scheduled reports:', e);
      setSaveMessage({ type: 'error', text: '保存出错' });
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  // --- Form helpers ---
  const resetForm = () => {
    setFormName('');
    setFormFrequency('daily');
    setFormTimeOfDay('09:00');
    setFormWeekDay(1);
    setFormPresetIds([]);
    setFormEmails('');
    setFormActive(true);
    setFormDateRangePreset('last3');
    setFormCustomDateStart('');
    setFormCustomDateEnd('');
    setEditingTask(null);
  };

  const openCreateForm = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const openEditForm = (task: ScheduledReportTask) => {
    setEditingTask(task);
    setFormName(task.name);
    setFormFrequency(task.frequency);
    setFormTimeOfDay(task.timeOfDay);
    setFormWeekDay(task.weekDay ?? 1);
    // 只预填仍存在的报告，避免已删除报告出现在表单中
    const validIds = new Set(pivotPresets.map(p => p.id));
    setFormPresetIds(task.pivotPresetIds.filter(pid => validIds.has(pid)));
    setFormEmails(task.emails.join(', '));
    setFormActive(task.active);
    setFormDateRangePreset(task.dateRangePreset ?? 'last3');
    setFormCustomDateStart(task.customDateStart ?? '');
    setFormCustomDateEnd(task.customDateEnd ?? '');
    setIsFormOpen(true);
  };

  const handleFormSubmit = () => {
    if (!formName.trim()) return;
    if (formPresetIds.length === 0) return;
    const emailList = formEmails.split(/[,;\n]+/).map(e => e.trim()).filter(Boolean);
    if (emailList.length === 0) return;

    const taskData: ScheduledReportTask = {
      id: editingTask?.id ?? generateId(),
      active: formActive,
      name: formName.trim(),
      frequency: formFrequency,
      timeOfDay: formTimeOfDay,
      weekDay: formFrequency === 'weekly' ? formWeekDay : undefined,
      dateRangePreset: formDateRangePreset,
      customDateStart: formDateRangePreset === 'custom' ? formCustomDateStart : undefined,
      customDateEnd: formDateRangePreset === 'custom' ? formCustomDateEnd : undefined,
      pivotPresetIds: formPresetIds,
      emails: emailList,
      lastRunAt: editingTask?.lastRunAt,
      sheetFileId: editingTask?.sheetFileId,
      createdAt: editingTask?.createdAt ?? new Date().toISOString(),
    };

    let updatedTasks: ScheduledReportTask[];
    if (editingTask) {
      trackScheduledTaskEdit(currentUser.username, taskData.name);
      updatedTasks = tasks.map(t => t.id === editingTask.id ? taskData : t);
    } else {
      trackScheduledTaskCreate(currentUser.username, taskData.name);
      updatedTasks = [...tasks, taskData];
    }
    saveTasks(updatedTasks);
    setIsFormOpen(false);
    resetForm();
  };

  const handleDeleteTask = (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (task) trackScheduledTaskDelete(currentUser.username, task.name);
    const updatedTasks = tasks.filter(t => t.id !== id);
    saveTasks(updatedTasks);
  };

  const handleToggleActive = (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (task) trackScheduledTaskToggle(currentUser.username, task.name, task.active);
    const updatedTasks = tasks.map(t => t.id === id ? { ...t, active: !t.active } : t);
    saveTasks(updatedTasks);
  };

  const togglePresetId = (id: string) => {
    setFormPresetIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const getPresetName = (id: string) => pivotPresets.find(p => p.id === id)?.name ?? id;

  // --- Render ---
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Sub-tab: Tasks vs History */}
      <div className="flex items-center gap-2 mb-2">
        {[
          { id: 'tasks' as const, label: '定时任务', icon: Clock },
          { id: 'history' as const, label: '发送记录', icon: History },
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
            onClick={loadTasks}
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

      {/* === Tasks Tab === */}
      {!isLoading && activeTab === 'tasks' && (
        <div className="space-y-4">
          {/* Create button */}
          <div className="flex justify-end">
            <button
              onClick={openCreateForm}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-indigo-900/30"
            >
              <Plus className="w-4 h-4" />
              新建定时任务
            </button>
          </div>

          {/* Task List */}
          {tasks.length === 0 && !isFormOpen && (
            <div className="bg-slate-900/50 rounded-3xl border border-slate-800 p-16 text-center">
              <Clock className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400 font-bold text-lg mb-2">暂无定时任务</p>
              <p className="text-slate-500 text-sm mb-6">创建定时任务后，系统将按设定时间自动生成报告并发送至指定邮箱</p>
              <button
                onClick={openCreateForm}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm rounded-xl transition-all"
              >
                <Plus className="w-4 h-4" />
                创建第一个定时任务
              </button>
            </div>
          )}

          {tasks.map(task => (
            <div
              key={task.id}
              className={`bg-slate-900/50 rounded-2xl border p-5 transition-all ${task.active ? 'border-slate-800' : 'border-slate-800/50 opacity-60'}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider ${task.active ? 'bg-emerald-900/30 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                      {task.active ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                      {task.active ? '运行中' : '已暂停'}
                    </span>
                    <h4 className="font-bold text-white text-lg truncate">{task.name}</h4>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      {task.frequency === 'daily' ? '每天' : `每周${WEEK_DAYS.find(d => d.value === task.weekDay)?.label ?? ''}`}
                      {' '}{task.timeOfDay}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5" />
                      {task.emails.length > 1 ? `${task.emails[0]} +${task.emails.length - 1}` : task.emails[0]}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      {getDateRangeLabel(task.dateRangePreset ?? 'last3', task.customDateStart, task.customDateEnd)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      {task.pivotPresetIds.length} 个报告
                    </span>
                  </div>

                  {/* Preset tags：仅展示仍存在的报告，已删除的不会显示 */}
                  {task.pivotPresetIds.length === 0 ? (
                    <p className="text-amber-500/90 text-xs mt-3 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      该任务暂无有效报告（可能已删除），请编辑添加报告或删除此任务
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {task.pivotPresetIds.map(pid => (
                        <span key={pid} className="px-2 py-0.5 bg-slate-800 text-slate-300 text-xs rounded-lg border border-slate-700">
                          {getPresetName(pid)}
                        </span>
                      ))}
                    </div>
                  )}

                  {task.lastRunAt && (
                    <p className="text-xs text-slate-500 mt-2">上次运行: {formatDateTime(task.lastRunAt)}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleToggleActive(task.id)}
                    className={`p-2 rounded-lg transition-colors ${task.active ? 'text-emerald-400 hover:bg-emerald-900/20' : 'text-slate-500 hover:bg-slate-800'}`}
                    title={task.active ? '暂停' : '启用'}
                  >
                    {task.active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => openEditForm(task)}
                    className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    title="编辑"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteTask(task.id)}
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
                    {editingTask ? '编辑定时任务' : '新建定时任务'}
                  </h3>
                  <button onClick={() => { setIsFormOpen(false); resetForm(); }} className="p-2 hover:bg-slate-800 rounded-xl transition-colors text-slate-400 hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-6">
                  {/* Task Name */}
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">任务名称</label>
                    <input
                      type="text"
                      value={formName}
                      onChange={e => setFormName(e.target.value)}
                      placeholder="例如：每日投放日报"
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white font-medium outline-none focus:border-indigo-500 transition placeholder-slate-600"
                    />
                  </div>

                  {/* Select Reports */}
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
                      选择要发送的报告 <span className="text-slate-500">({formPresetIds.length} 个已选)</span>
                    </label>
                    {pivotPresets.length === 0 ? (
                      <div className="bg-slate-800/50 rounded-xl p-4 text-slate-500 text-sm flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        当前项目暂无已保存报告，请先在"数据分析"中保存报告
                      </div>
                    ) : (
                      <div className="bg-slate-800/50 rounded-xl border border-slate-700 max-h-48 overflow-y-auto">
                        {pivotPresets.map(preset => (
                          <button
                            key={preset.id}
                            onClick={() => togglePresetId(preset.id)}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-slate-700/50 ${formPresetIds.includes(preset.id) ? 'text-indigo-300' : 'text-slate-400'}`}
                          >
                            <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${formPresetIds.includes(preset.id) ? 'bg-indigo-600 border-indigo-500' : 'border-slate-600'}`}>
                              {formPresetIds.includes(preset.id) && <Check className="w-3 h-3 text-white" />}
                            </div>
                            <span className="truncate font-medium tracking-normal">{preset.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Frequency */}
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">发送频率</label>
                    <div className="flex gap-3">
                      {(['daily', 'weekly'] as const).map(freq => (
                        <button
                          key={freq}
                          onClick={() => setFormFrequency(freq)}
                          className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all border ${formFrequency === freq ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'}`}
                        >
                          {freq === 'daily' ? '每天' : '每周'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Week Day (if weekly) */}
                  {formFrequency === 'weekly' && (
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">发送日</label>
                      <div className="flex flex-wrap gap-2">
                        {WEEK_DAYS.map(day => (
                          <button
                            key={day.value}
                            onClick={() => setFormWeekDay(day.value)}
                            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border ${formWeekDay === day.value ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'}`}
                          >
                            {day.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Time of Day */}
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">发送时间 (GMT+8)</label>
                    <select
                      value={formTimeOfDay}
                      onChange={e => setFormTimeOfDay(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white font-medium outline-none focus:border-indigo-500 transition appearance-none"
                    >
                      {TIME_OPTIONS.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  {/* Date Range */}
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">数据时间范围</label>
                    <div className="flex flex-wrap gap-2">
                      {DATE_RANGE_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => setFormDateRangePreset(opt.value)}
                          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border ${formDateRangePreset === opt.value ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'}`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {formDateRangePreset === 'custom' && (
                      <div className="grid grid-cols-2 gap-3 mt-3">
                        <div>
                          <span className="text-[9px] text-slate-500 uppercase block mb-1">开始日期</span>
                          <input
                            type="date"
                            value={formCustomDateStart}
                            onChange={e => setFormCustomDateStart(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white font-medium outline-none focus:border-indigo-500 transition"
                          />
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-500 uppercase block mb-1">结束日期</span>
                          <input
                            type="date"
                            value={formCustomDateEnd}
                            onChange={e => setFormCustomDateEnd(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white font-medium outline-none focus:border-indigo-500 transition"
                          />
                        </div>
                      </div>
                    )}
                    <p className="text-[10px] text-slate-500 mt-2">
                      {formDateRangePreset === 'custom'
                        ? '将使用您指定的固定日期范围拉取数据'
                        : '每次发送时，自动计算相对于发送日期的时间范围'}
                    </p>
                  </div>

                  {/* Emails */}
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">收件邮箱</label>
                    <textarea
                      value={formEmails}
                      onChange={e => setFormEmails(e.target.value)}
                      placeholder="输入邮箱地址，多个邮箱用逗号或换行分隔"
                      rows={3}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white font-medium outline-none focus:border-indigo-500 transition placeholder-slate-600 resize-none"
                    />
                  </div>

                  {/* Active Toggle */}
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-bold text-slate-300">启用此任务</label>
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
                      disabled={!formName.trim() || formPresetIds.length === 0 || !formEmails.trim() || isSaving}
                      className="flex-1 flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold rounded-xl transition-all"
                    >
                      <Send className="w-4 h-4" />
                      {isSaving ? '保存中...' : (editingTask ? '更新任务' : '创建任务')}
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
              <p className="text-slate-400 font-bold text-lg mb-2">暂无发送记录</p>
              <p className="text-slate-500 text-sm">定时任务执行后，发送记录将在这里展示</p>
            </div>
          ) : (
            <div className="bg-slate-900/50 rounded-2xl border border-slate-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">时间</th>
                    <th className="text-left px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">任务名称</th>
                    <th className="text-left px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">报告</th>
                    <th className="text-left px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">收件人</th>
                    <th className="text-left px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">状态</th>
                    <th className="text-left px-5 py-3 text-[10px] font-black text-slate-500 uppercase tracking-widest">文档</th>
                  </tr>
                </thead>
                <tbody>
                  {[...logs].reverse().map((log, idx) => (
                    <tr key={idx} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                      <td className="px-5 py-3 text-slate-400 whitespace-nowrap">{formatDateTime(log.sentAt)}</td>
                      <td className="px-5 py-3 text-white font-medium">{log.taskName}</td>
                      <td className="px-5 py-3 text-slate-400 max-w-[200px] truncate" title={log.presetNames}>{log.presetNames}</td>
                      <td className="px-5 py-3 text-slate-400 max-w-[180px] truncate" title={log.emails}>{log.emails}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase ${log.status === 'SUCCESS' ? 'bg-emerald-900/30 text-emerald-400' : 'bg-red-900/30 text-red-400'}`}>
                          {log.status === 'SUCCESS' ? <Check className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                          {log.status === 'SUCCESS' ? '成功' : '失败'}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        {log.sheetUrl ? (
                          <a href={log.sheetUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition-colors">
                            <ExternalLink className="w-3.5 h-3.5" />
                            查看
                          </a>
                        ) : log.errorMessage ? (
                          <span className="text-red-400 text-xs" title={log.errorMessage}>
                            {log.errorMessage.length > 30 ? log.errorMessage.slice(0, 30) + '...' : log.errorMessage}
                          </span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
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

export default ScheduledReportsPanel;
