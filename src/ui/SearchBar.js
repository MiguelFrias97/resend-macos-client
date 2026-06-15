import React from 'react';
import {TextInput} from 'react-native';
import {useTheme} from './useTheme';
import {SP, RADIUS} from './designTokens';

export default function SearchBar({value, onChange}) {
  const theme = useTheme();
  return (
    <TextInput
      placeholder="Search"
      placeholderTextColor={theme.textFaint}
      value={value}
      onChangeText={onChange}
      style={{
        margin: SP(2),
        height: 28,
        paddingHorizontal: SP(2),
        borderRadius: RADIUS.sm,
        backgroundColor: theme.text + '0E',
        fontSize: 13,
        color: theme.text,
      }}
    />
  );
}
