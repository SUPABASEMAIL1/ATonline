import React, { useState } from 'react';
import { Lock, Mail, Eye, Moon, Globe, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { sonner } from '../../lib/sonner';
import { openExternalLink, openMail } from '../../lib/urlHelper';
import { supabase } from '../../lib/supabase';

export function LoginPage() {
  const { signIn, loading } = useAuth();
  const [mode, setMode] = useState<'login' | 'forgot_password'>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [credentials, setCredentials] = useState({
    email: '',
    password: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === 'login') {
      if (!credentials.email.trim() || !credentials.password.trim()) {
        sonner.warning('Please enter both email/username and password');
        return;
      }
      try {
        await signIn(credentials.email.trim(), credentials.password);
      } catch (error: any) {
        console.debug('Login error handled by AuthContext:', error.message);
      }
    }
  };

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) {
      sonner.warning('Please enter your email address');
      return;
    }
    if (!resetEmail.includes('@')) {
      sonner.warning('Please enter a valid email address');
      return;
    }

    setResetLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
        redirectTo: `${window.location.origin}`,
      });
      if (error) throw error;

      sonner.success('Password reset link sent! Check your email inbox.');
      setResetEmail('');
      setMode('login');
    } catch (error: any) {
      console.error('Password reset error:', error);
      sonner.error(`Failed to send link: ${error.message}`);
    } finally {
      setResetLoading(false);
    }
  };

  const handlePaste = async (field: 'email' | 'password') => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setCredentials(prev => ({ ...prev, [field]: text }));
      }
    } catch (err) {
      console.error('Failed to read clipboard contents: ', err);
      sonner.error('Failed to paste. Check your browser clipboard permissions.');
    }
  };

  const handlePasteReset = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setResetEmail(text);
      }
    } catch (err) {
      console.error('Failed to read clipboard contents: ', err);
      sonner.error('Failed to paste. Check your browser clipboard permissions.');
    }
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-100 dark:from-[#0A0A0A] dark:via-[#0A1A10] dark:to-[#0F172A] flex flex-col py-8 px-4 transition-colors duration-500 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
      <div className="w-full max-w-md animate-fade-in m-auto">
        <div className="text-center mb-8">
          <img
            src="/logo.png"
            alt="Zaynah's POS"
            width={80}
            height={80}
            style={{ borderRadius: 16 }}
            loading="eager"
            className="mx-auto mb-5 shadow-2xl shadow-emerald-500/20 ring-2 ring-white/10 object-contain"
          />
          <h1 className="text-3xl font-black text-gray-900 dark:text-white mb-1 tracking-tight">Zaynah's POS</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {mode === 'forgot_password' ? 'Reset your password' : 'Welcome back! Please sign in'}
          </p>
        </div>

        <div className="card p-8 shadow-2xl border-0 dark:bg-surface dark:border dark:border-white/5">
          {mode === 'login' ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                  Email or Username
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600 dark:text-gray-500 h-4 w-4" />
                  <input
                    type="text"
                    value={credentials.email}
                    onChange={(e) => setCredentials(prev => ({ ...prev, email: e.target.value }))}
                    className="input pl-10 pr-[68px] h-11 dark:bg-white/5 dark:border-white/10 dark:text-white"
                    placeholder="Enter your email or username"
                    required
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                    <button
                      type="button"
                      onClick={() => handlePaste('email')}
                      className="px-2 py-1 text-[10px] font-bold text-gray-400 hover:text-primary dark:text-gray-500 dark:hover:text-emerald-400 transition-colors uppercase tracking-wider"
                    >
                      PASTE
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setMode('forgot_password')}
                    className="text-xs text-primary dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 font-medium"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600 dark:text-gray-500 h-4 w-4" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={credentials.password}
                    onChange={(e) => setCredentials(prev => ({ ...prev, password: e.target.value }))}
                    className="input pl-10 pr-[88px] h-11 dark:bg-white/5 dark:border-white/10 dark:text-white"
                    placeholder="Enter your password"
                    required
                    minLength={6}
                  />
                  <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center">
                    <button
                      type="button"
                      onClick={() => handlePaste('password')}
                      className="px-2 py-1 text-[10px] font-bold text-gray-400 hover:text-primary dark:text-gray-500 dark:hover:text-emerald-400 transition-colors uppercase tracking-wider"
                    >
                      PASTE
                    </button>
                    <div className="w-[1px] h-4 bg-gray-200 dark:bg-white/10 mx-0.5"></div>
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                    >
                      {showPassword ? <Moon className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn btn-md btn-primary w-full h-11 font-semibold shadow-xl shadow-emerald-500/20 hover:shadow-emerald-500/40 transform active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Signing in...</span>
                  </>
                ) : (
                  <span>Sign In</span>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleForgotPasswordSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600 dark:text-gray-500 h-4 w-4" />
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className="input pl-10 pr-[68px] h-11 dark:bg-white/5 dark:border-white/10 dark:text-white"
                    placeholder="Enter your registered email"
                    required
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                    <button
                      type="button"
                      onClick={handlePasteReset}
                      className="px-2 py-1 text-[10px] font-bold text-gray-400 hover:text-primary dark:text-gray-500 dark:hover:text-emerald-400 transition-colors uppercase tracking-wider"
                    >
                      PASTE
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={resetLoading}
                className="btn btn-md btn-primary w-full h-11 font-semibold shadow-xl shadow-emerald-500/20 hover:shadow-emerald-500/40 transform active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {resetLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Sending Link...</span>
                  </>
                ) : (
                  <span>Send Reset Link</span>
                )}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="inline-flex items-center text-sm text-primary dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 font-medium space-x-1"
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back to Sign In</span>
                </button>
              </div>
            </form>
          )}

          <div className="mt-6 p-4 bg-gradient-to-r from-gray-50 to-slate-50 dark:from-white/5 dark:to-white/10 rounded-xl border border-gray-200 dark:border-white/5">
            <p className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-2 text-center uppercase tracking-wider">Need any help?</p>
            <div className="space-y-2">
              <button
                onClick={() => openMail('ZAYNAHSPOS@GMAIL.COM')}
                className="flex items-center justify-center space-x-2 text-[10px] text-gray-600 dark:text-gray-400 hover:text-primary dark:hover:text-emerald-400 transition-colors w-full"
              >
                <Mail className="h-3 w-3" />
                <span>ZAYNAHSPOS@GMAIL.COM</span>
              </button>

              <button
                onClick={() => openExternalLink('https://WWW.ZAYNAHSPOS.COM')}
                className="flex items-center justify-center space-x-2 text-[10px] text-gray-600 dark:text-gray-400 hover:text-primary dark:hover:text-emerald-400 transition-colors w-full"
              >
                <Globe className="h-3 w-3" />
                <span>WWW.ZAYNAHSPOS.COM</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}