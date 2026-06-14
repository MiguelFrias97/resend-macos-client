import React, {useEffect, useState} from 'react';
import {View, ActivityIndicator} from 'react-native';
import MessageBodyView from '../native/MessageBodyView';
import {sanitizeEmailHtml} from '../html/sanitizeEmailHtml';

export default function MessageBody({messageId, allowRemote = false, deps}) {
  const [html, setHtml] = useState(null);
  const [cacheDir, setCacheDir] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
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
      // Always (re)cache inline images so the cidcache:// handler resolves them,
      // including on revisits to an already-fetched body.
      if (deps.cacheCidImages) {
        const dir = await deps.cacheCidImages(messageId);
        if (!cancelled) setCacheDir(dir || '');
      }
      if (!cancelled) setHtml(bodyHtml || '');
      if (!cancelled && deps.onLoaded) deps.onLoaded(messageId);
    })();
    return () => {
      cancelled = true;
    };
  }, [messageId, deps]);

  if (html == null) {
    return (
      <View style={{padding: 16}}>
        <ActivityIndicator />
      </View>
    );
  }
  return (
    <MessageBodyView
      style={{flex: 1}}
      html={sanitizeEmailHtml(html, {allowRemote})}
      allowRemote={allowRemote}
      cacheDir={cacheDir}
    />
  );
}
