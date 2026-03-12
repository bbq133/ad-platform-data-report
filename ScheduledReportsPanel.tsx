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
  ChevronRight,
  Play,
  Pause,
  FileSpreadsheet,
  ExternalLink,
  AlertTriangle,
  RefreshCcw,
  Send,
  History,
  Users,
  FolderOpen,
  Search
} from 'lucide-react';
import {
  fetchUserConfig, saveUserConfig, testSendScheduledReport,
  fetchFeishuDepartments, fetchFeishuUsers, fetchFeishuAllUsers, fetchFeishuUserConfig,
  saveFeishuUserConfig, testFeishuScheduledReport,
  type ScheduledReportTaskPayload, type FeishuScheduledReportTaskPayload,
  type FeishuDepartment, type FeishuUser
} from './api-service';
import type { ProjectOption } from './api-config';
import type { UserInfo } from './auth-service';
import { trackScheduledTaskCreate, trackScheduledTaskEdit, trackScheduledTaskDelete, trackScheduledTaskToggle, trackScheduledTaskSend } from './tracking-service';

// --- Types ---

export type DateRangePreset = 'last3' | 'last7' | 'last15' | 'last30' | 'custom';
export type ReportMode = 'google' | 'feishu';

export interface ScheduledReportTask {
  id: string;
  active: boolean;
  name: string;
  frequency: 'daily' | 'weekly';
  timeOfDay: string;
  weekDay?: number;
  dateRangePreset: DateRangePreset;
  customDateStart?: string;
  customDateEnd?: string;
  pivotPresetIds: string[];
  emails: string[];
  updateOnly?: boolean;
  lastRunAt?: string;
  sheetFileId?: string;
  createdAt: string;
}

export interface FeishuScheduledReportTask {
  id: string;
  active: boolean;
  name: string;
  frequency: 'daily' | 'weekly';
  timeOfDay: string;
  weekDay?: number;
  dateRangePreset: DateRangePreset;
  customDateStart?: string;
  customDateEnd?: string;
  pivotPresetIds: string[];
  feishuUserIds: string[];
  feishuSpreadsheetToken?: string;
  feishuCurrentSheetId?: string;
  feishuLastPresetIds?: string[];
  updateOnly?: boolean;
  lastRunAt?: string;
  createdAt: string;
}

