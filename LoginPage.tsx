import React, { useState } from 'react';
import { User, Lock, Loader2, AlertCircle, BarChart3, ExternalLink } from 'lucide-react';
import { fetchUserPermissions, UserInfo } from './auth-service';

interface LoginPageProps {
    onLoginSuccess: (userInfo: UserInfo) => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
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
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans selection:bg-indigo-500/30">
            {/* Background decorative elements */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-500/10 blur-[120px] rounded-full"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-500/10 blur-[120px] rounded-full"></div>
            </div>

            <div className="max-w-md w-full relative z-10 animate-in fade-in zoom-in duration-500">
                {/* Logo Section */}
                <div className="flex flex-col items-center mb-10">
                    <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-indigo-500/20 mb-6 group hover:scale-105 transition-transform duration-300">
                        <BarChart3 className="w-10 h-10 text-white" />
                    </div>
                    <div className="text-center">
                        <h1 className="text-3xl font-black bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 tracking-tight">
                            AdIntel
                        </h1>
                        <p className="text-slate-500 font-light uppercase tracking-[0.3em] text-[10px] mt-1">
                            Growth Scientist
                        </p>
                    </div>
                </div>

                {/* Login Card */}
                <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 rounded-[32px] p-10 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 opacity-50"></div>

                    <div className="text-center mb-8">
                        <h2 className="text-xl font-bold text-white tracking-tight">欢迎回来</h2>
                        <p className="text-slate-400 text-xs mt-2 uppercase tracking-widest font-black opacity-60">请登录以访问决策中心</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {error && (
                            <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 p-4 rounded-2xl flex items-start gap-3 text-xs animate-in slide-in-from-top-2">
                                <AlertCircle size={16} className="shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 block">用户名</label>
                            <div className="relative group">
                                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition-colors" size={18} />
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="w-full pl-12 pr-4 py-4 bg-slate-800/50 border border-slate-700 rounded-2xl focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-600 text-white text-sm font-medium"
                                    placeholder="输入您的账号"
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1 block">授权密码</label>
                            <div className="relative group">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-indigo-400 transition-colors" size={18} />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full pl-12 pr-4 py-4 bg-slate-800/50 border border-slate-700 rounded-2xl focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-600 text-white text-sm font-medium"
                                    placeholder="输入您的访问密码"
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-2xl transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-xl shadow-indigo-500/10 hover:shadow-indigo-500/20 active:scale-[0.98] text-sm tracking-widest uppercase"
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
                            className="mt-4 w-full flex items-center justify-center gap-2 py-3 text-slate-400 hover:text-indigo-400 text-xs font-medium transition-colors rounded-2xl border border-slate-700/50 hover:border-indigo-500/30"
                        >
                            <ExternalLink size={14} />
                            <span>账号申请入口</span>
                        </a>
                    </form>

                    <div className="mt-10 text-center">
                        <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
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
