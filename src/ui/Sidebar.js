import React from 'react';
import {View, Text, Pressable} from 'react-native';
import {useTheme} from './useTheme';

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
    <View style={{width: 160, paddingVertical: 8, backgroundColor: theme.panel}}>
      {FILTERS.map(f => (
        <Pressable
          key={f.key}
          onPress={() => onSelect(f.key)}
          style={{
            paddingVertical: 6,
            paddingHorizontal: 12,
            marginHorizontal: 6,
            borderRadius: 6,
            backgroundColor:
              selected === f.key ? theme.selectedBg : 'transparent',
          }}>
          <Text
            style={{
              color: selected === f.key ? theme.accent : theme.text,
              fontWeight: selected === f.key ? '600' : '400',
            }}>
            {f.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
