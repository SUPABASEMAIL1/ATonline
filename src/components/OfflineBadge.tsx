import { useEffect, useState } from 'react'
import { localDb } from '../lib/localDb'
import { ShieldAlert, Wifi, WifiOff } from 'lucide-react'

export function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine)
  const [pending, setPending] = useState(0)

  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    const handlePending = async () => {
      const count = await localDb.pendingOps.count()
      setPending(count)
    }
    handlePending()
    const interval = setInterval(handlePending, 3000)
    window.addEventListener('pendingops-changed', handlePending)

    return () => {
      clearInterval(interval)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('pendingops-changed', handlePending)
    }
  }, [])

  if (online) return null

  return (
    <div className="sticky top-0 z-[60] w-full bg-amber-500 text-white px-4 py-2 flex items-center justify-center gap-2 text-[11px] font-black uppercase tracking-widest shadow-lg">
      <WifiOff className="h-3.5 w-3.5 shrink-0" />
      <span>
        Offline Mode{pending > 0 ? ` — ${pending} change${pending !== 1 ? 's' : ''} pending, will sync when online` : ' — all changes saved locally'}
      </span>
    </div>
  )
}
