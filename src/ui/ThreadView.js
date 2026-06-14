import React from 'react';
import {ScrollView, View, Text} from 'react-native';
import MessageBody from './MessageBody';

export default function ThreadView({messages, bodyDeps, allowRemote}) {
  return (
    <ScrollView style={{flex: 1}}>
      {messages.map(m => (
        <View key={m.id} style={{borderBottomWidth: 1, borderBottomColor: '#eee'}}>
          <View
            style={{
              paddingHorizontal: 16,
              paddingVertical: 8,
              backgroundColor: m.direction === 'sent' ? '#f6f4fb' : '#fff',
            }}>
            <Text style={{fontWeight: '600'}}>{m.direction === 'sent' ? 'You' : m.from}</Text>
            <Text style={{color: '#999', fontSize: 12}}>{m.receivedAt}</Text>
          </View>
          <View style={{height: 240}}>
            <MessageBody messageId={m.id} allowRemote={allowRemote} deps={bodyDeps} />
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
