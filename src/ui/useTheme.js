import {useEffect, useState} from 'react';
import {useColorScheme, NativeModules} from 'react-native';
import {makeTheme} from './theme';

export function useTheme() {
  const scheme = useColorScheme();
  const [accent, setAccent] = useState(null);
  useEffect(() => {
    const mod = (NativeModules || {}).SystemAccent;
    if (mod && mod.getAccentColor) {
      mod
        .getAccentColor()
        .then(c => c && setAccent(c))
        .catch(() => {});
    }
  }, []);
  return makeTheme(scheme || 'light', accent || undefined);
}
