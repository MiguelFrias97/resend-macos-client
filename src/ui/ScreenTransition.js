import React, {useEffect, useRef} from 'react';
import {Animated} from 'react-native';

// A calm entrance for full-window screens (Settings / Compose) so they rise into
// place instead of hard-cutting in. 150ms fade + a subtle scale from 0.98 — the
// difference between "moving through space" and "swapping HTML pages".
export default function ScreenTransition({children, style}) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 150,
      useNativeDriver: false,
    }).start();
  }, [anim]);
  return (
    <Animated.View
      style={[
        {
          flex: 1,
          opacity: anim,
          transform: [
            {scale: anim.interpolate({inputRange: [0, 1], outputRange: [0.98, 1]})},
          ],
        },
        style,
      ]}>
      {children}
    </Animated.View>
  );
}
