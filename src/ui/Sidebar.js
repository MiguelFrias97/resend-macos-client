import React from 'react';
import {View, Text, Pressable} from 'react-native';
import {useTheme} from './useTheme';
import {SP, RADIUS, TYPE} from './designTokens';

const FILTERS = [
  {key: 'inbox', label: 'Inbox', glyph: '▤'},
  {key: 'unread', label: 'Unread', glyph: '●'},
  {key: 'starred', label: 'Starred', glyph: '★'},
  {key: 'sent', label: 'Sent', glyph: '↗'},
  {key: 'archive', label: 'Archive', glyph: '▾'},
];

export default function Sidebar({selected, onSelect, counts = {}}) {
  const theme = useTheme();
  return (
    <View style={{width: 180, paddingVertical: SP(2)}}>
      <Text
        style={{
          ...TYPE.sectionHeader,
          color: theme.textFaint,
          paddingHorizontal: SP(4),
          paddingBottom: SP(1.5),
        }}>
        Mailboxes
      </Text>
      {FILTERS.map(f => {
        const isSelected = selected === f.key;
        const count = counts[f.key];
        const showCount = typeof count === 'number' && count > 0;
        return (
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
              backgroundColor: isSelected ? theme.selectedBg : 'transparent',
            }}>
            <Text
              style={{
                width: 18,
                textAlign: 'center',
                fontSize: 13,
                color: isSelected ? theme.onAccent : theme.textMuted,
              }}>
              {f.glyph}
            </Text>
            <Text
              style={{
                fontSize: 13,
                fontWeight: isSelected ? '500' : '400',
                color: isSelected ? theme.onAccent : theme.text,
                flex: 1,
              }}>
              {f.label}
            </Text>
            {showCount ? (
              <Text
                style={{
                  ...TYPE.meta,
                  fontVariant: ['tabular-nums'],
                  color: isSelected ? theme.onAccent : theme.textFaint,
                }}>
                {count}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
