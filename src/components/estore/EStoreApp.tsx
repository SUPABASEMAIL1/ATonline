import React, { useState, useEffect, useMemo } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Product, AppSettings, Category, CartItem, Bundle, Sale, ProductModifier, CartItemTopping } from '../../types';
import { mapProduct, mapSettings, mapBundle, generateNextInvoiceNumber, settingsService } from '../../lib/services';
import { StoreFront } from './StoreFront';
import { StoreCheckout } from './StoreCheckout';
import { OrderTracker } from './OrderTracker';
import { useSearchParams } from 'react-router-dom';
import { ShoppingBag, Phone, Clock } from 'lucide-react';
import { formatTime12h } from '../../lib/timeFormat';
import { sonner } from '../../lib/sonner';
import { SkeletonLoader } from '../common/SkeletonLoader';
import { updateDynamicManifest } from '../../lib/dynamicManifest';

function TrackPage({ settings }: { settings: AppSettings | null }) {
  const [searchParams] = useSearchParams();
  const id = searchParams.get('id');
  if (!id) return <div className="p-8 text-center">Order ID not found</div>;
  return <OrderTracker orderId={id} settings={settings} />;
}

export function EStoreApp() {
  const [settings, setSettings] = useState<AppSettings | null>(() => {
    try {
      const saved = localStorage.getItem('pos_settings');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [customerPosition, setCustomerPosition] = useState<[number, number] | null>(null);
  const [isOutOfRange, setIsOutOfRange] = useState(false);

  const getDistanceFromLatLonInKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Radius of the earth in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
  };

  useEffect(() => {
    async function loadData() {
      try {
        // Fetch Settings (checking local IndexedDB first, then falling back to remote)
        const activeSettings = await settingsService.get();
        if (activeSettings) {
          setSettings(activeSettings);
          localStorage.setItem('pos_settings', JSON.stringify(activeSettings));
        }

        // Fetch Products
        const { data: productsData } = await supabase
          .from('products')
          .select('*')
          .eq('active', true)
          .eq('show_in_estore', true);

        let loadedProducts: Product[] = [];
        if (productsData) {
          loadedProducts = productsData.map(mapProduct);
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
          setCategories(catData.map(c => ({ id: c.id, name: c.name, estoreSortOrder: c.estore_sort_order ?? 0, color: c.color })));
        }

        // Fetch Bundles (active deals)
        const { data: bundlesData, error: bundlesError } = await supabase
          .from('bundles')
          .select('*, bundle_items(*), bundle_slots(*, bundle_slot_options(*))')
          .eq('active', true)
          .order('estore_sort_order', { ascending: true });
        
        if (bundlesError) {
          console.warn('[EStore] Bundle fetch error:', bundlesError.message);
        } else if (bundlesData) {
          setBundles(bundlesData.map(mapBundle));
        }

        // Geolocation pre-checking
        if (activeSettings && activeSettings.estoreDeliveryEnabled !== false && activeSettings.estoreLocationLat && activeSettings.estoreLocationLng && activeSettings.estoreDeliveryRadius) {
          if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                setCustomerPosition([lat, lng]);
                
                const distance = getDistanceFromLatLonInKm(
                  activeSettings!.estoreLocationLat!,
                  activeSettings!.estoreLocationLng!,
                  lat,
                  lng
                );
                
                if (distance > activeSettings!.estoreDeliveryRadius!) {
                  setIsOutOfRange(true);
                  sonner.warning("You are outside our delivery range. Self-Pickup is still available!");
                } else {
                  setIsOutOfRange(false);
                }
              },
              (err) => {
                console.warn("E-store geolocation prompt failed/denied", err);
              },
              { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
            );
          }
        }

      } catch (err) {
        console.error('Failed to load E-Store data', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Dynamic PWA Manifest Updater for E-Store Customer storefront visitors
  useEffect(() => {
    if (!settings) return;
    const bizName = settings.storeName || 'Zaynahs';
    const storeLogo = settings.storeLogo || '';
    const themeColor = settings.estoreThemeColor || '#10b981';

    if (storeLogo) {
      const appleIcon = document.querySelector('link[rel="apple-touch-icon"]');
      if (appleIcon) {
        appleIcon.setAttribute('href', storeLogo);
      }
      const favicons = document.querySelectorAll('link[rel*="icon"]');
      favicons.forEach(favicon => {
        favicon.setAttribute('href', storeLogo);
      });
    }

    document.title = bizName + ' - Online Store';

    let appleTitleMeta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (!appleTitleMeta) {
      appleTitleMeta = document.createElement('meta');
      appleTitleMeta.setAttribute('name', 'apple-mobile-web-app-title');
      document.head.appendChild(appleTitleMeta);
    }
    appleTitleMeta.setAttribute('content', bizName);

    let appNameMeta = document.querySelector('meta[name="application-name"]');
    if (!appNameMeta) {
      appNameMeta = document.createElement('meta');
      appNameMeta.setAttribute('name', 'application-name');
      document.head.appendChild(appNameMeta);
    }
    appNameMeta.setAttribute('content', bizName);

    updateDynamicManifest({
      storeName: bizName,
      storeLogo: storeLogo || undefined,
      isStore: true,
      themeColor,
      updatedAt: settings.updatedAt,
    });
  }, [settings]);

  // Sync E-Store light/dark mode class and restore admin theme on unmount
  useEffect(() => {
    if (!settings) return;
    const bg = settings.estoreBgColor || '#f9fafb';
    const isDark = bg.startsWith('#') ? (
      (() => {
        const hex = bg.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return brightness < 128;
      })()
    ) : false;

    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    return () => {
      // Restore Admin Theme on exit
      const adminTheme = localStorage.getItem('pos_settings')
        ? JSON.parse(localStorage.getItem('pos_settings')!).theme || 'dark'
        : 'dark';
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const isAdminDark = adminTheme === 'dark' || (adminTheme === 'auto' && mediaQuery.matches);
      if (isAdminDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };
  }, [settings?.estoreBgColor]);

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

  const addToCart = (product: Product, quantity = 1, options?: { selectedVariant?: string; selectedVariantId?: string; selectedModifiers?: ProductModifier[]; toppings?: CartItemTopping[] }) => {
    setCart(prev => {
      const existing = prev.findIndex(item => 
        item.product.id === product.id && 
        item.selectedVariant === options?.selectedVariant &&
        JSON.stringify(item.selectedModifiers) === JSON.stringify(options?.selectedModifiers) &&
        JSON.stringify(item.toppings) === JSON.stringify(options?.toppings)
      );

      let finalPrice = product.price;
      let resolvedVariantId = options?.selectedVariantId;

      if (options?.selectedVariant) {
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
        // Resolve variantId if not passed explicitly
        if (!resolvedVariantId && match) {
          resolvedVariantId = match.id;
        }
      }
      if (options?.selectedModifiers) {
        finalPrice += options.selectedModifiers.reduce((sum, mod) => sum + mod.price, 0);
      }
      const toppingsPrice = options?.toppings ? options.toppings.reduce((sum, t) => sum + t.price, 0) : 0;
      finalPrice += toppingsPrice;
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
        selectedVariantId: resolvedVariantId,
        selectedModifiers: options?.selectedModifiers,
        toppings: options?.toppings
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
      const oldQty = newCart[index].quantity || 1;
      const factor = quantity / oldQty;
      newCart[index].quantity = quantity;
      newCart[index].subtotal = newCart[index].subtotal * factor;
      if (newCart[index].discount) {
        newCart[index].discount = newCart[index].discount * factor;
      }
      return newCart;
    });
  };

  const addBundleToCart = (bundleCartItems: CartItem[]) => {
    setCart(prev => {
      let updatedCart = [...prev];
      for (const item of bundleCartItems) {
        const existingIndex = updatedCart.findIndex(
          x => (x.bundleId === item.bundleId) && x.product.id === item.product.id && x.selectedVariant === item.selectedVariant
        );

        if (existingIndex >= 0) {
          const existing = updatedCart[existingIndex];
          updatedCart[existingIndex] = {
            ...existing,
            quantity: existing.quantity + item.quantity,
            discount: (existing.discount || 0) + (item.discount || 0),
            subtotal: (existing.subtotal || 0) + (item.subtotal || 0),
          };
        } else {
          updatedCart.push(item);
        }
      }
      return updatedCart;
    });
  };

  const clearCart = () => setCart([]);

  if (loading) {
    return <SkeletonLoader type="storefront" />;
  }

  if (settings && !settings.estoreEnabled) {
    return (
      <div 
        className="min-h-[100dvh] flex flex-col items-center justify-center p-6 text-center relative overflow-hidden bg-zinc-950 text-white selection:bg-emerald-500/30 select-none"
        style={{ fontFamily: "'Outfit', 'Inter', sans-serif" }}
      >
        {/* Glow Effects */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] sm:w-[500px] h-[350px] sm:h-[500px] rounded-full bg-emerald-500/10 blur-[80px] sm:blur-[120px] pointer-events-none animate-pulse duration-4000" />
        <div className="absolute bottom-1/4 left-1/3 w-[250px] h-[250px] rounded-full bg-teal-500/5 blur-[80px] pointer-events-none" />

        {/* Outer Card with Glassmorphism */}
        <div className="relative z-10 max-w-md w-full bg-white/[0.02] dark:bg-zinc-900/30 backdrop-blur-xl border border-white/[0.05] p-8 sm:p-10 rounded-[2.5rem] shadow-2xl flex flex-col items-center gap-6 animate-in fade-in zoom-in-95 duration-500">
          
          {/* Logo / Icon Wrapper */}
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center shadow-lg shadow-emerald-500/10 relative group">
            <div className="absolute inset-0 rounded-3xl bg-emerald-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-md" />
            <ShoppingBag className="w-10 h-10 text-emerald-400 relative z-10" />
          </div>

          <div className="space-y-3">
            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-400/80 bg-emerald-400/10 px-3 py-1 rounded-full border border-emerald-400/20">
              Temporarily Offline
            </span>
            <h1 className="text-2xl font-black tracking-tight text-white uppercase leading-none mt-2">
              Store is Closed
            </h1>
            <p className="text-[10px] font-bold text-zinc-400 max-w-xs mx-auto leading-relaxed mt-2 uppercase tracking-wide">
              We are currently not accepting online orders. Please check back later or contact us directly.
            </p>
          </div>

          {/* Contact Details Panel */}
          {(settings.storePhone || settings.storeAddress) && (
            <div className="w-full border-t border-white/[0.06] pt-6 mt-2 space-y-4">
              <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest">Store Information</p>
              
              {settings.storePhone && (
                <a 
                  href={`tel:${settings.storePhone}`}
                  className="flex items-center justify-center gap-3 p-3.5 rounded-2xl bg-white/[0.02] border border-white/[0.04] hover:bg-emerald-500/10 hover:border-emerald-500/20 text-sm font-black transition-all group active:scale-95"
                >
                  <Phone className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
                  <span className="text-zinc-300 group-hover:text-white transition-colors">{settings.storePhone}</span>
                </a>
              )}

              {settings.storeAddress && (
                <div className="p-4 rounded-2xl bg-white/[0.01] border border-white/[0.03] text-[10px] font-bold text-zinc-400 leading-relaxed text-center">
                  <p className="text-[8px] font-black text-zinc-500 uppercase tracking-widest mb-1.5">Address</p>
                  {settings.storeAddress}
                </div>
              )}
            </div>
          )}

          {/* Decorative Footer */}
          <div className="text-[8px] font-black text-zinc-600 uppercase tracking-[0.2em] mt-2">
            Powered by {settings.storeName || 'Zaynahs POS'}
          </div>
        </div>
      </div>
    );
  }

  const estoreThemeStyles = `
    :root, .dark, html {
      --color-primary: ${settings?.estoreThemeColor || '#10b981'} !important;
      --color-primary-hover: ${settings?.estorePrimaryColorHover || '#059669'} !important;
      --color-bg: ${settings?.estoreBgColor || '#f9fafb'} !important;
      --color-surface: ${settings?.estoreCardBgColor || '#ffffff'} !important;
      --color-card-bg: ${settings?.estoreCardBgColor || '#ffffff'} !important;
      --color-text: ${settings?.estoreTextColor || '#111827'} !important;
      --color-text-muted: ${settings?.estoreTextColor ? settings.estoreTextColor + '80' : '#11182780'} !important;
    }
  `;

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
      <style dangerouslySetInnerHTML={{ __html: estoreThemeStyles }} />

      {(() => {
        const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
        const inWin = (st: string | undefined, et: string | undefined) => {
          if (!st || !et) return true;
          const [sh, sm] = st.split(':').map(Number);
          const [eh, em] = et.split(':').map(Number);
          const s = sh * 60 + sm, e = eh * 60 + em;
          return e > s ? (nowMin >= s && nowMin < e) : (nowMin >= s || nowMin < e);
        };
        const delOk = inWin(settings?.deliveryStartTime, settings?.deliveryEndTime);
        const pickOk = inWin(settings?.pickupStartTime, settings?.pickupEndTime);
        const shopOk = inWin(settings?.shopOpenTime, settings?.shopCloseTime);
        if (settings?.estoreEnabled === false || settings?.estoreEnabled === undefined) return null;
        if (!shopOk && (settings?.shopOpenTime || settings?.shopCloseTime)) {
          return (
            <div className="bg-red-500 text-white font-black px-4 py-3 text-center text-[10px] uppercase tracking-wider sticky top-0 z-[100] flex items-center justify-center gap-2 shadow-lg">
              <Clock className="w-4 h-4 shrink-0" />
              Store is currently closed — Open {formatTime12h(settings.shopOpenTime)} – {formatTime12h(settings.shopCloseTime)}
            </div>
          );
        }
        if (!delOk && (settings?.deliveryStartTime || settings?.deliveryEndTime)) {
          return (
            <div className="bg-amber-500 text-white font-black px-4 py-3 text-center text-[10px] uppercase tracking-wider sticky top-0 z-[100] flex items-center justify-center gap-2 shadow-lg">
              <Clock className="w-4 h-4 shrink-0" />
              Delivery available {formatTime12h(settings.deliveryStartTime)} – {formatTime12h(settings.deliveryEndTime)} — Pickup only right now
            </div>
          );
        }
        return null;
      })()}

      {isOutOfRange && (
        <div className="bg-amber-500 text-white font-black px-4 py-3 text-center text-[10px] uppercase tracking-wider sticky top-0 z-[100] flex items-center justify-center gap-2 shadow-lg">
          <svg className="w-4 h-4 text-white shrink-0 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          Warning: You are outside our delivery range. You can still order for Self Pickup!
        </div>
      )}

      <Routes>
        <Route path="/store" element={
                  <StoreFront 
            settings={settings} 
            products={products} 
            categories={categories}
            bundles={bundles}
            cart={cart}
            onAddToCart={addToCart}
            onAddBundle={addBundleToCart}
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
        <Route path="/store/track" element={<TrackPage settings={settings} />} />
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
