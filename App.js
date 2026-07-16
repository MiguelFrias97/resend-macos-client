import React, {useEffect, useState} from 'react';
import {View, ActivityIndicator} from 'react-native';
import Onboarding from './src/ui/Onboarding';
import InboxScreen from './src/ui/InboxScreen';
import {getApiKey} from './src/native/Keychain';

export default function App() {
  const [ready, setReady] = useState(false);
  const [apiKey, setApiKey] = useState(null);
  // True only when the current session started from a fresh onboarding (not a
  // key restored from the Keychain). Gates the first-run launch-at-login default
  // so upgrading users aren't auto-enrolled.
  const [freshSignIn, setFreshSignIn] = useState(false);

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
    <InboxScreen
      apiKey={apiKey}
      freshSignIn={freshSignIn}
      onSignOut={() => {
        setFreshSignIn(false);
        setApiKey(null);
      }}
    />
  ) : (
    <Onboarding
      onComplete={k => {
        setFreshSignIn(true);
        setApiKey(k);
      }}
    />
  );
}
