const PALETTES = {
  light: {
    bg: '#ffffff',
    panel: '#f2f0f5',
    border: '#e5e5e5',
    divider: '#eeeeee',
    text: '#1a1a1a',
    textMuted: '#888888',
    danger: '#b00020',
    sentBg: '#f6f4fb',
    selectedBg: '#ece8f7',
  },
  dark: {
    bg: '#1e1e1f',
    panel: '#2a2a2e',
    border: '#3a3a3e',
    divider: '#333336',
    text: '#f0f0f2',
    textMuted: '#9a9aa0',
    danger: '#ff6b6b',
    sentBg: '#2c2838',
    selectedBg: '#3a3550',
  },
};

const DEFAULT_ACCENT = '#5b4aa6';

export function makeTheme(scheme, accent) {
  const key = scheme === 'dark' ? 'dark' : 'light';
  return {...PALETTES[key], accent: accent || DEFAULT_ACCENT, scheme: key};
}
