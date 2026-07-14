import { X, Plus, Loader2, Wand2, Star, Camera, Save, Tag, User, Upload, Package, Database } from 'lucide-react';
import { compressImage } from '../../lib/imageCompression';
import { Product, ProductBatch, ProductVariant, ProductModifier, VariantData } from '../../types';
import { useApp } from '../../context/SupabaseAppContext';
import { MediaLibrary } from './MediaLibrary';
import { CameraScanner } from '../common/CameraScanner';
import { SearchableSelect } from '../common/SearchableSelect';
import { useState, useEffect, useMemo, useRef } from 'react';
import { sonner } from '../../lib/sonner';
import { Modal } from '../common/Modal';
import { HelpTooltip } from '../common/HelpTooltip';
import { cn } from '../../lib/utils';
import { useTranslation } from '../../hooks/useTranslation';
import { generateBarcodeValue } from '../../utils/barcode';
import { BarcodePreview } from '../common/BarcodePreview';

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
}

export function ProductModal({ isOpen, onClose, product }: ProductModalProps) {
  const { state, dispatch } = useApp();
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showMediaLibrary, setShowMediaLibrary] = useState(false);
  const [isAddingNewCategory, setIsAddingNewCategory] = useState(false);
  const [isAddingNewSupplier, setIsAddingNewSupplier] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [showScanner, setShowScanner] = useState(false);


  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    barcode: '',
    price: '',
    cost: '',
    stock: '',
    minStock: '',
    targetStock: '',
    category: '',
    supplier: '',
    description: '',
    taxable: true,
    active: true,
    trackInventory: true,
    isFeatured: false,
    showInEstore: true,
    image: '',
    isService: false,
    requireSerial: false,
  });

  const [batches, setBatches] = useState<ProductBatch[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [variantData, setVariantData] = useState<VariantData[]>([]);
  const [modifiers, setModifiers] = useState<ProductModifier[]>([]);

  // Calculate total quantity from batches (use remaining quantity if trackInventory is on)
  const batchTotalStock = useMemo(() => {
    return batches.reduce((sum, b) => {
      const remaining = Number((b as any).qtyRemaining ?? (b as any).qty_remaining ?? b.quantity ?? 0);
      return sum + (isNaN(remaining) ? 0 : remaining);
    }, 0);
  }, [batches]);

  // Sync batch total with formData.stock when batches change
  useEffect(() => {
    if (batches.length > 0) {
      setFormData(prev => ({ ...prev, stock: batchTotalStock.toString() }));
    }
  }, [batchTotalStock, batches.length]);

  useEffect(() => {
    if (product) {
      setFormData({
        name: product.name || '',
        sku: product.sku || '',
        barcode: product.barcode || '',
        price: product.price?.toString() || '0',
        cost: product.cost?.toString() || '0',
        stock: product.stock?.toString() || '0',
        minStock: product.minStock?.toString() || '0',
        targetStock: product.targetStock?.toString() || '',
        category: product.category || '',
        supplier: product.supplier || '',
        description: product.description || '',
        taxable: product.taxable ?? true,
        active: product.active ?? true,
        isFeatured: product.isFeatured ?? false,
        showInEstore: product.showInEstore ?? true,
        trackInventory: product.trackInventory ?? true,
        image: product.image || '',
        isService: product.isService ?? false,
        requireSerial: product.requireSerial ?? false,
      });
      setBatches(product.batches || []);
      setVariants((product.variants || []).map(v => ({ ...v, optionsRaw: '' })));
      setVariantData(product.variantData || []);
      setModifiers(product.modifiers || []);
    } else {
      setFormData({
        name: '',
        sku: '',
        barcode: '',
        price: '',
        cost: '',
        stock: '',
        minStock: '',
        targetStock: '',
        category: '',
        supplier: '',
        description: '',
        taxable: true,
        active: true,
        isFeatured: false,
        showInEstore: true,
        trackInventory: true,
        image: '',
        isService: false,
        requireSerial: false,
      });
      setBatches([]);
      setVariants([]);
      setVariantData([]);
      setModifiers([]);
    }
  }, [product]);

  const categories = useMemo(() => {
    // PRIMARY: use state.categories
    const fromCatTable = state.categories.map(c => {
      if (typeof c === 'object' && c !== null) {
        if (typeof c.name === 'string' && c.name.trim().startsWith('{')) {
          try {
            return JSON.parse(c.name).name || c.name;
          } catch (_) {}
        }
        return c.name;
      }
      if (typeof c === 'string') {
        if (c.trim().startsWith('{')) {
          try {
            return JSON.parse(c).name || c;
          } catch (_) {}
        }
        return c;
      }
      return '';
    }).filter(Boolean);

    // FALLBACK: from existing products
    const fromProducts = state.products.map(p => {
      const cat = p.category;
      if (typeof cat === 'string' && cat.trim().startsWith('{')) {
        try {
          return JSON.parse(cat).name || cat;
        } catch (_) {}
      }
      return cat;
    }).filter(Boolean);

    const list = new Set([...fromCatTable, ...fromProducts]);
    if (formData.category) {
      let cat = formData.category;
      if (typeof cat === 'string' && cat.trim().startsWith('{')) {
        try {
          cat = JSON.parse(cat).name || cat;
        } catch (_) {}
      }
      list.add(cat);
    }
    return Array.from(list).sort();
  }, [state.categories, state.products, formData.category]);

  const suppliers = useMemo(() => {
    const list = new Set(state.suppliers.map(s => s.name).filter(Boolean));
    if (formData.supplier) list.add(formData.supplier);
    return Array.from(list).sort();
  }, [state.suppliers, formData.supplier]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    // RBAC Guard
    const role = state.currentUser?.role;
    if (role === 'cashier') {
      await sonner.alert('Permission Denied', 'Cashiers are not allowed to add or modify products.');
      return;
    }

    // Validate required fields
    if (!formData.name.trim()) {
      await sonner.alert('Error!', 'Please enter a product name');
      return;
    }

    if (!(formData.category || '').trim()) {
      await sonner.alert('Error!', 'Please enter a category');
      return;
    }

    // SKU is now optional. Auto-generate if empty and needed
    if (!(formData.sku || '').trim()) {
      formData.sku = `SKU-${Date.now().toString().slice(-6)}`;
    }

    if (!formData.price || parseFloat(formData.price) <= 0) {
      await sonner.alert('Error!', 'Please enter a valid price');
      return;
    }

    if (!formData.cost || parseFloat(formData.cost) < 0) {
      await sonner.alert('Error!', 'Please enter a valid cost price (or 0 if no cost)');
      return;
    }

    // Only validate stock fields if inventory tracking is enabled
    if (formData.trackInventory) {
      if (formData.minStock && parseInt(formData.minStock) < 0) {
        await sonner.alert('Error!', 'Min stock cannot be negative');
        return;
      }
    }

    const productData: Product = {
      id: product?.id || Date.now().toString(),
      name: formData.name,
      sku: formData.sku,
      barcode: formData.barcode || undefined,
      price: parseFloat(formData.price) || 0,
      cost: parseFloat(formData.cost) || 0,
      stock: formData.trackInventory ? (batches.length > 0 ? batchTotalStock : (parseFloat(formData.stock) || 0)) : 999999,
      minStock: formData.trackInventory ? (parseFloat(formData.minStock) || 0) : 0,
      targetStock: formData.trackInventory && formData.targetStock ? (parseFloat(formData.targetStock) || undefined) : undefined,
      category: formData.category,
      supplier: formData.supplier || undefined,
      description: formData.description,
      taxable: formData.taxable,
      active: formData.active,
      isWeightBased: false,
      pricePerUnit: undefined,
      unit: undefined,
      image: formData.image || undefined,
      trackInventory: formData.trackInventory,
      isFeatured: formData.isFeatured,
      showInEstore: formData.showInEstore,
      isService: formData.isService,
      requireSerial: formData.requireSerial,
      batches,
      variants: variants.map(({ name, options }) => ({ name, options })),
      variantData,
      modifiers,
      createdAt: product?.createdAt || new Date(),
      updatedAt: new Date(),
    };


    try {
      const { productsService } = await import('../../lib/services');

      if (product) {
        await productsService.update(productData.id, productData);
        dispatch({ type: 'UPDATE_PRODUCT', payload: productData });
      } else {
        // --- NEW: Persistent Supplier Creation ---
        if (formData.supplier.trim()) {
          const { suppliersService } = await import('../../lib/services');
          const existingSupplier = state.suppliers.find(
            s => s.name.toLowerCase() === formData.supplier.trim().toLowerCase()
          );

          if (!existingSupplier) {
            const newSupp = await suppliersService.create({
              name: formData.supplier.trim(),
              email: '', phone: '', address: '', businessType: 'General',
              paymentTerms: '', openingBalance: 0, rating: 0
            });
            dispatch({ type: 'SET_SUPPLIERS', payload: [...state.suppliers, newSupp] });
          }
        }

        const newProduct = await productsService.create(productData);
        dispatch({ type: 'ADD_PRODUCT', payload: newProduct });
      }

      sonner.success(product ? 'Product updated successfully' : 'Product added successfully');

      // Clear form after successful addition if this was a "New Product"
      if (!product) {
        setFormData({
          name: '',
          sku: '',
          barcode: '',
          price: '',
          cost: '',
          stock: '',
          minStock: '',
          targetStock: '',
          category: '',
          supplier: '',
          description: '',
          taxable: true,
          active: true,
          trackInventory: true,
          isFeatured: false,
          showInEstore: true,
          image: '',
          isService: false,
          requireSerial: false,
        });
        setBatches([]);
        setVariants([]);
        setVariantData([]);
        setModifiers([]);
      }

      onClose();
    } catch (error: any) {
      console.error('Error saving product:', error);
      sonner.close();

      const errorMsg = error.message || '';
      
      // 1. Check for custom duplicate product error from productsService.create
      if (errorMsg.toLowerCase().includes('already exists')) {
        sonner.error(errorMsg);
        return;
      }

      // 2. Check for PostgreSQL Unique Violation error code
      if (error.code === '23505' || error.status === 409) {
        const details = error.details?.toLowerCase() || '';
        let errorMessage = 'A product with this SKU or Barcode already exists.';
        
        if (details.includes('sku')) {
          errorMessage = 'The SKU you entered already exists. Please use a unique SKU.';
        } else if (details.includes('barcode')) {
          errorMessage = 'The Barcode you entered already exists. Please use a unique barcode.';
        }
        
        sonner.error(errorMessage);
        return;
      }

      // 3. Fallback for other errors
      const fallbackMessage = 'Failed to save product. Please try again.';
      await sonner.alert('Error!', fallbackMessage);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;

    // Auto-uppercase SKU and Barcode
    let finalValue = value;
    if (name === 'sku' || name === 'barcode') {
      finalValue = value.toUpperCase();
    }

    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : finalValue
    }));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      try {
        setIsCompressing(true);
        // Utility automatically converts to WebP and targets 20-50KB
        const compressedFile = await compressImage(file, 800, 800, 0.7);
        const reader = new FileReader();
        reader.onload = (event) => {
          setFormData(prev => ({
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
          setFormData(prev => ({
            ...prev,
            image: event.target?.result as string
          }));
        };
        reader.readAsDataURL(file);
      } finally {
        setIsCompressing(false);
      }
    }
  };

  const generateBarcode = () => {
    if (!formData.name.trim()) {
      sonner.alert('Info', 'Please enter a product name first to generate a barcode');
      return;
    }
    const barcode = generateBarcodeValue(formData.name);
    setFormData(prev => ({ ...prev, barcode }));
  };

  const generateSku = () => {
    if (!formData.name.trim()) {
      sonner.alert('Info', 'Please enter a product name first to generate a smart SKU');
      return;
    }

    const words = formData.name.trim().split(/\s+/);
    let prefix = '';

    if (words.length >= 2) {
      prefix = (words[0].substring(0, 2) + words[1].substring(0, 2)).toUpperCase();
    } else if (words[0].length >= 3) {
      prefix = words[0].substring(0, 3).toUpperCase();
    } else {
      prefix = words[0].toUpperCase() + 'X';
    }

    const randomDigits = Math.floor(100 + Math.random() * 900).toString();
    const sku = prefix + '-' + randomDigits;

    setFormData(prev => ({ ...prev, sku }));
  };

  const handleAddCategory = async () => {
    const result = await sonner.input('New Category', 'Category Name');
    if (result.isConfirmed && result.value) {
      const catName = result.value.trim().toUpperCase();
      setFormData(prev => ({ ...prev, category: catName }));
      sonner.success(`Category "${catName}" added to form.`);
    }
  };

  const handleAddSupplier = async () => {
    const result = await sonner.input('New Supplier', 'Supplier Name');
    if (result.isConfirmed && result.value) {
      const supName = result.value.trim().toUpperCase();
      setFormData(prev => ({ ...prev, supplier: supName }));
      sonner.success(`Supplier "${supName}" added to form.`);
    }
  };

  const footer = (
    <div className="flex items-center justify-end gap-2 sm:gap-3 w-full">
      <button
        type="button"
        onClick={onClose}
        className="px-4 sm:px-6 py-2.5 sm:py-3.5 border border-rose-200 dark:border-rose-900/30 text-[#ff4b6e] hover:bg-rose-50 dark:hover:bg-rose-500/10 text-[9px] sm:text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all active:scale-95 shrink-0"
      >
        {t('discard_upper')}
      </button>
      <button
        type="button"
        onClick={handleSubmit}
        className="btn btn-md btn-primary flex-1 sm:flex-none sm:min-w-[240px] hover:shadow-emerald-500/30 !py-2.5 sm:!py-3.5 !text-[9px] sm:!text-[11px]"
      >
        <Package className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
        <span className="leading-none mt-[1px]">
          {product ? t('commit_changes') : t('register_product')}
        </span>
      </button>
    </div>
  );

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={product ? t('edit_product') : t('register_new_product')}
        maxWidth="lg"
        footer={footer}
      >
        <div className="space-y-6">
          {/* BASIC INFORMATION */}
          <div className="space-y-4">
            <h3 className="text-[10px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-widest flex items-center gap-3">
              <span className="w-8 h-px bg-gray-200 dark:bg-white/10"></span>
              {t('identity_origin')}
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Product Name */}
              <div className="space-y-2 md:col-span-2">
                <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider flex items-center">
                  {t('product_name_req')}
                  <HelpTooltip content="The commercial title of the product or service displayed on receipts, invoices, and POS terminal." />
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="E.g. Vintage Leather Jacket"
                  className="w-full bg-[#f8f9fa] dark:bg-black/75 border-none text-gray-900 dark:text-white text-sm rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 transition-all font-medium placeholder:text-gray-600"
                />
              </div>

              {/* Category */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider flex items-center">
                  {t('category_req')}
                  <HelpTooltip content="Organizes items into departments for structured reporting and quick filtering at the POS checkout." />
                </label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <select
                      name="category"
                      value={formData.category}
                      onChange={handleChange}
                      className="w-full bg-[#f8f9fa] dark:bg-black/75 border-none text-gray-900 dark:text-white text-sm rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 transition-all appearance-none font-medium"
                    >
                      <option value="" disabled>{t('select_category')}</option>
                      {categories.map(c => <option key={c} value={c} className="dark:bg-surface">{c}</option>)}
                    </select>
                  </div>
                  <button type="button" onClick={handleAddCategory} className="w-[40px] h-[40px] flex items-center justify-center bg-[#f8f9fa] dark:bg-black/75 hover:bg-gray-200 dark:hover:bg-white/10 rounded-xl text-gray-600 dark:text-gray-400 transition-colors shrink-0">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Supplier */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider flex items-center">
                  {t('supplier')}
                  <HelpTooltip content="Links this product to a vendor for automated reordering, purchase history, and supplier ledger calculations." />
                </label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <select
                      name="supplier"
                      value={formData.supplier}
                      onChange={handleChange}
                      className="w-full bg-[#f8f9fa] dark:bg-black/75 border-none text-gray-900 dark:text-white text-sm rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 transition-all appearance-none font-medium"
                    >
                      <option value="">{t('select_supplier_optional')}</option>
                      {suppliers.map(s => <option key={s} value={s} className="dark:bg-surface">{s}</option>)}
                    </select>
                  </div>
                  <button type="button" onClick={handleAddSupplier} className="w-[40px] h-[40px] flex items-center justify-center bg-[#f8f9fa] dark:bg-black/75 hover:bg-gray-200 dark:hover:bg-white/10 rounded-xl text-gray-600 dark:text-gray-400 transition-colors shrink-0">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* SKU */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider flex items-center">
                  {t('sku')}
                  <HelpTooltip content="Stock Keeping Unit: Unique internal code used to track inventory items across warehouses or stores." />
                </label>
                <div className="relative">
                  <input
                    type="text"
                    name="sku"
                    value={formData.sku}
                    onChange={handleChange}
                    placeholder="Auto-generated"
                    className="w-full bg-[#f8f9fa] dark:bg-black/75 border-none text-gray-900 dark:text-white text-sm rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 transition-all uppercase font-medium placeholder:text-gray-600 pr-12"
                  />
                  <button type="button" onClick={generateSku} className="absolute right-1.5 top-1.5 bottom-1.5 w-8 flex items-center justify-center bg-emerald-50/80 dark:bg-zinc-900 rounded-lg text-primary">
                    <Wand2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Barcode */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider flex items-center">
                  {t('barcode')}
                  <HelpTooltip content="UPC/EAN standard barcode. Scan with hardware scanner or generate a random sequence for custom retail packaging." />
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      name="barcode"
                      value={formData.barcode}
                      onChange={handleChange}
                      placeholder={t('scan_or_generate')}
                      className="w-full bg-[#f8f9fa] dark:bg-black/75 border-none text-gray-900 dark:text-white text-sm rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500 transition-all uppercase font-medium pr-12"
                    />
                    <button type="button" onClick={generateBarcode} className="absolute right-1.5 top-1.5 bottom-1.5 w-8 flex items-center justify-center bg-emerald-50/80 dark:bg-zinc-900 rounded-lg text-primary">
                      <Wand2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <button type="button" onClick={() => setShowScanner(true)} className="w-[40px] h-[40px] flex items-center justify-center bg-blue-50 dark:bg-blue-500/10 text-blue-500 rounded-xl transition-colors shrink-0">
                    <Camera className="w-4 h-4" />
                  </button>
                </div>
                {formData.barcode && (
                  <BarcodePreview value={formData.barcode} />
                )}
              </div>
            </div>
          </div>

          {/* E-STORE VISIBILITY & SORTING */}
          <div className="space-y-4">
            <h3 className="text-[10px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-widest flex items-center gap-3">
              <span className="w-8 h-px bg-gray-200 dark:bg-white/10"></span>
              E-Store Visibility & Sorting
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex items-start gap-3 cursor-pointer group p-4 bg-emerald-50 dark:bg-primary/10 rounded-xl border border-emerald-100 dark:border-primary/20 transition-all hover:bg-emerald-100 dark:hover:bg-primary/20">
                <input
                  type="checkbox"
                  name="showInEstore"
                  checked={formData.showInEstore}
                  onChange={handleChange}
                  className="w-5 h-5 mt-0.5 rounded border-gray-300 text-primary"
                />
                <div>
                  <div className="text-xs font-black text-emerald-900 dark:text-primary uppercase tracking-wide flex items-center">
                    Show in E-Store
                  </div>
                  <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mt-0.5">Allow online ordering</div>
                </div>
              </label>

              <label className="flex items-start gap-3 cursor-pointer group p-4 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-100 dark:border-amber-500/20 transition-all hover:bg-amber-100 dark:hover:bg-amber-900/20">
                <input
                  type="checkbox"
                  name="isFeatured"
                  checked={formData.isFeatured}
                  onChange={handleChange}
                  className="w-5 h-5 mt-0.5 rounded border-gray-300 text-amber-600"
                />
                <div>
                  <div className="text-xs font-black text-amber-900 dark:text-amber-200 uppercase tracking-wide flex items-center">
                    {t('featured', 'Featured')}
                  </div>
                  <div className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest mt-0.5">Sorts to top of E-Store</div>
                </div>
              </label>
            </div>
          </div>

          {/* PRICING & STOCK */}
          <div className="space-y-4">
            <h3 className="text-[10px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-widest flex items-center gap-3">
              <span className="w-8 h-px bg-gray-200 dark:bg-white/10"></span>
              {t('financials_inventory')}
            </h3>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider flex items-center">
                  {t('selling_price')}
                  <HelpTooltip content="The retail price charged to customers at checkout. Tax calculations will be applied on top of or inclusive of this figure." />
                </label>
                <input
                  type="text"
                  name="price"
                  value={formData.price}
                  onChange={handleChange}
                  className="w-full bg-white dark:bg-black/75 border border-gray-200 dark:border-white/5 text-gray-900 dark:text-white text-base font-black rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider flex items-center">
                  {t('cost_price')}
                  <HelpTooltip content="The wholesale acquisition cost. Used strictly for calculating Cost of Goods Sold (COGS), gross profit, and valuation." />
                </label>
                <input
                  type="text"
                  name="cost"
                  value={formData.cost}
                  onChange={handleChange}
                  className="w-full bg-white dark:bg-black/75 border border-gray-200 dark:border-white/5 text-gray-900 dark:text-white text-base font-black rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="space-y-4">
              <label className="flex items-start gap-3 cursor-pointer group p-3 bg-gray-50 dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/5 transition-all hover:bg-gray-100 dark:hover:bg-white/10">
                <input
                  type="checkbox"
                  name="trackInventory"
                  checked={formData.trackInventory}
                  onChange={handleChange}
                  className="w-5 h-5 mt-0.5 rounded border-gray-300 text-primary"
                />
                <div>
                  <div className="text-xs font-black text-gray-700 dark:text-gray-200 uppercase tracking-wide flex items-center">
                    {t('enable_active_tracking')}
                    <HelpTooltip content="Maintains real-time stock balances across sales and returns. Disabling this treats the item as having infinite supply." />
                  </div>
                  <div className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mt-0.5">{t('track_stock_alert')}</div>
                </div>
              </label>

              {formData.trackInventory && (
                <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider flex items-center">
                      {t('initial_stock')}
                      <HelpTooltip content="The starting physical inventory count available on hand when creating this item." />
                    </label>
                    <input
                      type="text"
                      name="stock"
                      value={formData.stock}
                      onChange={handleChange}
                      className="w-full bg-white dark:bg-black/75 border border-gray-200 dark:border-white/5 text-gray-900 dark:text-white text-base font-black rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-wider flex items-center">
                      {t('low_stock_alert')}
                      <HelpTooltip content="Threshold at which item appears on the Low Stock dashboard widget and reorder reports." />
                    </label>
                    <input
                      type="text"
                      name="minStock"
                      value={formData.minStock}
                      onChange={handleChange}
                      className="w-full bg-white dark:bg-black/75 border border-gray-200 dark:border-white/5 text-gray-900 dark:text-white text-base font-black rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Product Media */}
          <div className="space-y-4">
             <h3 className="text-[10px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-widest flex items-center gap-3">
              <span className="w-8 h-px bg-gray-200 dark:bg-white/10"></span>
              {t('visual_assets')}
            </h3>
            
            <div className="flex flex-col sm:flex-row gap-4 items-start">
               <div className="w-24 h-24 rounded-2xl bg-gray-100 dark:bg-black/75 border-2 border-dashed border-gray-200 dark:border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                  {formData.image ? (
                    <img src={formData.image} className="w-full h-full object-cover" />
                  ) : (
                    <Camera className="w-6 h-6 text-gray-600" />
                  )}
               </div>
               
               <div className="flex-1 space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-gray-50 transition-all">
                      {t('upload')}
                    </button>
                    <button onClick={() => setShowMediaLibrary(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest shadow-lg shadow-blue-600/20">
                      {t('library')}
                    </button>
                    {formData.image && (
                      <button onClick={() => setFormData(prev => ({ ...prev, image: '' }))} className="px-4 py-2 bg-rose-500/10 text-rose-500 rounded-lg text-[9px] font-black uppercase tracking-widest">
                        {t('remove')}
                      </button>
                    )}
                  </div>
                  <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" className="hidden" />
                  <p className="text-[8px] font-bold text-gray-600 uppercase tracking-widest">Supports WebP, JPG, PNG · Max 50KB</p>
               </div>
            </div>
           </div>

          {/* ADVANCED POS FEATURES */}
          <div className="space-y-6 pt-4 border-t border-gray-200 dark:border-white/5">
            <h3 className="text-[10px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-widest flex items-center gap-3">
              <span className="w-8 h-px bg-gray-200 dark:bg-white/10"></span>
              {t('universal_pos_enhancements')}
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex items-start gap-3 cursor-pointer group p-4 bg-purple-50 dark:bg-purple-900/10 rounded-xl border border-purple-100 dark:border-purple-500/20 transition-all hover:bg-purple-100 dark:hover:bg-purple-900/20">
                <input
                  type="checkbox"
                  name="isService"
                  checked={formData.isService}
                  onChange={handleChange}
                  className="w-5 h-5 mt-0.5 rounded border-gray-300 text-purple-600"
                />
                <div>
                  <div className="text-xs font-black text-purple-900 dark:text-purple-200 uppercase tracking-wide flex items-center">
                    {t('service_item')}
                    <HelpTooltip content="Flags this item as a non-physical service (e.g. repair fee, labor, consultation). Physical stock tracking will be automatically disabled, and sales will not trigger negative stock warnings." />
                  </div>
                  <div className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-widest mt-0.5">Labor, Delivery, Consultation (No Stock)</div>
                </div>
              </label>

              <label className="flex items-start gap-3 cursor-pointer group p-4 bg-orange-50 dark:bg-orange-900/10 rounded-xl border border-orange-100 dark:border-orange-500/20 transition-all hover:bg-orange-100 dark:hover:bg-orange-900/20">
                <input
                  type="checkbox"
                  name="requireSerial"
                  checked={formData.requireSerial}
                  onChange={handleChange}
                  className="w-5 h-5 mt-0.5 rounded border-gray-300 text-orange-600"
                />
                <div>
                  <div className="text-xs font-black text-orange-900 dark:text-orange-200 uppercase tracking-wide flex items-center">
                    {t('require_serial_imei')}
                    <HelpTooltip content="When enabled, cashier will be prompted to enter or scan the device's unique Serial Number / IMEI before adding this item to the POS cart." />
                  </div>
                  <div className="text-[10px] font-bold text-orange-600 dark:text-orange-400 uppercase tracking-widest mt-0.5">Force scanner prompt at POS checkout</div>
                </div>
              </label>
            </div>

            {/* VARIANTS BUILDER */}
            <div className="space-y-3 p-4 bg-gray-50 dark:bg-surface rounded-2xl border border-gray-200 dark:border-white/5">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-black text-gray-900 dark:text-white uppercase">{t('product_variants')}</h4>
                  <p className="text-[9px] text-gray-600 uppercase font-bold tracking-widest">Size, Color, Material (e.g. Garments, Shoes)</p>
                </div>
                <button 
                  type="button" 
                  onClick={() => setVariants([...variants, { name: '', options: [], optionsRaw: '' }])}
                  className="px-3 py-1.5 bg-white dark:bg-black text-primary dark:text-primary text-[10px] font-black uppercase tracking-widest rounded-lg border border-gray-200 dark:border-white/10 hover:border-primary shadow-sm"
                >
                  {t('add_variant_option')}
                </button>
              </div>
              
              {variants.map((variant, index) => {
                const addTag = (text: string) => {
                  const trimmed = text.trim();
                  if (!trimmed) return;
                  const parts = trimmed.split(/[,;]+/).map(p => p.trim()).filter(p => p && !variant.options.includes(p));
                  if (parts.length > 0) {
                    const newVariants = [...variants];
                    newVariants[index].options = [...variant.options, ...parts];
                    newVariants[index].optionsRaw = '';
                    setVariants(newVariants);
                  } else {
                    const newVariants = [...variants];
                    newVariants[index].optionsRaw = '';
                    setVariants(newVariants);
                  }
                };

                const removeTag = (optIndex: number) => {
                  const newVariants = [...variants];
                  newVariants[index].options = variant.options.filter((_, i) => i !== optIndex);
                  setVariants(newVariants);
                };

                return (
                  <div key={index} className="flex gap-2 items-start p-3 bg-white dark:bg-black/40 rounded-xl border border-gray-200 dark:border-white/5">
                    <input
                      type="text"
                      placeholder="Variant Name (e.g. Size)"
                      value={variant.name}
                      onChange={(e) => {
                        const newVariants = [...variants];
                        newVariants[index].name = e.target.value;
                        setVariants(newVariants);
                      }}
                      className="w-1/3 bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 text-xs rounded-lg px-3 py-2 focus:ring-1 focus:ring-emerald-500"
                    />
                    
                    <div 
                      className="flex-1 flex flex-wrap items-center gap-1.5 min-h-[38px] bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-lg px-2.5 py-1.5 focus-within:ring-1 focus-within:ring-emerald-500 focus-within:border-primary transition-all cursor-text"
                      onClick={(e) => {
                        const inputEl = e.currentTarget.querySelector('input[type="text"]');
                        if (inputEl) (inputEl as HTMLInputElement).focus();
                      }}
                    >
                      {variant.options.map((opt, optIndex) => (
                        <span 
                          key={optIndex} 
                          className="bg-emerald-50 dark:bg-primary/10 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-primary/20 px-2 py-0.5 rounded-md text-[11px] font-bold flex items-center gap-1 animate-fadeIn select-none"
                        >
                          {opt}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeTag(optIndex);
                            }}
                            className="text-primary hover:text-emerald-700 dark:hover:text-emerald-300 font-bold focus:outline-none transition-colors"
                          >
                            &times;
                          </button>
                        </span>
                      ))}
                      <input
                        type="text"
                        placeholder={variant.options.length === 0 ? "Options (Comma/Enter)" : ""}
                        value={variant.optionsRaw || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val.includes(',') || val.includes(';')) {
                            addTag(val);
                          } else {
                            const newVariants = [...variants];
                            newVariants[index].optionsRaw = val;
                            setVariants(newVariants);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            e.stopPropagation();
                            addTag(e.currentTarget.value);
                          } else if (e.key === 'Backspace' && !variant.optionsRaw && variant.options.length > 0) {
                            removeTag(variant.options.length - 1);
                          }
                        }}
                        onBlur={(e) => {
                          addTag(e.target.value);
                        }}
                        className="flex-1 min-w-[60px] bg-transparent border-0 outline-none p-0 text-xs text-gray-900 dark:text-white focus:ring-0 placeholder-gray-400 dark:placeholder-gray-500 font-medium"
                      />
                    </div>

                    <button type="button" onClick={() => setVariants(variants.filter((_, i) => i !== index))} className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
              
              {/* Matrix Generator Button */}
              {variants.length > 0 && variants.some(v => v.options.length > 0) && (
                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      // Simple matrix generation for up to 2 variants
                      if (variants.length === 0) return;
                      const newVariantData: VariantData[] = [];
                      const v1 = variants[0];
                      const v2 = variants.length > 1 ? variants[1] : null;
                      
                      v1.options.forEach(opt1 => {
                        if (v2 && v2.options.length > 0) {
                          v2.options.forEach(opt2 => {
                            const option1Label = `${v1.name}: ${opt1}`;
                            const option2Label = `${v2.name}: ${opt2}`;
                            const existing = variantData.find(vd => vd.option1 === option1Label && vd.option2 === option2Label);
                            newVariantData.push(existing || {
                              id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                              option1: option1Label,
                              option2: option2Label
                            });
                          });
                        } else {
                          const option1Label = `${v1.name}: ${opt1}`;
                          const existing = variantData.find(vd => vd.option1 === option1Label && !vd.option2);
                          newVariantData.push(existing || {
                            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                            option1: option1Label
                          });
                        }
                      });
                      setVariantData(newVariantData);
                    }}
                    className="px-4 py-2 bg-emerald-50 dark:bg-primary/10 text-emerald-600 dark:text-primary text-[10px] font-black uppercase tracking-widest rounded-lg border border-emerald-200 dark:border-primary/20 hover:border-primary shadow-sm flex items-center gap-2"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    {t('generate_matrix', 'Generate Price/Stock Matrix')}
                  </button>
                </div>
              )}
              
              {/* Matrix Display */}
              {variantData.length > 0 && (
                <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 dark:border-white/10">
                  <table className="w-full text-left text-[10px] uppercase font-bold text-gray-600 dark:text-gray-400">
                    <thead className="bg-gray-100 dark:bg-black/60 border-b border-gray-200 dark:border-white/10">
                      <tr>
                        <th className="px-3 py-2">Variant</th>
                        <th className="px-3 py-2 w-24">Exact Price</th>
                        <th className="px-3 py-2 w-20">Stock</th>
                        <th className="px-3 py-2 w-28">Barcode</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-black/20 divide-y divide-gray-100 dark:divide-white/5">
                      {variantData.map((vd, idx) => (
                        <tr key={vd.id}>
                          <td className="px-3 py-2 whitespace-nowrap text-gray-900 dark:text-white">
                            {vd.option1} {vd.option2 ? ` / ${vd.option2}` : ''}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              value={vd.priceOverride || ''}
                              onChange={(e) => {
                                const newData = [...variantData];
                                newData[idx].priceOverride = e.target.value ? parseFloat(e.target.value) : undefined;
                                setVariantData(newData);
                              }}
                              placeholder={formData.price}
                              className="w-full bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 text-xs rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-emerald-500"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              value={vd.stock || ''}
                              onChange={(e) => {
                                const newData = [...variantData];
                                newData[idx].stock = e.target.value ? parseInt(e.target.value, 10) : undefined;
                                setVariantData(newData);
                              }}
                              placeholder="0"
                              className="w-full bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 text-xs rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-emerald-500"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={vd.barcode || ''}
                              onChange={(e) => {
                                const newData = [...variantData];
                                newData[idx].barcode = e.target.value;
                                setVariantData(newData);
                              }}
                              placeholder="Auto"
                              className="w-full bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 text-xs rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-emerald-500 uppercase"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* MODIFIERS BUILDER */}
            <div className="space-y-3 p-4 bg-gray-50 dark:bg-surface rounded-2xl border border-gray-200 dark:border-white/5">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-black text-gray-900 dark:text-white uppercase">{t('product_modifiers')}</h4>
                  <p className="text-[9px] text-gray-600 uppercase font-bold tracking-widest">Add-ons & Extras (e.g. Cafe, Restaurant)</p>
                </div>
                <button 
                  type="button" 
                  onClick={() => setModifiers([...modifiers, { name: '', price: 0 }])}
                  className="px-3 py-1.5 bg-white dark:bg-black text-blue-600 dark:text-blue-500 text-[10px] font-black uppercase tracking-widest rounded-lg border border-gray-200 dark:border-white/10 hover:border-blue-500 shadow-sm"
                >
                  {t('add_modifier')}
                </button>
              </div>
              
              {modifiers.map((mod, index) => (
                <div key={index} className="flex flex-col sm:flex-row gap-2.5 p-3 bg-white dark:bg-black/40 rounded-xl border border-gray-200 dark:border-white/5">
                  <div className="flex-1 min-w-0 space-y-1.5 w-full">
                    <input
                      type="text"
                      placeholder="Add-on Name (e.g. Extra Cheese)"
                      value={mod.name}
                      onChange={(e) => {
                        const newMods = [...modifiers];
                        newMods[index].name = e.target.value;
                        setModifiers(newMods);
                      }}
                      className="w-full min-w-0 bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-1.5 focus:ring-1 focus:ring-blue-500 font-medium text-gray-900 dark:text-white"
                    />
                    {variants.length > 0 && variants.some(v => v.options.length > 0) && (
                      <select
                        value={mod.variantName || ''}
                        onChange={(e) => {
                          const newMods = [...modifiers];
                          newMods[index].variantName = e.target.value || undefined;
                          setModifiers(newMods);
                        }}
                        className="w-full min-w-0 bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-400 rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-blue-500 font-medium"
                      >
                        <option value="">Apply to all variants</option>
                        {variants.flatMap(v => v.options.map(opt => `${v.name}: ${opt}`)).map(opt => (
                          <option key={opt} value={opt}>Only for {opt}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-between sm:justify-start">
                    <div className="relative flex-1 sm:flex-none w-full sm:w-24">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 text-xs font-bold z-10">+</span>
                      <input
                        type="number"
                        placeholder="0"
                        value={mod.price || ''}
                        onChange={(e) => {
                          const newMods = [...modifiers];
                          newMods[index].price = parseFloat(e.target.value) || 0;
                          setModifiers(newMods);
                        }}
                        className="w-full bg-gray-50 dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-lg pl-6 pr-2 py-1.5 focus:ring-1 focus:ring-blue-500 font-bold text-gray-900 dark:text-white text-xs"
                      />
                    </div>
                    <button type="button" onClick={() => setModifiers(modifiers.filter((_, i) => i !== index))} className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg shrink-0 transition-colors mt-0.5">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}

            </div>
          </div>

          {/* Configuration */}
          <div className="pt-6 border-t border-gray-200 dark:border-white/5 flex flex-wrap gap-4 sm:gap-6">
             {['taxable', 'active'].map((field) => (
                <label key={field} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    name={field}
                    checked={(formData as any)[field]}
                    onChange={handleChange}
                    className="w-4 h-4 rounded border-gray-300 text-primary"
                  />
                  <span className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest">
                    {field === 'taxable' ? t('taxable') : t('active')}
                  </span>
                </label>
             ))}
          </div>
        </div>
      </Modal>

      {showMediaLibrary && (
        <MediaLibrary
          isOpen={showMediaLibrary}
          onClose={() => setShowMediaLibrary(false)}
          onSelect={(url) => setFormData(prev => ({ ...prev, image: url }))}
        />
      )}

      {showScanner && (
        <CameraScanner
          onScan={(code) => {
            const normalized = code.trim().toUpperCase().replace(/O/g, '0');
            setFormData(prev => ({ ...prev, barcode: normalized }));
            setShowScanner(false);
          }}
          onClose={() => setShowScanner(false)}
        />
      )}
    </>
  );
}