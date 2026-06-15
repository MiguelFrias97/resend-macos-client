// A tiny reactive store for the user's theme preference ('auto' | 'light' |
// 'dark'). useTheme subscribes via useSyncExternalStore, so changing it from the
// Settings screen re-themes the whole app without a context provider.
let override = 'auto';
const listeners = new Set();

export function getOverride() {
  return override;
}

export function setOverride(value) {
  override = value === 'light' || value === 'dark' ? value : 'auto';
  listeners.forEach(l => l());
}

export function subscribeOverride(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
