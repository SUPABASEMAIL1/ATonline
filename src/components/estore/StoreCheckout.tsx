import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { AppSettings, CartItem, Sale } from '../../types';
import { toRemoteSale } from '../../lib/services';
import { formatCurrency } from '../../lib/currencies';
import { ArrowLeft, CheckCircle, CheckCircle2, MapPin, AlertCircle, LocateFixed, User, Phone, Map as MapIcon, AlignLeft, Navigation, Clock } from 'lucide-react';
import { sonner } from '../../lib/sonner';
import { useEstoreAuth } from './useEstoreAuth';
import { formatTime12h } from '../../lib/timeFormat';

import { OrderTracker } from './OrderTracker';

function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2-lat1);
  const dLon = deg2rad(lon2-lon1); 
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2)
    ; 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c; // Distance in km
}

function deg2rad(deg: number) {
  return deg * (Math.PI/180);
}


interface StoreCheckoutProps {
  settings: AppSettings | null;
  cart: CartItem[];
  onClearCart: () => void;
  onUpdateCart: (index: number, quantity: number) => void;
}

export function StoreCheckout({ settings, cart, onClearCart, onUpdateCart }: StoreCheckoutProps) {
  const navigate = useNavigate();
  const { customer, loginOrRegister, isInitializing } = useEstoreAuth();
  
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('cash');

  function isTimeInWindow(st: string | undefined, et: string | undefined): boolean {
    if (!st || !et) return true;
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const [sh, sm] = st.split(':').map(Number);
    const [eh, em] = et.split(':').map(Number);
    const s = sh * 60 + sm, e = eh * 60 + em;
    return e > s ? (nowMin >= s && nowMin < e) : (nowMin >= s || nowMin < e);
  }

  const deliveryHoursOk = isTimeInWindow(settings?.deliveryStartTime, settings?.deliveryEndTime);
  const pickupHoursOk = isTimeInWindow(settings?.pickupStartTime, settings?.pickupEndTime);
  const shopHoursOk = isTimeInWindow(settings?.shopOpenTime, settings?.shopCloseTime);

  const isDeliveryEnabled = settings?.estoreDeliveryEnabled !== false;
  const isPickupEnabled = settings?.estorePickupEnabled === true;
  const deliverySelectable = isDeliveryEnabled && deliveryHoursOk;
  const pickupSelectable = isPickupEnabled && pickupHoursOk;

  const [fulfillmentMode, setFulfillmentMode] = useState<'delivery' | 'pickup'>('delivery');

  useEffect(() => {
    if (!deliverySelectable && pickupSelectable) {
      setFulfillmentMode('pickup');
    } else if (!pickupSelectable && deliverySelectable) {
      setFulfillmentMode('delivery');
    } else if (!deliverySelectable && !pickupSelectable) {
      // both unavailable — keep last selection
    } else if (fulfillmentMode === 'delivery' && !deliverySelectable) {
      setFulfillmentMode('pickup');
    } else if (fulfillmentMode === 'pickup' && !pickupSelectable) {
      setFulfillmentMode('delivery');
    }
  }, [deliverySelectable, pickupSelectable, fulfillmentMode]);

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address1: '',
    address2: '',
    notes: ''
  });
  
  const [position, setPosition] = useState<[number, number] | null>(null);

  // Set default payment method if COD is disabled
  useEffect(() => {
    if (settings?.estoreCodEnabled === false && settings?.estoreCustomPaymentEnabled) {
      setSelectedPaymentMethod('custom');
    }
  }, [settings?.estoreCodEnabled, settings?.estoreCustomPaymentEnabled]);

  useEffect(() => {
    const fetchLastOrder = async () => {
      if (customer) {
        try {
          const { data, error } = await supabase
            .from('sales')
            .select('delivery_address, customer_notes')
            .eq('customer_id', customer.id)
            .eq('sale_type', 'estore')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!error && data) {
            let addr1 = data.delivery_address || '';
            let addr2 = '';
            
            if (addr1.includes(' | Near: ')) {
              const parts = addr1.split(' | Near: ');
              addr1 = parts[0];
              addr2 = parts[1] || '';
            }

            setFormData(prev => ({
              ...prev,
              name: customer.name || prev.name,
              phone: customer.phone || prev.phone,
              address1: prev.address1 || addr1,
              address2: prev.address2 || addr2,
              notes: prev.notes || data.customer_notes || ''
            }));
          } else {
            setFormData(prev => ({
              ...prev,
              name: customer.name || prev.name,
              phone: customer.phone || prev.phone,
            }));
          }
        } catch (e) {
          console.error('Failed to fetch last order details for checkout prepopulation', e);
        }
      }
    };
    
    fetchLastOrder();
  }, [customer]);

  useEffect(() => {
    let isMounted = true;
    if (navigator.geolocation && !position) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (isMounted) setPosition([pos.coords.latitude, pos.coords.longitude]);
        },
        (err) => {
          console.warn("Geolocation failed on mount", err);
          if (isMounted) {
            if (settings?.estoreLocationLat && settings?.estoreLocationLng) {
              setPosition([settings.estoreLocationLat, settings.estoreLocationLng]);
            } else {
              setPosition([31.5204, 74.3587]); // Lahore roughly
            }
          }
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    } else if (!position) {
      if (settings?.estoreLocationLat && settings?.estoreLocationLng) {
        setPosition([settings.estoreLocationLat, settings.estoreLocationLng]);
      } else {
        setPosition([31.5204, 74.3587]);
      }
    }
    return () => { isMounted = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      sonner.error('Geolocation is not supported by your browser');
      return;
    }

    sonner.loading('Getting your location...', { id: 'geolocation' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition([pos.coords.latitude, pos.coords.longitude]);
        sonner.success('Location updated!', { id: 'geolocation' });
      },
      (err) => {
        sonner.error(`Failed to get location: ${err.message}`, { id: 'geolocation' });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.subtotal, 0);
  const deliveryFee = fulfillmentMode === 'delivery' ? (settings?.estoreDeliveryFee || 0) : 0;
  const total = cartTotal + deliveryFee;
  
  const isDeliveryAllowed = (): boolean => {
    if (fulfillmentMode === 'pickup') return true; // self-pickup is always allowed
    if (!settings?.estoreLocationLat || !settings?.estoreLocationLng || !settings?.estoreDeliveryRadius) return true; // No restriction if not set
    if (!position) return false;
    
    const distance = getDistanceFromLatLonInKm(
      settings.estoreLocationLat,
      settings.estoreLocationLng,
      position[0],
      position[1]
    );
    
    return distance <= settings.estoreDeliveryRadius;
  };

  const deliveryAllowed = isDeliveryAllowed();

  const modeHoursOk = fulfillmentMode === 'delivery' ? deliveryHoursOk : pickupHoursOk;
  const currentModeOk = shopHoursOk && modeHoursOk;
  const canOrder = currentModeOk && !(fulfillmentMode === 'delivery' && !deliveryAllowed) && cart.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) {
      sonner.error('Your cart is empty');
      return;
    }
    if (!canOrder) {
      if (!shopHoursOk && settings?.shopOpenTime && settings?.shopCloseTime) {
        sonner.error(`Store is currently closed. Opens at ${formatTime12h(settings.shopOpenTime)}.`);
      } else {
        const label = fulfillmentMode === 'delivery' ? 'Delivery' : 'Pickup';
        const st = fulfillmentMode === 'delivery' ? settings?.deliveryStartTime : settings?.pickupStartTime;
        const et = fulfillmentMode === 'delivery' ? settings?.deliveryEndTime : settings?.pickupEndTime;
        sonner.error(`${label} is currently unavailable (${formatTime12h(st)} – ${formatTime12h(et)}).`);
      }
      return;
    }

    if (fulfillmentMode === 'delivery' && !deliveryAllowed) {
      sonner.error('Sorry, this location is out of our delivery range.');
      return;
    }

    setLoading(true);
    try {
      if (!formData.name || !formData.phone) {
        throw new Error('Please fill Name and Phone Number.');
      }
      if (fulfillmentMode === 'delivery' && (!formData.address1 || !formData.address2)) {
        throw new Error('Please fill Delivery Address and Nearest Famous Place.');
      }
      
      let customerId = customer?.id;
      // Auto-register customer if they don't exist in local state
      if (!customerId) {
        const newCust = await loginOrRegister(formData.name, formData.phone);
        customerId = newCust?.id;
      }

      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const randomInt = Math.floor(1000 + Math.random() * 9000);
      const generatedInvoice = `WEB-${dateStr}-${randomInt}`;

      const saleData: Partial<Sale> = {
        id: crypto.randomUUID(),
        invoiceNumber: generatedInvoice,
        customerId: customerId,
        customerName: formData.name,
        customerPhone: formData.phone,
        deliveryAddress: fulfillmentMode === 'pickup' 
          ? 'SELF-PICKUP' 
          : (formData.address2.trim() ? `${formData.address1} | Near: ${formData.address2}` : formData.address1),
        customerNotes: selectedPaymentMethod === 'custom' && settings?.estoreCustomPaymentName
          ? `[${settings.estoreCustomPaymentName}]${formData.notes ? ' ' + formData.notes : ''}`
          : formData.notes || '',
        deliveryLocationLat: fulfillmentMode === 'pickup' ? undefined : (position ? position[0] : undefined),
        deliveryLocationLng: fulfillmentMode === 'pickup' ? undefined : (position ? position[1] : undefined),
        items: cart,
        subtotal: cartTotal,
        discountAmount: 0,
        taxAmount: 0,
        deliveryFee: deliveryFee,
        total: total,
        paymentMethod: (selectedPaymentMethod === 'custom' ? 'digital' : selectedPaymentMethod) as any,
        status: 'pending',
        cashier: 'ONLINE_STORE',
        timestamp: new Date(),
        createdAt: new Date(),
        estoreStatus: 'preparing',
        saleType: 'estore',
      };

      const remoteData = toRemoteSale(saleData);

      const { error } = await supabase.from('sales').insert(remoteData);
      if (error) throw error;

      setOrderId(generatedInvoice);
      localStorage.setItem('active_estore_order', generatedInvoice);
      setSuccess(true);
      onClearCart();
      navigate(`/store/track?id=${generatedInvoice}`);

    } catch (err: any) {
      console.error(err);
      sonner.error(err.message || 'Failed to place order');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return null; // Will navigate away
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)] pb-24" style={{ '--color-primary': settings?.estoreThemeColor || '#10b981' } as React.CSSProperties}>
      <header className="sticky top-0 z-50 bg-[var(--color-card-bg)] border-b border-gray-100 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-4">
          <button onClick={() => navigate('/store')} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <ArrowLeft className="w-6 h-6 text-gray-700" />
          </button>
          <h1 className="font-black text-xl tracking-tight text-[var(--color-text)]">Checkout</h1>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 flex flex-col lg:flex-row gap-8">
        
        {/* Checkout Form */}
        <div className="flex-1 space-y-6">
          {/* Fulfillment Mode Selector (KFC Style) */}
          <div className="grid grid-cols-2 gap-3 p-2 bg-[var(--color-card-bg)] rounded-[2rem] border border-gray-100 shadow-sm">
            <button
              type="button"
              onClick={() => deliverySelectable && setFulfillmentMode('delivery')}
              className={`py-4 rounded-2xl font-black text-sm uppercase tracking-wider flex flex-col items-center justify-center gap-1 transition-all ${
                !deliverySelectable
                  ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                  : fulfillmentMode === 'delivery'
                    ? 'bg-primary text-white shadow-lg'
                    : 'text-[var(--color-text)] opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5'
              }`}
              title={!deliverySelectable && settings?.deliveryStartTime && settings?.deliveryEndTime ? `Delivery available ${formatTime12h(settings.deliveryStartTime)} – ${formatTime12h(settings.deliveryEndTime)}` : ''}
            >
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                Delivery
              </div>
              {!deliverySelectable && deliveryHoursOk === false && settings?.deliveryStartTime && (
                <span className="text-[8px] font-medium opacity-60 flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5" /> {formatTime12h(settings.deliveryStartTime)} – {formatTime12h(settings.deliveryEndTime)}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => pickupSelectable && setFulfillmentMode('pickup')}
              className={`py-4 rounded-2xl font-black text-sm uppercase tracking-wider flex flex-col items-center justify-center gap-1 transition-all ${
                !pickupSelectable
                  ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                  : fulfillmentMode === 'pickup'
                    ? 'bg-primary text-white shadow-lg'
                    : 'text-[var(--color-text)] opacity-70 hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/5'
              }`}
              title={!pickupSelectable && settings?.pickupStartTime && settings?.pickupEndTime ? `Pickup available ${formatTime12h(settings.pickupStartTime)} – ${formatTime12h(settings.pickupEndTime)}` : ''}
            >
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
                Self Pickup
              </div>
              {!pickupSelectable && pickupHoursOk === false && settings?.pickupStartTime && (
                <span className="text-[8px] font-medium opacity-60 flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5" /> {formatTime12h(settings.pickupStartTime)} – {formatTime12h(settings.pickupEndTime)}
                </span>
              )}
            </button>
          </div>

          <div className="bg-[var(--color-card-bg)] rounded-3xl p-6 sm:p-8 shadow-sm border border-gray-100 relative">
            {!canOrder && (
              <div className="absolute inset-0 z-10 bg-white/80 dark:bg-black/80 backdrop-blur-sm rounded-3xl flex flex-col items-center justify-center p-6 text-center">
                <Clock className="w-10 h-10 text-amber-500 mb-3" />
                <p className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight">
                  Ordering Unavailable
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-xs">
                  {!shopHoursOk && settings?.shopOpenTime && settings?.shopCloseTime
                    ? `Store is currently closed. Reopens at ${formatTime12h(settings.shopOpenTime)}.`
                    : `${fulfillmentMode === 'delivery' ? 'Delivery' : 'Pickup'} is currently outside operating hours.`}
                </p>
                <p className="text-[10px] text-gray-400 mt-2">
                  Your cart items are saved — you can complete the order once the store reopens.
                </p>
              </div>
            )}
            <h2 className="text-2xl font-black text-[var(--color-text)] mb-6 flex items-center gap-3">
              <MapPin className="w-6 h-6 text-primary" /> {fulfillmentMode === 'pickup' ? 'Pickup Contact Details' : 'Delivery Details'}
            </h2>
            <form id="checkout-form" onSubmit={handleSubmit} className={`space-y-4 ${!canOrder ? 'pointer-events-none opacity-40' : ''}`}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center gap-2 text-sm font-black text-[var(--color-text)] opacity-80 mb-2">
                    <User className="w-4 h-4 text-primary" /> Full Name *
                  </label>
                  <input 
                    type="text" 
                    required
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-[var(--color-bg)] border border-gray-200/20 rounded-xl px-4 py-3.5 focus:ring-2 focus:ring-primary font-medium text-[var(--color-text)] placeholder-gray-400"
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-2 text-sm font-black text-[var(--color-text)] opacity-80 mb-2">
                    <Phone className="w-4 h-4 text-primary" /> Phone Number *
                  </label>
                  <input 
                    type="tel" 
                    required
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full bg-[var(--color-bg)] border border-gray-200/20 rounded-xl px-4 py-3.5 focus:ring-2 focus:ring-primary font-medium text-[var(--color-text)] placeholder-gray-400"
                    placeholder="0300 1234567"
                  />
                </div>
              </div>
              
              {fulfillmentMode === 'delivery' && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="flex items-center gap-2 text-sm font-black text-[var(--color-text)] opacity-80 mb-2">
                        <MapIcon className="w-4 h-4 text-primary" /> Detailed Delivery Address *
                      </label>
                      <textarea 
                        required
                        value={formData.address1}
                        onChange={e => setFormData({ ...formData, address1: e.target.value })}
                        className="w-full bg-[var(--color-bg)] border border-gray-200/20 rounded-xl px-4 py-3.5 focus:ring-2 focus:ring-primary font-medium min-h-[80px] resize-none text-[var(--color-text)] placeholder-gray-400"
                        placeholder="House 123, Street 4, Area, City"
                      />
                    </div>
                    <div>
                      <label className="flex items-center gap-2 text-sm font-black text-[var(--color-text)] opacity-80 mb-2">
                        <MapPin className="w-4 h-4 text-primary" /> Nearest Famous Place *
                      </label>
                      <textarea 
                        required
                        value={formData.address2}
                        onChange={e => setFormData({ ...formData, address2: e.target.value })}
                        className="w-full bg-[var(--color-bg)] border border-gray-200/20 rounded-xl px-4 py-3.5 focus:ring-2 focus:ring-primary font-medium min-h-[80px] resize-none text-[var(--color-text)] placeholder-gray-400"
                        placeholder="e.g. Opposite Main Park / Near Grand Mosque"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2 mt-4">
                      <label className="flex items-center gap-2 text-sm font-black text-[var(--color-text)] opacity-80">
                        <LocateFixed className="w-4 h-4 text-primary" /> Delivery Location *
                      </label>
                      <button
                        type="button"
                        onClick={handleGetCurrentLocation}
                        className="flex items-center gap-1.5 text-sm font-bold text-primary hover:text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        <LocateFixed className="w-4 h-4" />
                        Detect Location
                      </button>
                    </div>
                    
                    {position ? (
                      <div className={`p-4 rounded-xl border-2 flex items-center justify-between ${!deliveryAllowed ? 'border-red-500 bg-red-50' : 'border-emerald-500 bg-emerald-50'}`}>
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-full ${!deliveryAllowed ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                            {deliveryAllowed ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                          </div>
                          <div>
                            <p className={`font-bold text-sm ${!deliveryAllowed ? 'text-red-700' : 'text-emerald-700'}`}>
                              {deliveryAllowed ? 'Location Acquired & Verified' : 'Out of Delivery Range'}
                            </p>
                            <p className={`text-xs ${!deliveryAllowed ? 'text-red-600' : 'text-emerald-600'}`}>
                              {deliveryAllowed 
                                ? 'Your delivery location has been successfully pinned.' 
                                : `Sorry, you are outside our ${settings?.estoreDeliveryRadius}km delivery area.`}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 rounded-xl border-2 border-dashed border-orange-300 bg-orange-50 flex flex-col items-center justify-center text-center gap-2">
                        <MapPin className="w-6 h-6 text-orange-500 mb-1" />
                        <p className="text-sm font-bold text-orange-700">Location Required</p>
                        <p className="text-xs text-orange-600 max-w-xs">Please click "Detect Location" to verify if you are within our delivery area before checking out.</p>
                      </div>
                    )}
                  </div>
                </>
              )}

              <div>
                <label className="flex items-center gap-2 text-sm font-black text-[var(--color-text)] opacity-80 mb-2 mt-4">
                  <AlignLeft className="w-4 h-4 text-primary" /> Order Notes
                </label>
                <textarea 
                  value={formData.notes}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full bg-[var(--color-bg)] border border-gray-200/20 rounded-xl px-4 py-3.5 focus:ring-2 focus:ring-primary font-medium min-h-[80px] text-[var(--color-text)] placeholder-gray-400"
                  placeholder="E.g. Less spicy, call before arriving..."
                />
              </div>

              {fulfillmentMode === 'pickup' && settings?.storeLatitude && settings?.storeLongitude && (
                <div className="p-5 bg-emerald-50/50 dark:bg-emerald-900/10 rounded-2xl border border-emerald-200 dark:border-emerald-900/30 space-y-3">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    <h3 className="text-sm font-black text-emerald-800 dark:text-emerald-300">Pickup Location</h3>
                  </div>
                  <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 leading-relaxed">
                    {settings?.storeAddress || `${settings?.storeLatitude}, ${settings?.storeLongitude}`}
                  </p>
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${settings.storeLatitude},${settings.storeLongitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all"
                  >
                    <Navigation className="w-4 h-4" /> Get Directions
                  </a>
                </div>
              )}

              {/* Payment Methods */}
              {(settings?.estoreCodEnabled !== false || settings?.estoreCustomPaymentEnabled) && (
                <div className="mt-8">
                  <h3 className="text-lg font-black text-[var(--color-text)] mb-4">Payment Method</h3>
                  <div className="grid gap-3">
                    {settings?.estoreCodEnabled !== false && (
                      <label className={`relative flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${selectedPaymentMethod === 'cash' ? 'border-primary bg-primary/5' : 'border-gray-100 dark:border-white/5 bg-[var(--color-bg)] hover:border-primary/30'}`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedPaymentMethod === 'cash' ? 'border-primary' : 'border-gray-300'}`}>
                            {selectedPaymentMethod === 'cash' && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                          </div>
                          <div>
                            <span className="font-bold text-[var(--color-text)] block">Cash on Delivery</span>
                            <span className="text-xs text-[var(--color-text)] opacity-60">Pay when you receive the order</span>
                          </div>
                        </div>
                        <input type="radio" name="paymentMethod" value="cash" checked={selectedPaymentMethod === 'cash'} onChange={(e) => setSelectedPaymentMethod(e.target.value)} className="sr-only" />
                      </label>
                    )}
                    
                    {settings?.estoreCustomPaymentEnabled && (
                      <label className={`relative flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${selectedPaymentMethod === 'custom' ? 'border-primary bg-primary/5' : 'border-gray-100 dark:border-white/5 bg-[var(--color-bg)] hover:border-primary/30'}`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedPaymentMethod === 'custom' ? 'border-primary' : 'border-gray-300'}`}>
                            {selectedPaymentMethod === 'custom' && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                          </div>
                          <div>
                            <span className="font-bold text-[var(--color-text)] block">{settings?.estoreCustomPaymentName || 'Bank Transfer'}</span>
                            <span className="text-xs text-[var(--color-text)] opacity-60">Pay online in advance</span>
                          </div>
                        </div>
                        <input type="radio" name="paymentMethod" value="custom" checked={selectedPaymentMethod === 'custom'} onChange={(e) => setSelectedPaymentMethod(e.target.value)} className="sr-only" />
                      </label>
                    )}
                  </div>
                  
                  {selectedPaymentMethod === 'custom' && settings?.estoreCustomPaymentDetail && (
                    <div className="mt-4 p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30 text-sm">
                      <p className="font-bold text-blue-900 dark:text-blue-200 mb-2">Payment Details:</p>
                      <pre className="font-sans whitespace-pre-wrap text-blue-800 dark:text-blue-300">{settings.estoreCustomPaymentDetail}</pre>
                      {settings.estoreCustomPaymentNote && (
                        <p className="mt-3 text-xs font-bold text-blue-700 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40 p-2 rounded-lg inline-block">
                          {settings.estoreCustomPaymentNote}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </form>
          </div>
        </div>

        {/* Order Summary */}
        <div className="w-full lg:w-[420px] shrink-0">
          <div className="bg-[var(--color-card-bg)] rounded-3xl p-6 shadow-sm border border-gray-100 sticky top-24">
            <h2 className="text-xl font-black text-[var(--color-text)] mb-6">Order Summary</h2>
            <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2 no-scrollbar">
              {(() => {
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

                return (
                  <div className="space-y-4 w-full">
                    {/* Render Deals */}
                    {Array.from(bundlesMap.values()).map(b => (
                      <div key={b.bundleId} className="p-4 rounded-2xl border border-dashed border-primary/20 bg-primary/[0.02] space-y-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="bg-primary text-white text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md inline-block mb-1">🎁 DEAL</span>
                            <h4 className="font-bold text-[var(--color-text)] text-sm uppercase leading-tight">{b.bundleName}</h4>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-black text-primary text-sm block">{formatCurrency(b.totalSubtotal, settings?.currency)}</span>
                            <span className="text-[10px] font-bold text-[var(--color-text)] opacity-50 block mt-0.5">Qty: {b.items[0]?.quantity || 1}</span>
                          </div>
                        </div>
                        <div className="space-y-1.5 border-t border-black/5 dark:border-white/5 pt-2">
                          {b.items.map((item, idx) => (
                            <div key={idx} className="flex gap-2 items-center text-xs">
                              {item.product.image ? (
                                <img src={item.product.image} alt={item.product.name} className="w-7 h-7 rounded-lg object-cover shrink-0" />
                              ) : (
                                <div className="w-7 h-7 bg-black/5 rounded-lg flex items-center justify-center font-bold text-[var(--color-text)] opacity-30 shrink-0">
                                  {item.product.name.charAt(0)}
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="font-bold text-[var(--color-text)] truncate">{item.product.name}</p>
                                {item.selectedVariant && (
                                  <p className="text-[10px] text-[var(--color-text)] opacity-50 truncate">{item.selectedVariant}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}

                    {/* Render Standalone Items */}
                    {standaloneItems.map((item, idx) => (
                      <div key={idx} className="flex gap-4 items-center">
                        {item.product.image ? (
                          <img src={item.product.image} alt={item.product.name} className="w-14 h-14 rounded-xl object-cover shrink-0" />
                        ) : (
                          <div className="w-14 h-14 bg-gray-100 rounded-xl flex items-center justify-center font-black text-gray-300 shrink-0">
                            {item.product.name.charAt(0)}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <span className="font-bold text-[var(--color-text)] block leading-tight truncate">{item.product.name}</span>
                          {item.selectedVariant && (
                            <span className="text-xs text-[var(--color-text)] opacity-60 block mt-0.5 font-medium truncate">{item.selectedVariant}</span>
                          )}
                          {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                            <span className="text-xs text-[var(--color-text)] opacity-50 block mt-0.5 truncate">
                              + {item.selectedModifiers.map(m => m.name).join(', ')}
                            </span>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-black text-[var(--color-text)] block">{formatCurrency(item.subtotal, settings?.currency)}</span>
                          <span className="text-xs font-bold text-[var(--color-text)] opacity-50 block mt-0.5">Qty: {item.quantity}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
            
            <div className="border-t border-gray-100 mt-6 pt-6 space-y-3">
              <div className="flex justify-between text-sm font-bold text-[var(--color-text)] opacity-60">
                <span>Subtotal</span>
                <span>{formatCurrency(cartTotal, settings?.currency)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-[var(--color-text)] opacity-60">
                <span>Delivery Fee</span>
                <span>{formatCurrency(deliveryFee, settings?.currency)}</span>
              </div>
              <div className="flex justify-between text-xl font-black text-[var(--color-text)] pt-3 border-t border-gray-100 mt-3">
                <span>Total</span>
                <span className="text-primary">{formatCurrency(total, settings?.currency)}</span>
              </div>
            </div>

            <button 
              type="submit"
              form="checkout-form"
              disabled={loading || !canOrder}
              className="w-full py-4 mt-8 bg-primary text-white rounded-2xl font-black text-lg hover:brightness-90 active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2 shadow-lg"
            >
              {loading ? (
                <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
              ) : !canOrder ? (
                'Currently Unavailable'
              ) : (
                `Place Order ${selectedPaymentMethod === 'cash' ? '(COD)' : ''}`
              )}
            </button>
          </div>
        </div>

      </main>
    </div>
  );
}
