import { useMemo, useRef } from 'react';
import { X, Image as ImageIcon, MousePointer2, Package, Trash2, Plus, Upload } from 'lucide-react';
import { useApp } from '../../context/SupabaseAppContext';
import { productsService } from '../../lib/services';
import { sonner } from '../../lib/sonner';
import { Modal } from '../common/Modal';
import { cn } from '../../lib/utils';
import { compressImage } from '../../lib/imageCompression';

interface MediaLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
  standalone?: boolean;
}

export function MediaLibrary({ isOpen, onClose, onSelect, standalone }: MediaLibraryProps) {
  const { state, dispatch } = useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        sonner.loading('Compressing image...');
        const compressedFile = await compressImage(file, 800, 800, 0.7);
        const reader = new FileReader();
        reader.onload = (event) => {
          const base64Data = event.target?.result as string;
          sonner.dismissAll();
          sonner.success('Image compressed successfully!');
          onSelect(base64Data);
          if (!standalone) onClose();
        };
        reader.readAsDataURL(compressedFile);
      } catch (err) {
        console.error('Upload fail:', err);
        sonner.dismissAll();
        sonner.error('Failed to compress/upload image');
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteImage = async (e: React.MouseEvent, imageUrl: string) => {
    e.stopPropagation();

    // Check if it's the store logo
    if (imageUrl === state.settings?.storeLogo) {
      sonner.alert('System Asset', 'Store Logo cannot be deleted from Media Library.');
      return;
    }

    const { isConfirmed } = await sonner.confirm(
      'Delete Asset?',
      'This image will be removed from ALL products currently using it. Are you sure?'
    );

    if (isConfirmed) {
      try {
        const productsToUpdate = state.products.filter((p: any) => p.image === imageUrl);
        const idsToUpdate = productsToUpdate.map((p: any) => p.id);

        if (idsToUpdate.length > 0) {
          // Use 'image: null' for deletion in DB update (Supabase may prefer null to undefined)
          await productsService.bulkUpdate(idsToUpdate, { image: null as any });

          const updatedProducts = state.products.map((p: any) =>
            idsToUpdate.includes(p.id) ? { ...p, image: undefined, updatedAt: new Date() } : p
          );

          dispatch({ type: 'SET_PRODUCTS', payload: updatedProducts });

          sonner.success(`Image removed from ${idsToUpdate.length} product(s).`);
        }
      } catch (error) {
        console.error('Delete image error:', error);
        sonner.alert('Error', 'Failed to delete image.');
      }
    }
  };

  // Extract ALL unique images from products (Comprehensive Gallery)
  const productAssets = useMemo(() => {
    const uniqueImages = new Map<string, any>();

    // Add store logo first
    if (state.settings?.storeLogo && (state.settings.storeLogo.startsWith('http') || state.settings.storeLogo.startsWith('data:image'))) {
      uniqueImages.set(state.settings.storeLogo, {
        id: 'logo',
        name: 'Store Logo',
        sku: 'SYSTEM',
        image: state.settings.storeLogo,
        isSystem: true
      });
    }

    state.products
      .filter((p: any) => !!p.image && typeof p.image === 'string' && (p.image.startsWith('http') || p.image.startsWith('data:image')))
      .forEach((p: any) => {
        if (!uniqueImages.has(p.image)) {
          uniqueImages.set(p.image, {
            id: p.id,
            name: p.name,
            sku: p.sku,
            image: p.image,
            isSystem: false
          });
        }
      });

    // Scan bundles (deals) for custom banners to enable image reuse
    if (state.bundles) {
      state.bundles
        .filter((b: any) => !!b.image && typeof b.image === 'string' && (b.image.startsWith('http') || b.image.startsWith('data:image')))
        .forEach((b: any) => {
          if (!uniqueImages.has(b.image)) {
            uniqueImages.set(b.image, {
              id: b.id,
              name: b.name,
              sku: 'DEAL',
              image: b.image,
              isSystem: false
            });
          }
        });
    }

    return Array.from(uniqueImages.values());
  }, [state.products, state.settings?.storeLogo, state.bundles]);

  if (!isOpen) return null;

  const content = (
    <div className={cn("p-0 custom-scrollbar", standalone ? "h-full" : "")}>
      {standalone && (
        <div className="p-10 border-b border-white/5 bg-gradient-to-r from-emerald-500/5 to-transparent text-center">
          <h3 className="text-sm font-black text-primary uppercase tracking-[0.4em] mb-2">Global Media Repository</h3>
          <p className="text-gray-600 text-xs font-bold max-w-xl mx-auto">Showing every product image stored in your high-performance database.</p>
        </div>
      )}

      <div className={cn("p-6", !standalone && "min-h-[400px]")}>
        {productAssets.length > 0 || !standalone ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
            {/* Upload New Card (only in selection modal mode) */}
            {!standalone && (
              <div
                onClick={handleUploadClick}
                className="group flex flex-col gap-3 animate-in fade-in duration-300"
              >
                <div className="relative aspect-square bg-gray-50 dark:bg-black/40 rounded-[2rem] border-2 border-dashed border-gray-350 dark:border-white/10 hover:border-primary flex flex-col items-center justify-center cursor-pointer transition-all hover:scale-[1.03] shadow-sm hover:shadow-emerald-500/5">
                  <Plus className="h-8 w-8 text-gray-400 group-hover:text-primary group-hover:scale-110 transition-all mb-2" />
                  <span className="text-[10px] font-black text-gray-500 group-hover:text-primary uppercase tracking-widest text-center px-4">Upload New</span>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/*"
                    className="hidden"
                  />
                </div>
                <div className="px-2 text-center opacity-0 select-none">
                  <p className="text-[10px] font-black">Upload New</p>
                </div>
              </div>
            )}

            {productAssets.map((asset, index) => (
              <div
                key={`${asset.id}-${index}`}
                onClick={() => {
                  if (asset.image) onSelect(asset.image);
                  if (!standalone) onClose();
                }}
                className="group flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-4 duration-500"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="relative aspect-square bg-gray-50 dark:bg-black/75 rounded-[2rem] overflow-hidden border border-gray-200 dark:border-white/5 hover:border-primary/50 cursor-pointer transition-all hover:scale-[1.05] shadow-xl group-hover:shadow-emerald-500/10">
                  <img
                    src={asset.image}
                    alt={asset.name}
                    className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-125"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/20 flex flex-col items-center justify-center transition-all">
                    <MousePointer2 className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-all scale-75 group-hover:scale-100" />
                    {!asset.isSystem && (
                      <button
                        onClick={(e) => handleDeleteImage(e, asset.image)}
                        className="absolute top-3 right-3 p-2 bg-red-500 text-white rounded-xl opacity-0 group-hover:opacity-100 transition-all z-10 shadow-lg hover:scale-110"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {asset.isSystem && (
                    <div className="absolute top-3 left-3 bg-blue-500/90 text-white text-[8px] font-black px-2 py-1 rounded-full uppercase shadow-lg">
                      System Asset
                    </div>
                  )}
                </div>
                <div className="px-2 text-center">
                  <p className="text-[10px] font-black text-gray-900 dark:text-white uppercase truncate tracking-tight group-hover:text-primary transition-colors">{asset.name}</p>
                  <p className="text-[8px] text-gray-600 font-bold uppercase tracking-widest mt-0.5">{asset.sku}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-gray-600 py-20">
            <div className="p-10 rounded-full bg-white/[0.02] mb-8 border border-white/5 animate-pulse">
              <ImageIcon className="h-20 w-20 opacity-10" />
            </div>
            <p className="text-xl font-black uppercase text-white/20 tracking-[0.2em]">Repository Empty</p>
            <p className="text-xs font-bold mt-3 text-gray-600 max-w-xs text-center">Your database is currently clean. Add products with images to see them indexed here.</p>
          </div>
        )}
      </div>
    </div>
  );

  if (standalone) return content;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Media Library"
      maxWidth="xl"
    >
      {content}
    </Modal>
  );
}
