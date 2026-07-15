import React, { useState } from 'react';
import { X, Image as ImageIcon } from 'lucide-react';
import { MediaLibrary } from '../inventory/MediaLibrary';

interface LogoUploadProps {
  currentLogo?: string;
  onLogoChange: (logo: string | undefined) => void;
  disabled?: boolean;
}

export function LogoUpload({ currentLogo, onLogoChange, disabled = false }: LogoUploadProps) {
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);

  const removeLogo = () => {
    if (disabled) return;
    onLogoChange(undefined);
  };

  return (
    <div className="space-y-4">
      <label className="block text-sm font-semibold text-gray-700">
        Store Logo
      </label>

      {currentLogo ? (
        <div className="relative inline-block">
          <img
            src={currentLogo}
            alt="Store Logo"
            className="h-24 w-24 object-contain border border-gray-200 dark:border-white/10 rounded-xl bg-white dark:bg-white/[0.03] p-2"
          />
          <button
            onClick={removeLogo}
            disabled={disabled}
            className={`absolute -top-2 -right-2 rounded-full p-1 transition-colors ${disabled
              ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
              : 'bg-red-500 text-white hover:bg-red-600'
              }`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${disabled
            ? 'border-gray-200 dark:border-white/5 bg-gray-100 dark:bg-white/5 cursor-not-allowed'
            : 'border-gray-300 dark:border-white/10 hover:border-gray-400 dark:hover:border-white/20 cursor-pointer'
            }`}
          onClick={() => !disabled && setShowMediaLibrary(true)}
        >
          <div className="flex flex-col items-center space-y-3">
            <div className="bg-gray-100 dark:bg-white/5 p-3 rounded-xl">
              <ImageIcon className="h-8 w-8 text-gray-600 dark:text-gray-500" />
            </div>
            <div>
              <p className={`text-sm font-medium ${disabled ? 'text-gray-600' : 'text-gray-900 shadow-custom text-black dark:text-white'}`}>
                {disabled ? 'Upload disabled' : 'Click to choose or upload from Media Library'}
              </p>
              <p className="text-xs text-gray-600">
                Supports WebP, PNG, JPG · Compressed & Reusable
              </p>
            </div>
          </div>
        </div>
      )}

      {showMediaLibrary && (
        <MediaLibrary
          isOpen={showMediaLibrary}
          onClose={() => setShowMediaLibrary(false)}
          onSelect={onLogoChange}
        />
      )}
    </div>
  );
}