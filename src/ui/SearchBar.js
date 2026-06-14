import React from 'react';
import {TextInput} from 'react-native';
import {useTheme} from './useTheme';

export default function SearchBar({value, onChange}) {
  const theme = useTheme();
  return (
    <TextInput
      placeholder="Search"
      placeholderTextColor={theme.textMuted}
      value={value}
      onChangeText={onChange}
      style={{
        margin: 8,
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: 8,
        color: theme.text,
      }}
    />
  );
}
