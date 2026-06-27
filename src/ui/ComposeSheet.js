import React, {useEffect, useRef, useState} from 'react';
import {View, Text, TextInput, Pressable} from 'react-native';
import Composer from './Composer';
import ComposerFooter from './ComposerFooter';
import OutgoingAttachments from './OutgoingAttachments';
import RecipientField from './RecipientField';
import FromField from './FromField';
import {pickAttachments} from '../native/AttachmentFile';
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
  verifiedDomains = [],
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
  const mountedRef = useRef(true);
  useEffect(() => () => {
    mountedRef.current = false;
  }, []);
  const [status, setStatus] = useState('idle');
  const [errorText, setErrorText] = useState('');
  const [files, setFiles] = useState([]); // staged file attachments

  const handleAttach = async () => {
    try {
      const picked = await pickAttachments();
      if (picked && picked.length) {
        setFiles(prev => [
          ...prev,
          ...picked.map(f => ({
            filename: f.filename,
            content: f.content,
            content_type: f.contentType,
            size: f.size,
            tooLarge: f.tooLarge,
          })),
        ]);
      }
    } catch (e) {
      // user cancelled / picker failed — nothing to do
    }
  };
  const removeFile = i => setFiles(prev => prev.filter((_, idx) => idx !== i));
  // Resend parts only (drop UI-only fields, and any file flagged too large).
  const fileParts = () =>
    files
      .filter(f => !f.tooLarge && f.content)
      .map(f => ({filename: f.filename, content: f.content, content_type: f.content_type}));

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
            attachments: fileParts(),
          })
        : assembleComposePayload({
            from,
            to,
            cc,
            bcc,
            subject,
            html: content.html,
            inlineImages: content.inlineImages,
            attachments: fileParts(),
          });
    try {
      const res = await onSend(payload);
      // On success the parent may unmount this sheet (auto-dismiss), so don't
      // touch state once unmounted.
      if (!mountedRef.current) return;
      if (res && res.ok === false) {
        setErrorText((res.error && res.error.message) || String(res.error || ''));
        setStatus('failed');
      } else {
        setStatus('sent');
      }
    } catch (e) {
      if (!mountedRef.current) return;
      setErrorText(e.message || '');
      setStatus('failed');
    }
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
          <Text style={{...TYPE.button, color: theme.accent}}>Cancel</Text>
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
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          paddingLeft: SP(2),
          paddingVertical: SP(1.5),
          borderBottomWidth: 1,
          borderBottomColor: theme.divider,
        }}>
        <Text style={{...TYPE.meta, width: 56, color: theme.textMuted, marginTop: SP(1)}}>
          From
        </Text>
        <FromField
          value={from}
          onChange={setFrom}
          onBlur={persistFrom}
          verifiedDomains={verifiedDomains}
          placeholder="From"
          style={{flex: 1}}
        />
      </View>
      <TextInput
        placeholder="Subject"
        placeholderTextColor={theme.textMuted}
        value={subject}
        onChangeText={setSubject}
        style={subjectStyle}
      />
      <View style={{flex: 1, minHeight: 160, paddingHorizontal: SP(2), paddingTop: SP(2)}}>
        <Composer onChange={handleChange} onSubmit={send} />
      </View>
      <View
        style={{
          padding: SP(3),
          borderTopWidth: 1,
          borderTopColor: theme.divider,
        }}>
        <OutgoingAttachments files={files} onRemove={removeFile} />
        <ComposerFooter
          status={status}
          errorText={errorText}
          onSend={send}
          onAttach={handleAttach}
          theme={theme}
        />
      </View>
    </View>
  );
}
