import React from 'react';
import {View, Text, Pressable} from 'react-native';
import {useTheme} from './useTheme';
import {SP, RADIUS, TYPE} from './designTokens';
import Symbol from '../native/Symbol';

const FILTERS = [
  {key: 'inbox', label: 'Inbox', symbol: 'tray'},
  {key: 'unread', label: 'Unread', symbol: 'envelope.badge'},
  {key: 'starred', label: 'Starred', symbol: 'star'},
  {key: 'sent', label: 'Sent', symbol: 'paperplane'},
  {key: 'archive', label: 'Archive', symbol: 'archivebox'},
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
            style={({hovered}) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: SP(2.25),
              height: 28,
              paddingHorizontal: SP(2),
              marginHorizontal: SP(2),
              borderRadius: RADIUS.sm,
              // Calm selection: a tint (matching the message list), not a full
              // accent pill. Accent shows only in the icon, so selection reads
              // the same way across both panes.
              backgroundColor: isSelected
                ? theme.selectedFill
                : hovered
                ? theme.hover
                : 'transparent',
            })}>
            <View style={{width: 18, alignItems: 'center'}}>
              <Symbol
                name={f.symbol}
                size={16}
                color={isSelected ? theme.accent : theme.textMuted}
              />
            </View>
            <Text
              style={{
                fontSize: 13,
                fontWeight: isSelected ? '600' : '400',
                color: theme.text,
                flex: 1,
              }}>
              {f.label}
            </Text>
            {showCount ? (
              <Text
                style={{
                  ...TYPE.meta,
                  fontVariant: ['tabular-nums'],
                  color: isSelected ? theme.accent : theme.textFaint,
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
