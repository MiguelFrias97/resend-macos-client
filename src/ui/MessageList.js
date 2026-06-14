import React from 'react';
import {FlatList, Pressable, View, Text} from 'react-native';

function senderName(from) {
  const m = /^(.*?)\s*</.exec(from || '');
  return m ? m[1] : from;
}

export default function MessageList({messages, onSelect, selectedId, onToggleStar, onArchive}) {
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
            borderBottomColor: '#eee',
            backgroundColor: item.id === selectedId ? '#ece8f7' : 'transparent',
          }}>
          {!item.seen ? (
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                marginLeft: 8,
                backgroundColor: '#5b4aa6',
              }}
            />
          ) : null}
          <Pressable
            onPress={() => onSelect(item)}
            style={{flex: 1, paddingVertical: 8, paddingHorizontal: 12}}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
              <Text style={{fontWeight: item.seen ? '400' : '700'}}>{senderName(item.from)}</Text>
            </View>
            <Text numberOfLines={1} style={{color: '#333'}}>{item.subject}</Text>
          </Pressable>
          <Pressable
            accessibilityLabel={`Star ${item.subject}`}
            onPress={() => onToggleStar && onToggleStar(item)}
            style={{paddingHorizontal: 8, paddingVertical: 8}}>
            <Text style={{color: item.starred ? '#e0a800' : '#bbb', fontSize: 16}}>
              {item.starred ? '★' : '☆'}
            </Text>
          </Pressable>
          <Pressable
            accessibilityLabel={`Archive ${item.subject}`}
            onPress={() => onArchive && onArchive(item)}
            style={{paddingHorizontal: 8, paddingVertical: 8}}>
            <Text style={{color: '#888', fontSize: 16}}>🗀</Text>
          </Pressable>
        </View>
      )}
    />
  );
}
