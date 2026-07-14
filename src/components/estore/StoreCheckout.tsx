import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { AppSettings, CartItem, Sale } from '../../types';
import { toRemoteSale } from '../../lib/services';
import { formatCurrency } from '../../lib/currencies';
import { ArrowLeft, CheckCircle, CheckCircle2, MapPin, AlertCircle, LocateFixed, User, Phone, Map, AlignLeft } from 'lucide-react';
import { sonner } from '../../lib/sonner';
import { useEstoreAuth } from './useEstoreAuth';

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

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address1: '',
    address2: '',
    notes: ''
  });
  
  const [position, setPosition] = useState<[number, number] | null>(null);

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
  const deliveryFee = 0; // Or fetch from settings if you add it later
  const total = cartTotal + deliveryFee;
  
  const isDeliveryAllowed = (): boolean => {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) {
      sonner.error('Your cart is empty');
      return;
    }

    if (!deliveryAllowed) {
      sonner.error('Sorry, this location is out of our delivery range.');
      return;
    }

    setLoading(true);
    try {
      if (!formData.name || !formData.phone || !formData.address1 || !formData.address2 || !formData.notes) {
        throw new Error('Please fill all required fields including Nearest Famous Place and Order Notes.');
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
        deliveryAddress: formData.address2.trim() ? `${formData.address1} | Near: ${formData.address2}` : formData.address1,
        customerNotes: formData.notes,
        deliveryLocationLat: position ? position[0] : undefined,
        deliveryLocationLng: position ? position[1] : undefined,
        items: cart,
        subtotal: cartTotal,
        discountAmount: 0,
        taxAmount: 0,
        total: total,
        paymentMethod: 'cash',
        status: 'pending',
        cashier: 'ONLINE_STORE',
        timestamp: new Date(),
        createdAt: new Date(),
        estoreStatus: 'pending',
        saleType: 'estore',
      };

      const remoteData = toRemoteSale(saleData);

      const { error } = await supabase.from('sales').insert(remoteData);
      if (error) throw error;

      setOrderId(generatedInvoice);
      setSuccess(true);
      onClearCart();

    } catch (err: any) {
      console.error(err);
      sonner.error(err.message || 'Failed to place order');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return <OrderTracker orderId={orderId} settings={settings} />;
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
          <div className="bg-[var(--color-card-bg)] rounded-3xl p-6 sm:p-8 shadow-sm border border-gray-100">
            <h2 className="text-2xl font-black text-[var(--color-text)] mb-6 flex items-center gap-3">
              <MapPin className="w-6 h-6 text-primary" /> Delivery Details
            </h2>
            <form id="checkout-form" onSubmit={handleSubmit} className="space-y-4">
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
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center gap-2 text-sm font-black text-[var(--color-text)] opacity-80 mb-2">
                    <Map className="w-4 h-4 text-primary" /> Detailed Delivery Address *
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

              <div>
                <label className="flex items-center gap-2 text-sm font-black text-[var(--color-text)] opacity-80 mb-2 mt-4">
                  <AlignLeft className="w-4 h-4 text-primary" /> Order Notes *
                </label>
                <textarea 
                  required
                  value={formData.notes}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full bg-[var(--color-bg)] border border-gray-200/20 rounded-xl px-4 py-3.5 focus:ring-2 focus:ring-primary font-medium min-h-[80px] text-[var(--color-text)] placeholder-gray-400"
                  placeholder="E.g. Less spicy, call before arriving..."
                />
              </div>
            </form>
          </div>
        </div>

        {/* Order Summary */}
        <div className="w-full lg:w-[420px] shrink-0">
          <div className="bg-[var(--color-card-bg)] rounded-3xl p-6 shadow-sm border border-gray-100 sticky top-24">
            <h2 className="text-xl font-black text-[var(--color-text)] mb-6">Order Summary</h2>
            <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2 no-scrollbar">
              {cart.map((item, idx) => (
                <div key={idx} className="flex gap-4 items-center">
                  {item.product.image ? (
                    <img src={item.product.image} alt={item.product.name} className="w-14 h-14 rounded-xl object-cover shrink-0" />
                  ) : (
                    <div className="w-14 h-14 bg-gray-100 rounded-xl flex items-center justify-center font-black text-gray-300 shrink-0">
                      {item.product.name.charAt(0)}
                    </div>
                  )}
                  <div className="flex-1">
                    <span className="font-bold text-[var(--color-text)] block leading-tight">{item.product.name}</span>
                    {item.selectedVariant && (
                      <span className="text-xs text-[var(--color-text)] opacity-60 block mt-0.5 font-medium">{item.selectedVariant}</span>
                    )}
                    {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                      <span className="text-xs text-[var(--color-text)] opacity-50 block mt-0.5">
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
              disabled={loading || cart.length === 0 || !deliveryAllowed}
              className="w-full py-4 mt-8 bg-primary text-white rounded-2xl font-black text-lg hover:brightness-90 active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2 shadow-lg"
            >
              {loading ? (
                <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
              ) : (
                'Place Order (COD)'
              )}
            </button>
          </div>
        </div>

      </main>
    </div>
  );
}
