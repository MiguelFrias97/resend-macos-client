import React, {useEffect, useRef, useState} from 'react';
import {View, Text, TextInput, Pressable} from 'react-native';
import Composer from './Composer';
import {
  assembleComposePayload,
  assembleForwardPayload,
  forwardSubject,
} from '../compose/assembleCompose';

export default function ComposeSheet({
  defaultFrom = '',
  mode = 'compose',
  forward,
  onSend,
  onClose,
  onChangeFrom,
}) {
  const [to, setTo] = useState('');
  const [from, setFrom] = useState(defaultFrom);
  const [subject, setSubject] = useState(
    mode === 'forward' && forward && forward.original
      ? forwardSubject(forward.original.subject)
      : '',
  );
  const contentRef = useRef({html: '', inlineImages: []});
  const [status, setStatus] = useState('idle');
  const [errorText, setErrorText] = useState('');

  // Fill From from a late-arriving saved identity, but never clobber a value the
  // user has already typed.
  useEffect(() => {
    setFrom(prev => prev || defaultFrom);
  }, [defaultFrom]);

  const handleChange = next => {
    contentRef.current = next;
  };

  // Persist the identity on blur (not on every keystroke).
  const persistFrom = () => {
    if (onChangeFrom) onChangeFrom(from);
  };

  const send = async () => {
    setStatus('sending');
    setErrorText('');
    const content = contentRef.current;
    const payload =
      mode === 'forward'
        ? assembleForwardPayload({
            from,
            to,
            original: forward.original,
            originalHtml: forward.originalHtml,
            replyHtml: content.html,
            inlineImages: content.inlineImages,
            originalAttachments: forward.originalAttachments,
          })
        : assembleComposePayload({
            from,
            to,
            subject,
            html: content.html,
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

  const fieldStyle = {
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingVertical: 6,
    paddingHorizontal: 8,
  };

  return (
    <View style={{borderTopWidth: 1, borderTopColor: '#eee'}}>
      <View style={{flexDirection: 'row', alignItems: 'center', padding: 8}}>
        <Text style={{flex: 1, fontWeight: '600'}}>
          {mode === 'forward' ? 'Forward' : 'New message'}
        </Text>
        <Pressable onPress={onClose}>
          <Text style={{color: '#5b4aa6'}}>Close</Text>
        </Pressable>
      </View>
      <TextInput
        placeholder="To"
        value={to}
        onChangeText={setTo}
        autoCapitalize="none"
        style={fieldStyle}
      />
      <TextInput
        placeholder="From"
        value={from}
        onChangeText={setFrom}
        onBlur={persistFrom}
        autoCapitalize="none"
        style={fieldStyle}
      />
      <TextInput
        placeholder="Subject"
        value={subject}
        onChangeText={setSubject}
        style={fieldStyle}
      />
      <View style={{height: 180}}>
        <Composer onChange={handleChange} />
      </View>
      <View style={{flexDirection: 'row', alignItems: 'center', padding: 8}}>
        <Pressable
          onPress={send}
          disabled={status === 'sending'}
          style={{
            backgroundColor: '#d9d4e6',
            borderRadius: 6,
            paddingVertical: 6,
            paddingHorizontal: 16,
          }}>
          <Text style={{color: '#5b4aa6', fontWeight: '600'}}>
            {status === 'sending' ? 'Sending…' : 'Send'}
          </Text>
        </Pressable>
        {status === 'sent' ? (
          <Text style={{marginLeft: 12, color: '#2a8a3e'}}>Sent</Text>
        ) : null}
        {status === 'failed' ? (
          <Pressable onPress={send} style={{marginLeft: 12}}>
            <Text style={{color: '#b00'}}>
              {errorText ? `${errorText} — Retry` : 'Failed — Retry'}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
