import InventoryReportManager from '../../inventory/InventoryReportManager';

interface InventoryReportProps {
  startDate: Date;
  endDate: Date;
  globalSupplier: string;
  globalCategory: string;
  globalStore: string;
  sales: any[];
}

export function InventoryReport({ startDate, endDate, globalSupplier, globalCategory, globalStore, sales }: InventoryReportProps) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 -mx-4 lg:-mx-6 -mt-2">
      <InventoryReportManager
        startDate={startDate}
        endDate={endDate}
        globalSupplier={globalSupplier}
        globalCategory={globalCategory}
        globalStore={globalStore}
        sales={sales}
      />
    </div>
  );
}
