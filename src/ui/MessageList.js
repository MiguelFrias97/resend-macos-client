import React from 'react';
import {FlatList, Pressable, View, Text} from 'react-native';
import {useTheme} from './useTheme';
import {SP, TYPE} from './designTokens';

function senderName(from) {
  const m = /^(.*?)\s*</.exec(from || '');
  return m ? m[1] : from;
}

export default function MessageList({messages, onSelect, selectedId, onToggleStar, onArchive}) {
  const theme = useTheme();
  return (
    <FlatList
      data={messages}
      keyExtractor={m => m.id}
      renderItem={({item}) => {
        const selected = item.id === selectedId;
        const unread = !item.seen && item.direction !== 'sent';
        return (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            columnGap: SP(2),
            paddingTop: SP(2.75),
            paddingBottom: SP(3),
            paddingLeft: SP(3),
            paddingRight: SP(4),
            borderBottomWidth: 1,
            borderBottomColor: theme.divider,
            backgroundColor: selected ? theme.selectedBg : 'transparent',
          }}>
          <View style={{width: 8, marginTop: SP(1.5)}}>
            {unread ? (
              <View
                testID="unread-dot"
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: selected ? '#fff' : theme.accent,
                }}
              />
            ) : null}
          </View>
          <Pressable
            onPress={() => onSelect(item)}
            style={{flex: 1}}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
              <Text style={{...TYPE.sender, color: selected ? '#fff' : theme.text}}>{senderName(item.from)}</Text>
            </View>
            <Text
              numberOfLines={1}
              style={{...TYPE.subject, fontWeight: unread ? '600' : '400', color: selected ? '#fff' : theme.text}}>
              {item.subject}
            </Text>
          </Pressable>
          {item.direction !== 'sent' ? (
            <>
              <Pressable
                accessibilityLabel={`Star ${item.subject}`}
                onPress={() => onToggleStar && onToggleStar(item)}
                style={{paddingHorizontal: SP(2), paddingVertical: SP(2)}}>
                <Text style={{color: item.starred ? (selected ? '#fff' : '#E0A33A') : (selected ? 'rgba(255,255,255,0.82)' : theme.textMuted), fontSize: 16}}>
                  {item.starred ? '★' : '☆'}
                </Text>
              </Pressable>
              <Pressable
                accessibilityLabel={`Archive ${item.subject}`}
                onPress={() => onArchive && onArchive(item)}
                style={{paddingHorizontal: SP(2), paddingVertical: SP(2)}}>
                <Text style={{color: selected ? 'rgba(255,255,255,0.82)' : theme.textMuted, fontSize: 16}}>🗀</Text>
              </Pressable>
            </>
          ) : null}
        </View>
        );
      }}
    />
  );
}
