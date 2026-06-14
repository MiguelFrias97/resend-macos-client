import React, {useEffect, useState} from 'react';
import {View, Text} from 'react-native';
import MessageList from './MessageList';
import {createLocalStore} from '../data/localStore';
import {openDb} from '../data/db';
import {createMailSource} from '../net/mailSource';
import {startSyncLoop} from '../core/sync';

export default function InboxScreen({apiKey, makeStore, makeSource}) {
  const [messages, setMessages] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let stop = () => {};
    (async () => {
      const store = makeStore ? await makeStore() : await createLocalStore(openDb());
      const source = makeSource ? makeSource() : createMailSource({apiKey});
      if (cancelled) return;
      const refresh = async () => {
        const list = await store.listInbox();
        if (!cancelled) setMessages(list);
      };
      await refresh();
      const stopSync = startSyncLoop({
        source,
        store,
        onError: e => {
          if (!cancelled) setError(e.message);
        },
        onTick: () => refresh(),
      });
      stop = () => stopSync();
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [apiKey, makeStore, makeSource]);

  return (
    <View style={{flex: 1, flexDirection: 'row'}}>
      <View style={{width: 320, borderRightWidth: 1, borderRightColor: '#e5e5e5'}}>
        {error ? (
          <Text style={{padding: 12, color: '#b00'}}>Sync error: {error}</Text>
        ) : null}
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
