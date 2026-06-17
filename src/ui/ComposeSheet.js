import React, {useEffect, useRef, useState} from 'react';
import {View, Text, TextInput, Pressable} from 'react-native';
import Composer from './Composer';
import RecipientField from './RecipientField';
import {useTheme} from './useTheme';
import {
  assembleComposePayload,
  assembleForwardPayload,
  forwardSubject,
} from '../compose/assembleCompose';
import {SP, RADIUS, ELEV, TYPE} from './designTokens';

export default function ComposeSheet({
  defaultFrom = '',
  mode = 'compose',
  forward,
  onSend,
  onClose,
  onChangeFrom,
}) {
  const theme = useTheme();
  const [to, setTo] = useState([]);
  const [cc, setCc] = useState([]);
  const [bcc, setBcc] = useState([]);
  const [showCcBcc, setShowCcBcc] = useState(false);
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
            cc,
            bcc,
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
    ...TYPE.meta,
    color: theme.text,
    height: 38,
    paddingHorizontal: SP(2),
    borderBottomWidth: 1,
    borderBottomColor: theme.divider,
  };

  const subjectStyle = {
    ...TYPE.sender,
    fontWeight: '400',
    color: theme.text,
    height: 38,
    paddingHorizontal: SP(2),
    borderBottomWidth: 1,
    borderBottomColor: theme.divider,
  };

  return (
    <View
      style={{
        width: 680,
        maxWidth: '94%',
        height: '88%',
        borderRadius: RADIUS.lg,
        backgroundColor: theme.bg,
        overflow: 'hidden',
        ...ELEV.sheet,
      }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          height: 44,
          paddingHorizontal: SP(4),
          borderBottomWidth: 1,
          borderBottomColor: theme.divider,
        }}>
        <Text style={{flex: 1, ...TYPE.title, fontSize: 15, color: theme.text}}>
          {mode === 'forward' ? 'Forward' : 'New message'}
        </Text>
        <Pressable onPress={onClose}>
          <Text style={{...TYPE.button, color: theme.accent}}>Close</Text>
        </Pressable>
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingRight: SP(4),
          borderBottomWidth: 1,
          borderBottomColor: theme.divider,
        }}>
        <View style={{flex: 1}}>
          <RecipientField label="To" placeholder="name@example.com" value={to} onChange={setTo} />
        </View>
        {mode !== 'forward' ? (
          <Pressable onPress={() => setShowCcBcc(v => !v)}>
            <Text style={{...TYPE.button, color: theme.accent}}>Cc/Bcc</Text>
          </Pressable>
        ) : null}
      </View>
      {showCcBcc ? (
        <>
          <RecipientField label="Cc" placeholder="" value={cc} onChange={setCc} />
          <RecipientField label="Bcc" placeholder="" value={bcc} onChange={setBcc} />
        </>
      ) : null}
      <TextInput
        placeholder="From"
        placeholderTextColor={theme.textMuted}
        value={from}
        onChangeText={setFrom}
        onBlur={persistFrom}
        autoCapitalize="none"
        style={fieldStyle}
      />
      <TextInput
        placeholder="Subject"
        placeholderTextColor={theme.textMuted}
        value={subject}
        onChangeText={setSubject}
        style={subjectStyle}
      />
      <View style={{flex: 1, minHeight: 160, paddingHorizontal: SP(2), paddingTop: SP(2)}}>
        <Composer onChange={handleChange} />
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: SP(2),
          padding: SP(3),
          borderTopWidth: 1,
          borderTopColor: theme.divider,
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
