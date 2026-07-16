import React, {useEffect, useRef, useState} from 'react';
import {View, Text, Pressable} from 'react-native';
import {useTheme} from './useTheme';
import {SP, RADIUS, TYPE} from './designTokens';
import {
  isEnabled as loginIsEnabled,
  setEnabled as loginSetEnabled,
} from '../native/LoginItem';

// A self-contained "Launch at login" row. Loads the real SMAppService state on
// mount and reflects it; toggling registers/unregisters the login item. On
// failure (e.g. an ad-hoc build that can't register) it re-reads and shows the
// true state rather than a wishful one.
export default function LaunchAtLoginToggle() {
  const theme = useTheme();
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
    <View
      style={{
        minHeight: 44,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: SP(3),
        paddingVertical: SP(2),
      }}>
      <Text style={{...TYPE.body, color: theme.textMuted}}>Launch at login</Text>
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{checked: on}}
        onPress={toggle}
        style={{
          paddingVertical: SP(1.5),
          paddingHorizontal: SP(3),
          borderRadius: RADIUS.sm,
          backgroundColor: on ? theme.accent : 'transparent',
          borderWidth: 1,
          borderColor: on ? theme.accent : theme.border,
        }}>
        <Text style={{...TYPE.button, color: on ? '#fff' : theme.text}}>
          {on ? 'On' : 'Off'}
        </Text>
      </Pressable>
    </View>
  );
}
