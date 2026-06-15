import React, {useEffect, useState} from 'react';
import {ScrollView, View, Text, Pressable} from 'react-native';
import MessageBody from './MessageBody';
import {useTheme} from './useTheme';
import {SP, TYPE} from './designTokens';

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
        return (
          <View key={m.id} style={{borderBottomWidth: 1, borderBottomColor: theme.divider}}>
            <Pressable
              onPress={() => toggle(m.id)}
              style={{
                paddingVertical: SP(5),
                paddingHorizontal: SP(7),
                backgroundColor: m.direction === 'sent' ? theme.sentBg : theme.bg,
              }}>
              <Text style={{...TYPE.sender, color: theme.text}}>
                {m.direction === 'sent' ? 'You' : m.from}
              </Text>
              <Text style={{...TYPE.meta, color: theme.textFaint}}>{m.receivedAt}</Text>
            </Pressable>
            {isOpen ? (
              <View style={{height: 240}}>
                <MessageBody messageId={m.id} allowRemote={allowRemote} deps={bodyDeps} />
              </View>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}
