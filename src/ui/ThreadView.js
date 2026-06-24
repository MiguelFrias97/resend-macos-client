import React, {useEffect, useState} from 'react';
import {ScrollView, View, Text, Pressable} from 'react-native';
import MessageBody from './MessageBody';
import {useTheme} from './useTheme';
import {SP, TYPE} from './designTokens';
import {formatDateTime} from './formatDate';

// Derive a single uppercase monogram initial from a sender display string.
// Handles "Name <email>" (first letter of the name), a bare email (first
// letter), and "You" for sent messages. Falls back to "?".
function initialFor(name) {
  if (!name) return '?';
  const trimmed = String(name).trim();
  // Strip a trailing "<email>" and prefer the display name.
  const display = trimmed.replace(/<[^>]*>/g, '').trim();
  const source = display || trimmed.replace(/[<>]/g, '').trim();
  const ch = source.match(/[A-Za-z0-9]/);
  return ch ? ch[0].toUpperCase() : '?';
}

// Renders a thread's messages. Only expanded messages mount a MessageBody (and
// thus fetch their body / spin up a WKWebView), so opening a long thread doesn't
// fire a fetch per message. The most recent message is expanded by default;
// tapping any header toggles it.
export default function ThreadView({messages, bodyDeps, allowRemote}) {
  const theme = useTheme();
  const ids = messages.map(m => m.id).join(',');
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    const last = messages[messages.length - 1];
    setExpanded(last ? {[last.id]: true} : {});
    // Reset expansion when the thread changes (keyed on the id list).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  const toggle = id => setExpanded(e => ({...e, [id]: !e[id]}));

  return (
    <ScrollView style={{flex: 1, backgroundColor: theme.bg}}>
      {messages.map(m => {
        const isOpen = Boolean(expanded[m.id]);
        const senderName = m.direction === 'sent' ? 'You' : m.from;
        return (
          <View key={m.id} style={{borderBottomWidth: 1, borderBottomColor: theme.divider}}>
            <Pressable
              onPress={() => toggle(m.id)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: SP(4),
                paddingHorizontal: SP(7),
                backgroundColor: m.direction === 'sent' ? theme.sentBg : theme.bg,
              }}>
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  backgroundColor: theme.accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: SP(3),
                }}>
                <Text style={{fontSize: 13, fontWeight: '600', color: theme.onAccent}}>
                  {initialFor(senderName)}
                </Text>
              </View>
              <View style={{flex: 1, minWidth: 0}}>
                <Text style={{...TYPE.sender, color: theme.text}} numberOfLines={1}>
                  {senderName}
                </Text>
                <Text style={{...TYPE.meta, color: theme.textFaint}} numberOfLines={1}>
                  {formatDateTime(m.receivedAt)}
                </Text>
              </View>
            </Pressable>
            {isOpen ? (
              <View style={{minHeight: 320, paddingBottom: SP(4)}}>
                <MessageBody messageId={m.id} allowRemote={allowRemote} deps={bodyDeps} />
              </View>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}