export interface ScheduledReportLog {
  taskId: string;
  taskName: string;
  presetNames: string;
  emails: string;
  recipients?: string;
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
  tasks: ScheduledReportTask[];
  setTasks: React.Dispatch<React.SetStateAction<ScheduledReportTask[]>>;
  logs: ScheduledReportLog[];
  setLogs: React.Dispatch<React.SetStateAction<ScheduledReportLog[]>>;
  feishuTasks: FeishuScheduledReportTask[];
  setFeishuTasks: React.Dispatch<React.SetStateAction<FeishuScheduledReportTask[]>>;
  feishuLogs: ScheduledReportLog[];
  setFeishuLogs: React.Dispatch<React.SetStateAction<ScheduledReportLog[]>>;
  isLoadingScheduledReports?: boolean;
  isLoadingFeishuReports?: boolean;
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

const ScheduledReportsPanel: React.FC<Props> = ({
  currentUser,
  selectedProject,
  pivotPresets,
  tasks,
  setTasks,
  logs,
  setLogs,
  feishuTasks,
  setFeishuTasks,
  feishuLogs,
  setFeishuLogs,
  isLoadingScheduledReports = false,
  isLoadingFeishuReports = false,
}) => {
  const pivotPresetsRef = useRef(pivotPresets);
  useEffect(() => { pivotPresetsRef.current = pivotPresets; }, [pivotPresets]);
  const prevLogCountRef = useRef<number>(0);

  // --- Mode toggle ---
  const [reportMode, setReportMode] = useState<ReportMode>('feishu');

  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'tasks' | 'history'>('tasks');
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [testMessage, setTestMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // --- Shared form state ---
  const [formName, setFormName] = useState('');
  const [formFrequency, setFormFrequency] = useState<'daily' | 'weekly'>('daily');
  const [formTimeOfDay, setFormTimeOfDay] = useState('09:00');
  const [formWeekDay, setFormWeekDay] = useState(1);
  const [formPresetIds, setFormPresetIds] = useState<string[]>([]);
  const [formActive, setFormActive] = useState(true);
  const [formDateRangePreset, setFormDateRangePreset] = useState<DateRangePreset>('last3');
  const [formCustomDateStart, setFormCustomDateStart] = useState('');
  const [formCustomDateEnd, setFormCustomDateEnd] = useState('');

  // --- Update only mode ---
  const [formUpdateOnly, setFormUpdateOnly] = useState(true);

  // --- Google mode form ---
  const [formEmails, setFormEmails] = useState('');

  // --- Feishu mode form ---
  const [formFeishuUserIds, setFormFeishuUserIds] = useState<string[]>([]);

  // --- Feishu contacts data ---
  const [feishuSubDepts, setFeishuSubDepts] = useState<FeishuDepartment[]>([]);
  const [feishuUsers, setFeishuUsers] = useState<FeishuUser[]>([]);
  const [feishuAllUsers, setFeishuAllUsers] = useState<FeishuUser[]>([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [feishuUserSearch, setFeishuUserSearch] = useState('');

  // Breadcrumb for department drill-down
  const [deptBreadcrumb, setDeptBreadcrumb] = useState<{ id: string; name: string }[]>([{ id: '0', name: '全公司' }]);

  // --- Selected user cache (for display names) ---
  const [selectedUserCache, setSelectedUserCache] = useState<Map<string, FeishuUser>>(new Map());

  const currentTasks = reportMode === 'feishu' ? feishuTasks : tasks;
  const currentLogs = reportMode === 'feishu' ? feishuLogs : logs;
  const isLoading = reportMode === 'feishu' ? isLoadingFeishuReports : isLoadingScheduledReports;

  const displayTasks = React.useMemo(() => {
    const validPresetIds = new Set(pivotPresets.map(p => p.id));
    return currentTasks.map((t: any) => ({
      ...t,
      pivotPresetIds: (t.pivotPresetIds || []).filter((pid: string) => validPresetIds.has(pid)),
    }));
  }, [currentTasks, pivotPresets]);

  useEffect(() => {
    if (prevLogCountRef.current > 0 && currentLogs.length > prevLogCountRef.current) {
      currentLogs.slice(prevLogCountRef.current).forEach(log => {
        trackScheduledTaskSend(currentUser.username, log.taskName, log.status);
      });
    }
    prevLogCountRef.current = currentLogs.length;
  }, [currentLogs.length, currentUser.username]);

  const currentDeptId = deptBreadcrumb[deptBreadcrumb.length - 1]?.id ?? '0';

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

  // Load root contents + 全量用户（含子部门，后端有缓存）when form opens in feishu mode
  useEffect(() => {
    if (isFormOpen && reportMode === 'feishu') {
      setDeptBreadcrumb([{ id: '0', name: '全公司' }]);
      loadDeptContents('0');
      fetchFeishuAllUsers().then(setFeishuAllUsers);
    }
  }, [isFormOpen, reportMode]);

  // --- Save ---
  const saveTasks = async (updatedTasks: any[], updatedLogs?: ScheduledReportLog[]) => {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      const logsToSave = updatedLogs ?? currentLogs;
      const payload = { tasks: updatedTasks, logs: logsToSave };

      let ok: boolean;
      if (reportMode === 'feishu') {
        ok = await saveFeishuUserConfig(currentUser.username, selectedProject.projectId, 'feishuScheduledReports', payload);
      } else {
        ok = await saveUserConfig(currentUser.username, selectedProject.projectId, 'scheduledReports', payload);
      }

      if (ok) {
        if (reportMode === 'feishu') {
          setFeishuTasks(updatedTasks);
          if (updatedLogs) setFeishuLogs(updatedLogs);
        } else {
          setTasks(updatedTasks);
          if (updatedLogs) setLogs(updatedLogs);
        }
        setSaveMessage({ type: 'success', text: '保存成功' });
      } else {
        setSaveMessage({ type: 'error', text: '保存失败，请重试' });
      }
    } catch (e) {
      console.error('Failed to save:', e);
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
    setFormUpdateOnly(true);
    setFormDateRangePreset('last3');
    setFormCustomDateStart('');
    setFormCustomDateEnd('');
    setFormFeishuUserIds([]);
    setEditingTask(null);
    setTestMessage(null);
  };

  const openCreateForm = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const openEditForm = (task: any) => {
    setEditingTask(task);
    setFormName(task.name);
    setFormFrequency(task.frequency);
    setFormTimeOfDay(task.timeOfDay);
    setFormWeekDay(task.weekDay ?? 1);
    const validIds = new Set(pivotPresets.map(p => p.id));
    setFormPresetIds(task.pivotPresetIds.filter((pid: string) => validIds.has(pid)));
    setFormActive(task.active);
    setFormUpdateOnly(task.updateOnly ?? true);
    setFormDateRangePreset(task.dateRangePreset ?? 'last3');
    setFormCustomDateStart(task.customDateStart ?? '');
    setFormCustomDateEnd(task.customDateEnd ?? '');

    if (reportMode === 'google') {
      setFormEmails(task.emails?.join(', ') ?? '');
    } else {
      setFormFeishuUserIds(task.feishuUserIds ?? []);
    }
    setIsFormOpen(true);
  };

  const isFormValid = () => {
    if (!formName.trim() || formPresetIds.length === 0) return false;
    if (reportMode === 'google') {
      if (formUpdateOnly) return true;
      const emailList = formEmails.split(/[,;\n]+/).map(e => e.trim()).filter(Boolean);
      return emailList.length > 0;
    }
    // 飞书：非仅更新需收件人，仅更新需至少一名通知对象（收飞书 IM）
    return formFeishuUserIds.length > 0;
  };

  const handleFormSubmit = () => {
    if (!isFormValid()) return;

    let taskData: any;
    if (reportMode === 'google') {
      const emailList = formEmails.split(/[,;\n]+/).map(e => e.trim()).filter(Boolean);
      taskData = {
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
        updateOnly: formUpdateOnly,
        lastRunAt: editingTask?.lastRunAt,
        sheetFileId: editingTask?.sheetFileId,
        createdAt: editingTask?.createdAt ?? new Date().toISOString(),
      };
    } else {
      taskData = {
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
        feishuUserIds: formFeishuUserIds,
        feishuSpreadsheetToken: editingTask?.feishuSpreadsheetToken,
        feishuCurrentSheetId: editingTask?.feishuCurrentSheetId,
        feishuLastPresetIds: editingTask?.feishuLastPresetIds,
        updateOnly: formUpdateOnly,
        lastRunAt: editingTask?.lastRunAt,
        createdAt: editingTask?.createdAt ?? new Date().toISOString(),
      };
    }

    let updatedTasks: any[];
    if (editingTask) {
      trackScheduledTaskEdit(currentUser.username, taskData.name);
      updatedTasks = currentTasks.map((t: any) => t.id === editingTask.id ? taskData : t);
    } else {
      trackScheduledTaskCreate(currentUser.username, taskData.name);
      updatedTasks = [...currentTasks, taskData];
    }
    saveTasks(updatedTasks);
    setIsFormOpen(false);
    resetForm();
  };

  const handleTestSend = async () => {
    if (!formName.trim()) { setTestMessage({ type: 'error', text: '请先填写任务名称' }); return; }
    if (formPresetIds.length === 0) { setTestMessage({ type: 'error', text: '请至少选择一个报告' }); return; }

    setIsTesting(true);
    setTestMessage(null);

    try {
      if (reportMode === 'google') {
        const emailList = formEmails.split(/[,;\n]+/).map(e => e.trim()).filter(Boolean);
        if (!formUpdateOnly && emailList.length === 0) { setTestMessage({ type: 'error', text: '请填写至少一个收件邮箱' }); setIsTesting(false); return; }
        const taskPayload: ScheduledReportTaskPayload = {
          id: editingTask?.id,
          active: true,
          name: formName.trim(),
          frequency: formFrequency,
          timeOfDay: formTimeOfDay,
          weekDay: formFrequency === 'weekly' ? formWeekDay : undefined,
          dateRangePreset: formDateRangePreset,
          customDateStart: formDateRangePreset === 'custom' ? formCustomDateStart : undefined,
          customDateEnd: formDateRangePreset === 'custom' ? formCustomDateEnd : undefined,
          pivotPresetIds: formPresetIds,
          emails: emailList,
          updateOnly: formUpdateOnly,
        };
        await testSendScheduledReport(currentUser.username, selectedProject.projectId, taskPayload);
      } else {
        if (!formUpdateOnly && formFeishuUserIds.length === 0) {
          setTestMessage({ type: 'error', text: '请选择至少一个收件人' }); setIsTesting(false); return;
        }
        const taskPayload: FeishuScheduledReportTaskPayload = {
          id: editingTask?.id,
          active: true,
          name: formName.trim(),
          frequency: formFrequency,
          timeOfDay: formTimeOfDay,
          weekDay: formFrequency === 'weekly' ? formWeekDay : undefined,
          dateRangePreset: formDateRangePreset,
          customDateStart: formDateRangePreset === 'custom' ? formCustomDateStart : undefined,
          customDateEnd: formDateRangePreset === 'custom' ? formCustomDateEnd : undefined,
          pivotPresetIds: formPresetIds,
          feishuRecipientType: 'users',
          feishuUserIds: formFeishuUserIds,
          updateOnly: formUpdateOnly,
        };
        await testFeishuScheduledReport(currentUser.username, selectedProject.projectId, taskPayload);
      }
      setTestMessage({ type: 'success', text: formUpdateOnly ? '测试更新已完成，请查看在线文档' : '测试邮件已发送，请稍后在收件邮箱中查收' });
    } catch (e: any) {
      setTestMessage({ type: 'error', text: e?.message || '测试发送失败' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleDeleteTask = (id: string) => {
    const task = currentTasks.find((t: any) => t.id === id);
    if (task) trackScheduledTaskDelete(currentUser.username, (task as any).name);
    const updatedTasks = currentTasks.filter((t: any) => t.id !== id);
    saveTasks(updatedTasks);
  };

  const handleToggleActive = (id: string) => {
    const task = currentTasks.find((t: any) => t.id === id);
    if (task) trackScheduledTaskToggle(currentUser.username, (task as any).name, (task as any).active);
    const updatedTasks = currentTasks.map((t: any) => t.id === id ? { ...t, active: !t.active } : t);
    saveTasks(updatedTasks);
  };

  const togglePresetId = (id: string) => {
    setFormPresetIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const getPresetName = (id: string) => pivotPresets.find(p => p.id === id)?.name ?? id;

  const toggleFeishuUserId = (id: string) => {
    setFormFeishuUserIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const getRecipientSummary = (task: any) => {
    if (task.updateOnly) {
      const n = task.feishuUserIds?.length || 0;
      return n > 0 ? `仅更新，通知 ${n} 人` : '仅更新数据';
    }
    if (reportMode === 'google') {
      const emails = task.emails || [];
      return emails.length > 1 ? `${emails[0]} +${emails.length - 1}` : emails[0] || '-';
    }
    const count = task.feishuUserIds?.length || 0;
    return `${count} 位用户`;
  };

  // 列表数据源：全量用户已加载则用全量（可搜到子部门用户），否则用当前部门用户
  const feishuListSource = feishuAllUsers.length > 0 ? feishuAllUsers : feishuUsers;
  const filteredFeishuUsers = React.useMemo(() => {
    let list = feishuListSource;
    if (currentDeptId !== '0') {
      list = list.filter(u => u.department_ids && u.department_ids.includes(currentDeptId));
    }
    if (!feishuUserSearch.trim()) return list;
    const q = feishuUserSearch.toLowerCase();
    return list.filter(u =>
      (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q)
    );
  }, [feishuListSource, currentDeptId, feishuUserSearch]);

  // --- Render ---
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Mode toggle + Sub-tabs (Google 报表入口已隐藏，仅保留飞书报表) */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {([
          { id: 'tasks' as const, label: '报告定时任务', icon: Clock },
          { id: 'history' as const, label: '发送记录', icon: History },
        ]).map(({ id, label, icon: Icon }) => (
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
          <div className="flex justify-end">
            <button
              onClick={openCreateForm}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-indigo-900/30"
            >
              <Plus className="w-4 h-4" />
              新建{reportMode === 'feishu' ? '飞书' : ''}报告定时任务
            </button>
          </div>

          {displayTasks.length === 0 && !isFormOpen && (
            <div className="bg-slate-900/50 rounded-3xl border border-slate-800 p-16 text-center">
              <Clock className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400 font-bold text-lg mb-2">暂无{reportMode === 'feishu' ? '飞书' : ''}报告定时任务</p>
              <p className="text-slate-500 text-sm mb-6">
                {reportMode === 'feishu'
                  ? '创建飞书报告定时任务后，系统将自动生成飞书表格并发送至所选通讯录人员的邮箱'
                  : '创建报告定时任务后，系统将按设定时间自动生成报告并发送至指定邮箱'}
              </p>
              <button onClick={openCreateForm} className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm rounded-xl transition-all">
                <Plus className="w-4 h-4" />
                创建第一个{reportMode === 'feishu' ? '飞书' : ''}报告定时任务
              </button>
            </div>
          )}

          {displayTasks.map((task: any) => (
            <div key={task.id} className={`bg-slate-900/50 rounded-2xl border p-5 transition-all ${task.active ? 'border-slate-800' : 'border-slate-800/50 opacity-60'}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider ${task.active ? 'bg-emerald-900/30 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                      {task.active ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                      {task.active ? '运行中' : '已暂停'}
                    </span>
                    {reportMode === 'feishu' && (
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-blue-900/30 text-blue-400 uppercase tracking-wider">飞书</span>
                    )}
                    {task.updateOnly && (
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-amber-900/30 text-amber-400 uppercase tracking-wider">仅更新</span>
                    )}
                    <h4 className="font-bold text-white text-lg truncate">{task.name}</h4>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      {task.frequency === 'daily' ? '每天' : `每周${WEEK_DAYS.find(d => d.value === task.weekDay)?.label ?? ''}`}{' '}{task.timeOfDay}
                    </span>
                    <span className="flex items-center gap-1.5">
                      {reportMode === 'feishu' ? <Users className="w-3.5 h-3.5" /> : <Mail className="w-3.5 h-3.5" />}
                      {getRecipientSummary(task)}
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
                  {task.pivotPresetIds.length === 0 ? (
                    <p className="text-amber-500/90 text-xs mt-3 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      该任务暂无有效报告，请编辑添加报告或删除此任务
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {task.pivotPresetIds.map((pid: string) => (
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
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => handleToggleActive(task.id)} className={`p-2 rounded-lg transition-colors ${task.active ? 'text-emerald-400 hover:bg-emerald-900/20' : 'text-slate-500 hover:bg-slate-800'}`} title={task.active ? '暂停' : '启用'}>
                    {task.active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  <button onClick={() => openEditForm(task)} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors" title="编辑">
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDeleteTask(task.id)} className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-900/20 transition-colors" title="删除">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* === Create / Edit Form Modal === */}
          {isFormOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setIsFormOpen(false); resetForm(); }}>
              <div className="bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-8" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-black text-white">
                    {editingTask ? '编辑' : '新建'}{reportMode === 'feishu' ? '飞书' : ''}报告定时任务
                  </h3>
                  <button onClick={() => { setIsFormOpen(false); resetForm(); }} className="p-2 hover:bg-slate-800 rounded-xl transition-colors text-slate-400 hover:text-white">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-6">
                  {/* Task Name */}
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">任务名称</label>
                    <input type="text" value={formName} onChange={e => setFormName(e.target.value)} placeholder="例如：每日投放日报" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white font-medium outline-none focus:border-indigo-500 transition placeholder-slate-600" />
                  </div>

                  {/* Select Reports */}
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">选择要发送的报告 <span className="text-slate-500">({formPresetIds.length} 个已选)</span></label>
                    {pivotPresets.length === 0 ? (
                      <div className="bg-slate-800/50 rounded-xl p-4 text-slate-500 text-sm flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" />当前项目暂无已保存报告
                      </div>
                    ) : (
                      <div className="bg-slate-800/50 rounded-xl border border-slate-700 max-h-48 overflow-y-auto">
                        {pivotPresets.map(preset => (
                          <button key={preset.id} onClick={() => togglePresetId(preset.id)} className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-slate-700/50 ${formPresetIds.includes(preset.id) ? 'text-indigo-300' : 'text-slate-400'}`}>
                            <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${formPresetIds.includes(preset.id) ? 'bg-indigo-600 border-indigo-500' : 'border-slate-600'}`}>
                              {formPresetIds.includes(preset.id) && <Check className="w-3 h-3 text-white" />}
                            </div>
                            <span className="truncate font-medium">{preset.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Frequency */}
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">{formUpdateOnly ? '更新频率' : '发送频率'}</label>
                    <div className="flex gap-3">
                      {(['daily', 'weekly'] as const).map(freq => (
                        <button key={freq} onClick={() => setFormFrequency(freq)} className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all border ${formFrequency === freq ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'}`}>
                          {freq === 'daily' ? '每天' : '每周'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {formFrequency === 'weekly' && (
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">发送日</label>
                      <div className="flex flex-wrap gap-2">
                        {WEEK_DAYS.map(day => (
                          <button key={day.value} onClick={() => setFormWeekDay(day.value)} className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border ${formWeekDay === day.value ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'}`}>
                            {day.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Time */}
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">{formUpdateOnly ? '更新时间' : '发送时间'} (GMT+8)</label>
                    <select value={formTimeOfDay} onChange={e => setFormTimeOfDay(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white font-medium outline-none focus:border-indigo-500 transition appearance-none">
                      {TIME_OPTIONS.map(t => (<option key={t} value={t}>{t}</option>))}
                    </select>
                  </div>

                  {/* Date Range */}
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">数据时间范围</label>
                    <div className="flex flex-wrap gap-2">
                      {DATE_RANGE_OPTIONS.map(opt => (
                        <button key={opt.value} onClick={() => setFormDateRangePreset(opt.value)} className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border ${formDateRangePreset === opt.value ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600'}`}>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {formDateRangePreset === 'custom' && (
                      <div className="grid grid-cols-2 gap-3 mt-3">
                        <div>
                          <span className="text-[9px] text-slate-500 uppercase block mb-1">开始日期</span>
                          <input type="date" value={formCustomDateStart} onChange={e => setFormCustomDateStart(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white font-medium outline-none focus:border-indigo-500 transition" />
                        </div>
                        <div>
                          <span className="text-[9px] text-slate-500 uppercase block mb-1">结束日期</span>
                          <input type="date" value={formCustomDateEnd} onChange={e => setFormCustomDateEnd(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-white font-medium outline-none focus:border-indigo-500 transition" />
                        </div>
                      </div>
                    )}
                    <p className="text-[10px] text-slate-500 mt-2">
                      {formDateRangePreset === 'custom' ? '将使用您指定的固定日期范围拉取数据' : '每次发送时，自动计算相对于发送日期的时间范围'}
                    </p>
                  </div>

                  {/* === Recipients: Google = email (when not updateOnly); Feishu = 收件人 or 通知对象（飞书 IM） === */}
                  {reportMode === 'google' && !formUpdateOnly ? (
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">收件邮箱</label>
                      <textarea value={formEmails} onChange={e => setFormEmails(e.target.value)} placeholder="输入邮箱地址，多个邮箱用逗号或换行分隔" rows={3} className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white font-medium outline-none focus:border-indigo-500 transition placeholder-slate-600 resize-none" />
                    </div>
                  ) : reportMode === 'feishu' ? (
                    <div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
                        {formUpdateOnly ? '通知对象（飞书 IM）' : '收件人（飞书通讯录）'}<span className="text-slate-500 ml-1">已选 {formFeishuUserIds.length} 人</span>
                      </label>
                      {formUpdateOnly && (
                        <p className="text-[10px] text-amber-500/90 mb-2">更新后将通过飞书私信通知以下用户，不发送邮件</p>
                      )}

                      {/* Selected user tags */}
                      {formFeishuUserIds.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                          {formFeishuUserIds.map(uid => {
                            const u = selectedUserCache.get(uid);
                            return (
                              <span key={uid} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-900/30 text-blue-300 text-xs rounded-lg border border-blue-800">
                                {u?.avatar_url && <img src={u.avatar_url} className="w-4 h-4 rounded-full" alt="" />}
                                {u?.name || uid.slice(0, 10)}
                                <button onClick={() => toggleFeishuUserId(uid)} className="ml-0.5 hover:text-white"><X className="w-3 h-3" /></button>
                              </span>
                            );
                          })}
                        </div>
                      )}

                      {/* Breadcrumb navigation */}
                      <div className="flex items-center gap-1 text-xs mb-2 overflow-x-auto">
                        {deptBreadcrumb.map((crumb, idx) => (
                          <React.Fragment key={crumb.id}>
                            {idx > 0 && <ChevronRight className="w-3 h-3 text-slate-600 shrink-0" />}
                            <button
                              onClick={() => idx < deptBreadcrumb.length - 1 && navigateBreadcrumb(idx)}
                              className={`shrink-0 px-2 py-1 rounded-md transition-colors ${idx === deptBreadcrumb.length - 1 ? 'text-indigo-400 font-bold' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
                            >
                              {crumb.name}
                            </button>
                          </React.Fragment>
                        ))}
                      </div>

                      {/* Search */}
                      <div className="relative mb-2">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                        <input type="text" value={feishuUserSearch} onChange={e => setFeishuUserSearch(e.target.value)} placeholder="搜索用户名或邮箱" className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white outline-none focus:border-indigo-500 placeholder-slate-600" />
                      </div>

                      {/* Sub-departments + Users list */}
                      <div className="bg-slate-800/50 rounded-xl border border-slate-700 max-h-60 overflow-y-auto">
                        {isLoadingContacts ? (
                          <div className="p-4 text-center text-slate-500 text-sm">加载中...</div>
                        ) : (
                          <>
                            {/* Sub-departments (only when not searching) */}
                            {!feishuUserSearch.trim() && feishuSubDepts.length > 0 && (
                              <>
                                {feishuSubDepts.map(dept => (
                                  <button
                                    key={dept.open_department_id}
                                    onClick={() => navigateToDept(dept)}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-slate-700/50 text-slate-300 border-b border-slate-700/50"
                                  >
                                    <FolderOpen className="w-4 h-4 shrink-0 text-amber-500/80" />
                                    <span className="font-medium truncate">{dept.name || dept.open_department_id}</span>
                                    <span className="text-xs text-slate-500 ml-auto shrink-0 flex items-center gap-1">
                                      {dept.member_count} 人
                                      <ChevronRight className="w-3 h-3" />
                                    </span>
                                  </button>
                                ))}
                              </>
                            )}

                            {/* Users */}
                            {filteredFeishuUsers.length === 0 && feishuSubDepts.length === 0 ? (
                              <div className="p-4 text-center text-slate-500 text-sm">该部门下暂无用户</div>
                            ) : filteredFeishuUsers.length === 0 && feishuUserSearch.trim() ? (
                              <div className="p-4 text-center text-slate-500 text-sm">未找到匹配的用户</div>
                            ) : (
                              filteredFeishuUsers.map(user => (
                                <button
                                  key={user.open_id}
                                  onClick={() => { toggleFeishuUserId(user.open_id); setSelectedUserCache(prev => new Map(prev).set(user.open_id, user)); }}
                                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-slate-700/50 ${formFeishuUserIds.includes(user.open_id) ? 'text-blue-300' : 'text-slate-400'}`}
                                >
                                  <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${formFeishuUserIds.includes(user.open_id) ? 'bg-blue-600 border-blue-500' : 'border-slate-600'}`}>
                                    {formFeishuUserIds.includes(user.open_id) && <Check className="w-3 h-3 text-white" />}
                                  </div>
                                  {user.avatar_url && <img src={user.avatar_url} className="w-6 h-6 rounded-full shrink-0" alt="" />}
                                  <div className="min-w-0 flex-1">
                                    <span className="font-medium truncate block">{user.name}</span>
                                    {user.email && <span className="text-xs text-slate-500 truncate block">{user.email}</span>}
                                  </div>
                                </button>
                              ))
                            )}
                          </>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-2">点击部门文件夹可进入子部门，跨部门选择的用户会自动保留</p>
                    </div>
                  ) : null}

                  {/* Active Toggle */}
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-bold text-slate-300">启用此任务</label>
                    <button onClick={() => setFormActive(!formActive)} className={`relative w-12 h-7 rounded-full transition-colors ${formActive ? 'bg-indigo-600' : 'bg-slate-700'}`}>
                      <div className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${formActive ? 'translate-x-5' : ''}`} />
                    </button>
                  </div>

                  {/* Submit & Test */}
                  <div className="space-y-2 pt-2">
                    <div className="flex items-center gap-3">
                      <button onClick={handleFormSubmit} disabled={!isFormValid() || isSaving} className="flex-1 flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold rounded-xl transition-all">
                        <Send className="w-4 h-4" />
                        {isSaving ? '保存中...' : (editingTask ? '更新任务' : '创建任务')}
                      </button>
                      <button type="button" onClick={handleTestSend} disabled={!isFormValid() || isTesting} className="px-4 py-3 rounded-xl text-sm font-bold border border-slate-600 text-slate-200 hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2">
                        <Send className="w-4 h-4" />
                        {isTesting ? '测试中...' : (formUpdateOnly ? '测试更新数据' : '发送测试邮件')}
                      </button>
                      <button onClick={() => { setIsFormOpen(false); resetForm(); }} className="px-5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-all">
                        取消
                      </button>
                    </div>
                    {testMessage && (
                      <div className={`text-xs font-bold px-3 py-2 rounded-lg ${testMessage.type === 'success' ? 'bg-emerald-900/30 text-emerald-400' : 'bg-red-900/30 text-red-400'}`}>
                        {testMessage.text}
                      </div>
                    )}
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
          {currentLogs.length === 0 ? (
            <div className="bg-slate-900/50 rounded-3xl border border-slate-800 p-16 text-center">
              <History className="w-12 h-12 text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400 font-bold text-lg mb-2">暂无发送记录</p>
              <p className="text-slate-500 text-sm">报告定时任务执行后，发送记录将在这里展示</p>
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
                  {[...currentLogs].reverse().map((log, idx) => (
                    <tr key={idx} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                      <td className="px-5 py-3 text-slate-400 whitespace-nowrap">{formatDateTime(log.sentAt)}</td>
                      <td className="px-5 py-3 text-white font-medium">{log.taskName}</td>
                      <td className="px-5 py-3 text-slate-400 max-w-[200px] truncate" title={log.presetNames}>{log.presetNames}</td>
                      <td className="px-5 py-3 text-slate-400 max-w-[180px] truncate" title={log.recipients || log.emails}>{log.recipients || log.emails}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase ${log.status === 'SUCCESS' ? 'bg-emerald-900/30 text-emerald-400' : 'bg-red-900/30 text-red-400'}`}>
                          {log.status === 'SUCCESS' ? <Check className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                          {log.status === 'SUCCESS' ? '成功' : '失败'}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        {log.sheetUrl ? (
                          <a href={log.sheetUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition-colors">
                            <ExternalLink className="w-3.5 h-3.5" />查看
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
