import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

type Mode = 'login' | 'register';

const FIREBASE_ERRORS: Record<string, string> = {
  'auth/user-not-found':       '邮箱未注册，请先创建账号',
  'auth/wrong-password':       '密码错误，请重试',
  'auth/invalid-credential':   '邮箱或密码错误',
  'auth/email-already-in-use': '该邮箱已注册，请直接登录',
  'auth/weak-password':        '密码至少需要 6 位',
  'auth/invalid-email':        '请输入有效的邮箱地址',
  'auth/too-many-requests':    '尝试次数过多，请稍后再试',
};

function friendlyError(e: unknown): string {
  if (e && typeof e === 'object' && 'code' in e) {
    return FIREBASE_ERRORS[(e as { code: string }).code] ?? '发生错误，请重试';
  }
  return '发生错误，请重试';
}

export default function LoginPage() {
  const { signInWithEmail, createAccountWithEmail, loading } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode]           = useState<Mode>('login');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [name, setName]           = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState('');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-bg">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await signInWithEmail(email, password);
      } else {
        if (!name.trim()) { setError('请输入名字'); setSubmitting(false); return; }
        await createAccountWithEmail(email, password, name.trim());
      }
      navigate('/', { replace: true });
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = () => {
    setMode(m => m === 'login' ? 'register' : 'login');
    setError('');
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-6">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-10">
        <div className="w-12 h-12 rounded-2xl bg-accent/20 flex items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="#6ee7b7">
            <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/>
          </svg>
        </div>
        <span className="text-2xl font-bold text-white tracking-tight">PodLingo</span>
      </div>

      {/* Card */}
      <div
        className="w-full max-w-sm bg-surface-2 rounded-3xl p-8 border"
        style={{ borderColor: 'var(--clr-border3)' }}
      >
        <h1 className="text-xl font-bold text-white mb-1">
          {mode === 'login' ? 'Welcome back' : 'Create account'}
        </h1>
        <p className="text-sm text-muted mb-6">
          {mode === 'login'
            ? 'Sign in to access your episodes and vocabulary.'
            : 'Start learning with real podcasts.'}
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Name — register only */}
          {mode === 'register' && (
            <div>
              <label className="block text-xs text-muted mb-1.5">Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your name"
                required
                className="w-full bg-bg border rounded-2xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-accent/60 transition-colors"
                style={{ borderColor: 'var(--clr-border3)' }}
              />
            </div>
          )}

          {/* Email */}
          <div>
            <label className="block text-xs text-muted mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
              className="w-full bg-bg border rounded-2xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-accent/60 transition-colors"
              style={{ borderColor: 'var(--clr-border3)' }}
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs text-muted mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={mode === 'register' ? 'At least 6 characters' : '••••••••'}
              required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className="w-full bg-bg border rounded-2xl px-4 py-3 text-sm text-white placeholder-slate-500 outline-none focus:border-accent/60 transition-colors"
              style={{ borderColor: 'var(--clr-border3)' }}
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-xs text-red-400 pt-1">{error}</p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-accent text-bg font-semibold text-sm py-3.5 rounded-2xl hover:bg-accent/90 active:scale-[0.98] transition-all disabled:opacity-60 mt-2"
          >
            {submitting
              ? (mode === 'login' ? 'Signing in…' : 'Creating account…')
              : (mode === 'login' ? 'Sign in' : 'Create account')}
          </button>
        </form>

        {/* Mode toggle */}
        <p className="text-sm text-muted text-center mt-5">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            onClick={switchMode}
            className="text-accent hover:text-accent/80 font-medium transition-colors"
          >
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}
