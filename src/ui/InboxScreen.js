import React, {useEffect, useMemo, useRef, useState} from 'react';
import {View, Text, Pressable} from 'react-native';
import MessageList from './MessageList';
import AttachmentTray from './AttachmentTray';
import ReplyComposer from './ReplyComposer';
import Sidebar from './Sidebar';
import SearchBar from './SearchBar';
import ThreadView from './ThreadView';
import ComposeSheet from './ComposeSheet';
import SettingsScreen from './SettingsScreen';
import EmptyState from './EmptyState';
import {useTheme} from './useTheme';
import {SP, RADIUS, TYPE, ELEV} from './designTokens';
import {setOverride} from './themeOverride';
import {notify} from '../native/Notifications';
import {createLocalStore} from '../data/localStore';
import {openEncryptedDb} from '../data/db';
import {createMailSource} from '../net/mailSource';
import {createSender} from '../net/sender';
import {startSyncLoop} from '../core/sync';
import {sendReply, processOutbox} from '../core/outbox';
import {clearApiKey} from '../native/Keychain';
import {replyPayloadError} from '../reply/assembleReply';
import {isEmail} from '../compose/assembleCompose';
import {
  sanitizeFilename,
  isDangerousFilename,
  typeMismatch,
  isInlineImage,
} from '../files/attachmentSafety';

