import React, {useEffect, useMemo, useRef, useState} from 'react';
import {View, Text, Pressable} from 'react-native';
import MessageList from './MessageList';
import AttachmentTray from './AttachmentTray';
import ReplyComposer from './ReplyComposer';
import Sidebar from './Sidebar';
import SearchBar from './SearchBar';
import ThreadView from './ThreadView';
import ComposeSheet from './ComposeSheet';
import EmptyState from './EmptyState';
import {useTheme} from './useTheme';
import {notify} from '../native/Notifications';
import {createLocalStore} from '../data/localStore';
import {openDb} from '../data/db';
import {createMailSource} from '../net/mailSource';
import {createSender} from '../net/sender';
import {startSyncLoop} from '../core/sync';
import {sendReply, processOutbox} from '../core/outbox';
import {replyPayloadError} from '../reply/assembleReply';
import {
  sanitizeFilename,
  isDangerousFilename,
  typeMismatch,
  isInlineImage,
} from '../files/attachmentSafety';

export default function InboxScreen({apiKey, makeStore, makeSource}) {
  const theme = useTheme();
  const [messages, setMessages] = useState([]);
  const [selected, setSelected] = useState(null);
  const [thread, setThread] = useState([]);
  const [filter, setFilter] = useState('inbox');
  const [query, setQuery] = useState('');
  const [error, setError] = useState(null);
  const [allowRemote, setAllowRemote] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [ready, setReady] = useState(false);
  const [replying, setReplying] = useState(false);
  const [originalHtml, setOriginalHtml] = useState('');
  const [composeMode, setComposeMode] = useState(null); // null | 'compose' | 'forward'
  const [forwardData, setForwardData] = useState(null);
  const [fromIdentity, setFromIdentity] = useState('');
  const servicesRef = useRef(null);
  const outboxBusyRef = useRef(false);
  const filterRef = useRef('inbox');
  const queryRef = useRef('');
  const selectedRef = useRef(null);
  const listSeqRef = useRef(0);
  const searchTimerRef = useRef(null);

  // Load the message list for the current filter/search, reading from refs so
  // the sync tick and effects all use the latest values. A sequence guard drops
  // a slow result that resolves after a newer load (no out-of-order overwrite).
  const loadListRef = useRef(async () => {});
  loadListRef.current = async () => {
    const services = servicesRef.current;
    if (!services) return;
    const seq = ++listSeqRef.current;
    const q = queryRef.current.trim();
    const list = q
      ? await services.store.searchMessages(q)
      : await services.store.listMessages(filterRef.current);
    if (seq === listSeqRef.current) setMessages(list);
  };

  useEffect(() => {
    let cancelled = false;
    let stop = () => {};
    (async () => {
      const store = makeStore
        ? await makeStore()
        : await createLocalStore(openDb());
      const source = makeSource ? makeSource() : createMailSource({apiKey});
      const sender = createSender({apiKey});
      if (cancelled) return;
      servicesRef.current = {store, source, sender};
      setReady(true);
      const savedFrom = await store.getSetting('fromIdentity');
      if (!cancelled && savedFrom) setFromIdentity(savedFrom);
      await loadListRef.current();
      const stopSync = startSyncLoop({
        source,
        store,
        onError: e => {
          if (!cancelled) setError(e.message);
        },
        onNewMessages: fresh => {
          const n = fresh.length;
          notify(
            n === 1 ? 'New message' : `${n} new messages`,
            fresh[0] ? `${fresh[0].from}: ${fresh[0].subject || ''}` : '',
          );
          loadListRef.current();
        },
        onTick: () => {
          loadListRef.current();
          if (!outboxBusyRef.current) {
            outboxBusyRef.current = true;
            processOutbox({store, sender})
              .catch(() => {})
              .finally(() => {
                outboxBusyRef.current = false;
              });
          }
        },
      });
      stop = () => stopSync();
    })();
    return () => {
      cancelled = true;
      stop();
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [apiKey, makeStore, makeSource]);

  const onFilter = f => {
    filterRef.current = f;
    queryRef.current = '';
    setQuery('');
    setFilter(f);
    loadListRef.current();
  };

  const onQuery = q => {
    queryRef.current = q;
    setQuery(q);
    // Debounce: one query after typing settles, not one per keystroke.
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => loadListRef.current(), 200);
  };

  const downloadToCache = async (messageId, att, name, quarantine = true) => {
    const services = servicesRef.current;
    if (!services) throw new Error('services not ready');
    const AttachmentFile = require('../native/AttachmentFile');
    const meta = await services.source.getAttachment(messageId, att.id);
    if (!meta.downloadUrl) throw new Error('no download url');
    return AttachmentFile.downloadToCache(
      messageId,
      name,
      meta.downloadUrl,
      quarantine,
    );
  };

  const bodyDeps = useMemo(() => {
    if (!ready || !servicesRef.current) return null;
    const {store, source} = servicesRef.current;
    return {
      getMessage: id => store.getMessage(id),
      fetchBody: id => source.getReceivedEmail(id),
      saveBody: (id, b) => store.saveBody(id, b),
      saveAttachments: (id, a) => store.saveAttachments(id, a),
      cacheCidImages: async id => {
        try {
          const AttachmentFile = require('../native/AttachmentFile');
          const atts = await store.listAttachments(id);
          for (const att of atts) {
            if (!att.contentId) continue;
            if (
              att.downloaded &&
              att.localPath &&
              (await AttachmentFile.exists(att.localPath))
            ) {
              continue;
            }
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
        // The thread renders several bodies; only the clicked message drives
        // the attachment tray.
        if (!selectedRef.current || selectedRef.current.id !== id) return;
        const list = await store.listAttachments(id);
        setAttachments(list.filter(a => !isInlineImage(a)));
      },
    };
    // downloadToCache reads servicesRef.current, which is stable once ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const onSelect = async msg => {
    setAllowRemote(false);
    setAttachments([]);
    setReplying(false);
    setOriginalHtml('');
    setSelected(msg);
    selectedRef.current = msg;
    const {store} = servicesRef.current;
    if (!msg.seen) {
      await store.setSeen(msg.id, true);
    }
    const t = await store.listThread(msg.threadId);
    setThread(t);
    loadListRef.current();
  };

  const onToggleStar = async m => {
    await servicesRef.current.store.setStarred(m.id, !m.starred);
    loadListRef.current();
  };

  const onArchive = async m => {
    await servicesRef.current.store.setArchived(m.id, true);
    if (selectedRef.current && selectedRef.current.id === m.id) {
      setSelected(null);
      selectedRef.current = null;
    }
    loadListRef.current();
  };

  // Load a received message's body (and persist its attachment metadata),
  // fetching+caching if not present.
  const loadBody = async id => {
    const {store, source} = servicesRef.current;
    let msg = await store.getMessage(id);
    if (!msg || !msg.html) {
      try {
        const fetched = await source.getReceivedEmail(id);
        await store.saveBody(id, {html: fetched.html, text: fetched.text});
        if (fetched.attachments && fetched.attachments.length) {
          await store.saveAttachments(id, fetched.attachments);
        }
        msg = {...msg, html: fetched.html};
      } catch (e) {
        // Network issue — fall back to whatever we have.
      }
    }
    return (msg && msg.html) || '';
  };

  const startReply = async () => {
    setOriginalHtml(await loadBody(selected.id));
    setReplying(true);
  };

  const onChangeFrom = value => {
    setFromIdentity(value);
    servicesRef.current.store.setSetting('fromIdentity', value).catch(() => {});
  };

  // Compose/forward both send through the outbox; no thread, no sent-message row.
  const onSendMail = async payload => {
    const recipients = Array.isArray(payload.to) ? payload.to : [];
    const isEmail = a => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a || '');
    if (!isEmail(payload.from)) {
      return {ok: false, error: new Error('Enter a valid From address.')};
    }
    if (!recipients.length || !recipients.every(isEmail)) {
      return {ok: false, error: new Error('Enter at least one valid recipient.')};
    }
    const {store, sender} = servicesRef.current;
    const id = `out_${Math.random().toString(36).slice(2)}`;
    return sendReply({store, sender, id, payload});
  };

  const startForward = async () => {
    const {store} = servicesRef.current;
    const html = await loadBody(selected.id);
    // Re-attach the original's file attachments by downloading their bytes and
    // embedding them as base64 content (durable across an outbox retry, unlike a
    // presigned URL that would expire).
    const atts = (await store.listAttachments(selected.id)).filter(
      a => !isInlineImage(a),
    );
    const originalAttachments = [];
    for (const att of atts) {
      try {
        const AttachmentFile = require('../native/AttachmentFile');
        const path = await downloadToCache(
          selected.id,
          att,
          sanitizeFilename(att.filename),
          false,
        );
        const content = await AttachmentFile.readBase64(path);
        originalAttachments.push({
          filename: att.filename,
          content,
          contentType: att.contentType,
        });
      } catch (e) {
        // Skip an attachment we couldn't fetch rather than block the forward.
      }
    }
    setForwardData({
      original: selected,
      originalHtml: html,
      originalAttachments,
    });
    setComposeMode('forward');
  };

  const onSendReply = async payload => {
    const invalid = replyPayloadError(payload);
    if (invalid) return {ok: false, error: new Error(invalid)};
    const {store, sender} = servicesRef.current;
    const id = `out_${Math.random().toString(36).slice(2)}`;
    const now = new Date().toISOString();
    const sentMessage = {
      id: `sent_${id}`,
      threadId: selected.threadId,
      from: payload.from,
      subject: payload.subject,
      receivedAt: now,
      html: payload.html,
    };
    const res = await sendReply({
      store,
      sender,
      id,
      threadId: selected.threadId,
      payload,
      sentMessage,
    });
    if (res && res.ok) {
      setReplying(false);
      // Reflect the new sent reply in the conversation.
      setThread(await store.listThread(selected.threadId));
    }
    return res;
  };

  const onSaveAttachment = async att => {
    try {
      const AttachmentFile = require('../native/AttachmentFile');
      const safe = sanitizeFilename(att.filename);
      const dangerous =
        isDangerousFilename(att.filename) ||
        typeMismatch(att.contentType, att.filename);
      const path = await downloadToCache(selected.id, att, safe, true);
      await AttachmentFile.saveAs(path, safe, dangerous);
    } catch (e) {
      // User cancelled the save panel, or a transient failure — nothing to surface.
    }
  };

  const emptyMessage = () => {
    const q = (query || '').trim();
    if (q) return `No results for "${q}"`;
    switch (filter) {
      case 'unread':
        return 'No unread messages';
      case 'starred':
        return 'No starred messages';
      case 'archive':
        return 'No archived messages';
      default:
        return 'Your inbox is empty';
    }
  };

  return (
    <View style={{flex: 1, backgroundColor: theme.bg}}>
      <View style={{flex: 1, flexDirection: 'row'}}>
        <Sidebar selected={filter} onSelect={onFilter} />
        <View
          style={{
            width: 300,
            borderRightWidth: 1,
            borderRightColor: theme.border,
            backgroundColor: theme.bg,
          }}
        >
          <Pressable
            onPress={() => setComposeMode('compose')}
            style={{
              padding: 10,
              borderBottomWidth: 1,
              borderBottomColor: theme.divider,
            }}
          >
            <Text style={{color: theme.accent, fontWeight: '600'}}>
              ＋ Compose
            </Text>
          </Pressable>
          <SearchBar value={query} onChange={onQuery} />
          {error ? (
            <Text style={{padding: 12, color: theme.danger}}>
              Couldn't reach Resend — retrying… (Sync error: {error})
            </Text>
          ) : null}
          {ready && messages.length === 0 ? (
            <EmptyState message={emptyMessage()} />
          ) : (
            <MessageList
              messages={messages}
              onSelect={onSelect}
              selectedId={selected?.id}
              onToggleStar={onToggleStar}
              onArchive={onArchive}
            />
          )}
        </View>
        <View style={{flex: 1}}>
          {selected && bodyDeps ? (
            <View style={{flex: 1}}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.divider,
                }}
              >
                <Text
                  style={{fontSize: 16, fontWeight: '600', flex: 1, color: theme.text}}
                  numberOfLines={1}
                >
                  {selected.subject}
                </Text>
                {!allowRemote ? (
                  <Pressable
                    onPress={() => setAllowRemote(true)}
                    style={{marginLeft: 12}}
                  >
                    <Text style={{color: theme.accent}}>Load remote images</Text>
                  </Pressable>
                ) : null}
                {!replying ? (
                  <Pressable onPress={startReply} style={{marginLeft: 12}}>
                    <Text style={{color: theme.accent, fontWeight: '600'}}>
                      Reply
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={startForward} style={{marginLeft: 12}}>
                  <Text style={{color: theme.accent, fontWeight: '600'}}>
                    Forward
                  </Text>
                </Pressable>
              </View>
              <ThreadView
                messages={thread}
                bodyDeps={bodyDeps}
                allowRemote={allowRemote}
              />
              <AttachmentTray
                attachments={attachments}
                onSave={onSaveAttachment}
              />
              {replying ? (
                <ReplyComposer
                  original={selected}
                  originalHtml={originalHtml}
                  onSend={onSendReply}
                />
              ) : null}
            </View>
          ) : (
            <View
              style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}
            >
              <Text style={{color: theme.textMuted}}>Select a message</Text>
            </View>
          )}
        </View>
      </View>
      {composeMode ? (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: theme.bg,
          }}
        >
          <ComposeSheet
            mode={composeMode}
            defaultFrom={fromIdentity}
            forward={forwardData}
            onChangeFrom={onChangeFrom}
            onSend={onSendMail}
            onClose={() => {
              setComposeMode(null);
              setForwardData(null);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}
