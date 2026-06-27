import React, {useState} from 'react';
import {View, Text, TextInput, Pressable} from 'react-native';
import {useTheme} from './useTheme';
import {SP, RADIUS, TYPE} from './designTokens';

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
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);

  return (
    <View style={{flex: 1, backgroundColor: theme.bg, padding: SP(4)}}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: SP(4),
        }}>
        <Text style={{...TYPE.title, color: theme.text}}>Settings</Text>
        <Pressable onPress={onClose}>
          <Text style={{...TYPE.button, color: theme.accent}}>Done</Text>
        </Pressable>
      </View>

      <View
        style={{
          borderRadius: RADIUS.md,
          borderWidth: 1,
          borderColor: theme.border,
          backgroundColor: theme.surface2,
          marginBottom: SP(6),
        }}>
        <View
          style={{
            minHeight: 44,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: SP(3),
            paddingVertical: SP(2),
            borderBottomWidth: 1,
            borderBottomColor: theme.divider,
          }}>
          <Text style={{...TYPE.body, color: theme.textMuted}}>From address</Text>
          <TextInput
            placeholder="you@yourdomain.com"
            placeholderTextColor={theme.textMuted}
            value={from}
            onChangeText={setFrom}
            onBlur={() => onChangeFrom && onChangeFrom(from)}
            autoCapitalize="none"
            style={{
              flex: 1,
              textAlign: 'right',
              marginLeft: SP(3),
              ...TYPE.body,
              color: theme.text,
            }}
          />
        </View>

        <View
          style={{
            minHeight: 44,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: SP(3),
            paddingVertical: SP(2),
          }}>
          <Text style={{...TYPE.body, color: theme.textMuted}}>Appearance</Text>
          <View style={{flexDirection: 'row'}}>
            {THEME_OPTIONS.map(opt => (
              <Pressable
                key={opt.key}
                accessibilityLabel={`Theme ${opt.label}`}
                onPress={() => onChangeTheme && onChangeTheme(opt.key)}
                style={{
                  paddingVertical: SP(1.5),
                  paddingHorizontal: SP(3),
                  marginLeft: SP(2),
                  borderRadius: RADIUS.sm,
                  backgroundColor:
                    themeOverride === opt.key ? theme.selectedBg : 'transparent',
                  borderWidth: 1,
                  borderColor:
                    themeOverride === opt.key ? theme.accent : theme.border,
                }}>
                <Text
                  style={{
                    ...TYPE.button,
                    color: themeOverride === opt.key ? theme.onAccent : theme.text,
                  }}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      {confirmingSignOut ? (
        <View style={{gap: SP(2)}}>
          <Text style={{...TYPE.body, color: theme.text}}>Sign out?</Text>
          <Text style={{...TYPE.meta, color: theme.textMuted, maxWidth: 360}}>
            Mail cached on this Mac will be removed, and you'll need your Resend
            API key to sign back in.
          </Text>
          <View style={{flexDirection: 'row', gap: SP(2)}}>
            <Pressable
              onPress={onSignOut}
              style={{
                justifyContent: 'center',
                height: 30,
                paddingHorizontal: SP(4),
                borderRadius: RADIUS.sm,
                backgroundColor: theme.danger,
              }}>
              <Text style={{...TYPE.button, color: '#fff'}}>Sign out</Text>
            </Pressable>
            <Pressable
              onPress={() => setConfirmingSignOut(false)}
              style={{
                justifyContent: 'center',
                height: 30,
                paddingHorizontal: SP(3),
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: RADIUS.sm,
              }}>
              <Text style={{...TYPE.button, color: theme.text}}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          onPress={() => setConfirmingSignOut(true)}
          style={{
            alignSelf: 'flex-start',
            justifyContent: 'center',
            height: 30,
            paddingHorizontal: SP(3),
            borderWidth: 1,
            borderColor: theme.danger,
            borderRadius: RADIUS.sm,
          }}>
          <Text style={{...TYPE.button, color: theme.danger}}>Sign out</Text>
        </Pressable>
      )}
    </View>
  );
}