export default function InboxScreen({apiKey, makeStore, makeSource, onSignOut}) {
  const theme = useTheme();
  const [messages, setMessages] = useState([]);
  const [selected, setSelected] = useState(null);
  const [thread, setThread] = useState([]);
  const [filter, setFilter] = useState('inbox');
  const [counts, setCounts] = useState({});
  const [query, setQuery] = useState('');
  const [error, setError] = useState(null);
  const [allowRemote, setAllowRemote] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState(null);
  const [bootSeq, setBootSeq] = useState(0);
  const [replying, setReplying] = useState(false);
  const [originalHtml, setOriginalHtml] = useState('');
  const [composeMode, setComposeMode] = useState(null); // null | 'compose' | 'forward'
  const [forwardData, setForwardData] = useState(null);
  const [fromIdentity, setFromIdentity] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sentToast, setSentToast] = useState('');
  const sentToastTimer = useRef(null);

  // Shell-level confirmation that a message left — the composer often unmounts
  // before its own "Sent" can be seen.
  const flashSent = (msg = 'Message sent') => {
    setSentToast(msg);
    if (sentToastTimer.current) clearTimeout(sentToastTimer.current);
    sentToastTimer.current = setTimeout(() => setSentToast(''), 2500);
  };
  const [themeChoice, setThemeChoice] = useState('auto');
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
    // Refresh sidebar counts alongside the list (best-effort).
    if (services.store.counts) {
      try {
        const c = await services.store.counts();
        if (seq === listSeqRef.current) setCounts(c);
      } catch (e) {
        // counts are decorative; ignore failures
      }
    }
  };

  useEffect(() => {
    let cancelled = false;
    let stop = () => {};
    (async () => {
      let store;
      try {
        store = makeStore
          ? await makeStore()
          : await createLocalStore(await openEncryptedDb());
      } catch (e) {
        // Opening the encrypted local cache failed (e.g. the Keychain key read
        // was denied on an ad-hoc build, or SQLCipher isn't linked). Surface a
        // clear, actionable message instead of hanging on a blank screen.
        if (!cancelled) {
          setInitError(
            e && e.code === 'KEYCHAIN_DENIED'
              ? "Couldn't unlock your local cache — macOS denied Keychain access. Click Retry and choose Allow."
              : `Couldn't open your local cache: ${e.message}`,
          );
        }
        return;
      }
      const source = makeSource ? makeSource() : createMailSource({apiKey});
      const sender = createSender({apiKey});
      if (cancelled) return;
      servicesRef.current = {store, source, sender};
      setReady(true);
      const savedFrom = await store.getSetting('fromIdentity');
      if (!cancelled && savedFrom) setFromIdentity(savedFrom);
      const savedTheme = await store.getSetting('themeOverride');
      if (!cancelled && savedTheme) {
        setThemeChoice(savedTheme);
        setOverride(savedTheme);
      }
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
  }, [apiKey, makeStore, makeSource, bootSeq]);

  const retryInit = () => {
    setInitError(null);
    setBootSeq(s => s + 1);
  };

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
      fetchBody: async id => {
        const content = await source.getReceivedEmail(id);
        // The retrieved headers expose In-Reply-To/References (the list endpoint
        // doesn't), so re-thread this message into its parent's conversation.
        try {
          await store.rethreadByHeaders(id, content.inReplyTo, content.references);
        } catch (e) {
          // best-effort threading; never block rendering the body
        }
        return content;
      },
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
            // contentId comes from the email's MIME headers (attacker-controlled)
            // and is used as the cache filename — strip path separators so it
            // can't traverse (the native layer also rejects unsafe names).
            const name = String(att.contentId).toLowerCase().replace(/[/\\]/g, '');
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
    if (!msg.seen && msg.direction !== 'sent') {
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
        store.rethreadByHeaders(id, fetched.inReplyTo, fetched.references).catch(() => {});
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

  const onChangeTheme = value => {
    setThemeChoice(value);
    setOverride(value);
    servicesRef.current.store.setSetting('themeOverride', value).catch(() => {});
  };

  const onSignOutPressed = async () => {
    try {
      await clearApiKey();
    } catch (e) {
      // ignore — we still sign out of the session below.
    }
    if (onSignOut) onSignOut();
  };

  // Compose/forward send through the outbox and are recorded in Sent.
  const onSendMail = async payload => {
    const recipients = Array.isArray(payload.to) ? payload.to : [];
    if (!isEmail(payload.from)) {
      return {ok: false, error: new Error('Enter a valid From address.')};
    }
    if (!recipients.length || !recipients.every(isEmail)) {
      return {ok: false, error: new Error('Enter at least one valid recipient.')};
    }
    const {store, sender} = servicesRef.current;
    const id = `out_${Math.random().toString(36).slice(2)}`;
    // Give it its own thread so it shows (and opens) in the Sent folder.
    const sentMessage = {
      id: `sent_${id}`,
      threadId: `t_${id}`,
      from: payload.from,
      subject: payload.subject,
      receivedAt: new Date().toISOString(),
      html: payload.html,
    };
    const res = await sendReply({
      store,
      sender,
      id,
      threadId: sentMessage.threadId,
      payload,
      sentMessage,
    });
    if (res && res.ok) {
      flashSent();
      setComposeMode(null);
      setForwardData(null);
    }
    return res;
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
      flashSent();
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
      case 'sent':
        return 'No sent messages';
      default:
        return 'Your inbox is empty';
    }
  };

  if (initError) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.bg,
          alignItems: 'center',
          justifyContent: 'center',
          gap: SP(2),
          padding: SP(8),
        }}
      >
        <Text style={{...TYPE.title, color: theme.text}}>
          Can't open your mailbox cache
        </Text>
        <Text
          style={{...TYPE.body, color: theme.textMuted, textAlign: 'center'}}
        >
          {initError}
        </Text>
        <Pressable
          onPress={retryInit}
          style={{
            paddingHorizontal: SP(4),
            height: 32,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: RADIUS.sm,
            backgroundColor: theme.accent,
          }}
        >
          <Text style={{...TYPE.button, color: theme.onAccent}}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  // Move list selection by delta (keyboard ↑/↓).
  const moveSelection = delta => {
    if (!messages.length) return;
    const idx = messages.findIndex(m => m.id === selected?.id);
    const next = idx === -1 ? 0 : Math.max(0, Math.min(messages.length - 1, idx + delta));
    onSelect(messages[next]);
  };

  // Keyboard shortcuts, handled at the shell. keyDownEvents tells AppKit which
  // combos this view consumes (so they don't beep / fall through).
  const SHELL_KEYS = [
    {key: 'n', metaKey: true},
    {key: 'r', metaKey: true},
    {key: 'f', metaKey: true, shiftKey: true},
    {key: 'Escape'},
    {key: 'ArrowDown'},
    {key: 'ArrowUp'},
  ];
  const onShellKey = e => {
    const {key, metaKey, shiftKey} = e.nativeEvent || {};
    if (metaKey && shiftKey && (key === 'f' || key === 'F')) {
      if (selected) startForward();
    } else if (metaKey && key === 'n') {
      setForwardData(null);
      setComposeMode('compose');
    } else if (metaKey && key === 'r') {
      if (selected && !replying) startReply();
    } else if (key === 'Escape') {
      if (composeMode) {
        setComposeMode(null);
        setForwardData(null);
      } else if (settingsOpen) {
        setSettingsOpen(false);
      } else if (replying) {
        setReplying(false);
      }
    } else if (key === 'ArrowDown') {
      moveSelection(1);
    } else if (key === 'ArrowUp') {
      moveSelection(-1);
    }
  };

  return (
    <View
      style={{flex: 1, backgroundColor: theme.bg}}
      focusable={true}
      keyDownEvents={SHELL_KEYS}
      onKeyDown={onShellKey}>
      {sentToast ? (
        <View
          style={{
            position: 'absolute',
            bottom: SP(5),
            alignSelf: 'center',
            zIndex: 10,
            flexDirection: 'row',
            alignItems: 'center',
            gap: SP(2),
            paddingVertical: SP(2),
            paddingHorizontal: SP(4),
            borderRadius: RADIUS.pill,
            backgroundColor: theme.text,
            ...ELEV.popover,
          }}
        >
          <Text style={{...TYPE.button, color: theme.bg}}>✓ {sentToast}</Text>
        </View>
      ) : null}
      <View style={{flex: 1, flexDirection: 'row'}}>
        <Sidebar selected={filter} onSelect={onFilter} counts={counts} />
        <View
          style={{
            width: 340,
            borderRightWidth: 1,
            borderRightColor: theme.border,
            backgroundColor: theme.bg,
          }}
        >
          <View
            style={{
              height: 52,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: SP(2),
              borderBottomWidth: 1,
              borderBottomColor: theme.border,
            }}
          >
            <Pressable
              onPress={() => setComposeMode('compose')}
              style={{
                height: 28,
                paddingHorizontal: SP(2),
                borderRadius: RADIUS.sm,
                justifyContent: 'center',
              }}
            >
              <Text style={{...TYPE.button, color: theme.textMuted}}>
                + Compose
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Settings"
              onPress={() => setSettingsOpen(true)}
              style={{
                width: 30,
                height: 28,
                borderRadius: RADIUS.sm,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{...TYPE.button, color: theme.textMuted}}>⚙</Text>
            </Pressable>
          </View>
          <SearchBar value={query} onChange={onQuery} />
          {error ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: SP(2),
                paddingVertical: SP(1.5),
                paddingHorizontal: SP(3),
                backgroundColor: theme.danger + '14',
                borderBottomWidth: 1,
                borderBottomColor: theme.danger + '33',
              }}
            >
              <Text style={{...TYPE.meta, color: theme.danger}}>
                Couldn't reach Resend — retrying… (Sync error: {error})
              </Text>
            </View>
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
                  gap: SP(2),
                  paddingHorizontal: SP(7),
                  paddingVertical: SP(2.5),
                  borderBottomWidth: 1,
                  borderBottomColor: theme.divider,
                }}
              >
                <Text
                  style={{...TYPE.title, flex: 1, color: theme.text}}
                  numberOfLines={1}
                >
                  {selected.subject}
                </Text>
                {!allowRemote ? (
                  <Pressable
                    onPress={() => setAllowRemote(true)}
                    style={{
                      height: 28,
                      paddingHorizontal: SP(3),
                      borderRadius: RADIUS.sm,
                      borderWidth: 1,
                      borderColor: theme.border,
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{...TYPE.button, color: theme.text}}>
                      Load images
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={startForward}
                  style={{
                    height: 28,
                    paddingHorizontal: SP(3),
                    borderRadius: RADIUS.sm,
                    borderWidth: 1,
                    borderColor: theme.border,
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{...TYPE.button, color: theme.text}}>Forward</Text>
                </Pressable>
                {!replying ? (
                  <Pressable
                    onPress={startReply}
                    style={{
                      height: 28,
                      paddingHorizontal: SP(4),
                      borderRadius: RADIUS.sm,
                      backgroundColor: theme.accent,
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{...TYPE.button, color: theme.onAccent}}>
                      Reply
                    </Text>
                  </Pressable>
                ) : null}
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
                  from={fromIdentity}
                  onSend={onSendReply}
                />
              ) : null}
            </View>
          ) : (
            <View
              style={{flex: 1, alignItems: 'center', justifyContent: 'center', gap: SP(2)}}
            >
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: theme.surface2,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{fontSize: 24, color: theme.textFaint}}>✉</Text>
              </View>
              <Text style={{...TYPE.title, fontSize: 15, color: theme.text}}>
                No message selected
              </Text>
              <Text style={{...TYPE.preview, color: theme.textMuted}}>
                Select a conversation to read it here.
              </Text>
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
            backgroundColor: 'rgba(0,0,0,0.35)',
            alignItems: 'center',
            paddingTop: 52,
            paddingBottom: 24,
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
      {settingsOpen ? (
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
          <SettingsScreen
            defaultFrom={fromIdentity}
            onChangeFrom={onChangeFrom}
            themeOverride={themeChoice}
            onChangeTheme={onChangeTheme}
            onSignOut={onSignOutPressed}
            onClose={() => setSettingsOpen(false)}
          />
        </View>
      ) : null}
    </View>
  );
}
