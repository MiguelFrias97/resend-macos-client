import React, {useEffect, useMemo, useRef, useState} from 'react';
import {View, Text, Pressable} from 'react-native';
import MessageList from './MessageList';
import MessageBody from './MessageBody';
import {createLocalStore} from '../data/localStore';
import {openDb} from '../data/db';
import {createMailSource} from '../net/mailSource';
import {startSyncLoop} from '../core/sync';

export default function InboxScreen({apiKey, makeStore, makeSource}) {
  const [messages, setMessages] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState(null);
  const [allowRemote, setAllowRemote] = useState(false);
  const [ready, setReady] = useState(false);
  const servicesRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    let stop = () => {};
    (async () => {
      const store = makeStore ? await makeStore() : await createLocalStore(openDb());
      const source = makeSource ? makeSource() : createMailSource({apiKey});
      if (cancelled) return;
      servicesRef.current = {store, source};
      setReady(true);
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

  // Body fetch/render dependencies, stable once the services are ready.
  // Inline cid: image caching (cacheCidImages) is added in M3 Task 8.
  const bodyDeps = useMemo(() => {
    if (!ready || !servicesRef.current) return null;
    const {store, source} = servicesRef.current;
    return {
      getMessage: id => store.getMessage(id),
      fetchBody: id => source.getReceivedEmail(id),
      saveBody: (id, b) => store.saveBody(id, b),
      saveAttachments: (id, a) => store.saveAttachments(id, a),
    };
  }, [ready]);

  // Reset remote-image consent whenever a different message is opened.
  const onSelect = msg => {
    setAllowRemote(false);
    setSelected(msg);
  };

  return (
    <View style={{flex: 1, flexDirection: 'row'}}>
      <View style={{width: 320, borderRightWidth: 1, borderRightColor: '#e5e5e5'}}>
        {error ? (
          <Text style={{padding: 12, color: '#b00'}}>Sync error: {error}</Text>
        ) : null}
        <MessageList messages={messages} onSelect={onSelect} selectedId={selected?.id} />
      </View>
      <View style={{flex: 1}}>
        {selected && bodyDeps ? (
          <View style={{flex: 1}}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: '#eee',
              }}>
              <Text style={{fontSize: 16, fontWeight: '600'}} numberOfLines={1}>
                {selected.subject}
              </Text>
              {!allowRemote ? (
                <Pressable onPress={() => setAllowRemote(true)}>
                  <Text style={{color: '#3a6ea5'}}>Load remote images</Text>
                </Pressable>
              ) : null}
            </View>
            <MessageBody
              messageId={selected.id}
              allowRemote={allowRemote}
              deps={bodyDeps}
            />
          </View>
        ) : (
          <View style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}>
            <Text style={{color: '#999'}}>Select a message</Text>
          </View>
        )}
      </View>
    </View>
  );
}
