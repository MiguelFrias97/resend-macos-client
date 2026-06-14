import React from 'react';
import {View, Text, Pressable} from 'react-native';

const FILTERS = [
  {key: 'inbox', label: 'Inbox'},
  {key: 'unread', label: 'Unread'},
  {key: 'starred', label: 'Starred'},
  {key: 'archive', label: 'Archive'},
];

export default function Sidebar({selected, onSelect}) {
  return (
    <View style={{width: 160, paddingVertical: 8, backgroundColor: '#f2f0f5'}}>
      {FILTERS.map(f => (
        <Pressable
          key={f.key}
          onPress={() => onSelect(f.key)}
          style={{
            paddingVertical: 6,
            paddingHorizontal: 12,
            marginHorizontal: 6,
            borderRadius: 6,
            backgroundColor: selected === f.key ? '#d9d4e6' : 'transparent',
          }}>
          <Text
            style={{
              color: selected === f.key ? '#5b4aa6' : '#3a3a3a',
              fontWeight: selected === f.key ? '600' : '400',
            }}>
            {f.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
