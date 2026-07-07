import { FileText, Trash2, X, ShoppingCart } from 'lucide-react';
import { Sale } from '../../types';
import { formatCurrency } from '../../lib/currencies';
import { salesService } from '../../lib/services';
import { useApp } from '../../context/SupabaseAppContext';
import { useTranslation } from '../../hooks/useTranslation';

import { Modal } from '../common/Modal';

interface DraftsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onLoadDraft: (draft: Sale) => void;
}

export function DraftsModal({ isOpen, onClose, onLoadDraft }: DraftsModalProps) {
    const { state, dispatch } = useApp();
    const { t } = useTranslation();

    const drafts = state.sales
        .filter(sale => sale.notes?.includes('DRAFT_SALE'))
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            await salesService.delete(id);
            // Update global state so draft count badge and modal list updates instantly
            dispatch({ type: 'DELETE_SALE', payload: id });
        } catch (error) {
            console.error('Error deleting draft:', error);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={t('draft_archives', 'Draft Archives')}
            subtitle={t('suspended_sessions', 'Suspended Protocol • {count} Sessions').replace('{count}', drafts.length.toString())}
            maxWidth="lg"
            footer={
                <div className="flex items-center justify-end w-full">
                    <button
                        onClick={onClose}
                        className="w-full sm:w-auto sm:min-w-[240px] px-4 sm:px-8 py-2.5 sm:py-3.5 rounded-2xl text-[9px] sm:text-[11px] font-black uppercase tracking-widest bg-gray-200 dark:bg-white/5 text-gray-700 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white transition-all active:scale-95"
                    >
                        {t('close_archive', 'Close Archive')}
                    </button>
                </div>
            }
        >
            <div className="min-h-[300px]">
                {drafts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 px-10 text-center gap-6">
                        <div className="w-24 h-24 rounded-full bg-gray-100 dark:bg-black/20 flex items-center justify-center border border-gray-200 dark:border-white/5">
                            <FileText className="h-12 w-12 text-gray-600 dark:text-gray-500" />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tight">{t('vault_empty', 'Vault Empty')}</h3>
                            <p className="text-[10px] text-gray-600 dark:text-gray-400 max-w-sm mx-auto mt-2 font-black uppercase tracking-widest leading-relaxed">
                                {t('no_suspended_sessions', 'No suspended sales sessions registered.')}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in slide-in-from-bottom-4 duration-300">
                        {drafts.map((draft) => (
                            <div
                                key={draft.id}
                                onClick={() => onLoadDraft(draft)}
                                className="group relative p-5 rounded-[20px] border bg-[#f8f9fa] dark:bg-black/75 border-gray-200 dark:border-white/5 hover:border-emerald-200 dark:hover:border-primary/30 hover:bg-emerald-50 dark:hover:bg-primary/5 transition-all active:scale-[0.98] cursor-pointer"
                            >
                                <div className="flex items-start justify-between gap-4 mb-4">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 rounded-2xl bg-white dark:bg-white/5 group-hover:bg-primary text-primary group-hover:text-white shadow-sm border border-gray-200 dark:border-transparent transition-all">
                                            <ShoppingCart className="w-4 h-4" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[11px] font-black uppercase tracking-widest text-gray-900 dark:text-white truncate">
                                                {draft.customerName || t('walk_in_client', 'Walk-in Client')}
                                            </p>
                                            <p className="text-[9px] text-gray-600 dark:text-gray-500 font-bold uppercase tracking-widest mt-1">
                                                {new Date(draft.timestamp).toLocaleString()}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={(e) => handleDelete(draft.id, e)}
                                        className="p-2 text-gray-600 dark:text-gray-500 hover:text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-500/10 rounded-xl transition-all"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                                <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-white/5">
                                    <span className="text-[9px] font-black text-gray-600 dark:text-gray-500 uppercase tracking-widest">
                                        {draft.items.length} {t('items_captured', 'Items Captured')}
                                    </span>
                                    <span className="text-xl font-black text-primary dark:text-emerald-400">
                                        {formatCurrency(draft.total, state.settings.currency)}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Modal>
    );
}
