import React, {useEffect, useState} from 'react';
import {View, Text, ActivityIndicator} from 'react-native';
import MessageBodyView from '../native/MessageBodyView';
import {sanitizeEmailHtml, hasRemoteContent} from '../html/sanitizeEmailHtml';
import {useTheme} from './useTheme';
import {SP} from './designTokens';

export default function MessageBody({messageId, allowRemote = false, deps}) {
  const theme = useTheme();
  const [html, setHtml] = useState(null);
  const [cacheDir, setCacheDir] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setError(null);
    (async () => {
      try {
        const msg = await deps.getMessage(messageId);
        let bodyHtml = msg && msg.bodyFetched ? msg.html : null;
        if (!msg || !msg.bodyFetched) {
          const fetched = await deps.fetchBody(messageId);
          await deps.saveBody(messageId, {html: fetched.html, text: fetched.text});
          if (fetched.attachments && fetched.attachments.length) {
            await deps.saveAttachments(messageId, fetched.attachments);
          }
          bodyHtml = fetched.html;
        }
        // (Re)cache inline images so the cidcache:// handler resolves them. The
        // caching step itself is idempotent and skips already-downloaded images.
        if (deps.cacheCidImages) {
          const dir = await deps.cacheCidImages(messageId);
          if (!cancelled) setCacheDir(dir || '');
        }
        if (!cancelled) setHtml(bodyHtml || '');
        if (!cancelled && deps.onRemoteContent) {
          deps.onRemoteContent(messageId, hasRemoteContent(bodyHtml || ''));
        }
        if (!cancelled && deps.onLoaded) deps.onLoaded(messageId);
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load message');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [messageId, deps]);

  if (error != null) {
    return (
      <View style={{padding: 16, backgroundColor: theme.bg}}>
        <Text style={{color: theme.danger}}>Couldn't load this message: {error}</Text>
      </View>
    );
  }
  if (html == null) {
    return (
      <View style={{padding: 16, backgroundColor: theme.bg}}>
        <ActivityIndicator />
      </View>
    );
  }
  // Present the message on an intentional light "document" surface (framed,
  // inset, aligned under the sender) rather than a raw white bleed against the
  // dark chrome.
  return (
    <View
      style={{
        flex: 1,
        marginTop: SP(3),
        marginLeft: SP(7),
        marginRight: SP(4),
        borderRadius: 10,
        borderWidth: 1,
        borderColor: theme.border,
        backgroundColor: '#ffffff',
        overflow: 'hidden',
      }}>
      <MessageBodyView
        style={{flex: 1, backgroundColor: '#ffffff'}}
        html={sanitizeEmailHtml(html, {allowRemote, accentColor: theme.accent})}
        allowRemote={allowRemote}
        cacheDir={cacheDir}
      />
    </View>
  );
}
