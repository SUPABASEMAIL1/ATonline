import { Keyboard, Search, ShoppingBag, RefreshCw, FileText, Trash2, CreditCard, Check, X, Layers } from 'lucide-react';
import { Modal } from '../common/Modal';
import { useTranslation } from '../../hooks/useTranslation';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShortcutsModal({ isOpen, onClose }: ShortcutsModalProps) {
  const { t } = useTranslation();

  const terminalShortcuts = [
    { key: 'F3 or /', label: t('focus_search', 'Focus Search'), desc: t('focus_search_desc', 'Instantly focuses the product search bar to start scanning or typing.'), icon: Search },
    { key: 'F2', label: t('open_checkout', 'Open Checkout'), desc: t('open_checkout_desc', 'Open the checkout and settlement screen when items are in the cart.'), icon: CreditCard },
    { key: 'F4', label: t('hold_order', 'Hold Order / Save Draft'), desc: t('hold_order_desc', 'Saves the current cart session as a draft to retrieve it later.'), icon: FileText },
    { key: 'F5', label: t('new_tab', 'New Cart Tab'), desc: t('new_tab_desc', 'Creates a new active cart tab for multitasking multiple clients.'), icon: Layers },
    { key: 'F6', label: t('toggle_return_mode', 'Toggle Return Mode'), desc: t('toggle_return_mode_desc', 'Switches the POS between standard sales mode and customer return mode.'), icon: RefreshCw },
    { key: 'F7', label: t('open_drafts', 'Open Draft Archives'), desc: t('open_drafts_desc', 'Opens the list of saved/suspended drafts to resume checkout.'), icon: ShoppingBag },
    { key: 'Ctrl + Del', label: t('clear_cart', 'Clear Entire Cart'), desc: t('clear_cart_desc', 'Wipes out all items currently inside the active cart session.'), icon: Trash2 },
  ];

  const checkoutShortcuts = [
    { key: '1', label: t('method_cash', 'Select Cash'), desc: t('method_cash_desc', 'Select Cash as the payment method for the current sale.'), icon: CreditCard },
    { key: '2', label: t('method_card', 'Select Card'), desc: t('method_card_desc', 'Select Card payment method for digital terminal swipe.'), icon: CreditCard },
    { key: '3', label: t('method_digital', 'Select Digital'), desc: t('method_digital_desc', 'Select Digital/E-Transfer/Mobile Wallet payment method.'), icon: CreditCard },
    { key: '4', label: t('method_credit', 'Select Credit'), desc: t('method_credit_desc', 'Select Customer Credit Ledger to record the transaction as amount due.'), icon: CreditCard },
    { key: '5', label: t('method_split', 'Select Split Payment'), desc: t('method_split_desc', 'Switch to split/mixed payment modes (e.g. Cash + Card).'), icon: CreditCard },
    { key: 'E', label: t('exact_amount', 'Exact Amount Match'), desc: t('exact_amount_desc', 'Auto-fill the received amount to match the final net total.'), icon: Check },
    { key: 'Enter', label: t('process_payment', 'Process & Save Sale'), desc: t('process_payment_desc', 'Complete payment verification and record sale to database.'), icon: Check },
    { key: 'Esc', label: t('cancel_checkout', 'Cancel / Close'), desc: t('cancel_checkout_desc', 'Dismiss checkout pop-up and return back to POS cart view.'), icon: X },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('keyboard_shortcuts_guide', 'Keyboard Shortcuts Guide')}
      subtitle={t('keyboard_shortcuts_subtitle', 'Master these keys for lightning fast checkout speeds')}
      maxWidth="lg"
      footer={
        <div className="flex items-center justify-end w-full">
          <button
            onClick={onClose}
            className="w-full sm:w-auto sm:min-w-[240px] px-4 sm:px-8 py-2.5 sm:py-3.5 rounded-2xl text-[9px] sm:text-[11px] font-black uppercase tracking-widest bg-gray-200 dark:bg-white/5 text-gray-700 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white transition-all active:scale-95"
          >
            {t('dismiss_guide', 'Close Guide')}
          </button>
        </div>
      }
    >
      <div className="space-y-8 min-h-[350px]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* POS Terminal Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-gray-100 dark:border-white/5">
              <Keyboard className="w-4 h-4 text-primary" />
              <h3 className="text-xs font-black uppercase tracking-widest text-gray-900 dark:text-white">
                {t('pos_terminal_section', 'POS Terminal screen')}
              </h3>
            </div>
            <div className="space-y-3">
              {terminalShortcuts.map((shortcut) => {
                const Icon = shortcut.icon;
                return (
                  <div 
                    key={shortcut.key} 
                    className="p-3 rounded-2xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5 flex items-start gap-3 hover:border-primary/20 transition-all"
                  >
                    <div className="p-2 rounded-xl bg-white dark:bg-white/5 border border-gray-200 dark:border-transparent text-gray-500 mt-0.5 shrink-0">
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-black uppercase tracking-wider text-gray-800 dark:text-gray-200">
                          {shortcut.label}
                        </span>
                        <kbd className="inline-flex items-center px-2 py-0.5 rounded-lg bg-primary/10 dark:bg-primary/20 border border-primary/30 text-[9px] font-black text-primary dark:text-emerald-400 shadow-sm leading-none shrink-0 uppercase">
                          {shortcut.key}
                        </kbd>
                      </div>
                      <p className="text-[9px] text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                        {shortcut.desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Checkout Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-gray-100 dark:border-white/5">
              <CreditCard className="w-4 h-4 text-primary" />
              <h3 className="text-xs font-black uppercase tracking-widest text-gray-900 dark:text-white">
                {t('checkout_section', 'Checkout & Settlement')}
              </h3>
            </div>
            <div className="space-y-3">
              {checkoutShortcuts.map((shortcut) => {
                const Icon = shortcut.icon;
                return (
                  <div 
                    key={shortcut.key} 
                    className="p-3 rounded-2xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5 flex items-start gap-3 hover:border-primary/20 transition-all"
                  >
                    <div className="p-2 rounded-xl bg-white dark:bg-white/5 border border-gray-200 dark:border-transparent text-gray-500 mt-0.5 shrink-0">
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-black uppercase tracking-wider text-gray-800 dark:text-gray-200">
                          {shortcut.label}
                        </span>
                        <kbd className="inline-flex items-center px-2 py-0.5 rounded-lg bg-primary/10 dark:bg-primary/20 border border-primary/30 text-[9px] font-black text-primary dark:text-emerald-400 shadow-sm leading-none shrink-0 uppercase">
                          {shortcut.key}
                        </kbd>
                      </div>
                      <p className="text-[9px] text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                        {shortcut.desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </div>
    </Modal>
  );
}
