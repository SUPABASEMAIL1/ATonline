import React, { useState, useMemo } from 'react';
import { Sale, RefundRequest } from '../../types';
import { Modal } from '../common/Modal';
import { RotateCcw, Minus, Plus, AlertTriangle } from 'lucide-react';
import { formatCurrency } from '../../lib/currencies';
import { useApp } from '../../context/SupabaseAppContext';

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
    
    (sale.items || []).forEach((item, index) => {
      const refundQty = partialQtys[index] || 0;
      if (refundQty > 0) {
        const unitPrice = item.quantity > 0 ? (item.total || item.subtotal || 0) / item.quantity : 0;
        const refundAmount = unitPrice * refundQty;
        total += refundAmount;
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
    if (refundMode === 'full') {
      onConfirmRefund({
        type: 'full',
        items: [],
        totalRefundAmount: sale.total - (sale.refundedAmount || 0)
      });
    } else {
      onConfirmRefund({
        type: 'partial',
        items: calculatedPartialRefund.items,
        totalRefundAmount: calculatedPartialRefund.total
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

        <div className="flex bg-gray-100 dark:bg-dark-700 p-1 rounded-xl">
          <button
            onClick={() => setRefundMode('full')}
            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${
              refundMode === 'full'
                ? 'bg-white dark:bg-dark-800 shadow text-rose-600'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            Full Refund
          </button>
          <button
            onClick={() => setRefundMode('partial')}
            className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${
              refundMode === 'partial'
                ? 'bg-white dark:bg-dark-800 shadow text-amber-600'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            Partial Refund
          </button>
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
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        {item.product.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {formatCurrency((item.total || item.subtotal || 0) / item.quantity, settings?.currency || 'Rs')} each
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleQtyChange(index, currentRefundQty - 1, maxQty)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-dark-700 text-gray-700 dark:text-gray-300 active:scale-95"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-6 text-center font-bold text-sm text-gray-900 dark:text-white">
                        {currentRefundQty}
                      </span>
                      <button
                        onClick={() => handleQtyChange(index, currentRefundQty + 1, maxQty)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-dark-700 text-gray-700 dark:text-gray-300 active:scale-95"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
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
        <button
          onClick={onClose}
          disabled={isProcessing}
          className="flex-1 py-3 bg-gray-100 dark:bg-dark-700 text-gray-700 dark:text-gray-300 font-bold rounded-xl active:scale-95 disabled:opacity-50 btn-md"
        >
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          disabled={isProcessing || (refundMode === 'partial' && calculatedPartialRefund.total <= 0)}
          className={`flex-1 py-3 font-bold rounded-xl flex items-center justify-center gap-2 text-white active:scale-95 disabled:opacity-50 btn-md shadow-lg ${
            refundMode === 'full' ? 'bg-rose-500 shadow-rose-500/20' : 'bg-amber-500 shadow-amber-500/20'
          }`}
        >
          <RotateCcw className={`h-5 w-5 ${isProcessing ? 'animate-spin' : ''}`} />
          {isProcessing ? 'Processing...' : 'Confirm Refund'}
        </button>
      </div>
    </Modal>
  );
}
