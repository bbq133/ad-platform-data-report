import React, { useState } from 'react';
import { User, Lock, Loader2, AlertCircle, BarChart3, ExternalLink, PlayCircle, Sun, Moon } from 'lucide-react';
import { fetchUserPermissions, UserInfo } from './auth-service';
import { useUiMode } from './ui-mode-context';

interface LoginPageProps {
    onLoginSuccess: (userInfo: UserInfo) => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
    const { uiMode, setUiMode } = useUiMode();
    const isBright = uiMode === 'bright-minimal';
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim() || !password.trim()) {
            setError('请输入用户名和密码');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const userInfo = await fetchUserPermissions(username, password);
            onLoginSuccess(userInfo);
        } catch (err) {
            setError(err instanceof Error ? err.message : '登录失败，请稍后重试');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            className={
                isBright
                    ? 'min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans selection:bg-blue-200 transition-colors duration-200'
                    : 'min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans selection:bg-indigo-500/30'
            }
        >
            {/* UI 模式切换 */}
            <div className="fixed top-4 right-4 z-20 flex items-center gap-0.5 rounded-xl border overflow-hidden shadow-sm" role="group" aria-label="UI 模式">
                <button
                    type="button"
                    onClick={() => setUiMode('bright-minimal')}
                    className={`flex items-center justify-center w-11 h-10 transition-all duration-200 cursor-pointer ${isBright ? 'bg-blue-600 text-white' : 'bg-slate-800/50 text-slate-400 hover:bg-slate-700 hover:text-slate-200 border-r border-slate-700'}`}
                    title="日光模式"
                    aria-label="日光模式"
                >
                    <Sun className="w-5 h-5" />
                </button>
                <button
                    type="button"
                    onClick={() => setUiMode('default')}
                    className={`flex items-center justify-center w-11 h-10 transition-all duration-200 cursor-pointer ${isBright ? 'bg-slate-100 text-slate-600 hover:bg-slate-200 border-l border-slate-200' : 'bg-slate-800 text-white border-l border-slate-700'}`}
                    title="夜晚模式"
                    aria-label="夜晚模式"
                >
                    <Moon className="w-5 h-5" />
                </button>
            </div>
            {/* Background decorative elements */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/10 blur-[120px] rounded-full"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/10 blur-[120px] rounded-full"></div>
            </div>

            <div className="max-w-md w-full relative z-10 animate-in fade-in zoom-in duration-500">
                {/* Logo Section */}
                <div className="flex flex-col items-center mb-10">
                    <div
                        className={
                            isBright
                                ? 'w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg mb-6 group hover:scale-105 transition-transform duration-300'
                                : 'w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-indigo-500/20 mb-6 group hover:scale-105 transition-transform duration-300'
                        }
                    >
                        <BarChart3 className="w-10 h-10 text-white" />
                    </div>
                    <div className="text-center">
                        <h1 className={`text-3xl font-black tracking-tight font-heading ${isBright ? 'text-blue-900' : 'bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400'}`}>
                            AdIntel
                        </h1>
                        <p className={isBright ? 'text-slate-500 font-light uppercase tracking-[0.3em] text-[10px] mt-1' : 'text-slate-500 font-light uppercase tracking-[0.3em] text-[10px] mt-1'}>
                            Growth Scientist
                        </p>
                    </div>
                </div>

                {/* Login Card */}
                <div
                    className={
                        isBright
                            ? 'bg-white backdrop-blur-xl border border-slate-200 rounded-[32px] p-10 shadow-xl relative overflow-hidden'
                            : 'bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-[32px] p-10 shadow-2xl relative overflow-hidden'
                    }
                >
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 opacity-50"></div>

                    <div className="text-center mb-8">
                        <h2 className={`text-xl font-bold tracking-tight font-heading ${isBright ? 'text-blue-900' : 'text-white'}`}>欢迎回来</h2>
                        <p className={isBright ? 'text-slate-500 text-xs mt-2 uppercase tracking-widest font-black opacity-60' : 'text-slate-400 text-xs mt-2 uppercase tracking-widest font-black opacity-60'}>请登录以访问决策中心</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {error && (
                            <div className="bg-rose-500/10 border border-rose-500/30 text-rose-600 p-4 rounded-2xl flex items-start gap-3 text-xs animate-in slide-in-from-top-2">
                                <AlertCircle size={16} className="shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 block">用户名</label>
                            <div className="relative group">
                                <User className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${isBright ? 'text-slate-500 group-focus-within:text-blue-600' : 'text-slate-500 group-focus-within:text-indigo-400'}`} size={18} />
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className={
                                        isBright
                                            ? 'w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all duration-200 placeholder:text-slate-400 text-slate-900 text-sm font-medium'
                                            : 'w-full pl-12 pr-4 py-4 bg-slate-800/50 border border-slate-700 rounded-2xl focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-600 text-white text-sm font-medium'
                                    }
                                    placeholder="输入您的账号"
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 block">授权密码</label>
                            <div className="relative group">
                                <Lock className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${isBright ? 'text-slate-500 group-focus-within:text-blue-600' : 'text-slate-500 group-focus-within:text-indigo-400'}`} size={18} />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className={
                                        isBright
                                            ? 'w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all duration-200 placeholder:text-slate-400 text-slate-900 text-sm font-medium'
                                            : 'w-full pl-12 pr-4 py-4 bg-slate-800/50 border border-slate-700 rounded-2xl focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-600 text-white text-sm font-medium'
                                    }
                                    placeholder="输入您的访问密码"
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-2xl transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-xl shadow-indigo-500/10 hover:shadow-indigo-500/20 active:scale-[0.98] text-sm tracking-widest uppercase cursor-pointer"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="animate-spin" size={18} />
                                    <span>系统验证中...</span>
                                </>
                            ) : (
                                <span>身份认证</span>
                            )}
                        </button>

                        <a
                            href="https://tvo7pfzu3em.feishu.cn/share/base/form/shrcny5j6CayUgZnkiY8Jpkoj2e"
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`mt-4 w-full flex items-center justify-center gap-2 py-3 text-xs font-medium transition-colors duration-200 rounded-2xl cursor-pointer ${isBright ? 'text-slate-500 hover:text-blue-600 border border-slate-200 hover:border-blue-300' : 'text-slate-400 hover:text-indigo-400 border border-slate-700/50 hover:border-indigo-500/30'}`}
                        >
                            <ExternalLink size={14} />
                            <span>账号申请入口</span>
                        </a>
                        <a
                            href="https://tvo7pfzu3em.feishu.cn/wiki/YVg6wTHxPiuE0YkC3t5cpZJWnjf?from=from_copylink"
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`w-full flex items-center justify-center gap-2 py-3 text-xs font-medium transition-colors duration-200 rounded-2xl cursor-pointer ${isBright ? 'text-slate-500 hover:text-blue-600 border border-slate-200 hover:border-blue-300' : 'text-slate-400 hover:text-indigo-400 border border-slate-700/50 hover:border-indigo-500/30'}`}
                        >
                            <PlayCircle size={14} />
                            <span>演示视频</span>
                        </a>
                    </form>

                    <div className="mt-10 text-center">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                            如需技术支持或权限申请，敬请联系系统管理员
                        </p>
                    </div>
                </div>

                {/* Optional Footer info */}
                <div className="mt-12 text-center opacity-40">
                    <p className="text-[9px] font-medium text-slate-500 tracking-tighter">
                        © 2026 AdIntel Ecosystem. Aetherion Logic Engine V4.2
                    </p>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
