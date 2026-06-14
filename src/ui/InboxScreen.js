import React, {useEffect, useMemo, useRef, useState} from 'react';
import {View, Text, Pressable} from 'react-native';
import MessageList from './MessageList';
import MessageBody from './MessageBody';
import AttachmentTray from './AttachmentTray';
import {createLocalStore} from '../data/localStore';
import {openDb} from '../data/db';
import {createMailSource} from '../net/mailSource';
import {startSyncLoop} from '../core/sync';
import {
  sanitizeFilename,
  isDangerousFilename,
  typeMismatch,
  isInlineImage,
} from '../files/attachmentSafety';

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

  // Resolve an attachment's presigned URL, then let the native module download
  // the bytes straight into the per-message cache (no base64 across the bridge).
  // Inline (cid) images pass quarantine=false since they're served internally.
  const downloadToCache = async (messageId, att, name, quarantine = true) => {
    const services = servicesRef.current;
    if (!services) throw new Error('services not ready');
    const AttachmentFile = require('../native/AttachmentFile');
    const meta = await services.source.getAttachment(messageId, att.id);
    if (!meta.downloadUrl) throw new Error('no download url');
    return AttachmentFile.downloadToCache(messageId, name, meta.downloadUrl, quarantine);
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
            // Skip only if we have it AND the cached file is still on disk
            // (the recorded flag can go stale if the cache was evicted).
            if (
              att.downloaded &&
              att.localPath &&
              (await AttachmentFile.exists(att.localPath))
            ) {
              continue;
            }
            // Lowercase the name: WKWebView lowercases the cidcache:// host, so
            // the cache filename must match for uppercase Content-IDs to resolve.
            const name = String(att.contentId).toLowerCase();
            const path = await downloadToCache(id, att, name, false);
            await store.markAttachmentDownloaded(att.id, path);
          }
          return await AttachmentFile.cacheDir(id);
        } catch (e) {
          return '';
        }
      },
      onLoaded: async id => {
        const list = await store.listAttachments(id);
        // Inline (cid) images are rendered in the body — don't also list them
        // as saveable attachment chips. Unreferenced 'inline' parts (no cid)
        // are still shown so they're never lost.
        setAttachments(list.filter(a => !isInlineImage(a)));
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
      const dangerous =
        isDangerousFilename(att.filename) || typeMismatch(att.contentType, att.filename);
      // Always download a fresh quarantined copy for saving — the cid cache (if
      // any) is non-quarantined and stored under a different name.
      const path = await downloadToCache(selected.id, att, safe, true);
      await AttachmentFile.saveAs(path, safe, dangerous);
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
