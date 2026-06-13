import React, {useEffect, useState} from 'react';
import {View, ActivityIndicator} from 'react-native';
import Onboarding from './src/ui/Onboarding';
import InboxScreen from './src/ui/InboxScreen';
import {getApiKey} from './src/native/Keychain';

export default function App() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    getApiKey().then(k => {
      setAuthed(Boolean(k));
      setReady(true);
    });
  }, []);

  if (!ready) {
    return (
      <View style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}>
        <ActivityIndicator />
      </View>
    );
  }
  return authed ? (
    <InboxScreen />
  ) : (
    <Onboarding onComplete={() => setAuthed(true)} />
  );
}
