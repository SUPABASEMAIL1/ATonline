type Listener = (online: boolean) => void
const listeners: Listener[] = []

export function isOnline(): boolean {
  return navigator.onLine
}

export function onNetworkChange(fn: Listener) {
  listeners.push(fn)
  window.addEventListener('online', () => listeners.forEach(l => l(true)))
  window.addEventListener('offline', () => listeners.forEach(l => l(false)))
}
