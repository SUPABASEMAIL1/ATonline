import { useState } from 'react';
import { Plus, Edit, Trash2, Users, Crown, CreditCard, Loader2 } from 'lucide-react';
import { Salesman } from '../../types';
import { useApp } from '../../context/SupabaseAppContext';
import { SharedSearchBar } from '../../shared/modules/search-and-list';
import { Badge, Button, EmptyState, Pagination, usePagination } from '../../shared/ui';
import { salesmenService } from '../../lib/services';
import { SalesmanModal } from './SalesmanModal';
import { sonner } from '../../lib/sonner';
import { useTranslation } from '../../hooks/useTranslation';

export function SalesmanManager() {
  const { state, dispatch } = useApp();
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingSalesman, setEditingSalesman] = useState<Salesman | null>(null);
  const [loading, setLoading] = useState(false);

  const filteredSalesmen = state.salesmen.filter(salesman =>
    salesman.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (salesman.phone && salesman.phone.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const { page, totalPages, pageItems, goToPage, pageSize, setPageSize } = usePagination(filteredSalesmen, 25);

  const handleEdit = (salesman: Salesman) => {
    setEditingSalesman(salesman);
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    const result = await sonner.deleteConfirm('salesman');
    if (result.isConfirmed) {
      setLoading(true);
      sonner.loading('Deleting salesman...');
      try {
        await salesmenService.delete(id);
        dispatch({ type: 'SET_SALESMEN', payload: state.salesmen.filter(s => s.id !== id) });
        sonner.success('Salesman deleted successfully!');
      } catch (error: any) {
        sonner.error(`Error deleting salesman: ${error.message}`);
      } finally {
        setLoading(false);
        sonner.close();
      }
    }
  };

  const handleAdd = () => {
    setEditingSalesman(null);
    setShowModal(true);
  };

  const activeSalesmen = state.salesmen.filter(s => s.active).length;

  return (
    <div className="main-content-scroll p-1 sm:p-4 lg:p-6 bg-gray-50/50 dark:bg-app space-y-3 lg:space-y-6 max-w-[1400px] mx-auto">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 sm:gap-6 pb-2">
        <div className="flex flex-col md:flex-row md:items-center gap-4 sm:gap-6 xl:gap-10">
          <div className="flex items-center gap-4 shrink-0">
            <div className="h-10 w-10 sm:h-12 sm:w-12 bg-emerald-500/10 rounded-xl flex items-center justify-center shadow-inner border border-emerald-500/10">
              <CreditCard className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-500" />
            </div>
            <div>
              <h1 className="text-[22px] sm:text-[28px] font-black tracking-tight text-gray-900 dark:text-white leading-none">
                Salesmen <span className="text-gray-400 font-light">Management</span>
              </h1>
              <div className="flex items-center gap-2 mt-1 sm:mt-2">
                <Badge tone="success" className="!px-2 !py-0.5 !text-[10px] uppercase font-bold tracking-widest">{t('active', 'ACTIVE')}: {activeSalesmen}</Badge>
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  {t('total_records', 'TOTAL RECORDS')}: {state.salesmen.length}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full lg:w-auto shrink-0">
          <div className="w-full sm:w-[280px]">
            <SharedSearchBar
              placeholder={t('search_salesmen', 'Search salesmen...')}
              value={searchTerm}
              onChange={setSearchTerm}
            />
          </div>
          {state.currentUser?.role === 'admin' && (
            <Button
              onClick={handleAdd}
              variant="primary"
              className="!py-3 !px-5 whitespace-nowrap !h-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              <span className="text-[11px] font-black tracking-widest uppercase">{t('add_salesman', 'Add Salesman')}</span>
            </Button>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-[#1a1b1e] rounded-2xl sm:rounded-[32px] border border-gray-100 dark:border-white/5 shadow-sm dark:shadow-none overflow-hidden relative">
        <div className="overflow-x-auto custom-scrollbar">
          <div className="min-w-[800px] w-full align-middle inline-block">
            <div className="overflow-hidden">
              <table className="min-w-full divide-y divide-gray-100 dark:divide-white/5">
                <thead className="bg-gray-50/50 dark:bg-black/20">
                  <tr>
                    <th scope="col" className="px-5 sm:px-8 py-4 sm:py-5 text-left text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest w-[40%]">
                      {t('salesman_info', 'SALESMAN INFO')}
                    </th>
                    <th scope="col" className="px-5 sm:px-8 py-4 sm:py-5 text-left text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                      {t('status', 'STATUS')}
                    </th>
                    <th scope="col" className="px-5 sm:px-8 py-4 sm:py-5 text-right text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest w-[120px]">
                      {t('actions', 'ACTIONS')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-white/5 bg-white dark:bg-transparent">
                  {pageItems.map((salesman) => (
                    <tr key={salesman.id} className="hover:bg-gray-50/50 dark:hover:bg-white/[0.02] transition-colors group">
                      <td className="px-5 sm:px-8 py-4 sm:py-5 whitespace-nowrap">
                        <div className="flex items-center gap-4">
                          <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-gray-100 dark:bg-black/50 border border-gray-200 dark:border-white/5 flex items-center justify-center shrink-0 shadow-sm overflow-hidden">
                            <Users className="h-5 w-5 text-gray-400" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm sm:text-[15px] font-bold text-gray-900 dark:text-white truncate">
                              {salesman.name}
                            </span>
                            <div className="flex items-center gap-2 mt-0.5 sm:mt-1">
                              <span className="text-[11px] sm:text-xs text-gray-500 font-medium font-mono">{salesman.phone || 'N/A'}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 sm:px-8 py-4 sm:py-5 whitespace-nowrap">
                        <Badge tone={salesman.active ? 'success' : 'neutral'} className="!px-3 !py-1 !text-[10px] uppercase font-bold tracking-widest">
                          {salesman.active ? t('active', 'ACTIVE') : t('inactive', 'INACTIVE')}
                        </Badge>
                      </td>
                      <td className="px-5 sm:px-8 py-4 sm:py-5 whitespace-nowrap text-right">
                        {state.currentUser?.role === 'admin' && (
                          <div className="flex items-center justify-end gap-1 sm:gap-2 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(salesman)}
                              className="!h-9 !w-9 !p-0 !rounded-xl !bg-[#f8f9fa] dark:!bg-black/40 hover:!bg-blue-50 dark:hover:!bg-blue-500/20 text-gray-400 hover:text-blue-500 transition-colors"
                              title={t('edit', 'Edit')}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(salesman.id)}
                              className="!h-9 !w-9 !p-0 !rounded-xl !bg-[#f8f9fa] dark:!bg-black/40 hover:!bg-rose-50 dark:hover:!bg-rose-500/20 text-gray-400 hover:text-rose-500 transition-colors"
                              title={t('delete', 'Delete')}
                              disabled={loading}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredSalesmen.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-8 py-16">
                        <EmptyState
                          icon={Users}
                          title={t('no_salesmen_found', 'No Salesmen Found')}
                          description={searchTerm ? t('try_adjusting_search', 'Try adjusting your search terms') : t('add_first_salesman', 'Add your first salesman to get started')}
                          action={
                            !searchTerm && state.currentUser?.role === 'admin' ? (
                              <Button variant="primary" onClick={handleAdd}>
                                <Plus className="h-4 w-4 mr-2" />
                                {t('add_salesman', 'ADD SALESMAN')}
                              </Button>
                            ) : undefined
                          }
                        />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {totalPages > 1 && (
          <div className="px-5 sm:px-8 py-4 sm:py-5 border-t border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-black/20">
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={goToPage}
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
              totalItems={filteredSalesmen.length}
            />
          </div>
        )}
      </div>

      <SalesmanModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        salesman={editingSalesman}
      />
    </div>
  );
}
