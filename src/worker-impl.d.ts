declare module '#worker-impl' {
  export function createWorker(): Worker
  export function createEagerWorker(): Worker | null
}
