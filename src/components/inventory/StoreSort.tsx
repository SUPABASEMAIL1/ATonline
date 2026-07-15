import { useState, useMemo, useCallback, useRef } from 'react';
import {
  ArrowUpDown, Search, ChevronUp, ChevronDown, Package, GripVertical,
  Check, Globe, Layers, Gift, Power, Tag, Upload, Image as ImageIcon, Trash2
} from 'lucide-react';
import { useApp } from '../../context/SupabaseAppContext';
import { Product, Bundle, Category } from '../../types';
import { productsService, bundlesService, categoriesService } from '../../lib/services';
import { sonner } from '../../lib/sonner';
import { formatCurrency } from '../../lib/currencies';
import { compressImage } from '../../lib/imageCompression';
import { HelpTooltip } from '../common/HelpTooltip';
import { MediaLibrary } from './MediaLibrary';

type SortMode = 'products_all' | 'products_category' | 'categories' | 'deals';

/* ─────────────────────────────────────────────────────────────────────────────
   Reusable drag-and-drop list row styles helper
───────────────────────────────────────────────────────────────────────────── */
function rowCls(isDragging: boolean, isDragOver: boolean) {
  return [
    'flex items-center gap-3 px-4 py-3 transition-all cursor-grab active:cursor-grabbing select-none border-b border-gray-100 dark:border-white/[0.04] last:border-0',
    isDragging ? 'opacity-40 scale-[0.98]' : 'opacity-100',
    isDragOver
      ? 'bg-teal-50 dark:bg-teal-500/10 border-t-2 border-t-teal-400'
      : 'hover:bg-gray-50 dark:hover:bg-white/[0.02]',
  ].join(' ');
}

