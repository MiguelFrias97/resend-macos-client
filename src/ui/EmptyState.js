import React from 'react';
import {View, Text} from 'react-native';
import {useTheme} from './useTheme';
import {SP, TYPE} from './designTokens';
import Symbol from '../native/Symbol';

export default function EmptyState({message}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: SP(2.5),
        paddingVertical: SP(16),
        paddingHorizontal: SP(7),
      }}>
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: theme.surface2,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Symbol name="tray" size={22} color={theme.textFaint} />
      </View>
      <Text
        style={{
          ...TYPE.preview,
          color: theme.textMuted,
          textAlign: 'center',
          maxWidth: 210,
        }}>
        {message}
      </Text>
    </View>
  );
}
