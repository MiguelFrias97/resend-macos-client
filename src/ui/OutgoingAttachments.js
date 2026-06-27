import React from 'react';
import {View, Text, Pressable} from 'react-native';
import Symbol from '../native/Symbol';
import {useTheme} from './useTheme';
import {SP, RADIUS, TYPE} from './designTokens';

function humanSize(n) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// Chips for files staged on an outgoing message. `files` are Resend attachment
// parts plus a `size` (and optional `tooLarge`). onRemove(index) drops one.
export default function OutgoingAttachments({files, onRemove}) {
  const theme = useTheme();
  if (!files || !files.length) return null;
  return (
    <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: SP(2), marginBottom: SP(2)}}>
      {files.map((f, i) => {
        const bad = f.tooLarge;
        return (
          <View
            key={`${f.filename}-${i}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: SP(1.5),
              height: 28,
              paddingHorizontal: SP(2),
              borderRadius: RADIUS.sm,
              borderWidth: 1,
              borderColor: bad ? theme.danger : theme.border,
              backgroundColor: theme.surface2,
            }}>
            <Symbol
              name={bad ? 'exclamationmark.triangle.fill' : 'paperclip'}
              size={13}
              color={bad ? theme.danger : theme.textMuted}
            />
            <Text style={{...TYPE.meta, color: theme.text}} numberOfLines={1}>
              {f.filename}
            </Text>
            <Text style={{...TYPE.meta, color: bad ? theme.danger : theme.textFaint}}>
              {bad ? 'too large' : humanSize(f.size)}
            </Text>
            <Pressable
              accessibilityLabel={`Remove ${f.filename}`}
              onPress={() => onRemove(i)}
              hitSlop={6}>
              <Symbol name="xmark" size={10} color={theme.textFaint} />
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}
