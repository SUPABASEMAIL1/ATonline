import { useState } from 'react';
import { Shield, Lock, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { sonner } from '../../lib/sonner';

export function PasswordChange() {
  const { updatePassword } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const passwordRequirements = [
    { label: 'Minimum 6 characters', met: newPassword.length >= 6 },
    { label: 'Passwords match', met: newPassword === confirmPassword && newPassword.length > 0 },
  ];

  const handleUpdate = async () => {
    if (newPassword.length < 6) {
      sonner.error('Password too short: Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      sonner.error('Mismatch: Passwords do not match.');
      return;
    }

    setIsUpdating(true);
    try {
      await updatePassword(newPassword);
      sonner.success('Security Updated: Your password has been changed successfully.');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      sonner.error(`Update Failed: ${error.message || 'Failed to update password.'}`);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center space-y-2">
        <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/20 text-primary rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
          <Shield className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-black text-gray-900 dark:text-white">Change Password</h3>
        <p className="text-sm text-gray-600 font-medium">Keep your account secure with a strong password</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-black text-gray-600 uppercase tracking-widest ml-1">New Password</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10 rounded-2xl py-4 px-5 pr-12 focus:ring-4 focus:ring-emerald-500/10 focus:border-primary transition-all font-bold text-gray-900 dark:text-white"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600 hover:text-primary transition-colors"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-black text-gray-600 uppercase tracking-widest ml-1">Confirm Password</label>
          <input
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full bg-gray-50 dark:bg-white/5 border-gray-200 dark:border-white/10 rounded-2xl py-4 px-5 focus:ring-4 focus:ring-emerald-500/10 focus:border-primary transition-all font-bold text-gray-900 dark:text-white"
            placeholder="••••••••"
          />
        </div>

        <div className="bg-gray-50 dark:bg-white/[0.02] rounded-2xl p-4 border border-gray-200 dark:border-white/5 space-y-3">
          {passwordRequirements.map((req, idx) => (
            <div key={idx} className="flex items-center gap-3">
              {req.met ? (
                <CheckCircle2 className="w-4 h-4 text-primary" />
              ) : (
                <AlertCircle className="w-4 h-4 text-gray-600 dark:text-gray-500" />
              )}
              <span className={`text-xs font-bold ${req.met ? 'text-primary dark:text-emerald-400' : 'text-gray-600'}`}>
                {req.label}
              </span>
            </div>
          ))}
        </div>

        <button
          type="button"
          disabled={isUpdating || !newPassword || newPassword !== confirmPassword || newPassword.length < 6}
          onClick={handleUpdate}
          className="btn btn-md btn-primary w-full hover:bg-emerald-700 disabled:bg-gray-200 dark:disabled:bg-white/5 disabled:text-gray-600 mt-4"
        >
          {isUpdating ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Updating...</span>
            </>
          ) : (
            <>
              <Lock className="w-5 h-5" />
              <span>Update Password</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
