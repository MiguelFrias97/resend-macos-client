import React from 'react';
import {View, Text} from 'react-native';
import {useTheme} from './useTheme';

export default function EmptyState({message}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}>
      <Text style={{color: theme.textMuted, textAlign: 'center'}}>
        {message}
      </Text>
    </View>
  );
}
