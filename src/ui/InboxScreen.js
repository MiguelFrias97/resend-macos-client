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
import {setUnread as setMenuBarUnread} from '../native/MenuBar';
import {setEnabled as setLoginItemEnabled} from '../native/LoginItem';
import {maybeInitLoginItem} from '../core/loginItemInit';
import {createLocalStore} from '../data/localStore';
import {openEncryptedDb} from '../data/db';
import {createMailSource} from '../net/mailSource';
import {createSender} from '../net/sender';
import {startSyncLoop} from '../core/sync';
import {sendReply, processOutbox} from '../core/outbox';
import {clearApiKey, clearDbKey} from '../native/Keychain';
import Symbol from '../native/Symbol';
import ScreenTransition from './ScreenTransition';
import {onMenuCommand} from '../native/MenuEvents';
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
  const [hasRemoteImages, setHasRemoteImages] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState(null);
  const [bootSeq, setBootSeq] = useState(0);
  const [replying, setReplying] = useState(false);
  const [originalHtml, setOriginalHtml] = useState('');
  const [composeMode, setComposeMode] = useState(null); // null | 'compose' | 'forward'
  const [forwardData, setForwardData] = useState(null);
  const [fromIdentity, setFromIdentity] = useState('');
  const [verifiedDomains, setVerifiedDomains] = useState([]);
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
  const searchInputRef = useRef(null);
  const menuHandlerRef = useRef(() => {});
  const syncNowRef = useRef(null);
  const stopSyncRef = useRef(null);
  const [syncing, setSyncing] = useState(false);

  const onRefresh = async () => {
    if (!syncNowRef.current || syncing) return;
    setSyncing(true);
    try {
      await syncNowRef.current();
    } catch (e) {
      // errors surface via the sync-error banner; nothing extra here
    } finally {
      setSyncing(false);
    }
  };

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
      // First launch only: turn on Launch at login by default (user can undo
      // it in Settings). Non-fatal.
      maybeInitLoginItem({
        getSetting: store.getSetting,
        setSetting: store.setSetting,
        setEnabled: setLoginItemEnabled,
      }).catch(() => {});
      const savedFrom = await store.getSetting('fromIdentity');
      if (!cancelled && savedFrom) setFromIdentity(savedFrom);
      // Verified sending domains power the From picker/validation (best-effort).
      if (source.listVerifiedDomains) {
        source
          .listVerifiedDomains()
          .then(d => {
            if (!cancelled) setVerifiedDomains(d || []);
          })
          .catch(() => {});
      }
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
      syncNowRef.current = stopSync.syncNow;
      stopSyncRef.current = stopSync;
    })();
    return () => {
      cancelled = true;
      stop();
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [apiKey, makeStore, makeSource, bootSeq]);

  // Subscribe once to native app-menu commands; the listener reads the latest
  // handler from the ref (assigned every render), so it never goes stale and the
  // root view never needs focus.
  useEffect(() => onMenuCommand(c => menuHandlerRef.current(c)), []);

  // Mirror the inbox unread count onto the menu-bar badge.
  useEffect(() => {
    setMenuBarUnread(counts.inbox || 0);
  }, [counts]);

  // Clear the transient "Message sent" timer on unmount (e.g. sign-out within
  // 2.5s of a send) so it doesn't fire setState on an unmounted component.
  useEffect(
    () => () => {
      if (sentToastTimer.current) clearTimeout(sentToastTimer.current);
    },
    [],
  );

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
      onRemoteContent: (id, has) => {
        // The "Load images" toggle is global (allowRemote applies to every body),
        // so surface it if ANY rendered message in the open thread has blocked
        // remote content — not just the selected one. Reset happens on select.
        if (has) setHasRemoteImages(true);
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
    setHasRemoteImages(false);
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
    // Stop the sync loop FIRST so a scheduled/in-flight tick can't run a query
    // against the database we're about to delete.
    try {
      if (stopSyncRef.current) stopSyncRef.current();
    } catch (e) {
      // ignore
    }
    // Wipe the local mailbox cache so signing in with a different key can't
    // surface the previous account's mail (the cache is keyed by message id,
    // not account). The cache is disposable — it re-syncs from Resend.
    try {
      const services = servicesRef.current;
      if (services && services.store && services.store.deleteDatabase) {
        services.store.deleteDatabase();
      }
    } catch (e) {
      // best-effort; continue clearing credentials regardless
    }
    try {
      await clearApiKey();
      await clearDbKey();
    } catch (e) {
      // ignore — we still drop the session below.
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

  // Keyboard shortcuts come from the native app menu (AppDelegate's Message menu:
  // ⌘N / ⌘R / ⌘⇧F), relayed via MenuEvents. We keep the handler in a ref updated
  // every render so the once-only subscription always sees current state — and so
  // the root view never has to be focusable (which swallowed mouse clicks before).
  menuHandlerRef.current = cmd => {
    if (cmd === 'syncNow') {
      onRefresh();
      return;
    }
    // Ignore menu shortcuts while a full-window screen is already open, so e.g.
    // ⌘N while typing in compose/settings doesn't reset or stack a screen.
    if (composeMode || settingsOpen) return;
    if (cmd === 'compose') {
      setForwardData(null);
      setComposeMode('compose');
    } else if (cmd === 'reply') {
      if (selected && !replying) startReply();
    } else if (cmd === 'forward') {
      if (selected) startForward();
    }
  };

  // Settings / Compose are rendered as full-window screens (early return) rather
  // than overlays on top of the inbox. On react-native-macos, native views (the
  // message-list FlatList, the WKWebView) paint ABOVE sibling RN views, so an
  // absolute overlay gets occluded by them — which made Settings (and its Sign
  // out) appear not to open. Unmounting the panes while a screen is open fixes it.
  if (settingsOpen) {
    return (
      <ScreenTransition
        style={{
          backgroundColor: theme.bg,
          alignItems: 'center',
          paddingTop: SP(10),
        }}>
        <View
          style={{
            width: 480,
            maxWidth: '92%',
            maxHeight: '90%',
            borderRadius: RADIUS.lg,
            backgroundColor: theme.bg,
            borderWidth: 1,
            borderColor: theme.border,
            overflow: 'hidden',
            ...ELEV.sheet,
          }}>
          <SettingsScreen
            defaultFrom={fromIdentity}
            onChangeFrom={onChangeFrom}
            verifiedDomains={verifiedDomains}
            themeOverride={themeChoice}
            onChangeTheme={onChangeTheme}
            onSignOut={onSignOutPressed}
            onClose={() => setSettingsOpen(false)}
          />
        </View>
      </ScreenTransition>
    );
  }
  if (composeMode) {
    return (
      <ScreenTransition
        style={{
          backgroundColor: theme.bg,
          alignItems: 'center',
          paddingTop: SP(8),
          paddingBottom: SP(6),
        }}>
        <ComposeSheet
          mode={composeMode}
          defaultFrom={fromIdentity}
          verifiedDomains={verifiedDomains}
          forward={forwardData}
          onChangeFrom={onChangeFrom}
          onSend={onSendMail}
          onClose={() => {
            setComposeMode(null);
            setForwardData(null);
          }}
        />
      </ScreenTransition>
    );
  }

  return (
    <View style={{flex: 1, backgroundColor: theme.bg}}>
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
          <Symbol name="checkmark.circle.fill" size={15} color={theme.bg} />
          <Text style={{...TYPE.button, color: theme.bg}}>{sentToast}</Text>
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
              style={({hovered, pressed}) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: SP(1.5),
                height: 28,
                paddingHorizontal: SP(2.5),
                borderRadius: RADIUS.sm,
                justifyContent: 'center',
                backgroundColor: hovered || pressed ? theme.hover : 'transparent',
              })}
            >
              <Symbol name="square.and.pencil" size={15} color={theme.accent} />
              <Text style={{...TYPE.button, color: theme.text}}>Compose</Text>
            </Pressable>
            <View style={{flexDirection: 'row', alignItems: 'center', gap: SP(0.5)}}>
              <Pressable
                accessibilityLabel="Refresh"
                onPress={onRefresh}
                disabled={syncing}
                style={({hovered, pressed}) => ({
                  width: 30,
                  height: 28,
                  borderRadius: RADIUS.sm,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: syncing ? 0.5 : 1,
                  backgroundColor: hovered || pressed ? theme.hover : 'transparent',
                })}
              >
                <Symbol name="arrow.clockwise" size={15} color={theme.textMuted} />
              </Pressable>
              <Pressable
                accessibilityLabel="Settings"
                onPress={() => setSettingsOpen(true)}
                style={({hovered, pressed}) => ({
                  width: 30,
                  height: 28,
                  borderRadius: RADIUS.sm,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: hovered || pressed ? theme.hover : 'transparent',
                })}
              >
                <Symbol name="gearshape" size={16} color={theme.textMuted} />
              </Pressable>
            </View>
          </View>
          <SearchBar value={query} onChange={onQuery} inputRef={searchInputRef} />
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
                <View style={{flexDirection: 'row', alignItems: 'center', gap: SP(2)}}>
                  {hasRemoteImages && !allowRemote ? (
                    <Pressable
                      onPress={() => setAllowRemote(true)}
                      style={({hovered, pressed}) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: SP(1.5),
                        height: 28,
                        paddingHorizontal: SP(3),
                        borderRadius: RADIUS.sm,
                        borderWidth: 1,
                        borderColor: theme.border,
                        justifyContent: 'center',
                        backgroundColor: hovered || pressed ? theme.hover : 'transparent',
                      })}
                    >
                      <Symbol name="photo" size={14} color={theme.text} />
                      <Text style={{...TYPE.button, color: theme.text}}>
                        Load images
                      </Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={startForward}
                    style={({hovered, pressed}) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: SP(1.5),
                      height: 28,
                      paddingHorizontal: SP(3),
                      borderRadius: RADIUS.sm,
                      borderWidth: 1,
                      borderColor: theme.border,
                      justifyContent: 'center',
                      backgroundColor: hovered || pressed ? theme.hover : 'transparent',
                    })}
                  >
                    <Symbol name="arrowshape.turn.up.right" size={14} color={theme.text} />
                    <Text style={{...TYPE.button, color: theme.text}}>Forward</Text>
                  </Pressable>
                  {!replying ? (
                    <Pressable
                      onPress={startReply}
                      style={({hovered, pressed}) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: SP(1.5),
                        height: 28,
                        paddingHorizontal: SP(4),
                        borderRadius: RADIUS.sm,
                        backgroundColor: theme.accent,
                        opacity: hovered || pressed ? 0.9 : 1,
                        justifyContent: 'center',
                      })}
                    >
                      <Symbol name="arrowshape.turn.up.left" size={14} color={theme.onAccent} />
                      <Text style={{...TYPE.button, color: theme.onAccent}}>
                        Reply
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
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
                <Symbol name="envelope" size={24} color={theme.textFaint} />
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
    </View>
  );
}
