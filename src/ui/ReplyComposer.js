import React, {useRef, useState} from 'react';
import {View, Text, Pressable} from 'react-native';
import Composer from './Composer';
import {assembleReplyPayload} from '../reply/assembleReply';
import {useTheme} from './useTheme';
import {SP, RADIUS, TYPE} from './designTokens';

export default function ReplyComposer({original, originalHtml, from, onSend}) {
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
      from,
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
    <View
      style={{
        borderTopWidth: 1,
        borderTopColor: theme.divider,
        backgroundColor: theme.bg,
        padding: SP(3),
      }}>
      <View style={{minHeight: 80}}>
        <Composer onChange={handleChange} />
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: SP(2),
          marginTop: SP(2.5),
        }}>
        {status === 'sent' ? (
          <Text style={{...TYPE.meta, color: theme.success}}>Sent</Text>
        ) : null}
        {status === 'failed' ? (
          <Pressable onPress={send}>
            <Text style={{...TYPE.meta, color: theme.danger}}>
              {errorText ? `${errorText} — Retry` : 'Failed — Retry'}
            </Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={send}
          disabled={status === 'sending'}
          style={{
            height: 28,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: SP(4),
            borderRadius: RADIUS.sm,
            backgroundColor: theme.accent,
          }}>
          <Text style={{...TYPE.button, color: '#fff'}}>
            {status === 'sending' ? 'Sending…' : 'Send'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
