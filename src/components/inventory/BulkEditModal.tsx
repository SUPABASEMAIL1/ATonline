import { useState, useRef } from 'react';
import { X, DollarSign, Tag, User, Image as ImageIcon, CheckCircle2, Loader2, Upload, Layers } from 'lucide-react';
import { productsService } from '../../lib/services';
import { useApp } from '../../context/SupabaseAppContext';
import { Product } from '../../types';
import { sonner } from '../../lib/sonner';
import { SearchableSelect } from '../common/SearchableSelect';
import { MediaLibrary } from './MediaLibrary';
import { compressImage } from '../../lib/imageCompression';
import { Modal } from '../common/Modal';
import { useTranslation } from '../../hooks/useTranslation';

interface BulkEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedIds: string[];
  categories: string[];
  suppliers: string[];
}

export function BulkEditModal({ isOpen, onClose, selectedIds, categories, suppliers }: BulkEditModalProps) {
  const { state, dispatch } = useApp();
  const { t } = useTranslation();
  const [isUpdating, setIsUpdating] = useState(false);
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filter out 'All' from categories and suppliers for selection
  const availableCategories = categories.filter(c => c !== 'All');
  const availableSuppliers = suppliers.filter(s => s !== 'All');

  const [updates, setUpdates] = useState<Partial<Product>>({
    price: undefined,
    cost: undefined,
    category: undefined,
    supplier: undefined,
    image: undefined,
    active: undefined,
    taxable: undefined,
    isFeatured: undefined,
  });

  const handleApply = async () => {
    if (selectedIds.length === 0) return;

    // Filter out undefined values to only send actual changes
    const actualUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );

    if (Object.keys(actualUpdates).length === 0) {
      sonner.error('No changes selected to apply');
      return;
    }

    setIsUpdating(true);
    sonner.loading(`Updating ${selectedIds.length} items...`);

    try {
      await productsService.bulkUpdate(selectedIds, actualUpdates);

      // Update local state
      const updatedProducts = state.products.map(p =>
        selectedIds.includes(p.id) ? { ...p, ...actualUpdates, updatedAt: new Date() } : p
      );

      dispatch({ type: 'SET_PRODUCTS', payload: updatedProducts });
      sonner.success(`${selectedIds.length} products updated successfully`);
      onClose();
    } catch (error) {
      console.error('Bulk Update Error:', error);
      sonner.error('Failed to apply bulk updates');
    } finally {
      setIsUpdating(false);
      sonner.close();
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      try {
        setIsCompressing(true);
        const compressedFile = await compressImage(file, 800, 800, 0.7);
        const reader = new FileReader();
        reader.onload = (event) => {
          setUpdates(prev => ({
            ...prev,
            image: event.target?.result as string
          }));
        };
        reader.readAsDataURL(compressedFile);
      } catch (error) {
        console.error('Image compression failed:', error);
        // Fallback
        const reader = new FileReader();
        reader.onload = (event) => {
          setUpdates(prev => ({
            ...prev,
            image: event.target?.result as string
          }));
        };
        reader.readAsDataURL(file);
      } finally {
        setIsCompressing(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={t('bulk_logistics')}
        subtitle={t('executing_bulk_protocols').replace('{count}', selectedIds.length.toString())}
        maxWidth="lg"
        footer={
          <div className="flex items-center justify-end gap-2 sm:gap-3 w-full">
            <button
              type="button"
              onClick={onClose}
              className="px-4 sm:px-6 py-2.5 sm:py-3.5 border border-rose-200 dark:border-rose-900/30 text-[#ff4b6e] hover:bg-rose-50 dark:hover:bg-rose-500/10 text-[9px] sm:text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all active:scale-95 shrink-0"
            >
              {t('abort_protocol')}
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={isUpdating}
              className="btn btn-md btn-primary flex-1 sm:flex-none sm:min-w-[240px] !py-2.5 sm:!py-3.5 !text-[9px] sm:!text-[11px]"
            >
              {isUpdating ? <Loader2 className="h-4 w-4 sm:h-5 sm:w-5 animate-spin shrink-0" /> : <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />}
              <span>{isUpdating ? t('executing') : t('commit_protocols')}</span>
            </button>
          </div>
        }
      >
        <div className="space-y-10">
          {/* Financial Overrides */}
          <div className="space-y-6">
            <h3 className="text-[10px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-widest flex items-center gap-3">
              <span className="w-8 h-px bg-gray-200 dark:bg-white/10"></span>
              {t('financial_overrides')}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider block">{t('retail_price')}</label>
                <div className="relative">
                  <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-600" />
                  <input
                    type="number"
                    placeholder={t('no_change')}
                    className="w-full pl-12 pr-4 bg-[#f8f9fa] dark:bg-black/75 border-none text-gray-900 dark:text-white text-sm rounded-xl py-2.5 focus:ring-2 focus:ring-emerald-500 transition-all font-medium placeholder:text-gray-600"
                    onChange={(e) => setUpdates(prev => ({ ...prev, price: e.target.value ? parseFloat(e.target.value) : undefined }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider block">{t('acquisition_cost')}</label>
                <div className="relative">
                  <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-600" />
                  <input
                    type="number"
                    placeholder={t('no_change')}
                    className="w-full pl-12 pr-4 bg-[#f8f9fa] dark:bg-black/75 border-none text-gray-900 dark:text-white text-sm rounded-xl py-2.5 focus:ring-2 focus:ring-emerald-500 transition-all font-medium placeholder:text-gray-600"
                    onChange={(e) => setUpdates(prev => ({ ...prev, cost: e.target.value ? parseFloat(e.target.value) : undefined }))}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Classification Matrix */}
          <div className="space-y-6">
            <h3 className="text-[10px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-widest flex items-center gap-3">
              <span className="w-8 h-px bg-gray-200 dark:bg-white/10"></span>
              {t('classification_matrix')}
            </h3>
            <div className="space-y-5 relative z-30">
              <SearchableSelect
                label={t('global_category')}
                options={[{ id: '', label: t('no_change') }, ...availableCategories.map(cat => ({ id: cat, label: cat }))]}
                value={updates.category || ''}
                onChange={(val) => setUpdates(prev => ({ ...prev, category: val || undefined }))}
                icon={Tag}
              />
              <SearchableSelect
                label={t('primary_supplier')}
                options={[{ id: '', label: t('no_change') }, ...availableSuppliers.map(sup => ({ id: sup, label: sup }))]}
                value={updates.supplier || ''}
                onChange={(val) => setUpdates(prev => ({ ...prev, supplier: val || undefined }))}
                icon={User}
              />
            </div>
          </div>

          {/* Visual Protocol */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-widest flex items-center gap-3">
                <span className="w-8 h-px bg-gray-200 dark:bg-white/10"></span>
                {t('visual_protocol')}
              </h3>
              {updates.image && (
                <button onClick={() => setUpdates(prev => ({ ...prev, image: undefined }))} className="text-rose-500 text-[10px] font-black uppercase tracking-widest hover:underline">
                  {t('reset_asset')}
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div
                className="flex flex-col items-center justify-center p-6 bg-[#f8f9fa] dark:bg-black/75 rounded-[24px] border-2 border-dashed border-gray-200 dark:border-white/5 hover:border-primary/30 transition-all cursor-pointer group gap-3"
                onClick={() => setShowMediaLibrary(true)}
              >
                <div className="h-16 w-16 rounded-2xl bg-white dark:bg-surface flex items-center justify-center overflow-hidden shadow-sm">
                  {updates.image ? <img src={updates.image} className="h-full w-full object-cover" /> : <ImageIcon className="h-8 w-8 text-gray-600 group-hover:text-primary transition-colors" />}
                </div>
                <div className="text-center">
                  <p className="text-[11px] font-black text-gray-900 dark:text-white uppercase tracking-wide">{t('media_hub')}</p>
                  <p className="text-[9px] text-gray-600 font-bold uppercase tracking-widest mt-1">{t('select_existing')}</p>
                </div>
              </div>

              <div
                className={`flex flex-col items-center justify-center p-6 bg-[#f8f9fa] dark:bg-black/75 rounded-[24px] border-2 border-dashed border-gray-200 dark:border-white/5 transition-all cursor-pointer group gap-3 ${isCompressing ? 'opacity-50 pointer-events-none' : 'hover:border-blue-500/30'}`}
                onClick={() => !isCompressing && fileInputRef.current?.click()}
              >
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageUpload} />
                <div className="h-16 w-16 rounded-2xl bg-white dark:bg-surface flex items-center justify-center overflow-hidden shadow-sm">
                  {isCompressing ? <Loader2 className="h-8 w-8 text-blue-500 animate-spin" /> :
                    updates.image ? <img src={updates.image} className="h-full w-full object-cover" /> : <Upload className="h-8 w-8 text-gray-600 group-hover:text-blue-500 transition-colors" />}
                </div>
                <div className="text-center">
                  <p className="text-[11px] font-black text-gray-900 dark:text-white uppercase tracking-wide">{isCompressing ? t('syncing') : t('new_upload')}</p>
                  <p className="text-[9px] text-gray-600 font-bold uppercase tracking-widest mt-1">{isCompressing ? t('processing') : t('deploy_file')}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Operational State */}
          <div className="space-y-6">
            <h3 className="text-[10px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-widest flex items-center gap-3">
              <span className="w-8 h-px bg-gray-200 dark:bg-white/10"></span>
              {t('operational_state')}
            </h3>

            <div className="grid grid-cols-1 gap-4">
              {[
                { label: t('asset_activation'), key: 'active' },
                { label: t('fiscal_taxation'), key: 'taxable' },
                { label: t('priority_featuring'), key: 'isFeatured' },
              ].map(({ label, key }) => (
                <label key={key} className={`flex items-center justify-between p-5 rounded-[20px] border transition-all cursor-pointer ${(updates as any)[key] !== undefined ? 'bg-emerald-50 dark:bg-primary/10 border-emerald-200 dark:border-primary/20' : 'bg-[#f8f9fa] dark:bg-black/75 border-gray-200 dark:border-white/5'}`}>
                  <span className={`text-[11px] font-black uppercase tracking-widest ${(updates as any)[key] !== undefined ? 'text-primary dark:text-emerald-400' : 'text-gray-600 dark:text-gray-400'}`}>{label}</span>
                  <div className="relative">
                    <input
                      type="checkbox"
                      className="rounded-lg border-gray-300 dark:border-white/10 dark:bg-transparent text-primary focus:ring-0 h-6 w-6 transition-all cursor-pointer"
                      checked={(updates as any)[key] === true}
                      ref={el => {
                        if (el) el.indeterminate = (updates as any)[key] === undefined;
                      }}
                      onChange={(e) => {
                        const current = (updates as any)[key];
                        let next: boolean | undefined;
                        if (current === undefined) next = true;
                        else if (current === true) next = false;
                        else next = undefined;
                        setUpdates(prev => ({ ...prev, [key]: next }));
                      }}
                    />
                    {(updates as any)[key] === undefined && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-3 h-0.5 bg-gray-400 rounded-full"></div>
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <MediaLibrary
        isOpen={showMediaLibrary}
        onClose={() => setShowMediaLibrary(false)}
        onSelect={(url) => setUpdates(prev => ({ ...prev, image: url }))}
      />
    </>
  );
}
