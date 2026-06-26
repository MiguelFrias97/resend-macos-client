import React from 'react';
import {View, Text, TextInput} from 'react-native';
import {useTheme} from './useTheme';
import {SP, RADIUS} from './designTokens';

export default function SearchBar({value, onChange, inputRef}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        margin: SP(2),
        height: 28,
        paddingHorizontal: SP(2),
        borderRadius: RADIUS.sm,
        backgroundColor: theme.fieldFill,
      }}>
      <Text style={{color: theme.textFaint, fontSize: 13, marginRight: SP(1)}}>⌕</Text>
      <TextInput
        ref={inputRef}
        placeholder="Search"
        placeholderTextColor={theme.textFaint}
        value={value}
        onChangeText={onChange}
        style={{
          flex: 1,
          padding: 0,
          fontSize: 13,
          color: theme.text,
        }}
      />
    </View>
  );
}
