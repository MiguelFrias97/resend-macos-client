import React, {useState} from 'react';
import {View, Text, Pressable} from 'react-native';
import Composer from './Composer';

// Temporary surface to exercise the rich-text editor in isolation during M5.
// M6 replaces this with the real reply/compose screen wired to the send pipeline.
export default function ComposeScratchScreen({onClose}) {
  const [result, setResult] = useState({html: '', inlineImages: []});

  return (
    <View style={{flex: 1, backgroundColor: '#fff'}}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: '#e5e5e5',
        }}
      >
        <Text style={{fontSize: 15, fontWeight: '600'}}>
          Composer (scratch)
        </Text>
        <Pressable onPress={onClose}>
          <Text style={{color: '#3a6ea5'}}>Close</Text>
        </Pressable>
      </View>
      <Composer onChange={setResult} />
      <View style={{padding: 8, borderTopWidth: 1, borderTopColor: '#eee'}}>
        <Text style={{color: '#888'}}>
          HTML: {result.html.length} chars · inline images:{' '}
          {result.inlineImages.length}
        </Text>
      </View>
    </View>
  );
}
