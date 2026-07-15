import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { Bundle } from '../../types';
import { formatCurrency } from '../../lib/currencies';
import { ChevronRight, Flame, Timer } from 'lucide-react';

function Dealtimer({ bundle }: { bundle: any }) {
  const [display, setDisplay] = useState('');
  const [label, setLabel] = useState('Ends in');
  useEffect(() => {
    if (!bundle.scheduleType || bundle.scheduleType === 'always') return;
    const tick = () => {
      const now = new Date();
      let target: number | null = null;
      let isStart = false;
      if (bundle.startTime && bundle.endTime) {
        const [sh, sm] = bundle.startTime.split(':').map(Number);
        const [eh, em] = bundle.endTime.split(':').map(Number);
        const startToday = new Date(now); startToday.setHours(sh, sm, 0, 0);
        const endToday = new Date(now); endToday.setHours(eh, em, 0, 0);
        let sd = startToday.getTime() - now.getTime();
        let ed = endToday.getTime() - now.getTime();
        if (ed <= 0 && bundle.startTime > bundle.endTime) { endToday.setDate(endToday.getDate() + 1); ed = endToday.getTime() - now.getTime(); }
        if (sd > 0 && bundle.startTime > bundle.endTime) { startToday.setDate(startToday.getDate() - 1); sd = startToday.getTime() - now.getTime(); }
        if (sd > 0) { target = sd; isStart = true; } else if (ed > 0) target = ed;
      }
      if (!target && bundle.endDate) target = new Date(bundle.endDate + 'T23:59:59').getTime() - now.getTime();
      if (target && target > 0) {
        const h = Math.floor(target / 3600000);
        const m = Math.floor((target % 3600000) / 60000);
        const s = Math.floor((target % 60000) / 1000);
        setDisplay(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
        setLabel(isStart ? 'Starts in' : 'Ends in');
      } else setDisplay('');
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [bundle]);
  if (!display) return null;
  return (
    <div className="flex items-center gap-1 text-[9px] text-amber-600 dark:text-amber-400 font-black mt-1">
      <Timer className="h-2.5 w-2.5" />
      <span className="opacity-70">{label}</span>
      <span className="tabular-nums">{display}</span>
    </div>
  );
}

interface DealSizeSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupName: string;
  bundles: any[];
  currency: string;
  onSelect: (bundle: any) => void;
}

export function DealSizeSelectorModal({
  isOpen,
  onClose,
  groupName,
  bundles,
  currency,
  onSelect
}: DealSizeSelectorModalProps) {
  
  // Sort bundles by price ascending
  const sortedBundles = [...bundles].sort((a, b) => (a.finalPrice || 0) - (b.finalPrice || 0));

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={groupName} maxWidth="md">
      <div className="p-4 sm:p-5 space-y-3">
        <p className="text-xs text-gray-500 uppercase tracking-widest mb-4">
          Select Deal Size / Variant
        </p>
        
        <div className="space-y-3">
          {sortedBundles.map((bundle) => (
            <button
              key={bundle.id}
              onClick={() => {
                onSelect(bundle);
                onClose();
              }}
              className="w-full flex items-center justify-between p-4 rounded-xl border border-gray-200 dark:border-white/10 hover:border-violet-500 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-all text-left group shadow-sm hover:shadow-md"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {bundle.scheduleType === 'scheduled' && (
                    <span className="bg-amber-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0">
                      <Flame className="h-2.5 w-2.5" /> HOT
                    </span>
                  )}
                  <div className="font-black text-gray-900 dark:text-white uppercase tracking-wider text-sm truncate">
                    {bundle.variantName}
                  </div>
                </div>
                {bundle.isCombo && (
                  <div className="text-[10px] text-gray-500 mt-1 uppercase tracking-wider">
                    Includes {bundle.slots?.reduce((sum: number, slot: any) => sum + slot.requiredQuantity, 0) || 0} items
                  </div>
                )}
                {bundle.scheduleType === 'scheduled' && <Dealtimer bundle={bundle} />}
              </div>
              <div className="flex items-center gap-4 shrink-0 ml-3">
                <div className="font-black text-violet-600 dark:text-violet-400 text-base">
                  {formatCurrency(bundle.finalPrice, currency)}
                </div>
                <div className="h-8 w-8 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center group-hover:bg-violet-600 group-hover:text-white transition-colors">
                  <ChevronRight className="h-4 w-4" />
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
