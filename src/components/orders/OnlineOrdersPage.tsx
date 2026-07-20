import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useApp } from '../../context/SupabaseAppContext';
import { Sale } from '../../types';
import { salesService } from '../../lib/services';
import { formatCurrency } from '../../lib/currencies';
import { ShoppingBag, ChevronRight, CheckCircle2, XCircle, MapPin, Phone, FileText, Bike, Store, Home, Clock, Flame } from 'lucide-react';
import { sonner } from '../../lib/sonner';
import { useNavigate } from 'react-router-dom';

// ─── Module-level component (prevents blink from re-mounting on parent re-render) ───
const OrderTimer = ({ order, settings, onExpire }: { order: Sale, settings: any, onExpire?: (orderId: string) => void }) => {
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

  const isActive = ['pending', 'accepted', 'preparing'].includes(order.estoreStatus || '');

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

  const isPending = order.estoreStatus === 'pending';

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
  else if (status === 'delivered') activeIndex = 3;
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
            <p className="text-[9px] font-medium text-gray-400 mt-0.5">Zaynahs POS Store</p>
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

const STATUS_FLOW = ['pending', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'];
const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  preparing: 'Preparing',
  ready: 'Ready',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled'
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  accepted: 'bg-blue-100 text-blue-800 border-blue-200',
  preparing: 'bg-purple-100 text-purple-800 border-purple-200',
  ready: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  out_for_delivery: 'bg-orange-100 text-orange-800 border-orange-200',
  delivered: 'bg-gray-100 text-gray-800 border-gray-200',
  cancelled: 'bg-red-100 text-red-800 border-red-200'
};

export function OnlineOrdersPage() {
  const { state, dispatch } = useApp();
  const navigate = useNavigate();

  const activeOrders = useMemo(() => {
    return state.sales
      .filter(s => s.estoreStatus && !['delivered', 'cancelled'].includes(s.estoreStatus))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [state.sales]);

  const pastOrders = useMemo(() => {
    return state.sales
      .filter(s => s.estoreStatus && ['delivered', 'cancelled'].includes(s.estoreStatus))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 50);
  }, [state.sales]);

  const [activeTab, setActiveTab] = useState<'active' | 'past'>('active');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isMobileDetailOpen, setIsMobileDetailOpen] = useState(false);
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
  
  // Select order ONLY if selectedOrderId is explicitly set (never auto-open first order)
  const selectedOrder = useMemo(() => {
    if (selectedOrderId) {
      return displayedOrders.find(o => o.id === selectedOrderId) || null;
    }
    return null;
  }, [displayedOrders, selectedOrderId]);

  // Auto-mark selected order as seen
  useEffect(() => {
    if (selectedOrder) markOrderSeen(selectedOrder.id);
  }, [selectedOrder?.id]);


  const handleTimerExpire = useCallback((orderId: string) => {
    const order = state.sales.find(s => s.id === orderId);
    if (order && ['pending', 'accepted', 'preparing', 'ready', 'out_for_delivery'].includes(order.estoreStatus || '')) {
      sonner.error(`⏰ Order #${order.invoiceNumber} prep/delivery countdown expired! Please process it immediately.`);
    }
  }, [state.sales]);

  const updateStatus = async (sale: Sale, newStatus: string) => {
    const updates: Partial<Sale> = { estoreStatus: newStatus as any };
    if (newStatus === 'cancelled') {
      updates.status = 'cancelled';
    }
    const updated = { ...sale, ...updates };
    dispatch({ type: 'UPDATE_SALE', payload: updated });
    try {
      await salesService.update(sale.id, updates);
      sonner.success(`Order #${sale.invoiceNumber} status updated to ${STATUS_LABELS[newStatus]}`);
    } catch (error: any) {
      dispatch({ type: 'UPDATE_SALE', payload: sale });
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

  const handleAcceptToPOS = async (sale: Sale) => {
    // Change status to preparing automatically
    await updateStatus(sale, 'preparing');

    // 1. Set editing sale ID
    dispatch({ type: 'SET_EDITING_SALE_ID', payload: sale.id });
    
    // 2. Load items to cart and notes
    let fullNotes = sale.notes || '';
    if (sale.customerName) fullNotes += `\nCustomer Name: ${sale.customerName}`;
    if (sale.deliveryAddress) fullNotes += `\nDelivery Address: ${sale.deliveryAddress}`;
    if (sale.customerPhone) fullNotes += `\nPhone: ${sale.customerPhone}`;
    if (sale.customerNotes) fullNotes += `\nCustomer Notes: ${sale.customerNotes}`;
    // 3. Inject Delivery Fee as a synthetic cart item if present
    const cartItems = [...sale.items];
    if (sale.deliveryFee && sale.deliveryFee > 0) {
      cartItems.push({
        id: crypto.randomUUID(),
        productId: 'delivery-fee',
        name: 'Delivery Fee',
        price: sale.deliveryFee,
        quantity: 1,
        subtotal: sale.deliveryFee,
        isCustom: true,
        product: { id: 'delivery-fee', name: 'Delivery Fee', price: sale.deliveryFee, cost: 0, category: 'Service', isService: true }
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
          customerId: sale.customerId || null,
          notes: fullNotes.trim(),
          editingSaleId: sale.id,
        }
      }
    });

    sonner.success('Order loaded into POS and marked as Preparing');
    navigate('/pos');
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-[#0a0a0a] overflow-hidden">
      {/* Header Tabs (Hidden on mobile if detail is open) */}
      <div className={`flex gap-4 border-b border-gray-200 dark:border-gray-800 px-6 pt-4 shrink-0 bg-white dark:bg-[#111] ${isMobileDetailOpen ? 'hidden md:flex' : 'flex'}`}>
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
      </div>

      {/* Main Split Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Orders List */}
        <div className={`w-full md:w-1/3 border-r border-gray-200 dark:border-white/5 bg-white dark:bg-[#111] overflow-y-auto flex flex-col ${isMobileDetailOpen ? 'hidden md:flex' : 'flex'}`}>
          {displayedOrders.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-600 p-8 text-center">
              <ShoppingBag className="w-12 h-12 mb-4 opacity-20" />
              <p className="font-bold tracking-wide">No orders found.</p>
            </div>
          ) : (
            displayedOrders.map(order => {
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
                  <div className={`px-2 py-0.5 rounded-md border text-[9px] font-black uppercase tracking-widest ${STATUS_COLORS[order.estoreStatus!]}`}>
                    {STATUS_LABELS[order.estoreStatus!]}
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
                    <button 
                      onClick={() => setIsMobileDetailOpen(false)}
                      className="md:hidden p-2 -ml-2 hover:bg-gray-100 rounded-full text-gray-500"
                    >
                      <ChevronRight className="w-6 h-6 rotate-180" />
                    </button>
                    <h2 className="text-xl md:text-3xl font-black text-gray-900 dark:text-white tracking-tight">Order #{selectedOrder.invoiceNumber}</h2>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 md:gap-3 mt-2 md:ml-0 ml-10">
                    <div className={`px-3 py-1 rounded-lg border text-xs font-black uppercase tracking-widest ${STATUS_COLORS[selectedOrder.estoreStatus!]}`}>
                      {STATUS_LABELS[selectedOrder.estoreStatus!]}
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
                  <button 
                    onClick={() => handleAcceptToPOS(selectedOrder)}
                    className="w-full sm:flex-1 py-3 bg-primary text-white rounded-xl font-black uppercase tracking-widest text-sm hover:bg-opacity-90 transition-all flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-5 h-5" />
                    Accept & Load to POS
                  </button>
                  <button 
                    onClick={() => updateStatus(selectedOrder, 'cancelled')}
                    className="w-full sm:w-auto px-6 py-3 border border-rose-200 dark:border-rose-900/30 text-rose-600 dark:text-rose-400 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all flex items-center justify-center gap-2"
                  >
                    <XCircle className="w-4 h-4" />
                    Cancel
                  </button>
                </div>
              )}

              <OrderProgress status={selectedOrder.estoreStatus || 'pending'} deliveryAddress={selectedOrder.deliveryAddress} />

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
                    const bundlesMap = new Map<string, { bundleId: string; bundleName: string; items: typeof selectedOrder.items; totalSubtotal: number }>();
                    const standaloneItems: typeof selectedOrder.items = [];

                    selectedOrder.items.forEach(item => {
                      const bId = item.bundleId || item.bundle_id;
                      if (bId) {
                        if (!bundlesMap.has(bId)) {
                          bundlesMap.set(bId, {
                            bundleId: bId,
                            bundleName: item.bundleName || item.bundle_name || 'Deal',
                            items: [],
                            totalSubtotal: 0
                          });
                        }
                        const b = bundlesMap.get(bId)!;
                        b.items.push(item);
                        b.totalSubtotal += item.subtotal ?? ((item.price != null ? item.price * item.quantity : (item.product?.price ?? 0) * item.quantity) - (item.discount || 0));
                      } else {
                        standaloneItems.push(item);
                      }
                    });

                    let itemNumber = 0;

                    return (
                      <div className="space-y-4 w-full">
                        {/* Render Deals */}
                        {Array.from(bundlesMap.values()).map(b => (
                          <div key={b.bundleId} className="p-4 rounded-2xl border border-dashed border-primary/30 bg-primary/[0.02] dark:bg-primary/[0.01] space-y-3">
                            <div className="flex justify-between items-start">
                              <div>
                                <span className="bg-primary text-white text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md inline-block mb-1 shadow-sm">🎁 DEAL</span>
                                <h4 className="font-black text-gray-900 dark:text-white text-base uppercase leading-tight">{b.bundleName}</h4>
                              </div>
                              <div className="text-right shrink-0">
                                <span className="font-black text-primary text-base block">{formatCurrency(b.totalSubtotal, state.settings?.currency)}</span>
                                <span className="text-xs font-bold text-gray-500 block mt-0.5">Qty: {b.items[0]?.quantity || 1}</span>
                              </div>
                            </div>
                            <div className="space-y-2 border-t border-gray-100 dark:border-white/5 pt-2.5">
                              {b.items.map((item) => (
                                <div key={++itemNumber} className="flex gap-3 items-center text-xs">
                                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 text-[10px] font-bold shrink-0">{itemNumber}</span>
                                  {item.product?.image ? (
                                    <img src={item.product.image} alt={item.product.name} className="w-8 h-8 rounded-lg object-cover shrink-0" />
                                  ) : (
                                    <div className="w-8 h-8 bg-black/5 dark:bg-white/5 rounded-lg flex items-center justify-center font-bold text-gray-400 shrink-0">
                                      {item.product?.name?.charAt(0) || 'Item'}
                                    </div>
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <p className="font-bold text-gray-900 dark:text-white truncate">{item.product?.name}</p>
                                    {item.selectedVariant && (
                                      <p className="text-[10px] text-gray-500 truncate">{item.selectedVariant}</p>
                                    )}
                                    {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                                      <p className="text-[10px] text-primary truncate font-medium">+ {item.selectedModifiers.map((m: any) => m.name).join(', ')}</p>
                                    )}
                                    {item.toppings && item.toppings.length > 0 && (
                                      <p className="text-[10px] text-primary/70 truncate font-medium">+ Toppings: {item.toppings.map((t: any) => `${t.name} (${formatCurrency(t.price, state.settings?.currency)})`).join(', ')}</p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}

                        {/* Render Standalone Items */}
                        {standaloneItems.map((item) => (
                          <div key={++itemNumber} className="flex justify-between items-center py-3 border-b border-gray-100 dark:border-white/5 last:border-0">
                            <div className="flex items-center gap-4">
                              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 text-[10px] font-bold shrink-0">{itemNumber}</span>
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
                                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-1">
                                    {item.selectedVariant && <span>{item.selectedVariant}</span>}
                                    {item.selectedVariant && item.selectedModifiers && item.selectedModifiers.length > 0 && <span> | </span>}
                                    {item.selectedModifiers && item.selectedModifiers.map(m => m.name).join(', ')}
                                    {(item.selectedVariant || (item.selectedModifiers && item.selectedModifiers.length > 0)) && item.toppings && item.toppings.length > 0 && <span> | </span>}
                                    {item.toppings && item.toppings.length > 0 && <span>+ {item.toppings.map(t => `${t.name} (${formatCurrency(t.price, state.settings?.currency)})`).join(', ')}</span>}
                                  </p>
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
