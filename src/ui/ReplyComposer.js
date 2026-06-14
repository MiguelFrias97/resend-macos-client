import React, {useRef, useState} from 'react';
import {View, Text, Pressable} from 'react-native';
import Composer from './Composer';
import {assembleReplyPayload} from '../reply/assembleReply';
import {useTheme} from './useTheme';

export default function ReplyComposer({original, originalHtml, onSend}) {
  const theme = useTheme();
  const contentRef = useRef({html: '', inlineImages: []});
  const [status, setStatus] = useState('idle');
  const [errorText, setErrorText] = useState('');

  const handleChange = next => {
    contentRef.current = next;
  };

  const send = async () => {
    setStatus('sending');
    setErrorText('');
    const content = contentRef.current;
    const payload = assembleReplyPayload({
      original,
      replyHtml: content.html,
      originalHtml,
      inlineImages: content.inlineImages,
    });
    try {
      const res = await onSend(payload);
      if (res && res.ok === false) {
        setErrorText((res.error && res.error.message) || String(res.error || ''));
        setStatus('failed');
      } else {
        setStatus('sent');
      }
    } catch (e) {
      setErrorText(e.message || '');
      setStatus('failed');
    }
  };

  return (
    <View style={{borderTopWidth: 1, borderTopColor: theme.divider, backgroundColor: theme.bg}}>
      <View style={{height: 180}}>
        <Composer onChange={handleChange} />
      </View>
      <View style={{flexDirection: 'row', alignItems: 'center', padding: 8}}>
        <Pressable
          onPress={send}
          disabled={status === 'sending'}
          style={{
            backgroundColor: theme.selectedBg,
            borderRadius: 6,
            paddingVertical: 6,
            paddingHorizontal: 16,
          }}>
          <Text style={{color: theme.accent, fontWeight: '600'}}>
            {status === 'sending' ? 'Sending…' : 'Send'}
          </Text>
        </Pressable>
        {status === 'sent' ? (
          <Text style={{marginLeft: 12, color: '#2a8a3e'}}>Sent</Text>
        ) : null}
        {status === 'failed' ? (
          <Pressable onPress={send} style={{marginLeft: 12}}>
            <Text style={{color: theme.danger}}>
              {errorText ? `${errorText} — Retry` : 'Failed — Retry'}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
