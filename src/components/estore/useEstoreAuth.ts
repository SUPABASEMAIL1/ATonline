import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Customer } from '../../types';

export const useEstoreAuth = () => {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // Initialize from local storage
  useEffect(() => {
    const initAuth = async () => {
      try {
        const storedPhone = localStorage.getItem('estore_customer_phone');
        if (storedPhone) {
          await lookupCustomer(storedPhone);
        }
      } catch (err) {
        console.error('Failed to init estore auth', err);
      } finally {
        setIsInitializing(false);
      }
    };
    initAuth();
  }, []);

  const lookupCustomer = async (phone: string) => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('phone', phone)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const cust: Customer = {
          id: data.id,
          name: data.name,
          phone: data.phone,
          email: data.email,
          createdAt: new Date(data.created_at)
        };
        setCustomer(cust);
        localStorage.setItem('estore_customer_phone', cust.phone);
        return cust;
      }
      return null;
    } catch (err) {
      console.error('Error looking up customer', err);
      return null;
    }
  };

  const loginOrRegister = async (name: string, phone: string) => {
    try {
      let cust = await lookupCustomer(phone);
      if (!cust) {
        // Register new customer
        const { data, error } = await supabase
          .from('customers')
          .insert({ name, phone })
          .select()
          .single();
          
        if (error) throw error;
        
        cust = {
          id: data.id,
          name: data.name,
          phone: data.phone,
          email: data.email,
          createdAt: new Date(data.created_at)
        };
      } else if (cust.name !== name) {
         // Update name if they entered a different one
         const { error } = await supabase
          .from('customers')
          .update({ name })
          .eq('id', cust.id);
         if (!error) {
           cust.name = name;
         }
      }
      
      setCustomer(cust);
      localStorage.setItem('estore_customer_phone', cust.phone);
      return cust;
    } catch (err) {
      console.error('Error in login/register', err);
      throw err;
    }
  };

  const logout = () => {
    setCustomer(null);
    localStorage.removeItem('estore_customer_phone');
  };

  return {
    customer,
    isInitializing,
    lookupCustomer,
    loginOrRegister,
    logout
  };
};
