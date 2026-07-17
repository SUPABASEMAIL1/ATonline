import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Product, AppSettings, Category, CartItem, ProductModifier, Bundle, Sale } from '../../types';
import { ShoppingCart, ShoppingBag, Search, Plus, Minus, ChevronRight, ChevronLeft, X, User, History, LogOut, Bike, Clock, Flame, CheckCircle2, Timer } from 'lucide-react';
import { useEstoreAuth } from './useEstoreAuth';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/currencies';
import { StoreProductModal } from './StoreProductModal';
import { StoreDealModal } from './StoreDealModal';
import { HighlightBadge } from '../common/HighlightBadge';
import { useScheduleStatus } from '../../hooks/useScheduleStatus';

// ─── Live ticking order timer for StoreFront order history ───
const StoreOrderTimer = ({ order, settings, onExpire }: { order: any, settings: any, onExpire: () => void }) => {
  const [timeLeft, setTimeLeft] = useState<number>(-1);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!settings?.estoreOrderTimerEnabled || !settings?.estoreOrderTimerMinutes) return;
    const createdAt = new Date(order.createdAt).getTime();
    const durationMs = settings.estoreOrderTimerMinutes * 60 * 1000;
    const targetTime = createdAt + durationMs;
    
    const initialRemaining = targetTime - Date.now();
    if (initialRemaining <= 0) {
      setTimeLeft(0);
      setExpired(true);
      return;
    }

    setExpired(false);
    setTimeLeft(initialRemaining);

    const tick = () => {
      const remaining = targetTime - Date.now();
      if (remaining <= 0) {
        setTimeLeft(0);
        setExpired(prev => {
          if (!prev) {
            onExpire();
          }
          return true;
        });
      } else {
        setTimeLeft(remaining);
      }
    };
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [order.createdAt, settings?.estoreOrderTimerEnabled, settings?.estoreOrderTimerMinutes]);

  if (!settings?.estoreOrderTimerEnabled || timeLeft <= 0) return null;

  const isActive = ['pending', 'accepted', 'preparing', 'ready', 'out_for_delivery'].includes(order.estoreStatus || 'pending');
  if (!isActive) return null;

  const s = Math.floor(timeLeft / 1000);
  const formatted = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <span className="text-[10px] font-black tracking-wider bg-gray-100 dark:bg-white/10 px-2 py-0.5 rounded-md text-gray-600 dark:text-gray-300 flex items-center gap-1">
      <svg className="w-3.5 h-3.5 text-primary animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      {formatted}
    </span>
  );
};

