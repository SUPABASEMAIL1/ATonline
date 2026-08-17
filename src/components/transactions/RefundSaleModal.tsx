import React, { useState, useMemo } from 'react';
import { Sale, RefundRequest } from '../../types';
import { Modal } from '../common/Modal';
import { RotateCcw, Minus, Plus, AlertTriangle } from 'lucide-react';
import { formatCurrency } from '../../lib/currencies';
import { useApp } from '../../context/SupabaseAppContext';
import { Button, SegmentedControl, Select } from '../../shared/ui';

interface RefundSaleModalProps {
  isOpen: boolean;
  onClose: () => void;
  sale: Sale;
  onConfirmRefund: (request: RefundRequest) => Promise<void>;
  isProcessing: boolean;
}

export default function RefundSaleModal({ isOpen, onClose, sale, onConfirmRefund, isProcessing }: RefundSaleModalProps) {
  const { state: { settings } } = useApp();
  const [refundMode, setRefundMode] = useState<'full' | 'partial'>('full');

  // Default refund method = original sale method (fall back to cash for split/cheque)
  const defaultMethod = (['cash', 'card', 'online', 'digital'].includes(sale.paymentMethod))
    ? sale.paymentMethod
    : 'cash';
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState(defaultMethod);

  // State for partial refunds: tracking how much of each item to refund
  const [partialQtys, setPartialQtys] = useState<Record<number, number>>({});

  const handleQtyChange = (index: number, newQty: number, maxQty: number) => {
    setPartialQtys(prev => ({
      ...prev,
      [index]: Math.max(0, Math.min(newQty, maxQty))
    }));
  };

  const calculatedPartialRefund = useMemo(() => {
    let total = 0;
    const items: RefundRequest['items'] = [];

    // Distribute bill-level discount and tax proportionally across items so a partial
    // refund reflects the ACTUAL net amount the customer paid (incl. tax, after ALL
    // discounts) — fixes B2 (was using item.subtotal which omits bill discount & tax).
    const sumSubtotal = (sale.items || []).reduce((s, i) => s + (Number(i.subtotal) || 0), 0) || 1;
    const billDiscount = Number(sale.discountAmount) || 0;
    const tax = Number(sale.taxAmount) || 0;

    (sale.items || []).forEach((item, index) => {
      const refundQty = partialQtys[index] || 0;
      if (refundQty > 0) {
        const itemShare = (Number(item.subtotal) || 0) / sumSubtotal;
        const netUnit = ((Number(item.subtotal) || 0) - itemShare * billDiscount + itemShare * tax) / (Math.abs(item.quantity) || 1);
        // MONEY RULE: round every money value to 2 decimal places.
        const unitPrice = Math.round(netUnit * 100) / 100;
        const refundAmount = Math.round(unitPrice * refundQty * 100) / 100;
        total = Math.round((total + refundAmount) * 100) / 100;
        items.push({
          index,
          productId: item.product.id,
          qty: refundQty,
          refundAmount
        });
      }
    });
    
    return { total, items };
  }, [partialQtys, sale.items]);

  const handleConfirm = () => {
    const refundMeta = { reason: reason.trim() || undefined, method };
    if (refundMode === 'full') {
      onConfirmRefund({
        type: 'full',
        items: [],
        totalRefundAmount: sale.total - (sale.refundedAmount || 0),
        ...refundMeta
      });
    } else {
      onConfirmRefund({
        type: 'partial',
        items: calculatedPartialRefund.items,
        totalRefundAmount: calculatedPartialRefund.total,
        ...refundMeta
      });
    }
  };

  const totalAvailableToRefund = sale.total - (sale.refundedAmount || 0);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Refund Sale"
      maxWidth="lg"
      showClose={!isProcessing}
    >
      <div className="p-4 space-y-4">
        <div className="bg-rose-50 dark:bg-rose-900/20 text-rose-800 dark:text-rose-300 p-3 rounded-xl flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <p className="text-sm">
            Refunding will restore stock for returned items and adjust revenue reports. This action cannot be undone.
          </p>
        </div>

        <SegmentedControl
          options={[
            { label: 'Full Refund', value: 'full' },
            { label: 'Partial Refund', value: 'partial' }
          ]}
          value={refundMode}
          onChange={(v) => setRefundMode(v as 'full' | 'partial')}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest">Refund Method</label>
            <Select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="!py-2.5"
            >
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="online">Online Wallet</option>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-1">
            <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest">Reason (Optional)</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Damaged item, wrong size..."
              className="input w-full text-[13px] font-medium py-2.5 px-3 bg-white dark:bg-black/20 rounded-xl border border-gray-200 dark:border-white/10 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            />
          </div>
        </div>

        {refundMode === 'partial' && (
          <div className="border border-gray-200 dark:border-dark-700 rounded-xl overflow-hidden">
            <div className="bg-gray-50 dark:bg-dark-800 px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
              Select items to refund
            </div>
            <div className="divide-y divide-gray-100 dark:divide-dark-700 max-h-60 overflow-y-auto overscroll-contain">
              {(sale.items || []).map((item, index) => {
                const maxQty = item.quantity - (item.refundedQuantity || 0);
                const currentRefundQty = partialQtys[index] || 0;
                
                if (maxQty <= 0) return null; // Already fully refunded

                return (
                  <div key={index} className="p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-300 text-[10px] font-bold shrink-0">{index + 1}</span>
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                          {item.product.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {formatCurrency((item.total || item.subtotal || 0) / item.quantity, settings?.currency || 'Rs')} each
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <Button
                        variant="ghost"
                        onClick={() => handleQtyChange(index, currentRefundQty - 1, maxQty)}
                        className="!min-h-0 !w-8 !h-8 !rounded-lg !bg-gray-100 dark:!bg-dark-700 !text-gray-700 dark:!text-gray-300 hover:!bg-gray-100 dark:hover:!bg-dark-700"
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <span className="w-6 text-center font-bold text-sm text-gray-900 dark:text-white">
                        {currentRefundQty}
                      </span>
                      <Button
                        variant="ghost"
                        onClick={() => handleQtyChange(index, currentRefundQty + 1, maxQty)}
                        className="!min-h-0 !w-8 !h-8 !rounded-lg !bg-gray-100 dark:!bg-dark-700 !text-gray-700 dark:!text-gray-300 hover:!bg-gray-100 dark:hover:!bg-dark-700"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="pt-4 border-t border-gray-100 dark:border-dark-700 flex justify-between items-center">
          <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Refund Amount</p>
          <p className={`text-xl font-black ${refundMode === 'full' ? 'text-rose-600' : 'text-amber-600'}`}>
            {formatCurrency(
              refundMode === 'full' ? totalAvailableToRefund : calculatedPartialRefund.total,
              settings?.currency || 'Rs'
            )}
          </p>
        </div>
      </div>
      
      <div className="p-4 border-t border-gray-100 dark:border-dark-700 flex gap-2">
        <Button
          variant="secondary"
          onClick={onClose}
          disabled={isProcessing}
          className="flex-1 !py-3 !rounded-xl !font-bold !bg-gray-100 dark:!bg-dark-700 !text-gray-700 dark:!text-gray-300 disabled:opacity-50"
        >
          Cancel
        </Button>
        <Button
          variant="danger"
          onClick={handleConfirm}
          disabled={isProcessing || (refundMode === 'partial' && calculatedPartialRefund.total <= 0)}
          className={`flex-1 !py-3 !rounded-xl !font-bold !shadow-lg disabled:opacity-50 ${refundMode === 'full' ? '!bg-rose-500 !shadow-rose-500/20' : '!bg-amber-500 !shadow-amber-500/20'}`}
        >
          <RotateCcw className={`h-5 w-5 ${isProcessing ? 'animate-spin' : ''}`} />
          {isProcessing ? 'Processing...' : 'Confirm Refund'}
        </Button>
      </div>
    </Modal>
  );
}
