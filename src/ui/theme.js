// Semantic color tokens (light + dark), refined per the Claude Design spec.
// `accent` is injected from SystemAccent (NSColor.controlAccentColor); the hex
// DEFAULT below is only a pre-native fallback (macOS Blue). Selection fills with
// the live accent, so selected rows pair theme.selectedBg with theme.selectedText.
const PALETTES = {
  light: {
    bg: '#ffffff',
    surface2: '#f7f7f8', // sheets, input fields, quoted blocks
    sidebarBg: '#ececee', // under the vibrancy material
    text: '#1d1d1f',
    textMuted: '#6b6b70', // darkened to pass AA (~5:1)
    textFaint: '#8e8e93', // timestamps, counts (supplementary only)
    selectedText: '#ffffff', // label on an accent-filled selected row
    border: '#e3e3e6',
    divider: '#eeeef0',
    hover: 'rgba(0,0,0,0.05)',
    pressed: 'rgba(0,0,0,0.09)',
    selectedFill: 'rgba(0,0,0,0.06)', // calm tint for selected list rows
    danger: '#ff3b30',
    success: '#28a745',
    // Legacy aliases kept so existing consumers don't break.
    panel: '#ececee',
    sentBg: '#f7f7f8',
  },
  dark: {
    bg: '#1e1e1e',
    surface2: '#2a2a2c',
    sidebarBg: '#2a2a2c',
    text: '#f5f5f7',
    textMuted: '#a1a1a6',
    textFaint: '#6e6e73',
    selectedText: '#ffffff',
    border: '#3a3a3c',
    divider: '#2c2c2e',
    hover: 'rgba(255,255,255,0.06)',
    pressed: 'rgba(255,255,255,0.10)',
    selectedFill: 'rgba(255,255,255,0.09)',
    danger: '#ff453a',
    success: '#30d158',
    panel: '#2a2a2c',
    sentBg: '#2a2a2c',
  },
};

const DEFAULT_ACCENT = '#007aff'; // macOS Blue fallback until SystemAccent loads

// Pick black or white for text/icons placed ON the accent fill, by accent
// luminance — so a yellow/green system accent doesn't get unreadable white text.
function readableOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  // Relative luminance (sRGB, simple approximation).
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#000000' : '#ffffff';
}

export function makeTheme(scheme, accent) {
  const key = scheme === 'dark' ? 'dark' : 'light';
  const acc = accent || DEFAULT_ACCENT;
  // selectedBg = the accent fill (used by the sidebar pill + keyboard focus);
  // onAccent is the contrast-safe label color on top of it.
  return {
    ...PALETTES[key],
    accent: acc,
    selectedBg: acc,
    onAccent: readableOn(acc),
    scheme: key,
  };
}