// ─── Live countdown for scheduled deals ───
const DealCountdown = ({ bundle }: { bundle: Bundle }) => {
  const [display, setDisplay] = useState('');
  const [label, setLabel] = useState('Ends in');
  useEffect(() => {
    if (!bundle.scheduleType || bundle.scheduleType === 'always') return;
    const tick = () => {
      const now = new Date();
      const nowMs = now.getTime();
      let target: number | null = null;
      let isStart = false;

      if (bundle.startTime && bundle.endTime) {
        const [sh, sm] = bundle.startTime.split(':').map(Number);
        const [eh, em] = bundle.endTime.split(':').map(Number);
        const startToday = new Date(now);
        startToday.setHours(sh, sm, 0, 0);
        const endToday = new Date(now);
        endToday.setHours(eh, em, 0, 0);
        let startDiff = startToday.getTime() - nowMs;
        let endDiff = endToday.getTime() - nowMs;

        if (endDiff <= 0 && bundle.startTime > bundle.endTime) {
          endToday.setDate(endToday.getDate() + 1);
          endDiff = endToday.getTime() - nowMs;
        }
        if (startDiff > 0 && bundle.startTime > bundle.endTime) {
          startToday.setDate(startToday.getDate() - 1);
          startDiff = startToday.getTime() - nowMs;
        }

        if (startDiff > 0) {
          target = startDiff;
          isStart = true;
        } else if (endDiff > 0) {
          target = endDiff;
        }
      }

      if (!target && bundle.endDate) {
        target = new Date(bundle.endDate + 'T23:59:59').getTime() - nowMs;
      }

      if (target && target > 0) {
        const h = Math.floor(target / 3600000);
        const m = Math.floor((target % 3600000) / 60000);
        const s = Math.floor((target % 60000) / 1000);
        setDisplay(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
        setLabel(isStart ? 'Starts in' : 'Ends in');
      } else {
        setDisplay('');
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [bundle]);
  if (!display) return null;
  return (
    <div className="absolute bottom-3 left-3 right-3 z-10">
      <div className="flex items-center justify-center gap-1.5 bg-black/70 backdrop-blur-sm text-white text-[10px] font-black px-2.5 py-1 rounded-full shadow-lg">
        <Timer className="h-3 w-3" />
        <span className="text-[8px] opacity-80 mr-0.5">{label}</span>
        <span className="tabular-nums">{display}</span>
      </div>
    </div>
  );
};

const EStoreOrderProgress = ({ status }: { status: string }) => {
  const steps = [
    { key: 'pending', label: 'Placed', icon: Clock },
    { key: 'preparing', label: 'Preparing', icon: Flame },
    { key: 'out_for_delivery', label: 'On Road', icon: Bike },
    { key: 'delivered', label: 'Delivered', icon: CheckCircle2 },
  ];

  let activeIndex = 0;
  if (['pending', 'accepted'].includes(status)) activeIndex = 0;
  else if (['preparing', 'ready'].includes(status)) activeIndex = 1;
  else if (status === 'out_for_delivery') activeIndex = 2;
  else if (status === 'delivered') activeIndex = 3;
  else if (status === 'cancelled') activeIndex = -1;

  if (activeIndex === -1) {
    return (
      <div className="my-3 py-2 px-4 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/30 text-center">
        <span className="text-[10px] font-black text-rose-600 dark:text-rose-400 uppercase tracking-widest">Order Cancelled</span>
      </div>
    );
  }

  return (
    <div className="my-4 py-3 px-1.5 border border-black/5 dark:border-white/5 rounded-2xl bg-black/[0.01] dark:bg-white/[0.01]">
      <div className="relative flex justify-between items-center w-full">
        {/* Road line */}
        <div className="absolute left-4 right-4 top-[14px] h-1 bg-black/5 dark:bg-white/5 rounded-full -z-0">
          <div 
            className="h-full bg-primary transition-all duration-500 rounded-full" 
            style={{ width: `${(activeIndex / (steps.length - 1)) * 100}%` }}
          />
        </div>

        {/* Steps */}
        {steps.map((step, idx) => {
          const StepIcon = step.icon;
          const isCompleted = idx < activeIndex;
          const isActive = idx === activeIndex;

          return (
            <div key={step.key} className="flex flex-col items-center relative z-10 flex-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                isActive 
                  ? 'bg-primary border-primary text-white scale-110 shadow-md shadow-emerald-500/20' 
                  : isCompleted 
                    ? 'bg-primary/10 border-primary text-primary' 
                    : 'bg-white dark:bg-[#18181b] border-gray-200 dark:border-zinc-800 text-gray-400'
              }`}>
                <StepIcon className={`w-4 h-4 ${isActive && step.key === 'out_for_delivery' ? 'animate-bounce' : ''}`} />
              </div>
              <span className={`text-[9px] font-black uppercase tracking-wider mt-1.5 ${
                isActive ? 'text-primary' : 'text-gray-500'
              }`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};


interface StoreFrontProps {
  settings: AppSettings | null;
  products: Product[];
  categories: Category[];
  bundles: Bundle[];
  cart: CartItem[];
  onAddToCart: (product: Product, quantity?: number, options?: { selectedVariant?: string; selectedModifiers?: ProductModifier[] }) => void;
  onAddBundle: (cartItems: CartItem[]) => void;
  onUpdateCart: (index: number, quantity: number) => void;
}

export function StoreFront({ settings, products, categories, bundles, cart, onAddToCart, onAddBundle, onUpdateCart }: StoreFrontProps) {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [selectedProductForModal, setSelectedProductForModal] = useState<Product | null>(null);
  const [selectedBundleForModal, setSelectedBundleForModal] = useState<Bundle | null>(null);
  const categoryScrollRef = useRef<HTMLDivElement>(null);
  const dealsScrollRef = useRef<HTMLDivElement>(null);

  const { customer, loginOrRegister, logout, isInitializing } = useEstoreAuth();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showOrdersModal, setShowOrdersModal] = useState(false);
  const [loginPhone, setLoginPhone] = useState('');
  const [loginName, setLoginName] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [pastOrders, setPastOrders] = useState<Sale[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  useEffect(() => {
    if (customer && showOrdersModal) {
      loadPastOrders();
    }
  }, [customer, showOrdersModal]);

  const loadPastOrders = async () => {
    if (!customer) return;
    setLoadingOrders(true);
    try {
      const { data, error } = await supabase
        .from('sales')
        .select('*')
        .eq('customer_id', customer.id)
        .order('created_at', { ascending: false });
        
      if (!error && data) {
        // Map sales to frontend Sale objects using mapping logic (we can assume basic mapping or use mapSale if we import it, but we can just use the data as is for display purposes, but let's do basic mapping to ensure typing)
        // For E-Store past orders, we really just need id, total, items, status, timestamp.
        setPastOrders(data.map(d => ({
          ...d,
          saleDate: d.sale_date,
          createdAt: new Date(d.created_at),
          estoreStatus: d.estore_status
        } as any)));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingOrders(false);
    }
  };

  const handleTimerExpire = (orderId: string) => {
    console.log(`Order timer expired: ${orderId}`);
  };


  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginPhone) return;
    setIsLoggingIn(true);
    try {
      await loginOrRegister(loginName || 'Guest', loginPhone);
      setShowLoginModal(false);
    } catch (err) {
      alert("Failed to login.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleOrderAgain = (sale: Sale) => {
    if (!sale.items) return;
    
    let itemsAdded = 0;
    sale.items.forEach((item: any) => {
      // E-Store saves items as CartItem[] so product is nested inside item.product
      // POS saves items as SaleItem[] so productId is at top level
      const pid = item.product?.id || item.productId;
      const productExists = products.find(p => p.id === pid);
      if (productExists) {
        onAddToCart(productExists, item.quantity, {
          selectedVariant: item.selectedVariant,
          selectedModifiers: item.selectedModifiers
        });
        itemsAdded++;
      }
    });
    
    setShowOrdersModal(false);
    if (itemsAdded > 0) setIsCartOpen(true);
  };

  const scrollCategories = (direction: 'left' | 'right') => {
    if (categoryScrollRef.current) {
      const scrollAmount = 200;
      categoryScrollRef.current.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
    }
  };

  const scrollDeals = (direction: 'left' | 'right') => {
    if (dealsScrollRef.current) {
      const scrollAmount = 320;
      dealsScrollRef.current.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
    }
  };

  const renderProductCard = (product: Product) => {
    const cartIndex = cart.findIndex(c => c.product.id === product.id);
    const inCartQty = cartIndex >= 0 ? cart[cartIndex].quantity : 0;
    const hasVariants = product.variantData?.length > 0;
    const showDualPrice = !product.menuNumber && hasVariants && product.variantData!.length >= 2;
    const priceRange = showDualPrice
      ? `${formatCurrency(product.variantData![0].priceOverride ?? product.price, settings?.currency)} / ${formatCurrency(product.variantData![1].priceOverride ?? product.price, settings?.currency)}`
      : null;

    return (
      <div key={product.id} className="bg-[var(--color-card-bg)] rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow">
        {product.image ? (
          <div className="w-full pt-[100%] bg-black/5 dark:bg-white/5 relative shrink-0">
            <img src={product.image} alt={product.name} className="absolute inset-0 w-full h-full object-cover" />
            {product.highlightTag && (
              <div className="absolute top-2 left-2 z-10">
                <HighlightBadge tag={product.highlightTag} />
              </div>
            )}
          </div>
        ) : (
          <div className="w-full pt-[100%] bg-gradient-to-br from-gray-100 to-gray-200 relative shrink-0">
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-black text-3xl text-gray-300">{product.name.charAt(0)}</span>
            </div>
          </div>
        )}
        
        <div className="p-3 sm:p-5 flex-1 flex flex-col">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-2 gap-1 sm:gap-4">
            <h3 className="font-black text-sm sm:text-lg text-[var(--color-text)] leading-tight line-clamp-2">
              {product.menuNumber ? (
                <span className="text-primary/60 mr-1">{product.menuNumber}.</span>
              ) : null}
              {product.name}
            </h3>
            {priceRange ? (
              <span className="font-black text-xs sm:text-sm text-primary whitespace-nowrap leading-tight text-right">
                Med {priceRange.split(' / ')[0]}<br />
                Lrg {priceRange.split(' / ')[1]}
              </span>
            ) : (
              <span className="font-black text-sm sm:text-lg text-primary whitespace-nowrap">
                {formatCurrency(product.price, settings?.currency)}
              </span>
            )}
          </div>
          {product.description && (
            <p className="text-sm text-[var(--color-text)]/60 font-medium mb-4 line-clamp-2">{product.description}</p>
          )}
          
          <div className="mt-auto pt-4">
            {inCartQty > 0 ? (
              <div className="flex items-center justify-between bg-black/5 dark:bg-white/5 rounded-full p-1">
                <button 
                  onClick={() => onUpdateCart(cartIndex, inCartQty - 1)}
                  className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[var(--color-card-bg)] text-[var(--color-text)] opacity-80 shadow-sm flex items-center justify-center hover:opacity-100 active:scale-95 transition-all shrink-0"
                >
                  <Minus className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
                <span className="font-black text-[var(--color-text)] text-sm sm:text-lg w-8 sm:w-12 text-center">{inCartQty}</span>
                <button 
                  onClick={() => onUpdateCart(cartIndex, inCartQty + 1)}
                  className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-primary text-white shadow-sm flex items-center justify-center hover:brightness-90 active:scale-95 transition-all shrink-0"
                >
                  <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
            ) : (
              <button 
                onClick={() => {
                  if ((product.variants && product.variants.length > 0) || (product.modifiers && product.modifiers.length > 0)) {
                    setSelectedProductForModal(product);
                  } else {
                    onAddToCart(product);
                  }
                }}
                className="w-full py-3.5 bg-primary text-white rounded-full font-black text-sm hover:brightness-90 active:scale-95 transition-all"
              >
                Add to Cart
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.subtotal, 0);
  const cartItemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const filteredProducts = useMemo(() => {
    const filtered = products.filter(p => {
      if (p.showInEstore === false) return false;
      if (!p.active) return false;
      const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = activeCategory === 'All' || p.category === activeCategory;
      return matchesSearch && matchesCategory;
    });

    return filtered.sort((a, b) => {
      if (activeCategory === 'All') {
        const aPizza = a.category === 'Pizzas';
        const bPizza = b.category === 'Pizzas';
        if (aPizza && !bPizza) return -1;
        if (!aPizza && bPizza) return 1;
        if (aPizza && bPizza) return (a.menuNumber ?? 999) - (b.menuNumber ?? 999);
        return (a.menuNumber ?? 999) - (b.menuNumber ?? 999);
      }
      return (a.menuNumber ?? 999) - (b.menuNumber ?? 999);
    });
  }, [products, searchTerm, activeCategory]);

  const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
  function getPrevDayKey(day: string): string {
    const idx = DAYS.indexOf(day as any);
    return DAYS[idx <= 0 ? 6 : idx - 1];
  }
  function timeWraps(st: string, et: string): boolean {
    const [sh, sm] = st.split(':').map(Number);
    const [eh, em] = et.split(':').map(Number);
    return (eh * 60 + em) <= (sh * 60 + sm);
  }
  function inTimeW(nowMin: number, st: string, et: string): boolean {
    const [sh, sm] = st.split(':').map(Number);
    const [eh, em] = et.split(':').map(Number);
    const s = sh * 60 + sm, e = eh * 60 + em;
    return e > s ? (nowMin >= s && nowMin < e) : (nowMin >= s || nowMin < e);
  }
  function isBundleInSchedule(bundle: Bundle): boolean {
    if (!bundle.scheduleType || bundle.scheduleType === 'always') return true;
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const todayKey = DAYS[now.getDay()];
    const nowMin = now.getHours() * 60 + now.getMinutes();
    if (bundle.startDate && todayStr < bundle.startDate) return false;
    if (bundle.endDate && todayStr > bundle.endDate) return false;
    const wraps = bundle.startTime && bundle.endTime ? timeWraps(bundle.startTime, bundle.endTime) : false;
    const todayIn = bundle.repeatDays?.length ? bundle.repeatDays.includes(todayKey) : true;
    const prevIn = bundle.repeatDays?.length ? bundle.repeatDays.includes(getPrevDayKey(todayKey)) : false;
    let dayOk = todayIn || (wraps && prevIn && bundle.endTime && nowMin < (() => { const [eh, em] = bundle.endTime!.split(':').map(Number); return eh * 60 + em; })());
    if (!todayIn && !dayOk) return false;
    if (bundle.startTime && bundle.endTime && !inTimeW(nowMin, bundle.startTime, bundle.endTime)) return false;
    return true;
  }

  const matchingBundles = useMemo(() => {
    if (!bundles) return [];
    const activeBundles = bundles.filter(b => b.active !== false && isBundleInSchedule(b));
    if (!searchTerm) {
      return activeCategory === 'All' ? activeBundles : [];
    }
    const term = searchTerm.toLowerCase();
    return activeBundles.filter(b => 
      b.name.toLowerCase().includes(term) ||
      b.description?.toLowerCase().includes(term)
    );
  }, [bundles, searchTerm, activeCategory]);


  return (
    <div className="flex flex-col min-h-screen bg-[var(--color-bg)] pb-24" style={{ '--color-primary': settings?.estoreThemeColor || '#10b981' } as React.CSSProperties}>
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[var(--color-card-bg)] border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {settings?.storeLogo ? (
              <img src={settings.storeLogo} alt={settings.storeName} className="h-8 w-auto rounded-lg object-contain" />
            ) : (
              <div className="w-8 h-8 bg-primary text-white rounded-lg flex items-center justify-center font-black text-xl">
                {settings?.storeName?.charAt(0) || 'Z'}
              </div>
            )}
            <h1 className="font-black text-xl tracking-tight text-[var(--color-text)]">{settings?.storeName || 'E-Store'}</h1>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4">
            {!isInitializing && (
              customer ? (
                <button 
                  onClick={() => setShowOrdersModal(true)}
                  className="flex items-center gap-2 p-2 px-3 sm:px-4 text-primary bg-primary/10 hover:bg-primary/20 rounded-full font-bold text-xs sm:text-sm transition-colors"
                >
                  <History className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="hidden sm:inline">My Orders</span>
                </button>
              ) : (
                <button 
                  onClick={() => setShowLoginModal(true)}
                  className="flex items-center gap-2 p-2 px-3 sm:px-4 text-[var(--color-text)] opacity-80 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-full font-bold text-xs sm:text-sm transition-colors"
                >
                  <User className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="hidden sm:inline">Login</span>
                </button>
              )
            )}
            
            <button 
              onClick={() => setIsCartOpen(true)}
              className="relative p-2 text-[var(--color-text)] opacity-80 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors"
            >
              <ShoppingCart className="w-6 h-6 sm:w-7 sm:h-7" />
            {cartItemsCount > 0 && (
              <span className="absolute top-0 right-0 w-5 h-5 bg-primary text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white">
                {cartItemsCount}
              </span>
            )}
            </button>
          </div>
        </div>
      </header>

      {/* Hero Search */}
      <div className="bg-[var(--color-card-bg)] px-4 py-6 border-b border-gray-100">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-black text-[var(--color-text)] mb-4 tracking-tight">What are you craving?</h2>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input 
              type="text"
              placeholder="Search products, meals, or items..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-black/5 dark:bg-white/5 border-none rounded-2xl focus:ring-2 focus:ring-primary text-[var(--color-text)] placeholder-gray-400 text-lg font-medium outline-none transition-all"
            />
          </div>
        </div>
      </div>

      {/* Categories Strip */}
      <div className="sticky top-16 z-40 bg-[var(--color-card-bg)]/80 backdrop-blur-md border-b border-gray-100 px-4 py-3 group">
        <div className="max-w-7xl mx-auto relative flex items-center">
          <button 
            onClick={() => scrollCategories('left')}
            className="absolute left-0 z-10 w-8 h-8 rounded-full bg-[var(--color-card-bg)] shadow border border-gray-100 flex items-center justify-center text-gray-500 hover:text-[var(--color-text)] md:opacity-0 md:group-hover:opacity-100 transition-opacity -ml-2"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          
          <div ref={categoryScrollRef} className="flex-1 flex gap-2 overflow-x-auto scrollbar-hide snap-x relative px-10 scroll-smooth">
            <button
              onClick={() => setActiveCategory('All')}
              className={`snap-start whitespace-nowrap px-5 py-2.5 rounded-full font-black text-sm transition-all shrink-0 ${activeCategory === 'All' ? 'bg-primary text-white shadow-md' : 'bg-[var(--color-card-bg)] border border-black/10 dark:border-white/10 text-[var(--color-text)] opacity-70 hover:opacity-100 hover:border-black/20 dark:hover:border-white/20'}`}
            >
              All Items
            </button>
            {[...categories].filter(cat => {
              const count = products.filter(p => p.category === cat.name && p.active !== false).length;
              return cat.active !== false && count > 0;
            }).sort((a, b) => (a.estoreSortOrder ?? 0) - (b.estoreSortOrder ?? 0)).map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.name)}
                className={`snap-start whitespace-nowrap px-5 py-2.5 rounded-full font-black text-sm transition-all shrink-0 ${activeCategory === cat.name ? 'bg-primary text-white shadow-md' : 'bg-[var(--color-card-bg)] border border-black/10 dark:border-white/10 text-[var(--color-text)] opacity-70 hover:opacity-100 hover:border-black/20 dark:hover:border-white/20'}`}
              >
                {cat.name}
              </button>
            ))}
          </div>

          <button 
            onClick={() => scrollCategories('right')}
            className="absolute right-0 z-10 w-8 h-8 rounded-full bg-[var(--color-card-bg)] shadow border border-gray-100 flex items-center justify-center text-gray-500 hover:text-[var(--color-text)] md:opacity-0 md:group-hover:opacity-100 transition-opacity -mr-2"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Product Grid */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">

        {/* ─── Deals & Offers Section ─── */}
        {matchingBundles && matchingBundles.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-black text-[var(--color-text)] tracking-tight font-black text-[var(--color-text)]">
                  {searchTerm ? '🎁 Deals Matching Search' : '🎁 Deals & Offers'}
                </h2>
                <p className="text-xs text-[var(--color-text)] opacity-50 font-medium mt-0.5">
                  {searchTerm ? `Found ${matchingBundles.length} special combos` : 'Special combos at a great price'}
                </p>
              </div>
            </div>
            <div className="relative group">
              <button
                onClick={() => scrollDeals('left')}
                className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-[var(--color-card-bg)] shadow border border-gray-100 flex items-center justify-center text-gray-500 hover:text-[var(--color-text)] opacity-0 group-hover:opacity-100 transition-opacity -ml-3"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div ref={dealsScrollRef} className="flex gap-4 overflow-x-auto pb-3 no-scrollbar snap-x scroll-smooth">
                {matchingBundles.sort((a, b) => (a.estoreSortOrder ?? 0) - (b.estoreSortOrder ?? 0)).map(bundle => {
                  let bundleTotal = 0;
                  let dealPrice = 0;
                  let bundleMinPrice: number | null = null;
                  let bundleMaxPrice: number | null = null;
                  let previewProductsList: Product[] = [];

                  const calcVariantRange = (p: Product) => {
                    if (p.variantData && p.variantData.length > 0) {
                      const prices = p.variantData.map((vd: any) => vd.priceOverride ?? p.price).filter((pr: number) => pr > 0);
                      return { min: Math.min(...prices), max: Math.max(...prices) };
                    }
                    return { min: p.price, max: p.price };
                  };

                  if (bundle.overridePrice !== undefined && bundle.overridePrice !== null) {
                    dealPrice = bundle.overridePrice;
                    const allOptIds = bundle.slots?.flatMap(s => s.options?.map(o => o.productId) || [])
                      ?? bundle.items?.map(bi => bi.productId) ?? [];
                    const uniqueIds = Array.from(new Set(allOptIds));
                    previewProductsList = uniqueIds.map(id => products.find(p => p.id === id)).filter(Boolean) as Product[];
                  } else if (bundle.isCombo && bundle.slots) {
                    bundleTotal = bundle.slots.reduce((sum, slot) => {
                      const maxPriceOpt = slot.options?.reduce((max, opt) => {
                        const p = products.find(pr => pr.id === opt.productId);
                        return Math.max(max, p ? p.price : 0);
                      }, 0) || 0;
                      return sum + (maxPriceOpt * slot.requiredQuantity);
                    }, 0);

                    const allOptIds = bundle.slots.flatMap(s => s.options?.map(o => o.productId) || []);
                    const uniqueIds = Array.from(new Set(allOptIds));
                    previewProductsList = uniqueIds.map(id => products.find(p => p.id === id)).filter(Boolean) as Product[];

                    dealPrice = bundleTotal - bundle.discountValue;

                    // Per-slot range: each slot you pick N items from its options
                    let minSum = 0, maxSum = 0;
                    bundle.slots.forEach(slot => {
                      const slotProducts = (slot.options || [])
                        .map(opt => products.find(p => p.id === opt.productId))
                        .filter(Boolean) as Product[];
                      const slotRanges = slotProducts.map(calcVariantRange);
                      const minSorted = [...slotRanges].sort((a, b) => a.min - b.min);
                      const maxSorted = [...slotRanges].sort((a, b) => a.max - b.max);
                      const req = Math.min(slot.requiredQuantity, slotRanges.length);
                      minSum += minSorted.slice(0, req).reduce((s, r) => s + r.min, 0);
                      maxSum += maxSorted.slice(-req).reduce((s, r) => s + r.max, 0);
                    });
                    if (minSum > 0) { bundleMinPrice = minSum; bundleMaxPrice = maxSum; }
                    
                    // Collapse range to single price when name specifies the size
                    const lowerName = bundle.name.toLowerCase();
                    if (lowerName.includes(' - medium') || lowerName.includes(' - small') || lowerName.includes(' - large')) {
                      const nameTier = lowerName.includes(' - large') ? 1 : 0;
                      const slotProducts = (bundle.slots[0]?.options || [])
                        .map((opt: any) => products.find((p: Product) => p.id === opt.productId))
                        .filter(Boolean) as Product[];
                      if (slotProducts.length > 0) {
                        const singlePrices = slotProducts.map((p: Product) => {
                          if (p.variantData && p.variantData.length > nameTier) {
                            return p.variantData[nameTier].priceOverride ?? p.price;
                          }
                          return p.price;
                        });
                        const singleMin = Math.min(...singlePrices);
                        bundleMinPrice = singleMin;
                        bundleMaxPrice = singleMin;
                        dealPrice = singleMin;
                      }
                    }
                  } else {
                    bundleTotal = (bundle.items || []).reduce((sum, bi) => {
                      const p = products.find(pr => pr.id === bi.productId);
                      return sum + (p ? p.price * bi.quantity : 0);
                    }, 0);

                    previewProductsList = (bundle.items || []).map(bi => products.find(p => p.id === bi.productId)).filter(Boolean) as Product[];

                    const discount = bundle.discountType === 'percentage'
                      ? bundleTotal * (bundle.discountValue / 100)
                      : bundle.discountValue;
                    dealPrice = Math.max(0, bundleTotal - discount);

                    const ranges = previewProductsList.map(calcVariantRange);
                    const itemMin = ranges.reduce((sum, r, i) => sum + r.min * ((bundle.items?.[i]?.quantity) || 1), 0);
                    const itemMax = ranges.reduce((sum, r, i) => sum + r.max * ((bundle.items?.[i]?.quantity) || 1), 0);
                    const discPct = bundle.discountType === 'percentage' ? bundle.discountValue / 100 : 0;
                    const discFixed = bundle.discountType === 'fixed' ? bundle.discountValue : 0;
                    bundleMinPrice = Math.max(0, bundle.discountType === 'percentage' ? itemMin * (1 - discPct) : itemMin - discFixed);
                    bundleMaxPrice = Math.max(0, bundle.discountType === 'percentage' ? itemMax * (1 - discPct) : itemMax - discFixed);
                  }

                  return (
                    <div
                      key={bundle.id}
                      className="snap-start shrink-0 w-[75vw] sm:w-[300px] max-w-[300px] bg-[var(--color-card-bg)] rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-all duration-300 cursor-pointer active:scale-[0.98]"
                      onClick={() => setSelectedBundleForModal(bundle)}
                    >
                      <div className="relative w-full aspect-[900/650] bg-white flex items-center justify-center shrink-0">
                        {bundle.image ? (
                          <img src={bundle.image} alt={bundle.name} className="w-full h-full object-contain" />
                        ) : previewProductsList.length > 0 ? (
                          <div className={`grid h-full w-full ${previewProductsList.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                            {previewProductsList.slice(0, 4).map((product, pIdx) => (
                              <div key={product.id || pIdx} className="relative h-full w-full overflow-hidden bg-black/5">
                                {product.image ? (
                                  <img src={product.image} alt={product.name} className="w-full h-full object-cover transition-transform duration-500 hover:scale-110" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-gray-300">
                                    <Package className="h-6 w-6" />
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-5xl">🎁</span>
                        )}

                        <div className="absolute top-3 left-3 right-3 z-10 flex justify-between items-start gap-2 flex-wrap">
                          {(bundle as any).badgeEnabled ? (
                            <HighlightBadge
                              badgeEnabled={(bundle as any).badgeEnabled}
                              badgeText={(bundle as any).badgeText}
                              badgeIcon={(bundle as any).badgeIcon}
                              badgeBgColor={(bundle as any).badgeBgColor}
                              badgeTextColor={(bundle as any).badgeTextColor}
                            />
                          ) : bundle.highlightTag && (
                            <HighlightBadge tag={bundle.highlightTag} />
                          )}
                          {bundle.scheduleType === 'scheduled' && (
                            <span className="bg-amber-500 text-white text-[9px] font-black px-2 py-1 rounded-full shadow flex items-center gap-1">
                              <Flame className="h-3 w-3" /> SCHEDULED
                            </span>
                          )}
                          {bundle.overridePrice !== undefined && bundle.overridePrice !== null ? null : bundle.discountValue > 0 && (!bundle.isCombo || !bundle.slots) ? (
                            <span className="bg-red-500 text-white text-xs font-black px-2.5 py-1 rounded-full shadow ml-auto flex items-center gap-1">
                              {bundle.discountType === 'percentage' ? `-${bundle.discountValue}%` : `-${bundle.discountValue}`} OFF
                            </span>
                          ) : null}
                        </div>
                        {bundle.scheduleType === 'scheduled' && (
                          <DealCountdown bundle={bundle} />
                        )}
                      </div>

                      <div className="p-4 flex flex-col gap-1.5 flex-1 justify-between">
                        <div>
                          <h3 className="font-black text-[var(--color-text)] text-base leading-tight line-clamp-1">{bundle.name}</h3>
                          {bundle.description && (
                            <p className="text-xs text-[var(--color-text)] opacity-50 line-clamp-1 mt-0.5">{bundle.description}</p>
                          )}
                        </div>

                        <div>
                          <div className="flex items-center gap-2 mt-2">
                            {bundle.overridePrice !== undefined && bundle.overridePrice !== null ? (
                              <span className="text-lg font-black text-primary">
                                {formatCurrency(dealPrice, settings?.currency)}
                              </span>
                            ) : bundleMinPrice !== null && bundleMaxPrice !== null && bundleMinPrice < bundleMaxPrice ? (
                              <span className="text-lg font-black text-primary">
                                {formatCurrency(bundleMinPrice, settings?.currency)} – {formatCurrency(bundleMaxPrice, settings?.currency)}
                              </span>
                            ) : bundle.isCombo && bundle.slots ? (
                              <span className="text-lg font-black text-primary">
                                From {formatCurrency(dealPrice, settings?.currency)}
                              </span>
                            ) : (
                              <>
                                {bundleTotal > 0 && dealPrice < bundleTotal && (
                                  <span className="text-sm text-[var(--color-text)] opacity-40 line-through font-bold">
                                    {formatCurrency(bundleTotal, settings?.currency)}
                                  </span>
                                )}
                                <span className="text-lg font-black text-primary">
                                  {formatCurrency(dealPrice, settings?.currency)}
                                </span>
                              </>
                            )}
                          </div>
                          <p className="text-[10px] text-[var(--color-text)] opacity-40 font-semibold truncate mt-1">
                            {bundle.isCombo ? 'Customizable Combo Deal' : previewProductsList.map(p => p.name).join(' + ')}
                          </p>
                          <button
                            className="w-full py-2.5 bg-primary text-white rounded-full font-black text-xs hover:brightness-95 active:scale-95 transition-all mt-3"
                            onClick={e => { e.stopPropagation(); setSelectedBundleForModal(bundle); }}
                          >
                            {bundle.isCombo ? 'Customize Deal' : 'View Deal details'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <button
                onClick={() => scrollDeals('right')}
                className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-[var(--color-card-bg)] shadow border border-gray-100 flex items-center justify-center text-gray-500 hover:text-[var(--color-text)] opacity-0 group-hover:opacity-100 transition-opacity -mr-3"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </section>
        )}
        {/* ─── All Items Heading ─── */}
        {filteredProducts.length > 0 && (
          <div className="mb-4">
            <h2 className="text-xl font-black text-[var(--color-text)] tracking-tight">
              {searchTerm ? '🔍 Search Results' : 'All Items'}
            </h2>
            <p className="text-xs text-[var(--color-text)] opacity-50 font-medium mt-0.5">
              {searchTerm ? `Found ${filteredProducts.length} products matching "${searchTerm}"` : 'Browse our full menu'}
            </p>
          </div>
        )}
        {filteredProducts.length === 0 && matchingBundles.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-500 font-medium text-lg">No items found matching "{searchTerm}".</p>
          </div>
        ) : (
          filteredProducts.length > 0 ? (
            activeCategory === 'All' && !searchTerm ? (
              <>
                {/* ─── Pizzas Section ─── */}
                {(() => {
                  const pizzas = filteredProducts.filter(p => p.category === 'Pizzas');
                  const beverages = filteredProducts.filter(p => p.category === 'Beverages');
                  return (
                    <>
                      {pizzas.length > 0 && (
                        <section className="mb-8">
                          <div className="flex items-center gap-2 mb-4">
                            <h3 className="text-lg font-black text-[var(--color-text)]">Pizzas</h3>
                            <span className="text-xs text-gray-400 font-medium">({pizzas.length})</span>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
                            {pizzas.map(product => renderProductCard(product))}
                          </div>
                        </section>
                      )}
                      {beverages.length > 0 && (
                        <section className="mb-8">
                          <div className="flex items-center gap-2 mb-4">
                            <h3 className="text-lg font-black text-[var(--color-text)]">Beverages</h3>
                            <span className="text-xs text-gray-400 font-medium">({beverages.length})</span>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
                            {beverages.map(product => renderProductCard(product))}
                          </div>
                        </section>
                      )}
                    </>
                  );
                })()}
              </>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
                {filteredProducts.map(product => renderProductCard(product))}
              </div>
            )
        ) : null)}
      </main>

      {/* Floating Bottom Cart Button */}
      {cartItemsCount > 0 && !isCartOpen && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-sm z-50 animate-slide-up">
          <button
            onClick={() => setIsCartOpen(true)}
            className="w-full bg-primary text-white p-4 rounded-full shadow-2xl flex items-center justify-between hover:brightness-90 active:scale-95 transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="bg-[var(--color-card-bg)]/20 w-8 h-8 rounded-full flex items-center justify-center font-black">
                {cartItemsCount}
              </div>
              <span className="font-black text-sm">View Order</span>
            </div>
            <div className="font-black text-lg">
              {formatCurrency(cartTotal, settings?.currency)}
            </div>
          </button>
        </div>
      )}

      {/* Cart Drawer */}
      {isCartOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:justify-end md:items-stretch md:p-0">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" onClick={() => setIsCartOpen(false)} />
          <div className="relative w-full max-w-md bg-[var(--color-card-bg)] h-fit max-h-[85vh] md:h-full md:max-h-full rounded-[2rem] md:rounded-none shadow-2xl flex flex-col overflow-hidden animate-scale-up md:animate-slide-left">
            <div className="p-6 border-b border-black/10 dark:border-white/10 flex items-center justify-between">
              <h2 className="text-2xl font-black text-[var(--color-text)]">Your Order</h2>
              <button onClick={() => setIsCartOpen(false)} className="w-10 h-10 bg-black/5 dark:bg-white/5 rounded-full flex items-center justify-center text-[var(--color-text)] opacity-50 hover:opacity-100">
                <Minus className="w-6 h-6 rotate-45" /> {/* Use Minus rotated as X if Close icon missing, or just a simple X */}
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {cart.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <ShoppingBag className="w-16 h-16 mx-auto mb-4 opacity-20" />
                  <p className="font-bold">Your cart is empty</p>
                </div>
              ) : (() => {
                const bundlesMap = new Map<string, { bundleId: string; bundleName: string; items: typeof cart; totalSubtotal: number }>();
                const standaloneItems: typeof cart = [];

                cart.forEach(item => {
                  const bId = item.bundleId || item.bundle_id;
                  if (bId) {
                    if (!bundlesMap.has(bId)) {
                      bundlesMap.set(bId, {
                        bundleId: bId,
                        bundleName: item.bundleName || 'Deal',
                        items: [],
                        totalSubtotal: 0
                      });
                    }
                    const b = bundlesMap.get(bId)!;
                    b.items.push(item);
                    b.totalSubtotal += item.subtotal;
                  } else {
                    standaloneItems.push(item);
                  }
                });

                const renderQuantityControls = (bundleItems: typeof cart, isAdd: boolean) => {
                  bundleItems.forEach(bItem => {
                    const idx = cart.findIndex(x => x.product.id === bItem.product.id && (x.bundleId === bItem.bundleId || x.bundle_id === bItem.bundleId) && x.selectedVariant === bItem.selectedVariant);
                    if (idx >= 0) {
                      const newQty = isAdd ? bItem.quantity + 1 : bItem.quantity - 1;
                      onUpdateCart(idx, newQty);
                    }
                  });
                };

                let itemNumber = 0;
                return (
                  <div className="space-y-6">
                    {/* Render Deals */}
                    {Array.from(bundlesMap.values()).map(b => (
                      <div key={b.bundleId} className="bg-[var(--color-card-bg)] rounded-3xl p-5 border border-black/5 dark:border-white/5 shadow-sm">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <span className="bg-primary/10 text-primary text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md">🎁 DEAL</span>
                            <h4 className="font-bold text-sm text-[var(--color-text)] uppercase leading-tight">{b.bundleName}</h4>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-primary">{formatCurrency(b.totalSubtotal, settings?.currency)}</span>
                          </div>
                        </div>
                        {(b.items[0]?.toppings && b.items[0].toppings.length > 0) && (
                          <div className="mb-2">
                            <p className="text-[10px] text-primary/70 font-medium">+ {b.items[0].toppings.map((t: any) => `${t.name} (${formatCurrency(t.price, settings?.currency)})`).join(', ')}</p>
                          </div>
                        )}
                        <div className="space-y-2 border-t border-black/5 dark:border-white/5 pt-2">
                          {b.items.map((item) => (
                            <div key={++itemNumber} className="flex gap-2.5 items-center text-xs">
                              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 text-[10px] font-bold shrink-0">{itemNumber}</span>
                              {item.product.image ? (
                                <img src={item.product.image} alt={item.product.name} className="w-8 h-8 rounded-lg object-cover shrink-0" />
                              ) : (
                                <div className="w-8 h-8 bg-black/5 rounded-lg flex items-center justify-center font-bold text-[var(--color-text)] opacity-30 shrink-0">
                                  {item.product.name.charAt(0)}
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="font-bold text-[var(--color-text)] truncate">{item.product.name}</p>
                                {item.selectedVariant && (
                                  <p className="text-[10px] text-[var(--color-text)] opacity-50 truncate">{item.selectedVariant}</p>
                                )}
                                {item.toppings && item.toppings.length > 0 && (
                                  <p className="text-[10px] text-primary/70 mt-0.5 truncate font-medium">+ {item.toppings.map(t => `${t.name} (${formatCurrency(t.price, settings?.currency)})`).join(', ')}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}

                    {/* Render Standalone Items */}
                    {standaloneItems.map((item) => {
                      const idxInCart = cart.findIndex(x => x === item);
                      return (
                        <div key={++itemNumber} className="flex gap-4 items-center">
                          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 text-[10px] font-bold shrink-0">{itemNumber}</span>
                          {item.product.image ? (
                            <img src={item.product.image} alt={item.product.name} className="w-16 h-16 rounded-xl object-cover shrink-0" />
                          ) : (
                            <div className="w-16 h-16 bg-black/5 dark:bg-white/5 rounded-xl flex items-center justify-center font-black text-[var(--color-text)] opacity-30 shrink-0">
                              {item.product.name.charAt(0)}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-[var(--color-text)] leading-tight truncate">{item.product.name}</p>
                            <p className="text-xs text-[var(--color-text)] opacity-60 font-medium mt-0.5 truncate">{item.selectedVariant}</p>
                            {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                              <p className="text-xs text-[var(--color-text)] opacity-50 mt-0.5 truncate">
                                + {item.selectedModifiers.map(m => m.name).join(', ')}
                              </p>
                            )}
                            {item.toppings && item.toppings.length > 0 && (
                              <p className="text-[10px] text-primary/70 mt-0.5 truncate font-medium">
                                + {item.toppings.map(t => `${t.name} (${formatCurrency(t.price, settings?.currency)})`).join(', ')}
                              </p>
                            )}
                            <p className="text-primary font-black mt-1">{formatCurrency(item.subtotal / item.quantity, settings?.currency)}</p>
                          </div>
                          <div className="flex items-center gap-3 bg-black/5 dark:bg-white/5 rounded-full p-1 border border-black/5 dark:border-white/5 shrink-0">
                            <button onClick={() => onUpdateCart(idxInCart, item.quantity - 1)} className="w-8 h-8 bg-[var(--color-card-bg)] rounded-full flex items-center justify-center font-black text-[var(--color-text)] opacity-80">-</button>
                            <span className="font-bold w-6 text-center text-[var(--color-text)]">{item.quantity}</span>
                            <button onClick={() => onUpdateCart(idxInCart, item.quantity + 1)} className="w-8 h-8 bg-[var(--color-card-bg)] rounded-full flex items-center justify-center font-black text-[var(--color-text)] opacity-80">+</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {cart.length > 0 && (
              <div className="p-6 border-t border-black/5 dark:border-white/5 bg-[var(--color-bg)]">
                <div className="flex items-center justify-between mt-4">
                <span className="font-bold text-[var(--color-text)] opacity-60">Total</span>
                <span className="font-black text-2xl text-[var(--color-text)]">{formatCurrency(cartTotal, settings?.currency)}</span>
                </div>
                <button 
                  onClick={() => navigate('/store/checkout')}
                  className="w-full py-4 bg-primary text-white rounded-2xl font-black text-lg flex items-center justify-center gap-2 hover:brightness-90 active:scale-95 transition-all mt-6"
                >
                  Checkout <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Product Modal */}
      {selectedProductForModal && (
        <StoreProductModal 
          product={selectedProductForModal}
          currency={settings?.currency}
          isOpen={!!selectedProductForModal}
          onClose={() => setSelectedProductForModal(null)}
          onAddToCart={(product, qty, options) => {
            onAddToCart(product, qty, options);
          }}
        />
      )}

      {/* Deal/Bundle Modal */}
      {selectedBundleForModal && (
        <StoreDealModal 
          bundle={selectedBundleForModal}
          products={products}
          currency={settings?.currency}
          isOpen={!!selectedBundleForModal}
          onClose={() => setSelectedBundleForModal(null)}
          onAddBundle={onAddBundle}
        />
      )}

      {/* Login Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowLoginModal(false)} />
          <div className="relative bg-[var(--color-card-bg)] rounded-3xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <button onClick={() => setShowLoginModal(false)} className="absolute top-4 right-4 p-2 bg-black/5 dark:bg-white/5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors">
              <X className="w-5 h-5 text-[var(--color-text)]" />
            </button>
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <User className="w-6 h-6 text-primary" />
            </div>
            <h2 className="text-2xl font-black text-[var(--color-text)] mb-1">Welcome</h2>
            <p className="text-[var(--color-text)] opacity-50 text-sm mb-6 font-medium">Enter your details to track orders</p>
            
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[var(--color-text)] opacity-85 uppercase tracking-wider mb-1.5">Full Name</label>
                <input
                  type="text"
                  required
                  value={loginName}
                  onChange={e => setLoginName(e.target.value)}
                  className="w-full bg-[var(--color-bg)] border border-black/10 dark:border-white/10 rounded-xl px-4 py-3.5 focus:ring-2 focus:ring-primary font-medium text-[var(--color-text)] placeholder-gray-400/80 focus:bg-[var(--color-card-bg)] outline-none"
                  placeholder="John Doe"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--color-text)] opacity-85 uppercase tracking-wider mb-1.5">Phone Number</label>
                <input
                  type="tel"
                  required
                  value={loginPhone}
                  onChange={e => setLoginPhone(e.target.value)}
                  className="w-full bg-[var(--color-bg)] border border-black/10 dark:border-white/10 rounded-xl px-4 py-3.5 focus:ring-2 focus:ring-primary font-medium text-[var(--color-text)] placeholder-gray-400/80 focus:bg-[var(--color-card-bg)] outline-none"
                  placeholder="0300 1234567"
                />
              </div>
              <button 
                type="submit"
                disabled={isLoggingIn}
                className="w-full bg-primary text-white font-black py-4 rounded-xl hover:brightness-90 active:scale-95 transition-all mt-4 disabled:opacity-50"
              >
                {isLoggingIn ? 'Logging in...' : 'Continue'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Orders Modal */}
      {showOrdersModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowOrdersModal(false)} />
          <div className="relative bg-[var(--color-card-bg)] w-full max-w-2xl h-fit max-h-[85vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-scale-up">
            <div className="p-4 sm:p-6 border-b border-gray-100 flex items-center justify-between bg-[var(--color-card-bg)] sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                  <History className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-xl sm:text-2xl font-black text-[var(--color-text)]">Order History</h2>
                  <p className="text-xs sm:text-sm font-medium text-gray-500">{customer?.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => { logout(); setShowOrdersModal(false); }}
                  className="p-2 sm:px-4 sm:py-2 text-red-500 bg-red-50 hover:bg-red-100 rounded-full font-bold text-xs sm:text-sm flex items-center gap-2 transition-colors"
                >
                  <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
                <button onClick={() => setShowOrdersModal(false)} className="p-2 bg-gray-100 text-gray-500 rounded-full hover:bg-gray-200 transition-colors">
                  <X className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[var(--color-bg)]">
              {loadingOrders ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <div className="w-8 h-8 border-4 border-gray-200 border-t-primary rounded-full animate-spin mb-4" />
                  <p className="font-bold">Loading orders...</p>
                </div>
              ) : pastOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <History className="w-16 h-16 mb-4 opacity-20" />
                  <p className="font-bold text-lg">No past orders found</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {pastOrders.map((order) => (
                    <div key={order.id} className="bg-[var(--color-card-bg)] rounded-2xl p-4 sm:p-5 border-2 border-gray-100 shadow-sm">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <p className="font-bold text-[var(--color-text)]">
                            {new Date(order.createdAt!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-gray-100 text-gray-600">
                              {order.id.split('-')[0].toUpperCase()}
                            </span>
                            {(() => {
                              const estoreStatus = order.estoreStatus || order.estore_status || 'pending';
                              const labels: Record<string, string> = {
                                pending: 'Pending',
                                accepted: 'Accepted',
                                preparing: 'Preparing',
                                ready: 'Ready',
                                out_for_delivery: 'Out for Delivery',
                                delivered: 'Delivered',
                                cancelled: 'Cancelled'
                              };
                              const colors: Record<string, string> = {
                                pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
                                accepted: 'bg-blue-100 text-blue-800 border-blue-200',
                                preparing: 'bg-purple-100 text-purple-800 border-purple-200',
                                ready: 'bg-emerald-100 text-emerald-800 border-emerald-200',
                                out_for_delivery: 'bg-orange-100 text-orange-800 border-orange-200',
                                delivered: 'bg-emerald-100 text-emerald-800 border-emerald-200',
                                cancelled: 'bg-red-100 text-red-800 border-red-200'
                              };
                              return (
                                <div className="flex items-center gap-2">
                                  <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md border ${colors[estoreStatus] || 'bg-gray-100 text-gray-800 border-gray-200'}`}>
                                    {labels[estoreStatus] || estoreStatus}
                                  </span>
                                  <StoreOrderTimer order={order} settings={settings} onExpire={() => handleTimerExpire(order.id)} />
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-lg text-primary">{formatCurrency(order.total, settings?.currency)}</p>
                          <p className="text-xs font-bold text-gray-500">{order.items.length} items</p>
                        </div>
                      </div>

                      <EStoreOrderProgress status={order.estoreStatus || order.estore_status || 'pending'} />
                      
                      <div className="space-y-2 mb-4 bg-[var(--color-bg)] p-3 rounded-xl border border-gray-100">
                        {order.items.map((item: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between text-sm py-1 border-b border-gray-100 last:border-0 last:pb-0">
                            <div className="flex items-center gap-3">
                              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 text-[10px] font-bold shrink-0">{idx + 1}</span>
                              <div className="w-12 h-12 rounded-xl overflow-hidden bg-[var(--color-bg)] border border-black/5 dark:border-white/5 shrink-0 flex items-center justify-center">
                                {item.product?.image ? (
                                  <img src={item.product.image} alt={item.product?.name} className="w-full h-full object-cover" />
                                ) : (
                                  <ShoppingCart className="w-5 h-5 text-gray-300" />
                                )}
                              </div>
                              <div className="flex flex-col">
                                <span className="font-bold text-[var(--color-text)] text-sm leading-tight">
                                  <span className="text-primary mr-1 font-black">{item.quantity}x</span> 
                                  {item.product?.name || item.name}
                                </span>
                                {item.selectedVariant && (
                                  <span className="text-[11px] text-gray-500 font-bold mt-0.5">Variant: {item.selectedVariant}</span>
                                )}
                                {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {item.selectedModifiers.map((m: any, mIdx: number) => (
                                      <span key={mIdx} className="text-[9px] bg-black/5 dark:bg-white/10 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest">
                                        + {m.name}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                {item.toppings && item.toppings.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {item.toppings.map((t: any, tIdx: number) => (
                                      <span key={tIdx} className="text-[9px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold uppercase tracking-widest">
                                        + {t.name}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                            <span className="font-black text-primary ml-2">{formatCurrency(item.subtotal || (item.price * item.quantity), settings?.currency)}</span>
                          </div>
                        ))}
                      </div>

                      <button 
                        onClick={() => handleOrderAgain(order)}
                        className="w-full py-3 bg-primary text-white font-black rounded-xl hover:brightness-90 active:scale-95 transition-all flex items-center justify-center gap-2"
                      >
                        <ShoppingCart className="w-4 h-4" />
                        Add to Cart Again
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
