import React, {useEffect, useRef, useState} from 'react';
import {SettingsRow, SettingsPill} from './settingsControls';
import {
  isEnabled as loginIsEnabled,
  setEnabled as loginSetEnabled,
} from '../native/LoginItem';

// A self-contained "Launch at login" row. Loads the real SMAppService state on
// mount and reflects it; toggling registers/unregisters the login item. On
// failure (e.g. an ad-hoc build that can't register) it re-reads and shows the
// true state rather than a wishful one.
export default function LaunchAtLoginToggle() {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    loginIsEnabled()
      .then(v => {
        if (mountedRef.current) setOn(!!v);
      })
      .catch(() => {});
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await loginSetEnabled(!on);
      if (mountedRef.current) setOn(!!result);
    } catch (e) {
      const state = await loginIsEnabled();
      if (mountedRef.current) setOn(state);
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  return (
    <SettingsRow label="Launch at login">
      <SettingsPill
        accessibilityRole="switch"
        accessibilityState={{checked: on}}
        selected={on}
        onPress={toggle}
        label={on ? 'On' : 'Off'}
      />
    </SettingsRow>
  );
}
