import React, {useState} from 'react';
import {View, Text, TextInput, Pressable} from 'react-native';
import Symbol from '../native/Symbol';
import {useTheme} from './useTheme';
import {isEmail} from '../compose/assembleCompose';
import {SP, RADIUS, TYPE} from './designTokens';

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
    if (/[,;]/.test(t)) {
      // Commit only the tokens before a separator; keep the in-progress trailing
      // token in the field (don't yank a half-typed address into a chip).
      const segments = t.split(/[,;]/);
      const tail = segments.pop();
      const ready = segments.map(s => s.trim()).filter(Boolean);
      if (ready.length) onChange([...value, ...ready]);
      setText(tail);
    } else {
      setText(t);
    }
  };

  const remove = i => onChange(value.filter((_, idx) => idx !== i));

  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: SP(1.5),
        minHeight: 38,
        borderBottomWidth: 1,
        borderBottomColor: theme.divider,
        paddingVertical: SP(1),
        paddingHorizontal: SP(2),
      }}>
      {label ? (
        <Text style={{...TYPE.meta, width: 56, color: theme.textMuted}}>{label}</Text>
      ) : null}
      {value.map((addr, i) => {
        const valid = isEmail(addr);
        return (
          <Pressable
            key={`${addr}-${i}`}
            accessibilityLabel={`Remove ${addr}`}
            onPress={() => remove(i)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: SP(1),
              height: 22,
              paddingHorizontal: SP(2),
              borderRadius: RADIUS.pill,
              backgroundColor: valid ? theme.accent + '1A' : theme.danger + '1A',
            }}>
            {!valid ? (
              <Symbol name="exclamationmark.triangle.fill" size={11} color={theme.danger} />
            ) : null}
            <Text style={{fontSize: 12.5, color: valid ? theme.accent : theme.danger}}>
              {addr}
            </Text>
            <Symbol name="xmark" size={10} color={valid ? theme.accent : theme.danger} />
          </Pressable>
        );
      })}
      <TextInput
        placeholder={value.length ? '' : placeholder || ''}
        placeholderTextColor={theme.textMuted}
        value={text}
        onChangeText={handleChange}
        onSubmitEditing={() => commit(text)}
        onBlur={() => commit(text)}
        autoCapitalize="none"
        style={{flex: 1, minWidth: 120, ...TYPE.meta, color: theme.text}}
      />
    </View>
  );
}
