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
  // Grow the editor with its content, between a compact min and a scroll-after max.
  const MIN_TEXT = 56;
  const MAX_TEXT = 240;
  const [textHeight, setTextHeight] = useState(MIN_TEXT);
  const onContentSize = h =>
    setTextHeight(Math.max(MIN_TEXT, Math.min(MAX_TEXT, Math.ceil(h || 0))));

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
      {/* Explicit height (auto-grows with content via onContentSize): the native
          NSView editor must occupy a bounded box, or it overflows and covers the
          footer (native views capture mouse over their frame), making Send
          unclickable. Height = toolbar (32) + text + padding (12). */}
      <View style={{height: 32 + textHeight + 12}}>
        <Composer onChange={handleChange} onSubmit={send} onContentSize={onContentSize} />
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
