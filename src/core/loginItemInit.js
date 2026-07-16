// Enable launch-at-login once, on first run, so background refresh works out of
// the box. A persisted flag ensures we never force it back on after the user
// turns it off in Settings. Best-effort: an enable failure (ad-hoc build) is
// swallowed, and the flag is still set so we don't retry every launch.
export async function maybeInitLoginItem({getSetting, setSetting, setEnabled}) {
  const done = await getSetting('loginItemInitialized');
  if (done) return false;
  try {
    await setEnabled(true);
  } catch (e) {
    // non-fatal — registration can fail on unsigned/ad-hoc builds
  }
  await setSetting('loginItemInitialized', '1');
  return true;
}
