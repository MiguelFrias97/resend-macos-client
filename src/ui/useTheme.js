import {useEffect, useState, useSyncExternalStore} from 'react';
import {useColorScheme, NativeModules} from 'react-native';
import {makeTheme} from './theme';
import {getOverride, subscribeOverride} from './themeOverride';

export function useTheme() {
  // 'auto' follows the OS; 'light'/'dark' force the scheme.
  const override = useSyncExternalStore(subscribeOverride, getOverride, getOverride);
  const systemScheme = useColorScheme();
  const scheme = override === 'auto' ? systemScheme : override;
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
