export function createWorker(): Worker {
  return new Worker(new URL('./highlight.worker.js', import.meta.url), { type: 'module' })
}

export function createEagerWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null
  try { return createWorker() } catch { return null }
}
