import React from 'react';
import {View, Text, TextInput, Pressable} from 'react-native';
import Symbol from '../native/Symbol';
import {useTheme} from './useTheme';
import {SP, RADIUS, TYPE} from './designTokens';

function domainOf(addr) {
  const at = String(addr || '').indexOf('@');
  return at >= 0 ? addr.slice(at + 1).trim().toLowerCase() : '';
}

// A From-address input that knows the account's verified sending domains: it
// suggests them as chips and validates inline (so the user learns *why* a bare
// address won't send, instead of a flat error only at send time).
export default function FromField({
  value,
  onChange,
  onBlur,
  verifiedDomains = [],
  placeholder = 'you@yourdomain.com',
  style,
}) {
  const theme = useTheme();
  const domain = domainOf(value);
  const known = verifiedDomains.length > 0;
  const isVerified = !!domain && verifiedDomains.includes(domain);
  const unverified = known && !!domain && !isVerified;

  const setDomain = d => {
    const at = String(value || '').indexOf('@');
    const local = at >= 0 ? value.slice(0, at) : value || '';
    onChange(`${local}@${d}`);
  };

  return (
    <View style={style}>
      <TextInput
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        value={value}
        onChangeText={onChange}
        onBlur={onBlur}
        autoCapitalize="none"
        autoCorrect={false}
        style={{...TYPE.body, color: theme.text}}
      />
      {isVerified ? (
        <View style={{flexDirection: 'row', alignItems: 'center', gap: SP(1.5), marginTop: SP(1)}}>
          <Symbol name="checkmark.circle.fill" size={12} color={theme.success} />
          <Text style={{...TYPE.meta, color: theme.textFaint}}>
            Verified for sending
          </Text>
        </View>
      ) : unverified ? (
        <View style={{flexDirection: 'row', alignItems: 'center', gap: SP(1.5), marginTop: SP(1)}}>
          <Symbol name="exclamationmark.triangle.fill" size={12} color={theme.danger} />
          <Text style={{...TYPE.meta, color: theme.danger}} numberOfLines={2}>
            {domain} isn't a verified sending domain — Resend will reject it.
          </Text>
        </View>
      ) : null}
      {known ? (
        <View style={{flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SP(1.5), marginTop: SP(1.5)}}>
          <Text style={{...TYPE.meta, color: theme.textFaint}}>Verified:</Text>
          {verifiedDomains.map(d => (
            <Pressable
              key={d}
              accessibilityLabel={`Use ${d}`}
              onPress={() => setDomain(d)}
              style={({hovered}) => ({
                paddingHorizontal: SP(2),
                height: 22,
                justifyContent: 'center',
                borderRadius: RADIUS.pill,
                backgroundColor:
                  domain === d ? theme.accent + '1A' : hovered ? theme.hover : theme.surface2,
              })}>
              <Text style={{...TYPE.meta, color: domain === d ? theme.accent : theme.textMuted}}>
                {d}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
