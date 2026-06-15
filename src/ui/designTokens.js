// Design tokens — pure constants, no theme dependency.
// Spacing on a 4-pt grid; type scale is SF with point-based tracking
// (RN letterSpacing/lineHeight are points, not em). From the Claude Design spec.

export const SP = n => n * 4; // SP(2) = 8, SP(2.5) = 10, SP(3) = 12

export const RADIUS = {sm: 6, md: 9, lg: 12, pill: 999};

// Shadow presets for sheets / popovers.
export const ELEV = {
  sheet: {
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: {width: 0, height: 12},
  },
  popover: {
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 4},
  },
};

// Each entry spreads directly onto a Text style.
export const TYPE = {
  title: {fontSize: 19, fontWeight: '600', lineHeight: 24, letterSpacing: -0.4},
  sectionHeader: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  sender: {fontSize: 14, fontWeight: '600', lineHeight: 18, letterSpacing: -0.15},
  subject: {fontSize: 13.5, fontWeight: '400', lineHeight: 18}, // weight 600 when unread
  preview: {fontSize: 13, fontWeight: '400', lineHeight: 17},
  body: {fontSize: 15, fontWeight: '400', lineHeight: 23}, // reading view / WKWebView base
  meta: {fontSize: 12.5, fontWeight: '400', lineHeight: 16},
  button: {fontSize: 13, fontWeight: '500', lineHeight: 16},
};
