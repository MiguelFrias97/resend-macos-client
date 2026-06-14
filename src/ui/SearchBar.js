import React from 'react';
import {TextInput} from 'react-native';

export default function SearchBar({value, onChange}) {
  return (
    <TextInput
      placeholder="Search"
      value={value}
      onChangeText={onChange}
      style={{
        margin: 8,
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 8,
      }}
    />
  );
}
