import React, {useRef, useState} from 'react';
import {View} from 'react-native';
import Composer from './Composer';
import ComposerFooter from './ComposerFooter';
import {assembleReplyPayload} from '../reply/assembleReply';
import {useTheme} from './useTheme';
import {SP} from './designTokens';

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
        <Composer onChange={handleChange} onSubmit={send} />
      </View>
      <View style={{marginTop: SP(2.5)}}>
        <ComposerFooter status={status} errorText={errorText} onSend={send} theme={theme} />
      </View>
    </View>
  );
}
