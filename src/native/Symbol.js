import React from 'react';
import {requireNativeComponent} from 'react-native';

// Native SF Symbol view (NSImageView + systemSymbolName), tinted to follow the
// theme. RN strips the "Manager" suffix, so this is the `SymbolView` component.
const SymbolView = requireNativeComponent('SymbolView');

// <Symbol name="tray" size={16} color={theme.textMuted} />
// The wrapper box is sized a touch larger than the glyph so it optically centers.
export default function Symbol({name, size = 15, weight = 'regular', color, style}) {
  return (
    <SymbolView
      name={name}
      pointSize={size}
      weight={weight}
      tintColor={color || '#000000'}
      style={[{width: size + 3, height: size + 3}, style]}
    />
  );
}
