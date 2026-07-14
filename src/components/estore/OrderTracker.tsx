import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { AppSettings } from '../../types';
import { CheckCircle, Clock, ChefHat, Truck, Package, XCircle, Receipt, MapPin, Phone } from 'lucide-react';
import { formatCurrency } from '../../lib/currencies';

interface OrderTrackerProps {
  orderId: string; // The invoiceNumber
  settings: AppSettings | null;
}

export function OrderTracker({ orderId, settings }: OrderTrackerProps) {
  const navigate = useNavigate();
  const [order, setOrder] = useState<any>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [timeTotal, setTimeTotal] = useState<number>(0);

  // Fetch initial order data
  useEffect(() => {
    let sub: any;
    
    const fetchOrder = async () => {
      const { data } = await supabase
        .from('sales')
        .select('*')
        .eq('invoice_number', orderId)
        .maybeSingle();
        
      if (data) {
        setOrder(data);
        setupTimer(data);
      }
    };

    fetchOrder();

    // Subscribe to realtime updates for this specific order
    sub = supabase
      .channel(`order-tracker-${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sales',
          filter: `invoice_number=eq.${orderId}`
        },
        (payload) => {
          setOrder(payload.new);
        }
      )
      .subscribe();

    return () => {
      if (sub) supabase.removeChannel(sub);
    };
  }, [orderId]);

  // Setup Countdown Timer logic
  const setupTimer = (orderData: any) => {
    if (!settings?.estoreOrderTimerEnabled) return;
    
    const timerMins = settings?.estoreOrderTimerMinutes || 30;
    const createdAt = new Date(orderData.created_at || new Date()).getTime();
    const durationMs = timerMins * 60 * 1000;
    const targetTime = createdAt + durationMs;
    
    setTimeTotal(durationMs);
    
    const updateTimer = () => {
      const now = new Date().getTime();
      const remaining = Math.max(0, targetTime - now);
      setTimeLeft(remaining);
    };
    
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  };

  useEffect(() => {
    if (order) {
      const cleanup = setupTimer(order);
      return cleanup;
    }
  }, [order?.created_at, settings?.estoreOrderTimerEnabled]);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock className="w-10 h-10 animate-pulse" />;
      case 'accepted': return <CheckCircle className="w-10 h-10" />;
      case 'preparing': return <ChefHat className="w-10 h-10 animate-bounce" />;
      case 'ready': return <Package className="w-10 h-10" />;
      case 'out_for_delivery': return <Truck className="w-10 h-10 animate-pulse" />;
      case 'delivered': return <CheckCircle className="w-10 h-10" />;
      case 'cancelled': return <XCircle className="w-10 h-10 text-red-500" />;
      default: return <Clock className="w-10 h-10" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return 'Waiting for confirmation...';
      case 'accepted': return 'Order accepted!';
      case 'preparing': return 'Preparing your order...';
      case 'ready': return 'Order is ready for dispatch!';
      case 'out_for_delivery': return 'Out for delivery!';
      case 'delivered': return 'Delivered successfully!';
      case 'cancelled': return 'Order cancelled';
      default: return 'Processing...';
    }
  };

  const status = order?.estore_status || 'pending';
  const showTimer = settings?.estoreOrderTimerEnabled && timeLeft > 0 && ['pending', 'accepted', 'preparing'].includes(status);
  const progressPercent = timeTotal > 0 ? ((timeTotal - timeLeft) / timeTotal) * 100 : 0;

  return (
    <div className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] flex flex-col items-center p-4 sm:p-8 pb-24">
      
      <div className="w-full max-w-2xl text-center mb-8 mt-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="w-24 h-24 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner relative">
          <div className="absolute inset-0 border-4 border-primary/20 rounded-full animate-ping opacity-50"></div>
          {getStatusIcon(status)}
        </div>
        <h1 className="text-4xl sm:text-5xl font-black mb-3 text-[var(--color-text)] tracking-tight">Thank You!</h1>
        <h2 className="text-2xl font-bold mb-3 opacity-90">{getStatusText(status)}</h2>
        <p className="text-[var(--color-text)] opacity-60 font-medium">
          Your Order ID: <span className="font-black text-[var(--color-text)] opacity-100 bg-black/5 dark:bg-white/5 px-3 py-1 rounded-lg ml-1">#{orderId}</span>
        </p>
      </div>

      <div className="w-full max-w-2xl bg-[var(--color-card-bg)] rounded-3xl p-6 sm:p-8 shadow-xl animate-in fade-in zoom-in-95 duration-500 delay-100 border border-black/5 dark:border-white/5">
        
        {showTimer && (
          <div className="w-full bg-black/5 dark:bg-white/5 rounded-2xl p-6 mb-8 border border-black/10 dark:border-white/10 text-center">
            <h3 className="text-xs font-bold text-[var(--color-text)] opacity-60 uppercase tracking-widest mb-3">Estimated Preparation Time</h3>
            <div className="text-5xl font-black text-primary font-mono tabular-nums mb-4 tracking-tighter">
              {formatTime(timeLeft)}
            </div>
            
            <div className="h-3 w-full bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-1000 ease-linear rounded-full" 
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Order Details */}
        {order && (
          <div className="space-y-6 text-left">
            <h3 className="text-lg font-black text-[var(--color-text)] border-b border-black/10 dark:border-white/10 pb-4 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-primary" /> Order Summary
            </h3>
            
            <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
              {(order.items || []).map((item: any, idx: number) => (
                <div key={idx} className="flex gap-4 items-center p-3 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5">
                  <div className="relative shrink-0 w-16 h-16 rounded-xl overflow-hidden bg-white dark:bg-black/50 flex items-center justify-center border border-black/10 dark:border-white/10">
                    {item.product?.image ? (
                      <img src={item.product.image} alt={item.product?.name || item.name} className="w-full h-full object-cover" />
                    ) : (
                      <ShoppingBag className="w-6 h-6 text-primary opacity-50" />
                    )}
                    <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-primary text-white text-[10px] font-black flex items-center justify-center shadow-md">
                      {item.quantity}
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-[var(--color-text)] text-sm md:text-base leading-tight">{item.product?.name || item.name}</p>
                    {item.selectedVariant && (
                      <p className="text-xs text-[var(--color-text)] opacity-60 font-bold mt-1">Variant: {item.selectedVariant}</p>
                    )}
                    {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {item.selectedModifiers.map((m: any, mIdx: number) => (
                          <span key={mIdx} className="text-[9px] bg-black/10 dark:bg-white/10 text-[var(--color-text)] px-2 py-0.5 rounded-full font-bold uppercase tracking-widest">
                            + {m.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0 pl-2 border-l border-black/10 dark:border-white/10">
                    <span className="font-black text-primary text-sm md:text-base block">{formatCurrency(item.subtotal || (item.price * item.quantity), settings?.currency)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-black/10 dark:border-white/10 pt-4 space-y-3">
              <div className="flex justify-between text-sm font-bold text-[var(--color-text)] opacity-60">
                <span>Total Amount</span>
                <span className="text-xl font-black text-primary opacity-100">{formatCurrency(order.total, settings?.currency)}</span>
              </div>
            </div>

            <div className="bg-black/5 dark:bg-white/5 rounded-2xl p-5 mt-6 space-y-3">
              <h4 className="font-bold text-[var(--color-text)] text-sm mb-3">Delivery Information</h4>
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-primary shrink-0" />
                <p className="text-sm font-bold text-[var(--color-text)] opacity-80">{order.delivery_address || 'Pickup'}</p>
              </div>
              {order.customer_phone && (
                <div className="flex items-center gap-3">
                  <Phone className="w-5 h-5 text-primary shrink-0" />
                  <p className="text-sm font-bold text-[var(--color-text)] opacity-80">{order.customer_phone}</p>
                </div>
              )}
            </div>

          </div>
        )}

        <button 
          onClick={() => navigate('/store')}
          className="w-full py-4 mt-8 bg-primary text-white rounded-2xl font-black text-lg hover:brightness-110 active:scale-95 transition-all shadow-md"
        >
          Continue Shopping
        </button>
      </div>
    </div>
  );
}
