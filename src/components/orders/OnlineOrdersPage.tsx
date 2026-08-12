import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useApp } from '../../context/SupabaseAppContext';
import { StoreOrder, Sale } from '../../types';
import { storeOrdersService } from '../../lib/services';
import { formatCurrency } from '../../lib/currencies';
import { ShoppingBag, ChevronRight, CheckCircle2, XCircle, MapPin, Phone, FileText, Bike, Store, Home, Clock, Flame, Info } from 'lucide-react';
import { sonner } from '../../lib/sonner';
import { useNavigate } from 'react-router-dom';
import { SharedSearchBar } from '../../shared/modules/search-and-list';
import { Button, EmptyState } from '../../shared/ui';

// ─── Module-level component (prevents blink from re-mounting on parent re-render) ───
const OrderTimer = ({ order, settings, onExpire }: { order: StoreOrder, settings: any, onExpire?: (orderId: string) => void }) => {
  const [timeLeft, setTimeLeft] = useState<number>(-1);
  const [timeTotal, setTimeTotal] = useState<number>(0);
  const [notifiedHalf, setNotifiedHalf] = useState(false);
  const [notifiedThird, setNotifiedThird] = useState(false);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!settings?.estoreOrderTimerEnabled || !settings?.estoreOrderTimerMinutes) return;
    const createdAt = new Date(order.createdAt).getTime();
    const durationMs = settings.estoreOrderTimerMinutes * 60 * 1000;
    const targetTime = createdAt + durationMs;
    setTimeTotal(durationMs);

    const initialRemaining = targetTime - Date.now();
    const twoThird = (durationMs * 2) / 3;
    const oneThird = durationMs / 3;

    // Set initial alert states based on time already passed to prevent alert bombarding on mount/remount
    setNotifiedHalf(initialRemaining <= twoThird);
    setNotifiedThird(initialRemaining <= oneThird);

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
            onExpire?.(order.id);
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

  useEffect(() => {
    if (timeTotal === 0 || timeLeft < 0) return;
    const twoThird = (timeTotal * 2) / 3;
    const oneThird = timeTotal / 3;
    if (!notifiedHalf && timeLeft <= twoThird && timeLeft > 0) {
      setNotifiedHalf(true);
      sonner.warning(`⏰ Order #${order.invoiceNumber} — 2/3 time used!`);
    }
    if (!notifiedThird && timeLeft <= oneThird && timeLeft > 0) {
      setNotifiedThird(true);
      sonner.error(`🚨 Order #${order.invoiceNumber} — URGENT! Less than 1/3 time left!`);
    }
  }, [timeLeft]);

  if (!settings?.estoreOrderTimerEnabled || timeLeft < 0) return null;

  const isActive = ['pending', 'accepted', 'preparing'].includes(order.status || '');

  if (timeLeft === 0 && isActive) {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-[10px] font-black tracking-widest uppercase px-2.5 py-1.5 rounded-full w-fit bg-red-600 text-white animate-pulse border border-red-700 shadow">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
        ⚠ OUT OF TIME
      </div>
    );
  }

  if (!isActive) return null;

  const fmt = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };

  const ratio = timeTotal > 0 ? timeLeft / timeTotal : 1;
  const phase = ratio > 2/3 ? 'green' : ratio > 1/3 ? 'yellow' : 'red';
  const cls = {
    green:  'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300',
    yellow: 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300 animate-pulse',
    red:    'bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 animate-pulse',
  }[phase];

  const isPending = order.status === 'pending';

  return (
    <div className={`mt-2 flex items-center gap-1.5 text-[10px] font-black tracking-widest uppercase px-2.5 py-1.5 rounded-full border shadow-sm ${
      isPending 
        ? 'bg-rose-500 text-white border-rose-600 animate-pulse shadow-md shadow-rose-500/30' 
        : cls
    }`}>
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
      {isPending && <span className="opacity-95">WAITING: </span>}
      {fmt(timeLeft)}
    </div>
  );
};

