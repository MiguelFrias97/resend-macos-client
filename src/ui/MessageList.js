import React from 'react';
import {FlatList, Pressable, View, Text} from 'react-native';
import {useTheme} from './useTheme';

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
      renderItem={({item}) => (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            borderBottomWidth: 1,
            borderBottomColor: theme.divider,
            backgroundColor:
              item.id === selectedId ? theme.selectedBg : 'transparent',
          }}>
          {!item.seen && item.direction !== 'sent' ? (
            <View
              testID="unread-dot"
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                marginLeft: 8,
                backgroundColor: theme.accent,
              }}
            />
          ) : null}
          <Pressable
            onPress={() => onSelect(item)}
            style={{flex: 1, paddingVertical: 8, paddingHorizontal: 12}}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
              <Text style={{fontWeight: item.seen ? '400' : '700', color: theme.text}}>{senderName(item.from)}</Text>
            </View>
            <Text numberOfLines={1} style={{color: theme.textMuted}}>{item.subject}</Text>
          </Pressable>
          {item.direction !== 'sent' ? (
            <>
              <Pressable
                accessibilityLabel={`Star ${item.subject}`}
                onPress={() => onToggleStar && onToggleStar(item)}
                style={{paddingHorizontal: 8, paddingVertical: 8}}>
                <Text style={{color: item.starred ? '#e0a800' : theme.textMuted, fontSize: 16}}>
                  {item.starred ? '★' : '☆'}
                </Text>
              </Pressable>
              <Pressable
                accessibilityLabel={`Archive ${item.subject}`}
                onPress={() => onArchive && onArchive(item)}
                style={{paddingHorizontal: 8, paddingVertical: 8}}>
                <Text style={{color: theme.textMuted, fontSize: 16}}>🗀</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      )}
    />
  );
}
