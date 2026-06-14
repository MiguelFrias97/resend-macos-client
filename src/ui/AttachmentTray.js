import React from 'react';
import {View, Text, Pressable} from 'react-native';
import {isDangerousFilename, typeMismatch} from '../files/attachmentSafety';

function humanSize(n) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function AttachmentTray({attachments, onSave}) {
  if (!attachments || !attachments.length) return null;
  return (
    <View style={{flexDirection: 'row', flexWrap: 'wrap', padding: 8}}>
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
              margin: 4,
              paddingVertical: 6,
              paddingHorizontal: 10,
              borderWidth: 1,
              borderColor: risky ? '#d98b00' : '#ddd',
              borderRadius: 8,
            }}>
            {risky ? <Text>⚠ </Text> : null}
            <Text>{a.filename}</Text>
            <Text style={{color: '#999'}}> {humanSize(a.size)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
