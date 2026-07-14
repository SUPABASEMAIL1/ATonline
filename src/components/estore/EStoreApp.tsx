import React, { useState, useEffect, useMemo } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Product, AppSettings, Category, CartItem, Sale } from '../../types';
import { mapProduct, mapSettings, generateNextInvoiceNumber } from '../../lib/services';
import { StoreFront } from './StoreFront';
import { StoreCheckout } from './StoreCheckout';
import { ShoppingBag, Phone } from 'lucide-react';
import { sonner } from '../../lib/sonner';

export function EStoreApp() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        // Fetch Settings
        const { data: settingsData } = await supabase
          .from('app_settings')
          .select('*')
          .eq('id', '00000000-0000-4000-8000-000000000001')
          .maybeSingle();

        if (settingsData) {
          setSettings(mapSettings(settingsData));
        }

        // Fetch Products
        const { data: productsData } = await supabase
          .from('products')
          .select('*')
          .eq('active', true)
          .eq('show_in_estore', true);

        if (productsData) {
          const loadedProducts = productsData.map(mapProduct);
          setProducts(loadedProducts);
          
          // Rehydrate Cart
          try {
            const saved = localStorage.getItem('estore_cart');
            if (saved) {
              const parsed = JSON.parse(saved);
              const rehydratedCart = parsed.map((item: any) => {
                const pId = item.productId || item.product?.id;
                const prod = loadedProducts.find(p => p.id === pId);
                if (prod) {
                  return {
                    ...item,
                    product: prod,
                    subtotal: prod.price * (item.quantity || 1)
                  };
                }
                return null;
              }).filter(Boolean);
              setCart(rehydratedCart);
            }
          } catch (e) {
            console.error('Failed to parse cart', e);
          }
        }

        // Fetch Categories
        const { data: catData } = await supabase
          .from('categories')
          .select('*');
        
        if (catData) {
          setCategories(catData.map(c => ({ id: c.id, name: c.name, color: c.color })));
        }

      } catch (err) {
        console.error('Failed to load E-Store data', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Save Cart safely
  useEffect(() => {
    if (!loading) {
      try {
        const minimalCart = cart.map(item => ({
          ...item,
          productId: item.product.id,
          product: undefined // Don't store the full product (base64 images break quota)
        }));
        localStorage.setItem('estore_cart', JSON.stringify(minimalCart));
      } catch (err) {
        console.error('Failed to save cart to localStorage', err);
      }
    }
  }, [cart, loading]);

  const addToCart = (product: Product, quantity = 1, options?: { selectedVariant?: string; selectedModifiers?: ProductModifier[] }) => {
    setCart(prev => {
      // Find exact match including options
      const existing = prev.findIndex(item => 
        item.product.id === product.id && 
        item.selectedVariant === options?.selectedVariant &&
        JSON.stringify(item.selectedModifiers) === JSON.stringify(options?.selectedModifiers)
      );

      const basePrice = product.price; // For simplicity in this example, normally you calculate variant/modifier price here if they affect it.
      // But we will calculate it based on options.
      let finalPrice = basePrice;
      if (options?.selectedVariant) {
        // If variant matched, check priceOverride
        const parts = options.selectedVariant.split(',').map(s => s.trim());
        const match = product.variantData?.find(vd => {
          let m = true;
          if (vd.option1 && !parts.includes(vd.option1)) m = false;
          if (vd.option2 && !parts.includes(vd.option2)) m = false;
          if (vd.option3 && !parts.includes(vd.option3)) m = false;
          return m;
        });
        if (match?.priceOverride !== undefined) {
          finalPrice = match.priceOverride;
        }
      }
      if (options?.selectedModifiers) {
        finalPrice += options.selectedModifiers.reduce((sum, mod) => sum + mod.price, 0);
      }
      if (existing >= 0) {
        const newCart = [...prev];
        newCart[existing].quantity += quantity;
        newCart[existing].subtotal = newCart[existing].quantity * finalPrice;
        return newCart;
      }
      return [...prev, {
        product,
        quantity,
        subtotal: finalPrice * quantity,
        discount: 0,
        discountType: 'percentage',
        selectedVariant: options?.selectedVariant,
        selectedModifiers: options?.selectedModifiers
      }];
    });
    sonner.success(`Added ${product.name} to cart`);
  };

  const updateCartItem = (index: number, quantity: number) => {
    if (quantity <= 0) {
      setCart(prev => prev.filter((_, i) => i !== index));
      return;
    }
    setCart(prev => {
      const newCart = [...prev];
      newCart[index].quantity = quantity;
      newCart[index].subtotal = newCart[index].product.price * quantity;
      return newCart;
    });
  };

  const clearCart = () => setCart([]);

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (settings && !settings.estoreEnabled) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-gray-50 p-6 text-center">
        <ShoppingBag className="w-24 h-24 text-gray-300 mb-6" />
        <h1 className="text-3xl font-black text-gray-900 mb-2">Store is closed</h1>
        <p className="text-gray-500">We are currently not accepting online orders. Please check back later.</p>
      </div>
    );
  }

  return (
    <div 
      className="h-[100dvh] bg-[var(--color-bg)] text-[var(--color-text)] overflow-y-auto overflow-x-hidden transition-colors duration-300" 
      style={{ 
        WebkitOverflowScrolling: 'touch',
        '--color-primary': settings?.estoreThemeColor || '#10b981',
        '--color-primary-hover': settings?.estorePrimaryColorHover || '#059669',
        '--color-bg': settings?.estoreBgColor || '#f9fafb',
        '--color-text': settings?.estoreTextColor || '#111827',
        '--color-card-bg': settings?.estoreCardBgColor || '#ffffff',
      } as React.CSSProperties}
    >
      <Routes>
        <Route path="/store" element={
          <StoreFront 
            settings={settings} 
            products={products} 
            categories={categories}
            cart={cart}
            onAddToCart={addToCart}
            onUpdateCart={updateCartItem}
          />
        } />
        <Route path="/store/checkout" element={
          <StoreCheckout 
            settings={settings}
            cart={cart}
            onClearCart={clearCart}
            onUpdateCart={updateCartItem}
          />
        } />
      </Routes>
      
      {/* WhatsApp Floating Action Button */}
      {settings?.estoreWhatsappEnabled && settings.estoreWhatsappNumber && (
        <a
          href={`https://wa.me/${settings.estoreWhatsappNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent("Hi, I need some help with an order from " + (settings.storeName || "the store") + ".")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-6 left-6 z-[60] bg-[#25D366] text-white p-3.5 rounded-full shadow-[0_8px_30px_rgb(37,211,102,0.4)] hover:scale-110 active:scale-95 transition-all flex items-center justify-center animate-in fade-in slide-in-from-bottom-5 duration-500"
          title="Chat with us on WhatsApp"
        >
          <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
        </a>
      )}
    </div>
  );
}
