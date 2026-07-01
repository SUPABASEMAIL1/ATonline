import React, { useState, useRef } from 'react';
import { X, Image as ImageIcon, Loader2 } from 'lucide-react';
import { compressImage } from '../../lib/imageCompression';

interface LogoUploadProps {
  currentLogo?: string;
  onLogoChange: (logo: string | undefined) => void;
  disabled?: boolean;
}

export function LogoUpload({ currentLogo, onLogoChange, disabled = false }: LogoUploadProps) {
  const [dragOver, setDragOver] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (file: File) => {
    if (disabled) return;
    if (file && file.type.startsWith('image/')) {
      try {
        setIsCompressing(true);
        // Compress and convert to WebP (target 20-50KB)
        const compressedFile = await compressImage(file, 800, 800, 0.7);

        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result as string;
          onLogoChange(result);
        };
        reader.readAsDataURL(compressedFile);
      } catch (error) {
        console.error('Compression failed:', error);
        // Fallback to original if compression fails (though it shouldn't)
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result as string;
          onLogoChange(result);
        };
        reader.readAsDataURL(file);
      } finally {
        setIsCompressing(false);
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const removeLogo = () => {
    if (disabled) return;
    onLogoChange(undefined);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
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
            : dragOver
              ? 'border-blue-400 dark:border-blue-500/50 bg-blue-50 dark:bg-blue-500/5 cursor-pointer'
              : 'border-gray-300 dark:border-white/10 hover:border-gray-400 dark:hover:border-white/20 cursor-pointer'
            }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => !disabled && fileInputRef.current?.click()}
        >
          <div className="flex flex-col items-center space-y-3">
            <div className="bg-gray-100 dark:bg-white/5 p-3 rounded-xl">
              {isCompressing ? (
                <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
              ) : (
                <ImageIcon className="h-8 w-8 text-gray-600 dark:text-gray-500" />
              )}
            </div>
            <div>
              <p className={`text-sm font-medium ${disabled ? 'text-gray-600' : 'text-gray-900 shadow-custom text-black dark:text-white'}`}>
                {isCompressing ? 'Optimizing Image...' : disabled ? 'Upload disabled' : 'Click to upload or drag and drop'}
              </p>
              <p className="text-xs text-gray-600">
                WebP, PNG, JPG (Auto-compressed to 20-50KB)
              </p>
            </div>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileInput}
        disabled={disabled}
        className="hidden"
      />
    </div>
  );
}