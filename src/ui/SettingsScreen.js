import React, {useState} from 'react';
import {View, Text, TextInput, Pressable} from 'react-native';
import {useTheme} from './useTheme';

const THEME_OPTIONS = [
  {key: 'auto', label: 'Auto'},
  {key: 'light', label: 'Light'},
  {key: 'dark', label: 'Dark'},
];

export default function SettingsScreen({
  defaultFrom = '',
  onChangeFrom,
  themeOverride = 'auto',
  onChangeTheme,
  onSignOut,
  onClose,
}) {
  const theme = useTheme();
  const [from, setFrom] = useState(defaultFrom);

  return (
    <View style={{flex: 1, backgroundColor: theme.bg, padding: 16}}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}>
        <Text style={{fontSize: 18, fontWeight: '600', color: theme.text}}>
          Settings
        </Text>
        <Pressable onPress={onClose}>
          <Text style={{color: theme.accent}}>Done</Text>
        </Pressable>
      </View>

      <Text style={{color: theme.textMuted, marginBottom: 4}}>From address</Text>
      <TextInput
        placeholder="you@yourdomain.com"
        placeholderTextColor={theme.textMuted}
        value={from}
        onChangeText={setFrom}
        onBlur={() => onChangeFrom && onChangeFrom(from)}
        autoCapitalize="none"
        style={{
          borderWidth: 1,
          borderColor: theme.border,
          borderRadius: 8,
          padding: 8,
          color: theme.text,
          marginBottom: 20,
        }}
      />

      <Text style={{color: theme.textMuted, marginBottom: 6}}>Appearance</Text>
      <View style={{flexDirection: 'row', marginBottom: 24}}>
        {THEME_OPTIONS.map(opt => (
          <Pressable
            key={opt.key}
            accessibilityLabel={`Theme ${opt.label}`}
            onPress={() => onChangeTheme && onChangeTheme(opt.key)}
            style={{
              paddingVertical: 6,
              paddingHorizontal: 14,
              marginRight: 8,
              borderRadius: 6,
              backgroundColor:
                themeOverride === opt.key ? theme.selectedBg : 'transparent',
              borderWidth: 1,
              borderColor: theme.border,
            }}>
            <Text
              style={{
                color: themeOverride === opt.key ? theme.accent : theme.text,
                fontWeight: themeOverride === opt.key ? '600' : '400',
              }}>
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Pressable onPress={onSignOut}>
        <Text style={{color: theme.danger, fontWeight: '600'}}>Sign out</Text>
      </Pressable>
    </View>
  );
}
