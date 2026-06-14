import React, {useState} from 'react';
import {View, Text, TextInput, Button} from 'react-native';
import {verifyApiKey} from '../net/verifyApiKey';
import {setApiKey} from '../native/Keychain';

export default function Onboarding({onComplete, deps = {}}) {
  const verify = deps.verify || verifyApiKey;
  const save = deps.save || setApiKey;
  const [key, setKey] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

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
    <View style={{padding: 24, gap: 12, maxWidth: 420}}>
      <Text style={{fontSize: 20, fontWeight: '600'}}>Connect Resend</Text>
      <TextInput
        placeholder="re_..."
        value={key}
        onChangeText={setKey}
        autoCapitalize="none"
        secureTextEntry
        style={{borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 8}}
      />
      {error ? <Text style={{color: 'red'}}>{error}</Text> : null}
      <Button
        title={busy ? 'Connecting…' : 'Connect'}
        onPress={connect}
        disabled={busy}
      />
    </View>
  );
}
