import React from 'react';
import {View, Text, Pressable} from 'react-native';
import {useTheme} from './useTheme';
import {SP, RADIUS, TYPE} from './designTokens';

// Shared building blocks for Settings rows so the row metrics and the selectable
// "pill" live in one place instead of being copied per control (Appearance
// selector, Launch-at-login toggle, ...).

// A settings row: a muted label on the left, controls on the right.
export function SettingsRow({label, children}) {
  const theme = useTheme();
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
      <Text style={{...TYPE.body, color: theme.textMuted}}>{label}</Text>
      <View style={{flexDirection: 'row'}}>{children}</View>
    </View>
  );
}

// A selectable pill inside a SettingsRow. `selected` fills it with the accent and
// uses the contrast-safe on-accent label color; `spaced` adds a left margin when
// several pills sit side by side (segmented selector).
export function SettingsPill({
  label,
  selected,
  onPress,
  spaced = false,
  accessibilityRole,
  accessibilityLabel,
  accessibilityState,
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      onPress={onPress}
      style={{
        paddingVertical: SP(1.5),
        paddingHorizontal: SP(3),
        marginLeft: spaced ? SP(2) : 0,
        borderRadius: RADIUS.sm,
        backgroundColor: selected ? theme.selectedBg : 'transparent',
        borderWidth: 1,
        borderColor: selected ? theme.accent : theme.border,
      }}>
      <Text
        style={{...TYPE.button, color: selected ? theme.onAccent : theme.text}}>
        {label}
      </Text>
    </Pressable>
  );
}