/* ─────────────────────────────────────────────────────────────────────────────
   Shared "Saving / Saved" indicator
───────────────────────────────────────────────────────────────────────────── */
function SaveIndicator({ saving, saved }: { saving: boolean; saved: boolean }) {
  if (saving) return (
    <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-amber-500">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
      Saving...
    </span>
  );
  if (saved) return (
    <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-500">
      <Check className="h-3 w-3" />
      Saved
    </span>
  );
  return null;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Main StoreSort Component
───────────────────────────────────────────────────────────────────────────── */
export function StoreSort() {
  const { state, dispatch } = useApp();
  const [mode, setMode] = useState<SortMode>('products_all');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedRecently, setSavedRecently] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [selectedBundleForImage, setSelectedBundleForImage] = useState<string | null>(null);
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);

  const handleImageTrigger = (bundleId: string) => {
    setSelectedBundleForImage(bundleId);
    setShowMediaLibrary(true);
  };

  const handleMediaSelect = async (url: string) => {
    if (selectedBundleForImage) {
      const bundleId = selectedBundleForImage;
      try {
        setSaving(true);
        // Find original bundle
        const bundle = state.bundles.find(b => b.id === bundleId);
        if (bundle) {
          const updated = { ...bundle, image: url };
          dispatch({ type: 'UPDATE_BUNDLE', payload: updated });
          await bundlesService.update(bundleId, { image: url });
          sonner.success('Deal image updated successfully!');
          triggerSaved();
        }
      } catch (error) {
        console.error('Failed to update deal image:', error);
        sonner.error('Failed to update deal image');
      } finally {
        setSelectedBundleForImage(null);
      }
    }
  };

  const handleRemoveImage = async (bundle: Bundle) => {
    try {
      setSaving(true);
      const updated = { ...bundle, image: undefined };
      dispatch({ type: 'UPDATE_BUNDLE', payload: updated });
      await bundlesService.update(bundle.id, { image: null as any });
      sonner.success('Deal image removed');
      triggerSaved();
    } catch {
      sonner.error('Failed to remove image');
    }
  };

  /* ── Derived data ── */
  const storeProducts = useMemo(
    () => state.products.filter(p => p.active !== false),
    [state.products]
  );

  const categoryNames = useMemo(() => {
    const cats = new Set(storeProducts.map(p => p.category).filter(Boolean));
    return Array.from(cats).sort();
  }, [storeProducts]);

  const effectiveCategory = selectedCategory || categoryNames[0] || '';

  /* ── Sorted lists by mode ── */
  const sortedProducts = useMemo(() => {
    let list = storeProducts;
    if (mode === 'products_category' && effectiveCategory) {
      list = list.filter(p => p.category === effectiveCategory);
    }
    if (searchTerm.trim()) {
      const t = searchTerm.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(t) || (p.sku || '').toLowerCase().includes(t));
    }
    return [...list].sort((a, b) =>
      mode === 'products_all'
        ? (a.estoreSortOrder ?? 0) - (b.estoreSortOrder ?? 0)
        : (a.estoreCategorySortOrder ?? 0) - (b.estoreCategorySortOrder ?? 0)
    );
  }, [storeProducts, mode, effectiveCategory, searchTerm]);

  const sortedCategories = useMemo(() => {
    let list = [...(state.categories || [])];
    if (searchTerm.trim()) {
      const t = searchTerm.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(t));
    }
    return list.sort((a, b) => (a.estoreSortOrder ?? 0) - (b.estoreSortOrder ?? 0));
  }, [state.categories, searchTerm]);

  const sortedBundles = useMemo(() => {
    let list = [...(state.bundles || [])];
    if (searchTerm.trim()) {
      const t = searchTerm.toLowerCase();
      list = list.filter(b => b.name.toLowerCase().includes(t));
    }
    return list.sort((a, b) => (a.estoreSortOrder ?? 0) - (b.estoreSortOrder ?? 0));
  }, [state.bundles, searchTerm]);

  /* ── Auto-save helper ── */
  const triggerSaved = useCallback(() => {
    setSaving(false);
    setSavedRecently(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => setSavedRecently(false), 2200);
  }, []);

  /* ──────────────────────────────────────────────────────────────
     PRODUCTS: Persist order
  ────────────────────────────────────────────────────────────── */
  const persistProductOrder = useCallback(async (reordered: Product[]) => {
    const field = mode === 'products_all' ? 'estoreSortOrder' : 'estoreCategorySortOrder';
    const updates: Promise<void>[] = [];
    reordered.forEach((p, idx) => {
      const cur = mode === 'products_all' ? (p.estoreSortOrder ?? 0) : (p.estoreCategorySortOrder ?? 0);
      if (cur === idx) return;
      const updated = { ...p, [field]: idx };
      dispatch({ type: 'UPDATE_PRODUCT', payload: updated });
      updates.push(productsService.update(p.id, { [field]: idx }).catch(console.error));
    });
    if (!updates.length) return;
    setSaving(true);
    await Promise.all(updates);
    triggerSaved();
  }, [mode, dispatch, triggerSaved]);

  /* ──────────────────────────────────────────────────────────────
     CATEGORIES: Persist order
  ────────────────────────────────────────────────────────────── */
  const persistCategoryOrder = useCallback(async (reordered: Category[]) => {
    const updates: Promise<void>[] = [];
    reordered.forEach((c, idx) => {
      if ((c.estoreSortOrder ?? 0) === idx) return;
      updates.push(categoriesService.update(c.id, { estoreSortOrder: idx }).catch(console.error));
    });
    if (!updates.length) return;
    setSaving(true);
    // Optimistic: update global state
    const updated = (state.categories || []).map(c => {
      const newOrder = reordered.findIndex(r => r.id === c.id);
      return newOrder >= 0 ? { ...c, estoreSortOrder: newOrder } : c;
    });
    dispatch({ type: 'SET_CATEGORIES', payload: updated });
    await Promise.all(updates);
    triggerSaved();
  }, [state.categories, dispatch, triggerSaved]);

  /* ──────────────────────────────────────────────────────────────
     DEALS: Persist order
  ────────────────────────────────────────────────────────────── */
  const persistDealOrder = useCallback(async (reordered: Bundle[]) => {
    const updates: Promise<void>[] = [];
    reordered.forEach((b, idx) => {
      if ((b.estoreSortOrder ?? 0) === idx) return;
      const updated = { ...b, estoreSortOrder: idx };
      dispatch({ type: 'UPDATE_BUNDLE', payload: updated });
      updates.push(bundlesService.update(b.id, { estoreSortOrder: idx }).catch(console.error));
    });
    if (!updates.length) return;
    setSaving(true);
    await Promise.all(updates);
    triggerSaved();
  }, [dispatch, triggerSaved]);

  /* ── Drag helpers ── */
  const handleDragStart = (idx: number) => setDragIndex(idx);
  const handleDragEnter = (idx: number) => setDragOverIndex(idx);
  const handleDragEnd = () => {
    if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
      moveItem(dragIndex, dragOverIndex);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  /* ── Move item (arrow buttons & drag) ── */
  const moveItem = useCallback((from: number, to: number) => {
    if (to < 0) return;
    if (mode === 'categories') {
      if (to >= sortedCategories.length) return;
      const r = [...sortedCategories];
      const [m] = r.splice(from, 1); r.splice(to, 0, m);
      persistCategoryOrder(r);
    } else if (mode === 'deals') {
      if (to >= sortedBundles.length) return;
      const r = [...sortedBundles];
      const [m] = r.splice(from, 1); r.splice(to, 0, m);
      persistDealOrder(r);
    } else {
      if (to >= sortedProducts.length) return;
      const r = [...sortedProducts];
      const [m] = r.splice(from, 1); r.splice(to, 0, m);
      persistProductOrder(r);
    }
  }, [mode, sortedCategories, sortedBundles, sortedProducts, persistCategoryOrder, persistDealOrder, persistProductOrder]);

  /* ── Toggle showInEstore for a product ── */
  const toggleProductVisibility = useCallback(async (product: Product) => {
    const updated = { ...product, showInEstore: !product.showInEstore };
    dispatch({ type: 'UPDATE_PRODUCT', payload: updated });
    try {
      await productsService.update(product.id, { showInEstore: !product.showInEstore });
      sonner.success(!product.showInEstore ? `${product.name} visible on store` : `${product.name} hidden from store`);
    } catch {
      sonner.error('Failed to update visibility');
      dispatch({ type: 'UPDATE_PRODUCT', payload: product }); // rollback
    }
  }, [dispatch]);

  /* ── Toggle category active (shows on store when active) ── */
  const toggleCategoryVisibility = useCallback(async (cat: Category) => {
    const updated = { ...cat, active: cat.active !== false ? false : true };
    const reordered = (state.categories || []).map(c => c.id === cat.id ? updated : c);
    dispatch({ type: 'SET_CATEGORIES', payload: reordered });
    try {
      await categoriesService.update(cat.id, { active: updated.active });
      sonner.success(updated.active ? `${cat.name} enabled` : `${cat.name} disabled`);
    } catch {
      sonner.error('Failed to update category');
      dispatch({ type: 'SET_CATEGORIES', payload: state.categories || [] });
    }
  }, [state.categories, dispatch]);

  /* ── Toggle bundle active (shows on store when active) ── */
  const toggleBundleVisibility = useCallback(async (bundle: Bundle) => {
    const updated = { ...bundle, active: !bundle.active };
    dispatch({ type: 'UPDATE_BUNDLE', payload: updated });
    try {
      await bundlesService.update(bundle.id, { active: !bundle.active });
      sonner.success(!bundle.active ? `${bundle.name} enabled` : `${bundle.name} disabled`);
    } catch {
      sonner.error('Failed to update bundle');
      dispatch({ type: 'UPDATE_BUNDLE', payload: bundle });
    }
  }, [dispatch]);

  const currentList =
    mode === 'categories' ? sortedCategories :
    mode === 'deals' ? sortedBundles :
    sortedProducts;
  const totalCount =
    mode === 'categories' ? (state.categories?.length ?? 0) :
    mode === 'deals' ? (state.bundles?.length ?? 0) :
    storeProducts.length;

  const modeTabs: { id: SortMode; label: string; icon: React.ElementType; color: string }[] = [
    { id: 'products_all', label: 'All Products', icon: Globe, color: 'text-teal-600' },
    { id: 'products_category', label: 'By Category', icon: ArrowUpDown, color: 'text-teal-600' },
    { id: 'categories', label: 'Categories', icon: Tag, color: 'text-indigo-600' },
    { id: 'deals', label: 'Deals', icon: Gift, color: 'text-violet-600' },
  ];

  return (
    <div className="space-y-5 animate-in fade-in duration-300">

      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight">
            Store Sort & Visibility
          </h2>
          <p className="text-[10px] text-gray-500 mt-0.5">
            Drag or use arrows to reorder · Toggle power icon to show/hide on store
          </p>
        </div>
        <SaveIndicator saving={saving} saved={savedRecently} />
      </div>

      {/* ─── Mode Tabs ─── */}
      <div className="flex flex-wrap gap-1 p-1 bg-gray-100 dark:bg-white/5 rounded-xl">
        {modeTabs.map(tab => {
          const Icon = tab.icon;
          const isActive = mode === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => { setMode(tab.id); setSearchTerm(''); }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex-1 justify-center min-w-[80px] ${
                isActive
                  ? 'bg-white dark:bg-surface shadow-md text-primary'
                  : 'text-gray-500 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <Icon className="h-3 w-3" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ─── Sub-controls row ─── */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Category dropdown — only for By Category mode */}
        {mode === 'products_category' && (
          <select
            value={effectiveCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            className="input text-sm max-w-[180px]"
          >
            {categoryNames.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        )}

        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder={
              mode === 'categories' ? 'Search categories...' :
              mode === 'deals' ? 'Search deals...' :
              'Search name, SKU...'
            }
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="input pl-8 w-full text-sm"
          />
        </div>
      </div>

      {/* ─── Info Banner ─── */}
      <div className={`flex items-start gap-3 p-3 rounded-2xl border ${
        mode === 'categories'
          ? 'bg-indigo-500/5 border-indigo-500/20'
          : mode === 'deals'
          ? 'bg-violet-500/5 border-violet-500/20'
          : 'bg-teal-500/5 border-teal-500/20'
      }`}>
        {mode === 'categories'
          ? <Tag className="h-4 w-4 text-indigo-500 shrink-0 mt-0.5" />
          : mode === 'deals'
          ? <Gift className="h-4 w-4 text-violet-500 shrink-0 mt-0.5" />
          : <ArrowUpDown className="h-4 w-4 text-teal-500 shrink-0 mt-0.5" />
        }
        <p className={`text-[10px] font-bold leading-relaxed ${
          mode === 'categories' ? 'text-indigo-600 dark:text-indigo-400' :
          mode === 'deals' ? 'text-violet-600 dark:text-violet-400' :
          'text-teal-600 dark:text-teal-400'
        }`}>
          {mode === 'products_all' && 'Controls the order products appear when "All Items" is selected on the store. Use the power icon to hide/show individual products.'}
          {mode === 'products_category' && `Controls the order "${effectiveCategory}" products appear when that category is selected on the store. Use the power icon to hide/show products.`}
          {mode === 'categories' && 'Controls the order of category chips shown on the store. Drag to reorder.'}
          {mode === 'deals' && 'Controls the order of Deals/Bundles on the store. Toggle power icon to enable or disable a deal.'}
        </p>
      </div>

      {/* ─── List ─── */}
      {currentList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white dark:bg-surface rounded-3xl border border-gray-200 dark:border-white/5">
          <div className="h-16 w-16 bg-teal-500/10 rounded-3xl flex items-center justify-center mb-4">
            <Package className="h-8 w-8 text-teal-500" />
          </div>
          <p className="text-sm font-black text-gray-900 dark:text-white mb-1">Nothing Found</p>
          <p className="text-[11px] text-gray-500">
            {searchTerm ? 'No items match your search.' : 'Nothing to sort here yet.'}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-surface rounded-3xl border border-gray-200 dark:border-white/5 overflow-hidden shadow-xl">
          {/* Table header */}
          <div className="hidden md:grid gap-0 border-b border-gray-100 dark:border-white/5 px-4 py-2.5 bg-gray-50/50 dark:bg-white/[0.02]"
            style={{ gridTemplateColumns: mode === 'categories' ? 'auto 1fr 80px' : 'auto 1fr 110px 90px 90px' }}
          >
            <div className="w-12" />
            <p className="text-[9px] font-black uppercase tracking-widest text-gray-500">
              {mode === 'categories' ? 'Category' : mode === 'deals' ? 'Deal' : 'Product'}
            </p>
            {mode !== 'categories' && <p className="text-[9px] font-black uppercase tracking-widest text-gray-500 text-right">Price</p>}
            {mode !== 'categories' && <p className="text-[9px] font-black uppercase tracking-widest text-gray-500 text-center">
              {mode === 'deals' ? 'Status' : 'Stock'}
            </p>}
            <p className="text-[9px] font-black uppercase tracking-widest text-gray-500 text-center">
              {mode === 'categories' ? 'Order' : 'Visible/Order'}
            </p>
          </div>

          <div>
            {/* ── PRODUCTS ── */}
            {(mode === 'products_all' || mode === 'products_category') && (sortedProducts as Product[]).map((product, idx) => {
              const isDragging = dragIndex === idx;
              const isDragOver = dragOverIndex === idx;
              const isVisible = product.showInEstore !== false;
              return (
                <div
                  key={product.id}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragEnter={() => handleDragEnter(idx)}
                  onDragOver={e => e.preventDefault()}
                  onDragEnd={handleDragEnd}
                  className={rowCls(isDragging, isDragOver)}
                >
                  {/* Drag Handle */}
                  <div className="flex flex-col items-center gap-0.5 w-8 shrink-0">
                    <GripVertical className="h-4 w-4 text-gray-300 dark:text-gray-600" />
                    <span className="text-[8px] font-black text-gray-300 dark:text-gray-600">#{idx + 1}</span>
                  </div>

                  {/* Product Info */}
                  <div className={`flex items-center gap-3 flex-1 min-w-0 ${!isVisible ? 'opacity-50' : ''}`}>
                    <div className="h-10 w-10 rounded-xl overflow-hidden shrink-0 bg-gray-100 dark:bg-white/5 flex items-center justify-center">
                      {product.image
                        ? <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
                        : <Package className="h-5 w-5 text-gray-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-black text-gray-900 dark:text-white uppercase tracking-tight truncate">
                        {product.name}
                        {!isVisible && <span className="ml-2 text-[8px] font-black bg-gray-200 dark:bg-white/10 text-gray-500 px-1.5 py-0.5 rounded uppercase">Hidden</span>}
                      </p>
                      <p className="text-[9px] text-gray-400 truncate mt-0.5">
                        {product.category}{product.sku ? ` · ${product.sku}` : ''}
                      </p>
                    </div>
                  </div>

                  {/* Price */}
                  <p className="hidden md:block text-[11px] font-black text-gray-900 dark:text-white text-right shrink-0 w-[110px]">
                    {formatCurrency(product.price, state.settings.currency)}
                  </p>

                  {/* Stock */}
                  <div className="hidden md:flex justify-center w-[90px]">
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                      product.isService ? 'bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400' :
                      product.stock > 10 ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' :
                      product.stock > 0 ? 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400' :
                      'bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400'
                    }`}>
                      {product.isService ? 'Service' : `${product.stock}`}
                    </span>
                  </div>

                  {/* Controls */}
                  <div className="flex items-center gap-1 ml-auto md:ml-0 shrink-0">
                    {/* Visibility toggle */}
                    <button
                      type="button"
                      title={isVisible ? 'Hide from store' : 'Show on store'}
                      onClick={() => toggleProductVisibility(product)}
                      className={`h-7 w-7 rounded-lg flex items-center justify-center transition-all ${
                        isVisible
                          ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 hover:bg-red-100 dark:hover:bg-red-500/20 hover:text-red-500'
                          : 'bg-gray-100 dark:bg-white/5 text-gray-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 hover:text-emerald-600'
                      }`}
                    >
                      <Power className="h-3.5 w-3.5" />
                    </button>
                    {/* Up */}
                    <button type="button" title="Move Up" onClick={() => moveItem(idx, idx - 1)} disabled={idx === 0}
                      className="h-7 w-7 rounded-lg flex items-center justify-center bg-gray-100 dark:bg-white/5 text-gray-500 hover:bg-teal-100 dark:hover:bg-teal-500/20 hover:text-teal-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    {/* Down */}
                    <button type="button" title="Move Down" onClick={() => moveItem(idx, idx + 1)} disabled={idx === sortedProducts.length - 1}
                      className="h-7 w-7 rounded-lg flex items-center justify-center bg-gray-100 dark:bg-white/5 text-gray-500 hover:bg-teal-100 dark:hover:bg-teal-500/20 hover:text-teal-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}

            {/* ── CATEGORIES ── */}
            {mode === 'categories' && (sortedCategories as Category[]).map((cat, idx) => {
              const isDragging = dragIndex === idx;
              const isDragOver = dragOverIndex === idx;

              // Count products in this category
              const productsInCat = state.products.filter(p => p.category === cat.name);
              const itemCount = productsInCat.length;
              const isAutoDisabled = itemCount === 0;
              const isActive = cat.active !== false && !isAutoDisabled;

              // Determine status text and colors
              let statusLabel = 'Active';
              let statusClass = 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400';

              if (isAutoDisabled) {
                statusLabel = 'Disabled (auto)';
                statusClass = 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400';
              } else if (cat.active === false) {
                statusLabel = 'Disabled (manual)';
                statusClass = 'bg-gray-100 dark:bg-white/5 text-gray-400';
              }

              return (
                <div
                  key={cat.id}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragEnter={() => handleDragEnter(idx)}
                  onDragOver={e => e.preventDefault()}
                  onDragEnd={handleDragEnd}
                  className={rowCls(isDragging, isDragOver)}
                >
                  <div className="flex flex-col items-center gap-0.5 w-8 shrink-0">
                    <GripVertical className="h-4 w-4 text-gray-300 dark:text-gray-600" />
                    <span className="text-[8px] font-black text-gray-300 dark:text-gray-600">#{idx + 1}</span>
                  </div>

                  <div className={`flex items-center gap-3 flex-1 min-w-0 ${!isActive ? 'opacity-50' : ''}`}>
                    <div className="h-10 w-10 rounded-xl bg-indigo-500/10 flex items-center justify-center shrink-0">
                      <Tag className="h-5 w-5 text-indigo-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-black text-gray-900 dark:text-white uppercase tracking-tight truncate">
                        {cat.name}
                        <span className="ml-2 text-[9px] font-black bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded-full uppercase tracking-wider">
                          {itemCount} {itemCount === 1 ? 'item' : 'items'}
                        </span>
                      </p>
                      {cat.description && <p className="text-[9px] text-gray-400 truncate mt-0.5">{cat.description}</p>}
                    </div>
                  </div>

                  <div className="hidden md:flex justify-center w-[120px]">
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${statusClass}`}>
                      {statusLabel}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 ml-auto md:ml-0 shrink-0">
                    <button
                      type="button"
                      title={isAutoDisabled ? 'Empty category auto-disabled' : isActive ? 'Disable category' : 'Enable category'}
                      onClick={() => {
                        if (isAutoDisabled) {
                          sonner.alert('Empty Category', 'Categories with 0 items are automatically disabled. Please add products to this category first.');
                          return;
                        }
                        toggleCategoryVisibility(cat);
                      }}
                      className={`h-7 w-7 rounded-lg flex items-center justify-center transition-all ${
                        isAutoDisabled
                          ? 'bg-amber-100/50 dark:bg-amber-500/5 text-amber-500/50 cursor-not-allowed'
                          : isActive
                            ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 hover:bg-red-100 dark:hover:bg-red-500/20 hover:text-red-500'
                            : 'bg-gray-100 dark:bg-white/5 text-gray-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 hover:text-emerald-600'
                      }`}
                    >
                      <Power className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" title="Move Up" onClick={() => moveItem(idx, idx - 1)} disabled={idx === 0}
                      className="h-7 w-7 rounded-lg flex items-center justify-center bg-gray-100 dark:bg-white/5 text-gray-500 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" title="Move Down" onClick={() => moveItem(idx, idx + 1)} disabled={idx === sortedCategories.length - 1}
                      className="h-7 w-7 rounded-lg flex items-center justify-center bg-gray-100 dark:bg-white/5 text-gray-500 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}

            {/* ── DEALS / BUNDLES ── */}
            {mode === 'deals' && (sortedBundles as Bundle[]).map((bundle, idx) => {
              const isDragging = dragIndex === idx;
              const isDragOver = dragOverIndex === idx;
              const isActive = bundle.active !== false;
              const itemCount = bundle.isCombo
                ? (bundle.slots || []).reduce((s: number, sl: any) => s + (sl.requiredQuantity || 1), 0)
                : (bundle.items || []).reduce((s: number, it: any) => s + (it.quantity || 1), 0);
              return (
                <div
                  key={bundle.id}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragEnter={() => handleDragEnter(idx)}
                  onDragOver={e => e.preventDefault()}
                  onDragEnd={handleDragEnd}
                  className={rowCls(isDragging, isDragOver)}
                >
                  <div className="flex flex-col items-center gap-0.5 w-8 shrink-0">
                    <GripVertical className="h-4 w-4 text-gray-300 dark:text-gray-600" />
                    <span className="text-[8px] font-black text-gray-300 dark:text-gray-600">#{idx + 1}</span>
                  </div>

                  <div className={`flex items-center gap-3 flex-1 min-w-0 ${!isActive ? 'opacity-50' : ''}`}>
                    {/* Deal Image Uploader Thumbnail */}
                    <div 
                      className="relative h-10 w-10 rounded-xl overflow-hidden bg-violet-500/10 border border-violet-500/20 hover:border-violet-400 hover:bg-violet-500/20 flex items-center justify-center shrink-0 group/img cursor-pointer transition-all"
                      onClick={() => handleImageTrigger(bundle.id)}
                      title="Click to upload custom Deal image banner (Store Only)"
                    >
                      {bundle.image ? (
                        <>
                          <img src={bundle.image} alt={bundle.name} className="h-full w-full object-contain bg-slate-950" />
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center text-white">
                            <Upload className="h-3.5 w-3.5" />
                          </div>
                        </>
                      ) : (
                        <>
                          <Gift className="h-5 w-5 text-violet-500 group-hover/img:scale-110 transition-transform" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center text-white">
                            <Upload className="h-3.5 w-3.5" />
                          </div>
                        </>
                      )}
                    </div>
                    <HelpTooltip content="Recommended image size: 900×650px" />

                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-black text-gray-900 dark:text-white uppercase tracking-tight truncate">
                        {bundle.name}
                        {!isActive && <span className="ml-2 text-[8px] font-black bg-gray-200 dark:bg-white/10 text-gray-500 px-1.5 py-0.5 rounded uppercase">Disabled</span>}
                      </p>
                      <p className="text-[9px] text-gray-400 mt-0.5 flex items-center gap-2">
                        <span>{bundle.isCombo ? 'Combo Deal' : 'Fixed Bundle'}</span>
                        <span>·</span>
                        <span>{itemCount} item{itemCount !== 1 ? 's' : ''}</span>
                        <span>·</span>
                        <span>{bundle.discountValue}{bundle.discountType === 'percentage' ? '%' : ''} off</span>
                        {bundle.scheduleType === 'scheduled' && (
                          <>
                            <span>·</span>
                            <span className="text-amber-600 dark:text-amber-400 font-bold uppercase">
                              {bundle.startDate || '—'}{bundle.startTime ? ` ${bundle.startTime}` : ''}
                            </span>
                          </>
                        )}
                        {bundle.image && (
                          <>
                            <span>·</span>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleRemoveImage(bundle); }}
                              className="text-rose-500 hover:text-rose-600 font-bold hover:underline uppercase text-[8px] tracking-wider"
                              title="Remove custom banner image"
                            >
                              Remove Image
                            </button>
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Price placeholder */}
                  <div className="hidden md:block w-[110px]" />

                  {/* Status */}
                  <div className="hidden md:flex justify-center w-[90px]">
                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                      isActive ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-gray-100 dark:bg-white/5 text-gray-400'
                    }`}>
                      {isActive ? 'Active' : 'Disabled'}
                    </span>
                  </div>

                  {/* Controls */}
                  <div className="flex items-center gap-1 ml-auto md:ml-0 shrink-0">
                    <button
                      type="button"
                      title={isActive ? 'Disable deal' : 'Enable deal'}
                      onClick={() => toggleBundleVisibility(bundle)}
                      className={`h-7 w-7 rounded-lg flex items-center justify-center transition-all ${
                        isActive
                          ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 hover:bg-red-100 dark:hover:bg-red-500/20 hover:text-red-500'
                          : 'bg-gray-100 dark:bg-white/5 text-gray-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 hover:text-emerald-600'
                      }`}
                    >
                      <Power className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" title="Move Up" onClick={() => moveItem(idx, idx - 1)} disabled={idx === 0}
                      className="h-7 w-7 rounded-lg flex items-center justify-center bg-gray-100 dark:bg-white/5 text-gray-500 hover:bg-violet-100 dark:hover:bg-violet-500/20 hover:text-violet-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" title="Move Down" onClick={() => moveItem(idx, idx + 1)} disabled={idx === sortedBundles.length - 1}
                      className="h-7 w-7 rounded-lg flex items-center justify-center bg-gray-100 dark:bg-white/5 text-gray-500 hover:bg-violet-100 dark:hover:bg-violet-500/20 hover:text-violet-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 bg-gray-50/50 dark:bg-white/[0.02] border-t border-gray-100 dark:border-white/5 flex items-center justify-between">
            <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">
              Showing {currentList.length} of {totalCount} items
            </p>
            <p className="text-[9px] text-gray-400">Changes save automatically</p>
          </div>
        </div>
      )}

      {showMediaLibrary && (
        <MediaLibrary
          isOpen={showMediaLibrary}
          onClose={() => setShowMediaLibrary(false)}
          onSelect={handleMediaSelect}
        />
      )}
    </div>
  );
}
