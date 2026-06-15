import React, {useEffect, useState} from 'react';
import {View, ActivityIndicator} from 'react-native';
import Onboarding from './src/ui/Onboarding';
import InboxScreen from './src/ui/InboxScreen';
import {getApiKey} from './src/native/Keychain';

export default function App() {
  const [ready, setReady] = useState(false);
  const [apiKey, setApiKey] = useState(null);

  useEffect(() => {
    getApiKey().then(k => {
      setApiKey(k || null);
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
  return apiKey ? (
    <InboxScreen apiKey={apiKey} onSignOut={() => setApiKey(null)} />
  ) : (
    <Onboarding onComplete={k => setApiKey(k)} />
  );
}
