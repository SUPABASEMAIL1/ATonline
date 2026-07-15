import React from 'react';

interface SkeletonLoaderProps {
  type?: 'storefront' | 'grid' | 'list' | 'detail' | 'order-timer';
  count?: number;
}

export function SkeletonLoader({ type = 'grid', count = 4 }: SkeletonLoaderProps) {
  // Shimmer pulse styling
  const shimmer = "animate-pulse bg-gray-200 dark:bg-zinc-800 rounded-xl";

  if (type === 'storefront') {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a] p-4 sm:p-6 space-y-8 animate-fade-in">
        {/* Header Skeleton */}
        <div className="max-w-7xl mx-auto flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 ${shimmer} rounded-full`} />
            <div className={`w-32 h-6 ${shimmer}`} />
          </div>
          <div className={`w-20 h-9 ${shimmer} rounded-full`} />
        </div>

        {/* Banner Carousel Skeleton */}
        <div className="max-w-7xl mx-auto">
          <div className={`w-full aspect-[900/400] sm:aspect-[21/9] ${shimmer} rounded-[2rem]`} />
        </div>

        {/* Search Bar Skeleton */}
        <div className="max-w-3xl mx-auto">
          <div className={`w-full h-14 ${shimmer} rounded-full`} />
        </div>

        {/* Categories Scroll Skeleton */}
        <div className="max-w-7xl mx-auto flex gap-3 overflow-x-hidden py-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={`w-24 h-9 ${shimmer} rounded-full shrink-0`} />
          ))}
        </div>

        {/* Product Grid Skeleton */}
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="bg-white dark:bg-zinc-900 rounded-[2rem] border border-black/5 p-3 sm:p-5 flex flex-col gap-4 shadow-sm h-full">
                <div className={`w-full aspect-square ${shimmer} rounded-[1.5rem]`} />
                <div className="space-y-2">
                  <div className={`w-3/4 h-4 ${shimmer}`} />
                  <div className={`w-1/2 h-4 ${shimmer}`} />
                </div>
                <div className={`w-full h-11 ${shimmer} rounded-full mt-auto`} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (type === 'grid') {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-6">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="bg-white dark:bg-zinc-900 rounded-[2rem] border border-black/5 p-3 sm:p-5 flex flex-col gap-4 shadow-sm h-full">
            <div className={`w-full aspect-square ${shimmer} rounded-[1.5rem]`} />
            <div className="space-y-2">
              <div className={`w-3/4 h-4 ${shimmer}`} />
              <div className={`w-1/2 h-4 ${shimmer}`} />
            </div>
            <div className={`w-full h-11 ${shimmer} rounded-full mt-auto`} />
          </div>
        ))}
      </div>
    );
  }

  if (type === 'list') {
    return (
      <div className="space-y-3">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="bg-white dark:bg-zinc-900 border border-black/5 p-4 rounded-2xl flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3 w-full">
              <div className={`w-10 h-10 ${shimmer} rounded-xl shrink-0`} />
              <div className="space-y-1.5 w-full">
                <div className={`w-1/3 h-4 ${shimmer}`} />
                <div className={`w-1/4 h-3 ${shimmer}`} />
              </div>
            </div>
            <div className={`w-16 h-8 ${shimmer} rounded-lg shrink-0`} />
          </div>
        ))}
      </div>
    );
  }

  if (type === 'detail') {
    return (
      <div className="bg-white dark:bg-zinc-900 border border-black/5 rounded-3xl p-6 space-y-6 shadow-sm">
        <div className={`w-full h-64 ${shimmer} rounded-[2rem]`} />
        <div className="space-y-3">
          <div className={`w-1/3 h-7 ${shimmer}`} />
          <div className={`w-2/3 h-4 ${shimmer}`} />
          <div className={`w-1/2 h-4 ${shimmer}`} />
        </div>
        <div className="space-y-4 pt-4 border-t border-black/5">
          <div className={`w-24 h-5 ${shimmer}`} />
          <div className="flex gap-2">
            <div className={`w-20 h-10 ${shimmer} rounded-xl`} />
            <div className={`w-20 h-10 ${shimmer} rounded-xl`} />
            <div className={`w-20 h-10 ${shimmer} rounded-xl`} />
          </div>
        </div>
        <div className="flex gap-4 pt-6">
          <div className={`w-32 h-12 ${shimmer} rounded-full`} />
          <div className={`flex-1 h-12 ${shimmer} rounded-full`} />
        </div>
      </div>
    );
  }

  if (type === 'order-timer') {
    return (
      <div className={`w-24 h-5 ${shimmer} rounded-full mt-2`} />
    );
  }

  return null;
}
