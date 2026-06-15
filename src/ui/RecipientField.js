import React, {useState} from 'react';
import {View, Text, TextInput, Pressable} from 'react-native';
import {useTheme} from './useTheme';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A recipient input that turns typed addresses into removable chips. `value` is
// an array of address strings; `onChange` reports the new array. Invalid
// addresses are kept but flagged (red) so the user can fix them before sending.
export default function RecipientField({label, placeholder, value = [], onChange}) {
  const theme = useTheme();
  const [text, setText] = useState('');

  const commit = raw => {
    const parts = String(raw)
      .split(/[,;]/)
      .map(s => s.trim())
      .filter(Boolean);
    if (parts.length) onChange([...value, ...parts]);
    setText('');
  };

  const handleChange = t => {
    if (/[,;]/.test(t)) commit(t);
    else setText(t);
  };

  const remove = i => onChange(value.filter((_, idx) => idx !== i));

  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: theme.divider,
        paddingVertical: 6,
        paddingHorizontal: 8,
      }}>
      {label ? (
        <Text style={{color: theme.textMuted, marginRight: 6}}>{label}</Text>
      ) : null}
      {value.map((addr, i) => (
        <Pressable
          key={`${addr}-${i}`}
          accessibilityLabel={`Remove ${addr}`}
          onPress={() => remove(i)}
          style={{
            backgroundColor: theme.selectedBg,
            borderRadius: 10,
            paddingVertical: 2,
            paddingHorizontal: 8,
            marginRight: 4,
            marginVertical: 2,
          }}>
          <Text style={{color: EMAIL.test(addr) ? theme.accent : theme.danger}}>
            {addr} ✕
          </Text>
        </Pressable>
      ))}
      <TextInput
        placeholder={value.length ? '' : placeholder || label}
        placeholderTextColor={theme.textMuted}
        value={text}
        onChangeText={handleChange}
        onSubmitEditing={() => commit(text)}
        onBlur={() => commit(text)}
        autoCapitalize="none"
        style={{flex: 1, minWidth: 120, color: theme.text, padding: 2}}
      />
    </View>
  );
}
