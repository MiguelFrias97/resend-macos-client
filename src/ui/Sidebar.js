import React from 'react';
import {View, Text, Pressable} from 'react-native';
import {useTheme} from './useTheme';
import {SP, RADIUS} from './designTokens';

const FILTERS = [
  {key: 'inbox', label: 'Inbox'},
  {key: 'unread', label: 'Unread'},
  {key: 'starred', label: 'Starred'},
  {key: 'sent', label: 'Sent'},
  {key: 'archive', label: 'Archive'},
];

export default function Sidebar({selected, onSelect}) {
  const theme = useTheme();
  return (
    <View style={{width: 160, paddingVertical: SP(2)}}>
      {FILTERS.map(f => (
        <Pressable
          key={f.key}
          onPress={() => onSelect(f.key)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: SP(2.25),
            height: 28,
            paddingHorizontal: SP(2),
            marginHorizontal: SP(2),
            borderRadius: RADIUS.sm,
            backgroundColor:
              selected === f.key ? theme.selectedBg : 'transparent',
          }}>
          <Text
            style={{
              fontSize: 13,
              fontWeight: selected === f.key ? '500' : '400',
              color: selected === f.key ? theme.selectedText : theme.text,
              flex: 1,
            }}>
            {f.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
