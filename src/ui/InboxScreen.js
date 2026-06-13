import React, {useEffect, useState} from 'react';
import {View, Text} from 'react-native';
import MessageList from './MessageList';
import {createLocalStore} from '../data/localStore';
import {openDb} from '../data/db';
import {createMailSource} from '../net/mailSource';
import {startSyncLoop} from '../core/sync';
import {getApiKey} from '../native/Keychain';

export default function InboxScreen() {
  const [messages, setMessages] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let stop = () => {};
    (async () => {
      const apiKey = await getApiKey();
      const store = await createLocalStore(openDb());
      const source = createMailSource({apiKey});
      const refresh = async () => setMessages(await store.listInbox());
      await refresh();
      const stopSync = startSyncLoop({source, store});
      const ui = setInterval(refresh, 5000);
      stop = () => {
        clearInterval(ui);
        stopSync();
      };
    })();
    return () => stop();
  }, []);

  return (
    <View style={{flex: 1, flexDirection: 'row'}}>
      <View style={{width: 320, borderRightWidth: 1, borderRightColor: '#e5e5e5'}}>
        <MessageList messages={messages} onSelect={setSelected} selectedId={selected?.id} />
      </View>
      <View style={{flex: 1, padding: 16}}>
        {selected ? (
          <Text style={{fontSize: 16, fontWeight: '600'}}>{selected.subject}</Text>
        ) : (
          <Text style={{color: '#999'}}>Select a message</Text>
        )}
      </View>
    </View>
  );
}
