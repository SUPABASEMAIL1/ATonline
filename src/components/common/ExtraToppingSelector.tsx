import { useState, useEffect } from 'react';
import { Plus, Check } from 'lucide-react';
import { Topping, CartItemTopping } from '../../types';
import { toppingsService } from '../../lib/services';

interface ExtraToppingSelectorProps {
  selectedToppings: CartItemTopping[];
  onChange: (toppings: CartItemTopping[]) => void;
  size?: 'small' | 'medium' | 'large';
  allowedToppingIds?: string[];
  toppings?: Topping[]; // if provided, uses this list instead of fetching from DB
}

export default function ExtraToppingSelector({ selectedToppings, onChange, size = 'medium', allowedToppingIds, toppings: propToppings }: ExtraToppingSelectorProps) {
  const [dbToppings, setDbToppings] = useState<Topping[]>([]);
  const [loading, setLoading] = useState(true);

  const allToppings = propToppings || dbToppings;

  useEffect(() => {
    if (propToppings) {
      setLoading(false);
      return;
    }
    toppingsService.fetchAll()
      .then(setDbToppings)
      .catch(() => setDbToppings([]))
      .finally(() => setLoading(false));
  }, [propToppings]);

  const getPriceKey = (): 'priceSmall' | 'priceMedium' | 'priceLarge' => {
    if (size === 'small') return 'priceSmall';
    if (size === 'large') return 'priceLarge';
    return 'priceMedium';
  };

  const toggleTopping = (topping: Topping) => {
    const priceKey = getPriceKey();
    const price = topping[priceKey];
    const exists = selectedToppings.find(t => t.toppingId === topping.id);
    if (exists) {
      onChange(selectedToppings.filter(t => t.toppingId !== topping.id));
    } else {
      onChange([...selectedToppings, { toppingId: topping.id, name: topping.name, price }]);
    }
  };

  const visibleToppings = allowedToppingIds
    ? allToppings.filter(t => allowedToppingIds.includes(t.id))
    : allToppings;

  if (loading) return (
    <div className="flex flex-wrap gap-2 min-h-[36px]">
      {[1, 2, 3].map(i => (
        <div key={i} className="h-9 w-28 rounded-full animate-pulse bg-gray-200 dark:bg-zinc-700" />
      ))}
    </div>
  );

  if (visibleToppings.length === 0) return null;

  return (
    <div>
      <p className="text-xs font-bold text-default mb-2 uppercase tracking-wider">Extra Toppings</p>
      <div className="flex flex-wrap gap-2">
        {visibleToppings.map(topping => {
          const priceKey = getPriceKey();
          const price = topping[priceKey];
          const isSelected = selectedToppings.some(t => t.toppingId === topping.id);
          return (
            <button
              key={topping.id}
              type="button"
              onClick={() => toggleTopping(topping)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-all active:scale-95 ${
                isSelected
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 dark:bg-white/5 text-default hover:bg-gray-200 dark:hover:bg-white/10'
              }`}
            >
              {isSelected ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
              {topping.name}
              <span className="opacity-70">+Rs {price}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
