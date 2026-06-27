import React, {useRef, useState} from 'react';
import {View} from 'react-native';
import Composer from './Composer';
import ComposerFooter from './ComposerFooter';
import OutgoingAttachments from './OutgoingAttachments';
import {assembleReplyPayload} from '../reply/assembleReply';
import {pickAttachments} from '../native/AttachmentFile';
import {useTheme} from './useTheme';
import {SP} from './designTokens';

export default function ReplyComposer({original, originalHtml, from, onSend}) {
  const theme = useTheme();
  const contentRef = useRef({html: '', inlineImages: []});
  const [status, setStatus] = useState('idle');
  const [errorText, setErrorText] = useState('');
  const [files, setFiles] = useState([]);

  const handleChange = next => {
    contentRef.current = next;
  };

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
      // cancelled / failed
    }
  };
  const removeFile = i => setFiles(prev => prev.filter((_, idx) => idx !== i));

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
      attachments: files
        .filter(f => !f.tooLarge && f.content)
        .map(f => ({filename: f.filename, content: f.content, content_type: f.content_type})),
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
      {/* Fixed height (not minHeight): the native NSView editor must not overflow
          its box and cover the footer below it, or the Send button becomes
          unclickable (native views capture mouse events over their frame). */}
      <View style={{height: 180}}>
        <Composer onChange={handleChange} onSubmit={send} />
      </View>
      <View style={{marginTop: SP(2.5)}}>
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
