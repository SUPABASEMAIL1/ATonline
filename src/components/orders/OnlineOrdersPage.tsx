import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../context/SupabaseAppContext';
import { Sale } from '../../types';
import { salesService } from '../../lib/services';
import { formatCurrency } from '../../lib/currencies';
import { ShoppingBag, ChevronRight, CheckCircle2, XCircle, MapPin, Phone, FileText } from 'lucide-react';
import { sonner } from '../../lib/sonner';
import { useNavigate } from 'react-router-dom';

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
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
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

  const displayedOrders = activeTab === 'active' ? activeOrders : pastOrders;
  
  // Select first order by default if none selected
  const selectedOrder = useMemo(() => {
    if (selectedOrderId) {
      const order = displayedOrders.find(o => o.id === selectedOrderId);
      if (order) return order;
    }
    return displayedOrders.length > 0 ? displayedOrders[0] : null;
  }, [displayedOrders, selectedOrderId]);

  // Timer component for individual orders
  const OrderTimer = ({ order, settings }: { order: Sale, settings: any }) => {
    const [timeLeft, setTimeLeft] = useState<number>(0);
    const [timeTotal, setTimeTotal] = useState<number>(0);
    
    useEffect(() => {
      if (!settings?.estoreOrderTimerEnabled || !settings?.estoreOrderTimerMinutes) return;
      
      const createdAt = new Date(order.createdAt).getTime();
      const durationMs = settings.estoreOrderTimerMinutes * 60 * 1000;
      const targetTime = createdAt + durationMs;
      
      setTimeTotal(durationMs);
      
      const updateTimer = () => {
        const now = new Date().getTime();
        const remaining = Math.max(0, targetTime - now);
        setTimeLeft(remaining);
        
        // Notify at half time
        if (remaining > 0 && remaining <= durationMs / 2 && remaining > (durationMs / 2) - 1000) {
          sonner.warning(`Half time reached for Order #${order.invoiceNumber}!`);
        }
      };
      
      updateTimer();
      const interval = setInterval(updateTimer, 1000);
      return () => clearInterval(interval);
    }, [order.createdAt, settings?.estoreOrderTimerEnabled, settings?.estoreOrderTimerMinutes]);

    if (!settings?.estoreOrderTimerEnabled || timeLeft <= 0 || !['pending', 'accepted', 'preparing'].includes(order.estoreStatus || '')) return null;

    const formatTime = (ms: number) => {
      const totalSeconds = Math.floor(ms / 1000);
      const m = Math.floor(totalSeconds / 60);
      const s = totalSeconds % 60;
      return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const isHalfTime = timeTotal > 0 && timeLeft <= timeTotal / 2;

    return (
      <div className={`mt-2 flex items-center gap-1.5 text-[10px] font-black tracking-widest uppercase px-2 py-1 rounded-md w-fit ${isHalfTime ? 'bg-orange-100 text-orange-700 animate-pulse border border-orange-200' : 'bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300'}`}>
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        {formatTime(timeLeft)}
      </div>
    );
  };

  const updateStatus = async (sale: Sale, newStatus: string) => {
    try {
      await salesService.update(sale.id, { estoreStatus: newStatus as any });
      sonner.success(`Order #${sale.invoiceNumber} status updated to ${STATUS_LABELS[newStatus]}`);
    } catch (error: any) {
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
    if (sale.deliveryAddress) fullNotes += `\nDelivery Address: ${sale.deliveryAddress}`;
    if (sale.customerPhone) fullNotes += `\nPhone: ${sale.customerPhone}`;
    if (sale.customerNotes) fullNotes += `\nCustomer Notes: ${sale.customerNotes}`;
    
    // Switch to POS cart logic via SET_CART and SET_NOTES, ensuring we are on active tab
    dispatch({ type: 'SET_CART', payload: sale.items });
    dispatch({ type: 'SET_NOTES', payload: fullNotes.trim() });
    
    dispatch({
      type: 'UPDATE_SALES_TAB',
      payload: {
        id: state.activeSalesTab,
        updates: {
          cart: sale.items,
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
            displayedOrders.map(order => (
              <button
                key={order.id}
                onClick={() => { setSelectedOrderId(order.id); setIsMobileDetailOpen(true); }}
                className={`w-full text-left p-4 border-b border-gray-100 dark:border-white/5 transition-colors flex flex-col gap-2 ${
                  selectedOrder?.id === order.id 
                    ? 'bg-primary/5 border-l-4 border-l-primary' 
                    : 'hover:bg-gray-50 dark:hover:bg-white/5 border-l-4 border-l-transparent'
                }`}
              >
                <div className="flex justify-between items-start w-full">
                  <div className="flex flex-col">
                    <span className="font-black text-gray-900 dark:text-white text-base">#{order.invoiceNumber}</span>
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
                <OrderTimer order={order} settings={state.settings} />
              </button>
            ))
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
                    <OrderTimer order={selectedOrder} settings={state.settings} />
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
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400 leading-relaxed">
                      {selectedOrder.deliveryAddress}
                    </p>
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
                  {selectedOrder.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center py-3 border-b border-gray-100 dark:border-white/5 last:border-0">
                      <div className="flex items-center gap-4">
                        <div className="relative shrink-0">
                          {item.product.image ? (
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
                          <p className="font-bold text-gray-900 dark:text-white text-base leading-tight">{item.product.name}</p>
                          {(item.selectedVariant || (item.selectedModifiers && item.selectedModifiers.length > 0)) && (
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-1">
                              {item.selectedVariant && <span>{item.selectedVariant}</span>}
                              {item.selectedVariant && item.selectedModifiers && item.selectedModifiers.length > 0 && <span> | </span>}
                              {item.selectedModifiers && item.selectedModifiers.map(m => m.name).join(', ')}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="font-black text-gray-900 dark:text-white text-lg">
                        {formatCurrency(item.total, state.settings?.currency)}
                      </div>
                    </div>
                  ))}
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
