import React from 'react';
import {FlatList, Pressable, View, Text} from 'react-native';

function senderName(from) {
  const m = /^(.*?)\s*</.exec(from || '');
  return m ? m[1] : from;
}

export default function MessageList({messages, onSelect, selectedId}) {
  return (
    <FlatList
      data={messages}
      keyExtractor={m => m.id}
      renderItem={({item}) => (
        <Pressable
          onPress={() => onSelect(item)}
          style={{
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderBottomWidth: 1,
            borderBottomColor: '#eee',
            backgroundColor: item.id === selectedId ? '#ece8f7' : 'transparent',
          }}>
          <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
            <Text style={{fontWeight: item.seen ? '400' : '700'}}>{senderName(item.from)}</Text>
          </View>
          <Text numberOfLines={1} style={{color: '#333'}}>{item.subject}</Text>
        </Pressable>
      )}
    />
  );
}
