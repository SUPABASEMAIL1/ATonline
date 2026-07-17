import { useState, useEffect } from 'react';
import { Topping } from '../../types';
import { toppingsService } from '../../lib/services';
import { Check } from 'lucide-react';

interface ToppingAssignmentPanelProps {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  loading?: boolean;
}

export default function ToppingAssignmentPanel({ selectedIds, onChange, loading: externalLoading }: ToppingAssignmentPanelProps) {
  const [toppings, setToppings] = useState<Topping[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    toppingsService.fetchAll()
      .then(setToppings)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(i => i !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  if (loading || externalLoading) {
    return (
      <div className="flex gap-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-8 w-24 rounded-full bg-gray-100 dark:bg-white/5 animate-pulse" />
        ))}
      </div>
    );
  }

  if (toppings.length === 0) {
    return <p className="text-xs text-gray-400 italic">No toppings configured. Add toppings in the database first.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {toppings.map(topping => {
        const isOn = selectedIds.includes(topping.id);
        return (
          <button
            key={topping.id}
            type="button"
            onClick={() => toggle(topping.id)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition-all active:scale-95 ${
              isOn
                ? 'bg-primary text-white shadow-sm'
                : 'bg-gray-100 dark:bg-white/5 text-default hover:bg-gray-200 dark:hover:bg-white/10 border border-transparent'
            }`}
          >
            {isOn && <Check className="h-3 w-3" />}
            {topping.name}
          </button>
        );
      })}
    </div>
  );
}
