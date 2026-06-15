import React, {useState} from 'react';
import {View, Text, TextInput, Pressable} from 'react-native';
import {verifyApiKey} from '../net/verifyApiKey';
import {setApiKey} from '../native/Keychain';
import {useTheme} from './useTheme';
import {SP, RADIUS, ELEV, TYPE} from './designTokens';

export default function Onboarding({onComplete, deps = {}}) {
  const theme = useTheme();
  const verify = deps.verify || verifyApiKey;
  const save = deps.save || setApiKey;
  const [key, setKey] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState(false);

  async function connect() {
    setBusy(true);
    setError(null);
    const ok = await verify(key);
    if (!ok) {
      setError('That key was rejected by Resend.');
      setBusy(false);
      return;
    }
    await save(key);
    setBusy(false);
    onComplete(key);
  }

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.bg,
      }}>
      <View
        style={{
          width: 380,
          padding: SP(8),
          borderRadius: RADIUS.lg,
          backgroundColor: theme.bg,
          ...ELEV.sheet,
        }}>
        <Text style={{...TYPE.title, fontSize: 22, color: theme.text, textAlign: 'center'}}>
          Connect Resend
        </Text>
        <Text style={{...TYPE.meta, color: theme.textMuted, marginTop: SP(1.5), textAlign: 'center'}}>
          Paste your Resend API key to get started.
        </Text>
        <TextInput
          placeholder="re_..."
          placeholderTextColor={theme.textMuted}
          value={key}
          onChangeText={setKey}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoCapitalize="none"
          secureTextEntry
          style={{
            height: 36,
            borderRadius: RADIUS.sm,
            borderWidth: 1,
            borderColor: focused ? theme.accent : theme.border,
            backgroundColor: theme.surface2,
            paddingHorizontal: SP(3),
            fontSize: 13.5,
            fontFamily: 'ui-monospace',
            color: theme.text,
            marginTop: SP(4),
          }}
        />
        {error ? (
          <Text style={{...TYPE.meta, color: theme.danger, marginTop: SP(1.5)}}>
            {error}
          </Text>
        ) : null}
        <Pressable
          onPress={connect}
          disabled={busy}
          style={{
            height: 32,
            borderRadius: RADIUS.sm,
            backgroundColor: theme.accent,
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: SP(4),
          }}>
          <Text style={{...TYPE.button, color: '#fff'}}>
            {busy ? 'Connecting…' : 'Connect'}
          </Text>
        </Pressable>
        <Text
          style={{
            ...TYPE.meta,
            color: theme.textFaint,
            textAlign: 'center',
            marginTop: SP(3),
          }}>
          🔒 Your key is stored securely in the macOS Keychain.
        </Text>
      </View>
    </View>
  );
}
