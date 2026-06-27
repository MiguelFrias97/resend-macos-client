import React from 'react';
import {View, Text, Pressable} from 'react-native';
import Symbol from '../native/Symbol';
import {SP, RADIUS, TYPE} from './designTokens';

// The send bar shared by ComposeSheet and ReplyComposer so the two can't drift.
// status: 'idle' | 'sending' | 'sent' | 'failed'. errorText is shown static on
// failure; the tappable element is the Retry button, not the error text.
// onAttach (optional) shows a paperclip button pinned left.
export default function ComposerFooter({status, errorText, onSend, onAttach, theme}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: SP(2),
      }}>
      {onAttach ? (
        <Pressable
          accessibilityLabel="Attach files"
          onPress={onAttach}
          style={({hovered, pressed}) => ({
            width: 28,
            height: 28,
            borderRadius: RADIUS.sm,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 'auto',
            backgroundColor: hovered || pressed ? theme.hover : 'transparent',
          })}>
          <Symbol name="paperclip" size={16} color={theme.textMuted} />
        </Pressable>
      ) : null}
      {status === 'sent' ? (
        <Text style={{...TYPE.meta, color: theme.success}}>Sent</Text>
      ) : null}
      {status === 'failed' ? (
        <>
          {errorText ? (
            <Text style={{...TYPE.meta, color: theme.danger}}>{errorText}</Text>
          ) : null}
          <Pressable
            onPress={onSend}
            style={{
              height: 28,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: theme.border,
              paddingHorizontal: SP(3),
              borderRadius: RADIUS.sm,
            }}>
            <Text style={{...TYPE.button, color: theme.text}}>Retry</Text>
          </Pressable>
        </>
      ) : null}
      <Pressable
        onPress={onSend}
        disabled={status === 'sending'}
        style={{
          height: 28,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: SP(4),
          borderRadius: RADIUS.sm,
          backgroundColor: theme.accent,
        }}>
        <Text style={{...TYPE.button, color: theme.onAccent}}>
          {status === 'sending' ? 'Sending…' : 'Send'}
        </Text>
      </Pressable>
    </View>
  );
}