const OrderProgress = ({ status, deliveryAddress }: { status: string; deliveryAddress?: string }) => {
  const steps = [
    { key: 'pending', label: 'Order Received', icon: Clock, desc: 'Waiting for acceptance' },
    { key: 'preparing', label: 'Preparing', icon: Flame, desc: 'In the kitchen' },
    { key: 'out_for_delivery', label: 'On The Road', icon: Bike, desc: 'Rider is delivering' },
    { key: 'delivered', label: 'Delivered', icon: CheckCircle2, desc: 'Order complete' },
  ];

  let activeIndex = 0;
  if (['pending', 'accepted'].includes(status)) activeIndex = 0;
  else if (['preparing', 'ready'].includes(status)) activeIndex = 1;
  else if (status === 'out_for_delivery') activeIndex = 2;
  else if (['delivered', 'converted'].includes(status)) activeIndex = 3;
  else if (status === 'cancelled') activeIndex = -1;

  if (activeIndex === -1) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 text-center">
        <p className="text-sm font-black text-red-600 dark:text-red-400 uppercase tracking-widest">⚠️ ORDER CANCELLED</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-white/5 rounded-2xl p-6 shadow-sm space-y-6">
      <div className="flex justify-between items-center px-1">
        <span className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">Delivery Progress</span>
        {status === 'out_for_delivery' && (
          <span className="bg-orange-500 text-white text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full flex items-center gap-1.5 animate-pulse shadow-sm">
            <Bike className="w-3 h-3 animate-bounce" /> Rider on Road
          </span>
        )}
      </div>

      {/* Visual Road Timeline */}
      <div className="relative flex justify-between items-center w-full mt-4">
        {/* The Road Line */}
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1.5 bg-gray-100 dark:bg-white/5 rounded-full -z-0">
          <div 
            className="h-full bg-gradient-to-r from-primary to-orange-500 transition-all duration-500 rounded-full" 
            style={{ width: `${(activeIndex / (steps.length - 1)) * 100}%` }}
          />
        </div>

        {/* Steps */}
        {steps.map((step, idx) => {
          const StepIcon = step.icon;
          const isCompleted = idx < activeIndex;
          const isActive = idx === activeIndex;

          return (
            <div key={step.key} className="flex flex-col items-center relative z-10">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                isActive 
                  ? 'bg-primary border-primary text-white scale-110 shadow-lg shadow-emerald-500/20' 
                  : isCompleted 
                    ? 'bg-emerald-50 border-emerald-500 text-emerald-600 dark:bg-emerald-950/20 dark:border-emerald-500' 
                    : 'bg-white border-gray-200 text-gray-400 dark:bg-[#111] dark:border-gray-800'
              }`}>
                <StepIcon className="w-5 h-5" />
              </div>
              <span className={`text-[9px] font-black uppercase tracking-wider mt-2 ${
                isActive ? 'text-primary' : isCompleted ? 'text-emerald-600' : 'text-gray-500'
              }`}>
                {step.label}
              </span>
              <span className="text-[7px] font-medium text-gray-400 dark:text-gray-500 uppercase mt-0.5 max-w-[80px] text-center hidden sm:block">
                {step.desc}
              </span>
            </div>
          );
        })}
      </div>

      {/* Start / End Destination Info */}
      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100 dark:border-white/5 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
        <div className="flex items-start gap-2">
          <Store className="w-4 h-4 text-emerald-500 shrink-0" />
          <div>
            <p className="font-black text-gray-700 dark:text-gray-300">START DESTINATION</p>
            <p className="text-[9px] font-medium text-gray-400 mt-0.5">Online Store</p>
          </div>
        </div>
        <div className="flex items-start gap-2 border-l border-gray-100 dark:border-white/5 pl-4">
          <Home className="w-4 h-4 text-orange-500 shrink-0" />
          <div>
            <p className="font-black text-gray-700 dark:text-gray-300">END DESTINATION</p>
            <p className="text-[9px] font-medium text-gray-400 mt-0.5 truncate max-w-[150px]">
              {deliveryAddress || 'Self Pickup'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

const STATUS_FLOW = ['pending', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'converted', 'cancelled'];
const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  preparing: 'Preparing',
  ready: 'Ready',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  converted: 'Converted',
  cancelled: 'Cancelled'
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  accepted: 'bg-blue-100 text-blue-800 border-blue-200',
  preparing: 'bg-purple-100 text-purple-800 border-purple-200',
  ready: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  out_for_delivery: 'bg-orange-100 text-orange-800 border-orange-200',
  delivered: 'bg-gray-100 text-gray-800 border-gray-200',
  converted: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  cancelled: 'bg-red-100 text-red-800 border-red-200'
};

export function OnlineOrdersPage() {
  const { state, dispatch } = useApp();
  const navigate = useNavigate();

  const activeOrders = useMemo(() => {
    return state.storeOrders
      .filter(s => !['delivered', 'cancelled'].includes(s.status))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [state.storeOrders]);

  const pastOrders = useMemo(() => {
    return state.storeOrders
      .filter(s => ['delivered', 'cancelled'].includes(s.status))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 50);
  }, [state.storeOrders]);

  const [activeTab, setActiveTab] = useState<'active' | 'past'>('active');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isMobileDetailOpen, setIsMobileDetailOpen] = useState(false);
  const [orderSearch, setOrderSearch] = useState('');
  const [seenOrderIds, setSeenOrderIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('seen_order_ids') || '[]')); }
    catch { return new Set(); }
  });

  const markOrderSeen = (id: string) => {
    setSeenOrderIds(prev => {
      const next = new Set(prev);
      next.add(id);
      try { localStorage.setItem('seen_order_ids', JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  const displayedOrders = activeTab === 'active' ? activeOrders : pastOrders;

  // Shared search filter — order # / customer / phone
  const searchFilteredOrders = useMemo(() => {
    const term = orderSearch.trim().toLowerCase();
    if (!term) return displayedOrders;
    return displayedOrders.filter(o =>
      String(o.invoiceNumber || '').toLowerCase().includes(term) ||
      (o.customerName || '').toLowerCase().includes(term) ||
      (o.customerPhone || '').toLowerCase().includes(term)
    );
  }, [displayedOrders, orderSearch]);
  
  // Select order ONLY if selectedOrderId is explicitly set (never auto-open first order)
  const selectedOrder = useMemo(() => {
    if (selectedOrderId) {
      return searchFilteredOrders.find(o => o.id === selectedOrderId) || null;
    }
    return null;
  }, [searchFilteredOrders, selectedOrderId]);

  // Auto-mark selected order as seen
  useEffect(() => {
    if (selectedOrder) markOrderSeen(selectedOrder.id);
  }, [selectedOrder?.id]);


  const handleTimerExpire = useCallback((orderId: string) => {
    const order = state.storeOrders.find(s => s.id === orderId);
    if (order && ['pending', 'accepted', 'preparing', 'ready', 'out_for_delivery'].includes(order.status || '')) {
      sonner.error(`⏰ Order #${order.invoiceNumber} prep/delivery countdown expired! Please process it immediately.`);
    }
  }, [state.storeOrders]);

  const updateStatus = async (order: StoreOrder, newStatus: string) => {
    const updates: Partial<StoreOrder> = { status: newStatus as any };
    const updated = { ...order, ...updates };
    dispatch({ type: 'UPDATE_STORE_ORDER', payload: updated });
    try {
      await storeOrdersService.update(order.id, updates);
      sonner.success(`Order #${order.invoiceNumber} status updated to ${STATUS_LABELS[newStatus]}`);
    } catch (error: any) {
      dispatch({ type: 'UPDATE_STORE_ORDER', payload: order });
      sonner.error(error.message || 'Failed to update status');
    }
  };

  const getNextStatus = (currentStatus: string) => {
    const currentIndex = STATUS_FLOW.indexOf(currentStatus);
    if (currentIndex >= 0 && currentIndex < STATUS_FLOW.length - 2) {
      return STATUS_FLOW[currentIndex + 1];
    }
    return null;
  };

  const handleAcceptToPOS = async (order: StoreOrder) => {
    if (order.fulfilledSaleId || order.status === 'converted') {
      sonner.error('This order has already been processed into a POS Sale.');
      return;
    }

    // Change status to preparing automatically
    await updateStatus(order, 'preparing');

    // 1. Set editing store order ID for fulfillment tracking
    dispatch({ type: 'SET_EDITING_STORE_ORDER_ID', payload: order.id });
    
    // 2. Load items to cart and notes
    let fullNotes = order.customerNotes || '';
    if (order.customerName) fullNotes += `\nCustomer Name: ${order.customerName}`;
    if (order.deliveryAddress) fullNotes += `\nDelivery Address: ${order.deliveryAddress}`;
    if (order.customerPhone) fullNotes += `\nPhone: ${order.customerPhone}`;
    if (order.customerNotes) fullNotes += `\nCustomer Notes: ${order.customerNotes}`;
    // 3. Inject Delivery Fee as a synthetic cart item if present
    const cartItems = [...order.items];
    if (order.deliveryFee && order.deliveryFee > 0) {
      cartItems.push({
        id: crypto.randomUUID(),
        productId: 'delivery-fee',
        name: 'Delivery Fee',
        price: order.deliveryFee,
        quantity: 1,
        subtotal: order.deliveryFee,
        isCustom: true,
        product: { id: 'delivery-fee', name: 'Delivery Fee', price: order.deliveryFee, cost: 0, category: 'Service', isService: true }
      } as any);
    }
    
    // Switch to POS cart logic via SET_CART and SET_NOTES, ensuring we are on active tab
    dispatch({ type: 'SET_CART', payload: cartItems });
    dispatch({ type: 'SET_NOTES', payload: fullNotes.trim() });
    
    dispatch({
      type: 'UPDATE_SALES_TAB',
      payload: {
        id: state.activeSalesTab,
        updates: {
          cart: cartItems,
          customerId: order.customerId || null,
          notes: fullNotes.trim(),
        }
      }
    });

    sonner.success('Order loaded into POS and marked as Preparing');
    navigate('/pos');
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-[#0a0a0a] overflow-hidden">
      {/* Header Tabs (Hidden on mobile if detail is open) */}
      <div className={`flex flex-wrap gap-4 border-b border-gray-200 dark:border-gray-800 px-6 pt-4 pb-3 shrink-0 bg-white dark:bg-[#111] ${isMobileDetailOpen ? 'hidden md:flex' : 'flex'} items-center`}>
        <button 
          onClick={() => { setActiveTab('active'); setSelectedOrderId(null); setIsMobileDetailOpen(false); }}
          className={`font-black uppercase tracking-widest text-[11px] pb-3 border-b-2 transition-colors ${activeTab === 'active' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'} flex items-center gap-2`}
        >
          Active Orders 
          {activeOrders.length > 0 && (
            <span className="bg-rose-500 text-white text-[9px] px-2 py-0.5 rounded-full shadow-sm">{activeOrders.length}</span>
          )}
        </button>
        <button 
          onClick={() => { setActiveTab('past'); setSelectedOrderId(null); setIsMobileDetailOpen(false); }}
          className={`font-black uppercase tracking-widest text-[11px] pb-3 border-b-2 transition-colors ${activeTab === 'past' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
        >
          Past Orders
        </button>

        {/* Shared search module */}
        <div className="w-full sm:w-72 sm:ml-auto order-last sm:order-none">
          <SharedSearchBar
            value={orderSearch}
            onChange={setOrderSearch}
            placeholder="Search order #, customer, phone..."
          />
        </div>

        <div className="ml-auto mb-3 flex items-center gap-2 text-[10px] font-bold text-gray-400 group cursor-help relative">
          <Info className="w-4 h-4 text-gray-400" />
          <span className="hidden sm:inline">How does stock work?</span>
          <div className="absolute right-0 top-full mt-2 w-64 p-3 bg-gray-900 text-white text-[11px] rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
            <p className="mb-2">📦 <strong>Pending Orders:</strong> Do NOT affect your stock. Inventory is untouched until accepted.</p>
            <p className="mb-2">✅ <strong>Accepted Orders:</strong> Stock is deducted when you finalize the bill in POS.</p>
            <p>🗑️ <strong>Cancelled Orders:</strong> Automatically deleted from the database after 24 hours.</p>
          </div>
        </div>
      </div>

      {/* Main Split Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Orders List */}
        <div className={`w-full md:w-1/3 border-r border-gray-200 dark:border-white/5 bg-white dark:bg-[#111] overflow-y-auto flex flex-col ${isMobileDetailOpen ? 'hidden md:flex' : 'flex'}`}>
          {searchFilteredOrders.length === 0 ? (
            <EmptyState
              icon={<ShoppingBag className="w-12 h-12 opacity-20 text-gray-400" />}
              title={orderSearch ? 'No orders match your search.' : 'No orders found.'}
              className="h-full !p-8"
            />
          ) : (
            searchFilteredOrders.map(order => {
              const isNew = !seenOrderIds.has(order.id);
              return (
              <button
                key={order.id}
                onClick={() => { setSelectedOrderId(order.id); setIsMobileDetailOpen(true); markOrderSeen(order.id); }}
                className={`w-full text-left p-4 border-b border-gray-100 dark:border-white/5 transition-colors flex flex-col gap-2 ${
                  selectedOrder?.id === order.id 
                    ? 'bg-primary/5 border-l-4 border-l-primary' 
                    : isNew
                      ? 'bg-rose-50 dark:bg-rose-900/10 border-l-4 border-l-rose-500 hover:bg-rose-100 dark:hover:bg-rose-900/20'
                      : 'hover:bg-gray-50 dark:hover:bg-white/5 border-l-4 border-l-transparent'
                }`}
              >
                <div className="flex justify-between items-start w-full">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-gray-900 dark:text-white text-base">#{order.invoiceNumber}</span>
                      {isNew && (
                        <span className="bg-rose-500 text-white text-[8px] px-1.5 py-0.5 rounded font-black uppercase tracking-widest animate-pulse">NEW</span>
                      )}
                    </div>
                    <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400">
                      {new Date(order.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                    <div className={`px-2 py-0.5 rounded-md border text-[9px] font-black uppercase tracking-widest ${STATUS_COLORS[order.status]}`}>
                      {STATUS_LABELS[order.status]}
                  </div>
                </div>
                <div className="flex justify-between items-center w-full mt-1">
                  <span className="text-sm font-bold text-gray-700 dark:text-gray-300 truncate pr-2">
                    {order.customerName || 'Guest'}
                  </span>
                  <span className="text-sm font-black text-gray-900 dark:text-white shrink-0">
                    {formatCurrency(order.total, state.settings?.currency)}
                  </span>
                </div>
                <OrderTimer order={order} settings={state.settings} onExpire={handleTimerExpire} />
              </button>
              );
            })
          )}
        </div>

        {/* Right: Order Details */}
        <div className={`w-full md:w-2/3 bg-gray-50 dark:bg-[#0a0a0a] overflow-y-auto p-4 md:p-6 ${isMobileDetailOpen ? 'block' : 'hidden md:block'}`}>
          {selectedOrder ? (
            <div className="max-w-3xl mx-auto flex flex-col gap-4 md:gap-6 pb-24 md:pb-0">
              
              {/* Top Bar */}
              <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-white/5 rounded-2xl p-4 md:p-6 shadow-sm flex flex-col sm:flex-row justify-between items-start gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <Button
                      onClick={() => setIsMobileDetailOpen(false)}
                      icon={<ChevronRight className="w-6 h-6 rotate-180" />}
                      className="md:hidden !min-h-0 !p-2 !-ml-2 !rounded-full !text-gray-500 !hover:bg-gray-100"
                    />
                    <h2 className="text-xl md:text-3xl font-black text-gray-900 dark:text-white tracking-tight">Order #{selectedOrder.invoiceNumber}</h2>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 md:gap-3 mt-2 md:ml-0 ml-10">
                    <div className={`px-3 py-1 rounded-lg border text-xs font-black uppercase tracking-widest ${STATUS_COLORS[selectedOrder.status]}`}>
                      {STATUS_LABELS[selectedOrder.status]}
                    </div>
                    <span className="text-sm font-bold text-gray-500">
                      {new Date(selectedOrder.createdAt).toLocaleString()}
                    </span>
                    <OrderTimer order={selectedOrder} settings={state.settings} onExpire={handleTimerExpire} />
                  </div>
                </div>
                <div className="text-left sm:text-right ml-10 sm:ml-0">
                  <p className="text-xs md:text-sm font-bold text-gray-500 uppercase tracking-widest mb-1">Total Amount</p>
                  <p className="text-2xl md:text-3xl font-black text-primary">{formatCurrency(selectedOrder.total, state.settings?.currency)}</p>
                </div>
              </div>

              {/* Action Buttons */}
              {activeTab === 'active' && (
                <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-white/5 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row gap-3">
                  {(selectedOrder.status === 'converted' || selectedOrder.fulfilledSaleId) ? (
                    <div className="w-full py-3 bg-indigo-50 border border-indigo-200 text-indigo-700 dark:bg-indigo-900/20 dark:border-indigo-800/30 dark:text-indigo-300 rounded-xl font-black uppercase tracking-widest text-sm flex items-center justify-center gap-2">
                      <CheckCircle2 className="w-5 h-5" />
                      Converted to Sale {selectedOrder.fulfilledSaleId && `(POS)`}
                    </div>
                  ) : (
                    <>
                      <Button
                        onClick={() => handleAcceptToPOS(selectedOrder)}
                        icon={<CheckCircle2 className="w-5 h-5" />}
                        className="w-full sm:flex-1 !py-3 !rounded-xl !font-black !text-sm !gap-2 hover:!bg-emerald-700"
                      >
                        Accept & Load to POS
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => updateStatus(selectedOrder, 'cancelled')}
                        icon={<XCircle className="w-4 h-4" />}
                        className="w-full sm:w-auto !min-h-0 !px-6 !py-3 !rounded-xl !font-black !text-xs !gap-2 !shadow-none !bg-transparent !border !border-rose-200 dark:!border-rose-900/30 !text-rose-600 dark:!text-rose-400 !hover:opacity-100 hover:!bg-rose-50 dark:hover:!bg-rose-500/10"
                      >
                        Cancel
                      </Button>
                    </>
                  )}
                </div>
              )}

              <OrderProgress status={selectedOrder.status || 'pending'} deliveryAddress={selectedOrder.deliveryAddress} />

              {/* Customer Info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-white/5 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-4 text-gray-900 dark:text-white">
                    <Phone className="w-5 h-5 text-primary" />
                    <h3 className="font-black text-lg">Contact Info</h3>
                  </div>
                  <p className="text-base font-bold text-gray-900 dark:text-white mb-1">{selectedOrder.customerName || 'Guest Customer'}</p>
                  {selectedOrder.customerPhone && (
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{selectedOrder.customerPhone}</p>
                  )}
                </div>

                <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-white/5 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-4 text-gray-900 dark:text-white">
                    <MapPin className="w-5 h-5 text-primary" />
                    <h3 className="font-black text-lg">Delivery Address</h3>
                  </div>
                  {selectedOrder.deliveryAddress ? (
                    <div className="space-y-3">
                      <p className="text-sm font-medium text-gray-600 dark:text-gray-400 leading-relaxed">
                        {selectedOrder.deliveryAddress}
                      </p>
                      {selectedOrder.deliveryLocationLat && selectedOrder.deliveryLocationLng && (
                        <div className="pt-2 border-t border-gray-100 dark:border-white/5 space-y-2">
                          <p className="text-[10px] font-mono text-gray-500">
                            Coordinates: {selectedOrder.deliveryLocationLat.toFixed(5)}, {selectedOrder.deliveryLocationLng.toFixed(5)}
                          </p>
                          <a 
                            href={`https://www.google.com/maps/search/?api=1&query=${selectedOrder.deliveryLocationLat},${selectedOrder.deliveryLocationLng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-primary hover:text-primary-hover bg-primary/5 hover:bg-primary/10 px-3 py-2 rounded-xl transition-all"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            Open in Google Maps
                          </a>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm font-medium text-gray-400 italic">No address provided</p>
                  )}
                </div>
              </div>

              {/* Customer Notes */}
              {selectedOrder.customerNotes && (
                <div className="bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-500/20 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-2 text-yellow-800 dark:text-yellow-500">
                    <FileText className="w-5 h-5" />
                    <h3 className="font-black text-lg uppercase tracking-widest text-[11px]">Customer Note</h3>
                  </div>
                  <p className="text-sm font-bold text-yellow-900 dark:text-yellow-400">{selectedOrder.customerNotes}</p>
                </div>
              )}

              {/* Order Items */}
              <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-white/5 rounded-2xl p-6 shadow-sm">
                <h3 className="font-black text-xl text-gray-900 dark:text-white mb-6">Order Items</h3>
                <div className="flex flex-col gap-4">
                  {(() => {
                    const groupCartItems = (cartItems: any[]) => {
                      const bundlesMap = new Map<string, {
                        bundleId: string;
                        bundleName: string;
                        items: { item: any; originalIndex: number }[];
                        totalSubtotal: number;
                        bundleQty: number;
                      }>();
                      const standaloneItems: { item: any; originalIndex: number }[] = [];

                      cartItems.forEach((item, index) => {
                        const bId = item.bundleId || item.bundle_id;
                        if (bId) {
                          if (!bundlesMap.has(bId)) {
                            bundlesMap.set(bId, {
                              bundleId: bId,
                              bundleName: item.bundleName || item.bundle_name || 'Deal',
                              items: [],
                              totalSubtotal: 0,
                              bundleQty: 1
                            });
                          }
                          const b = bundlesMap.get(bId)!;
                          b.items.push({ item, originalIndex: index });
                          b.totalSubtotal += item.subtotal ?? ((item.price != null ? item.price * item.quantity : (item.product?.price ?? 0) * item.quantity) - (item.discount || 0));
                        } else {
                          standaloneItems.push({ item, originalIndex: index });
                        }
                      });
                      
                      bundlesMap.forEach((b) => {
                        const originalBundleDefId = b.bundleId.match(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/)?.[0] || b.bundleId;
                        let bundleDef = state.bundles?.find(x => x.id === originalBundleDefId);
                        if (!bundleDef) {
                          bundleDef = state.products?.find(x => x.id === originalBundleDefId) as unknown as Bundle;
                        }
                        
                        let bundleQty = 1;
                        if (bundleDef && bundleDef.items && bundleDef.items.length > 0) {
                          const firstBi = bundleDef.items[0];
                          const cartItem = b.items.find(x => x.item.product.id === firstBi.productId);
                          if (cartItem) {
                            bundleQty = Math.round(cartItem.item.quantity / firstBi.quantity);
                          }
                        } else if (b.items.length > 0) {
                          bundleQty = b.items[0].item.quantity;
                        }
                        if (bundleQty === 0) bundleQty = 1;
                        b.bundleQty = bundleQty;
                      });

                      return { bundles: Array.from(bundlesMap.values()), standaloneItems };
                    };

                    const { bundles, standaloneItems } = groupCartItems(selectedOrder.items);

                    return (
                      <div className="space-y-4 w-full">
                        {/* Render Deals */}
                        {bundles.map((b, bIdx) => (
                          <div key={b.bundleId} className="p-4 rounded-2xl border border-dashed border-primary/30 bg-primary/[0.02] dark:bg-primary/[0.01] space-y-3">
                            <div className="flex justify-between items-start">
                              <div>
                                <span className="bg-primary text-white text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md inline-block mb-1 shadow-sm">🎁 DEAL</span>
                                <h4 className="font-black text-gray-900 dark:text-white text-base uppercase leading-tight">{bIdx + 1}. {b.bundleQty > 1 ? `${b.bundleQty}x ${b.bundleName}` : b.bundleName}</h4>
                              {b.items[0]?.item.toppings && b.items[0].item.toppings.length > 0 && (
                                <p className="text-[10px] text-gray-500 truncate font-medium mt-1">+ {b.items[0].item.toppings.map((t: any) => `${Math.abs(b.items[0].item.quantity || 1) > 1 ? Math.abs(b.items[0].item.quantity || 1) + 'x ' : ''}${t.name} (${formatCurrency(t.price * Math.abs(b.items[0].item.quantity || 1), state.settings?.currency)})`).join(', ')}</p>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <span className="font-black text-primary text-base block">{formatCurrency(b.totalSubtotal, state.settings?.currency)}</span>
                              <span className="text-xs font-bold text-gray-500 block mt-0.5">Qty: {b.bundleQty}</span>
                            </div>
                          </div>
                          <div className="space-y-2 border-t border-gray-100 dark:border-white/5 pt-2.5">
                            {b.items.map(({ item, originalIndex }) => (
                              <div key={originalIndex} className="flex gap-3 items-center text-xs">
                                <span className="flex items-center justify-center w-6 h-6 text-gray-700 dark:text-gray-300 text-[10px] font-bold shrink-0">-</span>
                                {item.product?.image ? (
                                  <img src={item.product.image} alt={item.product.name} className="w-8 h-8 rounded-lg object-cover shrink-0" />
                                ) : (
                                  <div className="w-8 h-8 bg-black/5 dark:bg-white/5 rounded-lg flex items-center justify-center font-bold text-gray-400 shrink-0">
                                    {item.product?.name?.charAt(0) || 'Item'}
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="font-bold text-gray-900 dark:text-white truncate">{b.bundleQty > 0 ? Math.round(Math.abs(item.quantity) / b.bundleQty) : Math.abs(item.quantity)}x {item.product?.name}</p>
                                  {item.selectedVariant && (
                                    <p className="text-[10px] text-gray-500 truncate">{item.selectedVariant}</p>
                                  )}
                                  {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                                    <p className="text-[10px] text-primary truncate font-medium">+ {item.selectedModifiers.map((m: any) => `${Math.abs(item.quantity) > 1 ? Math.abs(item.quantity) + 'x ' : ''}${m.name} (${formatCurrency(m.price * Math.abs(item.quantity), state.settings?.currency)})`).join(', ')}</p>
                                  )}
                                  {item.addonItems && item.addonItems.length > 0 && (
                                    <p className="text-[10px] text-violet-500 truncate font-medium">+ Add-ons: {item.addonItems.map((a: any) => `${a.addon?.name || a.name} ${a.quantity * Math.abs(item.quantity)}x (${formatCurrency(a.subtotal * Math.abs(item.quantity), state.settings?.currency)})`).join(', ')}</p>
                                  )}
                                  {item.displayToppings && item.displayToppings.length > 0 && (
                                    <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate font-medium">+ {item.displayToppings.map((t: any) => `${Math.abs(item.quantity) > 1 ? Math.abs(item.quantity) + 'x ' : ''}${t.name}`).join(', ')}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}

                      {/* Render Standalone Items */}
                      {standaloneItems.map(({ item, originalIndex }, sIdx) => (
                        <div key={originalIndex} className="flex justify-between items-center py-3 border-b border-gray-100 dark:border-white/5 last:border-0">
                          <div className="flex items-center gap-4">
                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 text-[10px] font-bold shrink-0">{sIdx + 1}</span>
                              <div className="relative shrink-0">
                                {item.product?.image ? (
                                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-white shadow-sm border border-gray-200/50 dark:border-white/10">
                                    <img src={item.product.image} alt={item.product.name} className="w-full h-full object-cover" />
                                  </div>
                                ) : (
                                  <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-white/5 flex items-center justify-center border border-gray-200/50 dark:border-white/10">
                                    <ShoppingBag className="w-5 h-5 text-gray-400" />
                                  </div>
                                )}
                                <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center font-black text-white text-[10px] shadow-sm border-2 border-white dark:border-[#111]">
                                  {item.quantity}
                                </div>
                              </div>
                              <div>
                                <p className="font-bold text-gray-900 dark:text-white text-base leading-tight">{item.product?.name}</p>
                                {(item.selectedVariant || (item.selectedModifiers && item.selectedModifiers.length > 0) || (item.toppings && item.toppings.length > 0)) && (
                                  <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-1 flex flex-col gap-0.5">
                                    {item.selectedVariant && <span>{item.selectedVariant}</span>}
                                    {item.selectedModifiers && item.selectedModifiers.length > 0 && <span>+ {item.selectedModifiers.map((m: any) => `${Math.abs(item.quantity) > 1 ? Math.abs(item.quantity) + 'x ' : ''}${m.name} (${formatCurrency(m.price * Math.abs(item.quantity), state.settings?.currency)})`).join(', ')}</span>}
                                    {item.addonItems && item.addonItems.length > 0 && <span className="text-violet-500">+ Add-ons: {item.addonItems.map((a: any) => `${a.addon?.name || a.name} ${a.quantity * Math.abs(item.quantity)}x (${formatCurrency(a.subtotal * Math.abs(item.quantity), state.settings?.currency)})`).join(', ')}</span>}
                                    {item.toppings && item.toppings.length > 0 && <span>+ {item.toppings.map((t: any) => `${Math.abs(item.quantity) > 1 ? Math.abs(item.quantity) + 'x ' : ''}${t.name} (${formatCurrency(t.price * Math.abs(item.quantity), state.settings?.currency)})`).join(', ')}</span>}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="font-black text-gray-900 dark:text-white text-lg">
                              {formatCurrency(
                                item.subtotal ??
                                (item.price != null ? item.price * item.quantity : (item.product?.price ?? 0) * item.quantity),
                                state.settings?.currency
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Payment Summary Breakdown */}
              <div className="bg-white dark:bg-[#111] border border-gray-200 dark:border-white/5 rounded-2xl p-6 shadow-sm">
                <h3 className="font-black text-xl text-gray-900 dark:text-white mb-4">Payment Summary</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-sm font-medium text-gray-600 dark:text-gray-400">
                    <span>Subtotal</span>
                    <span className="font-bold text-gray-900 dark:text-white">
                      {formatCurrency(selectedOrder.subtotal ?? (selectedOrder.total - (selectedOrder.deliveryFee || 0)), state.settings?.currency)}
                    </span>
                  </div>
                  {selectedOrder.deliveryFee != null && selectedOrder.deliveryFee > 0 && (
                    <div className="flex justify-between items-center text-sm font-medium text-gray-600 dark:text-gray-400">
                      <span>Delivery Charges (DC)</span>
                      <span className="font-bold text-primary">
                        +{formatCurrency(selectedOrder.deliveryFee, state.settings?.currency)}
                      </span>
                    </div>
                  )}
                  {selectedOrder.discountAmount != null && selectedOrder.discountAmount > 0 && (
                    <div className="flex justify-between items-center text-sm font-medium text-gray-600 dark:text-gray-400">
                      <span>Discount</span>
                      <span className="font-bold text-rose-500">
                        -{formatCurrency(selectedOrder.discountAmount, state.settings?.currency)}
                      </span>
                    </div>
                  )}
                  {selectedOrder.taxAmount != null && selectedOrder.taxAmount > 0 && (
                    <div className="flex justify-between items-center text-sm font-medium text-gray-600 dark:text-gray-400">
                      <span>Tax</span>
                      <span className="font-bold text-gray-900 dark:text-white">
                        +{formatCurrency(selectedOrder.taxAmount, state.settings?.currency)}
                      </span>
                    </div>
                  )}
                  <div className="pt-3 border-t border-gray-100 dark:border-white/5 flex justify-between items-center">
                    <span className="text-base font-black text-gray-900 dark:text-white">Total</span>
                    <span className="text-xl font-black text-primary">
                      {formatCurrency(selectedOrder.total, state.settings?.currency)}
                    </span>
                  </div>
                </div>
              </div>

            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-600">
              <ShoppingBag className="w-16 h-16 mb-4 opacity-20" />
              <p className="font-bold tracking-wide">Select an order to view details.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
