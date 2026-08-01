import React, { useState } from 'react';
import { Lock, Eye, Moon } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { sonner } from '../../lib/sonner';
import { Button } from '../../shared/ui';

export function ResetPasswordPage() {
  const { updatePassword, signOut, setIsRecoveringPassword } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword.length < 6) {
      sonner.warning('Password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      sonner.error('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await updatePassword(newPassword);
      sonner.success('Password updated successfully! Welcome back.');
      setIsRecoveringPassword(false);
    } catch (error: any) {
      console.error('Password reset error:', error);
      sonner.error(`Failed to update password: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    try {
      await signOut();
      setIsRecoveringPassword(false);
    } catch (e) {
      setIsRecoveringPassword(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-100 dark:from-[#0A0A0A] dark:via-[#0A1A10] dark:to-[#0F172A] flex items-center justify-center p-4 transition-colors duration-500 overflow-y-auto">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <img
            src="/zaynahs-logo.svg"
            alt="Zaynah's POS"
            width={80}
            height={80}
            style={{ borderRadius: 16 }}
            className="mx-auto mb-5 shadow-2xl shadow-emerald-500/20 ring-2 ring-white/10 object-contain"
          />
          <h1 className="text-3xl font-black text-gray-900 dark:text-white mb-1 tracking-tight">Set New Password</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Choose a secure new password for your account.
          </p>
        </div>

        <div className="card p-8 shadow-2xl border-0 dark:bg-surface dark:border dark:border-white/5">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                New Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600 dark:text-gray-500 h-4 w-4" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="input pl-10 h-11 dark:bg-white/5 dark:border-white/10 dark:text-white"
                  placeholder="Enter new password"
                  required
                  minLength={6}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                Confirm Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-600 dark:text-gray-500 h-4 w-4" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input pl-10 pr-[44px] h-11 dark:bg-white/5 dark:border-white/10 dark:text-white"
                  placeholder="Confirm new password"
                  required
                  minLength={6}
                />
                <Button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="!absolute !right-3 !top-1/2 !-translate-y-1/2 !min-h-0 !p-1 !text-gray-600 dark:!text-gray-500"
                >
                  {showPassword ? <Moon className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <Button
              type="submit"
              fullWidth
              loading={loading}
              disabled={loading}
              className="!h-11 !font-semibold !shadow-xl !shadow-emerald-500/20 hover:!shadow-emerald-500/40 active:!scale-[0.98] disabled:!opacity-50"
            >
              {loading ? <span>Saving Password...</span> : <span>Save Password</span>}
            </Button>

            <Button
              type="button"
              variant="ghost"
              onClick={handleCancel}
              className="!min-h-0 !w-full !pt-2 !pb-0 !text-sm !font-medium !normal-case !tracking-normal !text-gray-600 dark:!text-gray-400 hover:!text-gray-800 dark:hover:!text-gray-200"
            >
              Cancel & Log Out
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
