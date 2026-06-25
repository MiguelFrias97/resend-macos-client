import React from 'react';
import {View, Text, Pressable} from 'react-native';
import {isDangerousFilename, typeMismatch} from '../files/attachmentSafety';
import {SP, RADIUS, TYPE} from './designTokens';
import {useTheme} from './useTheme';

function humanSize(n) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function AttachmentTray({attachments, onSave}) {
  const theme = useTheme();
  if (!attachments || !attachments.length) return null;
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: SP(2),
        marginTop: SP(3),
        marginLeft: SP(7),
        marginRight: SP(4),
      }}>
      {attachments.map(a => {
        const risky =
          isDangerousFilename(a.filename) || typeMismatch(a.contentType, a.filename);
        return (
          <Pressable
            key={a.id}
            onPress={() => onSave(a)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: SP(2),
              height: 40,
              paddingHorizontal: SP(2.5),
              borderRadius: RADIUS.md,
              borderWidth: 1,
              borderColor: risky ? theme.danger : theme.border,
              backgroundColor: theme.surface2,
            }}>
            {risky ? <Text style={{color: theme.danger}}>⚠</Text> : null}
            <Text style={{fontSize: 13, fontWeight: '500', color: theme.text}}>
              {a.filename}
            </Text>
            <Text style={{...TYPE.meta, color: theme.textFaint}}>{humanSize(a.size)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
