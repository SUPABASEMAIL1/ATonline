import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Product, AppSettings, Category, CartItem, ProductModifier, Sale } from '../../types';
import { ShoppingCart, Search, Plus, Minus, ChevronRight, ChevronLeft, X, User, History, LogOut } from 'lucide-react';
import { useEstoreAuth } from './useEstoreAuth';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/currencies';
import { StoreProductModal } from './StoreProductModal';

interface StoreFrontProps {
  settings: AppSettings | null;
  products: Product[];
  categories: Category[];
  cart: CartItem[];
  onAddToCart: (product: Product, quantity?: number, options?: { selectedVariant?: string; selectedModifiers?: ProductModifier[] }) => void;
  onUpdateCart: (index: number, quantity: number) => void;
}

export function StoreFront({ settings, products, categories, cart, onAddToCart, onUpdateCart }: StoreFrontProps) {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [selectedProductForModal, setSelectedProductForModal] = useState<Product | null>(null);
  const categoryScrollRef = useRef<HTMLDivElement>(null);

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
          createdAt: new Date(d.created_at)
        } as any)));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingOrders(false);
    }
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
    // Add all items from the old sale to the current cart
    if (!sale.items) return;
    
    // Using onAddToCart might be slow for many items, but we can do it one by one or create a new prop onCartUpdate that accepts a whole cart.
    // For now, let's just use onAddToCart in a loop for items that still exist in products
    let itemsAdded = 0;
    sale.items.forEach(item => {
      const productExists = products.find(p => p.id === item.productId);
      if (productExists) {
        // Add to cart N times to match quantity
        for(let i=0; i<item.quantity; i++) {
          onAddToCart(productExists);
        }
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

  const cartTotal = cart.reduce((sum, item) => sum + item.subtotal, 0);
  const cartItemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      if (p.showInEstore === false) return false;
      if (!p.active) return false;
      const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = activeCategory === 'All' || p.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchTerm, activeCategory]);

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
          
          <div ref={categoryScrollRef} className="flex-1 flex gap-2 overflow-x-auto scrollbar-hide snap-x relative px-6 md:px-0 scroll-smooth">
            <button
              onClick={() => setActiveCategory('All')}
              className={`snap-start whitespace-nowrap px-5 py-2.5 rounded-full font-black text-sm transition-all shrink-0 ${activeCategory === 'All' ? 'bg-primary text-white shadow-md' : 'bg-[var(--color-card-bg)] border border-black/10 dark:border-white/10 text-[var(--color-text)] opacity-70 hover:opacity-100 hover:border-black/20 dark:hover:border-white/20'}`}
            >
              All Items
            </button>
            {categories.map(cat => (
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
        {filteredProducts.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-500 font-medium text-lg">No products found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
            {filteredProducts.map(product => {
              const cartIndex = cart.findIndex(c => c.product.id === product.id);
              const inCartQty = cartIndex >= 0 ? cart[cartIndex].quantity : 0;

              return (
                <div key={product.id} className="bg-[var(--color-card-bg)] rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow">
                  {product.image ? (
                    <div className="w-full pt-[100%] bg-black/5 dark:bg-white/5 relative shrink-0">
                      <img src={product.image} alt={product.name} className="absolute inset-0 w-full h-full object-cover" />
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
                      <h3 className="font-black text-sm sm:text-lg text-[var(--color-text)] leading-tight line-clamp-2">{product.name}</h3>
                      <span className="font-black text-sm sm:text-lg text-primary whitespace-nowrap">
                        {formatCurrency(product.price, settings?.currency)}
                      </span>
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
            })}
          </div>
        )}
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
        <div className="fixed inset-0 z-[100] flex justify-end">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity" onClick={() => setIsCartOpen(false)} />
          <div className="relative w-full max-w-md bg-[var(--color-card-bg)] h-full shadow-2xl flex flex-col animate-slide-left">
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
              ) : (
                cart.map((item, idx) => (
                  <div key={idx} className="flex gap-4 items-center">
                    {item.product.image ? (
                      <img src={item.product.image} alt={item.product.name} className="w-16 h-16 rounded-xl object-cover" />
                    ) : (
                      <div className="w-16 h-16 bg-black/5 dark:bg-white/5 rounded-xl flex items-center justify-center font-black text-[var(--color-text)] opacity-30">
                        {item.product.name.charAt(0)}
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="font-bold text-[var(--color-text)] leading-tight">{item.product.name}</p>
                      <p className="text-xs text-[var(--color-text)] opacity-60 font-medium mt-0.5">{item.selectedVariant}</p>
                      {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                        <p className="text-xs text-[var(--color-text)] opacity-50 mt-0.5">
                          + {item.selectedModifiers.map(m => m.name).join(', ')}
                        </p>
                      )}
                      <p className="text-primary font-black mt-1">{formatCurrency(item.subtotal / item.quantity, settings?.currency)}</p>
                    </div>
                    <div className="flex items-center gap-3 bg-black/5 dark:bg-white/5 rounded-full p-1 border border-black/5 dark:border-white/5">
                      <button onClick={() => onUpdateCart(idx, item.quantity - 1)} className="w-8 h-8 bg-[var(--color-card-bg)] rounded-full flex items-center justify-center font-black text-[var(--color-text)] opacity-80">-</button>
                      <span className="font-bold w-6 text-center text-[var(--color-text)]">{item.quantity}</span>
                      <button onClick={() => onUpdateCart(idx, item.quantity + 1)} className="w-8 h-8 bg-[var(--color-card-bg)] rounded-full flex items-center justify-center font-black text-[var(--color-text)] opacity-80">+</button>
                    </div>
                  </div>
                ))
              )}
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
                <label className="block text-xs font-bold text-[var(--color-text)] opacity-80 uppercase tracking-wider mb-1.5">Full Name</label>
                <input
                  type="text"
                  required
                  value={loginName}
                  onChange={e => setLoginName(e.target.value)}
                  className="w-full bg-black/5 dark:bg-white/5 border-none rounded-xl px-4 py-3.5 focus:ring-2 focus:ring-primary font-medium text-[var(--color-text)]"
                  placeholder="John Doe"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[var(--color-text)] opacity-80 uppercase tracking-wider mb-1.5">Phone Number</label>
                <input
                  type="tel"
                  required
                  value={loginPhone}
                  onChange={e => setLoginPhone(e.target.value)}
                  className="w-full bg-black/5 dark:bg-white/5 border-none rounded-xl px-4 py-3.5 focus:ring-2 focus:ring-primary font-medium text-[var(--color-text)]"
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
        <div className="fixed inset-0 z-[110] flex flex-col md:items-center md:justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowOrdersModal(false)} />
          <div className="relative bg-[var(--color-card-bg)] w-full h-full md:h-auto md:max-h-[85vh] md:max-w-2xl md:rounded-3xl shadow-2xl flex flex-col animate-in slide-in-from-bottom-10 md:zoom-in-95 duration-300">
            <div className="p-4 sm:p-6 border-b border-gray-100 flex items-center justify-between bg-[var(--color-card-bg)] md:rounded-t-3xl sticky top-0 z-10">
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
                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                              order.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                              order.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                              order.status === 'refunded' ? 'bg-red-100 text-red-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>
                              {order.status}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-lg text-primary">{formatCurrency(order.total, settings?.currency)}</p>
                          <p className="text-xs font-bold text-gray-500">{order.items.length} items</p>
                        </div>
                      </div>
                      
                      <div className="space-y-2 mb-4 bg-[var(--color-bg)] p-3 rounded-xl border border-gray-100">
                        {order.items.map((item: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between text-sm py-1 border-b border-gray-100 last:border-0 last:pb-0">
                            <div className="flex items-center gap-3">
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
                        Order Again
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
