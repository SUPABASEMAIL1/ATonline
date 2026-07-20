import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown, X, Plus } from 'lucide-react';

interface Option {
  id: string;
  label: string;
  image?: string;
  sublabel?: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  onAddNew?: (search: string) => void;
  placeholder?: string;
  label?: string;
  icon?: any;
  required?: boolean;
  align?: 'left' | 'right';
}

export function SearchableSelect({
  options,
  value,
  onChange,
  onAddNew,
  placeholder = 'Search...',
  label,
  icon: Icon,
  required,
  align = 'left'
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedOption = useMemo(() => options.find(o => o.id === value), [options, value]);

  const filteredOptions = useMemo(() => {
    return options.filter(o => String(o.label || '').toLowerCase().includes(search.toLowerCase()) || String(o.sublabel || '').toLowerCase().includes(search.toLowerCase()));
  }, [options, search]);

  const positionDropdown = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const triggerWidth = rect.width;
    const gap = 4;
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom;
    const dropdownHeight = Math.min(filteredOptions.length * 44 + 60, 280);

    const style: React.CSSProperties = {
      position: 'fixed',
      minWidth: Math.max(triggerWidth, 180),
      maxWidth: Math.min(300, window.innerWidth - 32),
      zIndex: 9999,
    };

    if (align === 'right') {
      style.right = window.innerWidth - rect.right;
    } else {
      style.left = rect.left;
    }

    if (spaceBelow < dropdownHeight + gap) {
      style.bottom = window.innerHeight - rect.top + gap;
      style.maxHeight = Math.min(280, rect.top - gap);
    } else {
      style.top = rect.bottom + gap;
      style.maxHeight = Math.min(280, spaceBelow - gap);
    }

    setDropdownStyle(style);
  }, [filteredOptions.length, align]);

  const openDropdown = useCallback(() => {
    setIsOpen(true);
    positionDropdown();
  }, [positionDropdown]);

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setSearch('');
  }, []);

  const handleClickOutside = useCallback((event: MouseEvent) => {
    if (
      containerRef.current && !containerRef.current.contains(event.target as Node) &&
      dropdownRef.current && !dropdownRef.current.contains(event.target as Node)
    ) {
      closeDropdown();
    }
  }, [closeDropdown]);

  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') closeDropdown();
  }, [closeDropdown]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
      window.addEventListener('scroll', positionDropdown, true);
      window.addEventListener('resize', positionDropdown);
      document.body.style.overflow = 'hidden';
      setTimeout(() => searchInputRef.current?.focus(), 50);
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('scroll', positionDropdown, true);
      window.removeEventListener('resize', positionDropdown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleClickOutside, handleEscape, positionDropdown]);

  return (
    <div className={`relative ${isOpen ? 'z-[300]' : 'z-30'}`} ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => isOpen ? closeDropdown() : openDropdown()}
        className={`flex items-center gap-2 px-3 py-2 bg-white dark:bg-black/30 rounded-xl border transition-all active:scale-95 w-full text-left min-h-[36px] sm:min-h-[40px] ${
          required && !value ? 'border-rose-500/50 shadow-sm shadow-rose-500/10' : 'border-gray-200 dark:border-white/5'
        }`}
      >
        {Icon && <Icon className="h-3.5 w-3.5 text-gray-600 shrink-0" />}
        <span className="flex-1 text-[10px] font-black uppercase tracking-widest truncate text-gray-900 dark:text-white flex items-center gap-2">
          {label ? <span className="text-gray-600 dark:text-gray-400 mr-1">{label}:</span> : ''}
          {selectedOption?.image && <img src={selectedOption.image} alt="" className="w-5 h-5 rounded-md object-cover" />}
          {selectedOption?.label || value || 'Select...'}
        </span>
        <ChevronDown className={`h-3 w-3 text-gray-600 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && createPortal(
        <div
          ref={dropdownRef}
          style={dropdownStyle}
          className="bg-[var(--bg-card,#fff)] dark:bg-[var(--surface,#111)] border border-gray-200 dark:border-white/10 rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.15)] flex flex-col overflow-hidden animate-in fade-in duration-100"
        >
          <div className="p-1.5 border-b border-gray-200 dark:border-white/5 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={placeholder}
                className="w-full bg-gray-50 dark:bg-black/75 border-none rounded-lg pl-8 pr-3 py-1.5 text-[16px] font-bold focus:ring-1 focus:ring-emerald-500 outline-none"
                style={{ fontSize: '16px' }}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-1 scrollbar-hide" style={{ maxHeight: dropdownStyle.maxHeight ? `calc(${typeof dropdownStyle.maxHeight === 'number' ? dropdownStyle.maxHeight + 'px' : dropdownStyle.maxHeight} - 60px)` : '220px' }}>
            {filteredOptions.length > 0 ? (
              <div className="flex flex-col gap-0.5">
                {filteredOptions.map((option, index) => (
                  <button
                    key={option.id || `opt-${index}`}
                    onClick={() => {
                      onChange(option.id);
                      closeDropdown();
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 transition-colors ${
                      value === option.id
                        ? 'bg-primary text-white'
                        : 'text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-white/10'
                    }`}
                    style={{ minHeight: '40px' }}
                  >
                    {option.image && (
                      <img src={option.image} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />
                    )}
                    <div className="flex flex-col min-w-0">
                      <span className="text-[12px] font-bold uppercase tracking-wider truncate">{option.label}</span>
                      {option.sublabel && <span className={`text-[9px] font-black uppercase tracking-widest truncate ${value === option.id ? 'text-white/80' : 'text-gray-500 dark:text-gray-400'}`}>{option.sublabel}</span>}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-3 text-center text-gray-500 text-[11px] font-bold uppercase">No results found</div>
            )}
          </div>

          {onAddNew && search.trim() && !options.some(o => o.label.toLowerCase() === search.toLowerCase()) && (
            <div className="p-1 border-t border-gray-200 dark:border-white/5 bg-gray-50/30 dark:bg-white/[0.02] flex-shrink-0">
              <button
                type="button"
                onClick={() => {
                  onAddNew(search);
                  closeDropdown();
                }}
                className="w-full text-left px-3 py-2 rounded-lg text-[13px] font-bold uppercase tracking-wider text-primary hover:bg-primary/10 transition-all flex items-center gap-2"
                style={{ minHeight: '40px' }}
              >
                <div className="w-5 h-5 bg-primary/10 rounded flex items-center justify-center">
                   <Plus className="h-3 w-3" />
                </div>
                Add New "{search}"
              </button>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
