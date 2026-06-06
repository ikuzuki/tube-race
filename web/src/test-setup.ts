import '@testing-library/jest-dom'

// Node 26 ships an experimental global `localStorage` that is undefined unless
// started with --localstorage-file, which shadows jsdom's. Provide a simple
// in-memory implementation so storage-backed hooks behave in tests.
const store = new Map<string, string>()
const memoryStorage = {
  get length() {
    return store.size
  },
  clear: () => store.clear(),
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  key: (i: number) => Array.from(store.keys())[i] ?? null,
  removeItem: (k: string) => store.delete(k),
  setItem: (k: string, v: string) => {
    store.set(k, String(v))
  },
} as Storage

try {
  Object.defineProperty(globalThis, 'localStorage', {
    value: memoryStorage,
    configurable: true,
    writable: true,
  })
} catch {
  // If the global is locked down, leave it; storage-dependent tests will skip.
}
