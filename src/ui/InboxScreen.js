import React, {useEffect, useMemo, useRef, useState} from 'react';
import {View, Text, Pressable} from 'react-native';
import MessageList from './MessageList';
import MessageBody from './MessageBody';
import AttachmentTray from './AttachmentTray';
import {createLocalStore} from '../data/localStore';
import {openDb} from '../data/db';
import {createMailSource} from '../net/mailSource';
import {startSyncLoop} from '../core/sync';
import {arrayBufferToBase64} from '../files/base64';
import {sanitizeFilename} from '../files/attachmentSafety';

export default function InboxScreen({apiKey, makeStore, makeSource}) {
  const [messages, setMessages] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState(null);
  const [allowRemote, setAllowRemote] = useState(false);
  const [attachments, setAttachments] = useState([]);
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

  // Download an attachment's bytes into the per-message cache, returning the path.
  const downloadToCache = async (messageId, att, name) => {
    const {source} = servicesRef.current;
    const AttachmentFile = require('../native/AttachmentFile');
    const meta = await source.getAttachment(messageId, att.id);
    if (!meta.downloadUrl) throw new Error('no download url');
    const res = await source.downloadBytes(meta.downloadUrl);
    const buf = await res.arrayBuffer();
    return AttachmentFile.writeToCache(messageId, name, arrayBufferToBase64(buf));
  };

  const bodyDeps = useMemo(() => {
    if (!ready || !servicesRef.current) return null;
    const {store, source} = servicesRef.current;
    return {
      getMessage: id => store.getMessage(id),
      fetchBody: id => source.getReceivedEmail(id),
      saveBody: (id, b) => store.saveBody(id, b),
      saveAttachments: (id, a) => store.saveAttachments(id, a),
      // Cache each inline (cid) image so the WKWebView's cidcache:// handler
      // resolves it. Reads attachments from the store, so it works on both the
      // fresh-fetch path and revisits to an already-cached body.
      cacheCidImages: async id => {
        try {
          const AttachmentFile = require('../native/AttachmentFile');
          const atts = await store.listAttachments(id);
          for (const att of atts) {
            if (!att.contentId) continue;
            await downloadToCache(id, att, att.contentId);
          }
          return await AttachmentFile.cacheDir(id);
        } catch (e) {
          return '';
        }
      },
      onLoaded: async id => {
        const list = await store.listAttachments(id);
        setAttachments(list);
      },
    };
    // downloadToCache reads servicesRef.current, which is stable once ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const onSelect = msg => {
    setAllowRemote(false);
    setAttachments([]);
    setSelected(msg);
  };

  const onSaveAttachment = async att => {
    try {
      const AttachmentFile = require('../native/AttachmentFile');
      const safe = sanitizeFilename(att.filename);
      const path = att.localPath || (await downloadToCache(selected.id, att, safe));
      await AttachmentFile.saveAs(path, safe);
    } catch (e) {
      // User cancelled the save panel, or a transient failure — nothing to surface.
    }
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
            <AttachmentTray attachments={attachments} onSave={onSaveAttachment} />
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
