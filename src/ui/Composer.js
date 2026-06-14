import React from 'react';
import {View, Pressable, Text} from 'react-native';
import RichEditorView, {commands} from '../native/RichEditorView';
import {docModelToHtml} from '../editor/docModelToHtml';
import {collectInlineImages} from '../editor/collectInlineImages';

function ToolbarButton({label, onPress, children}) {
  return (
    <Pressable
      accessibilityLabel={label}
      onPress={onPress}
      style={{paddingVertical: 4, paddingHorizontal: 10, marginRight: 4}}
    >
      <Text style={{fontWeight: '600'}}>{children}</Text>
    </Pressable>
  );
}

// A rich-text composer: a native NSTextView editor with a formatting toolbar.
// onChange reports the email HTML and the inline images extracted from the
// editor's document model (consumed by the reply/send pipeline in M6).
export default function Composer({onChange}) {
  const handleNativeChange = e => {
    const model = e && e.nativeEvent ? e.nativeEvent.model : null;
    if (onChange) {
      onChange({
        html: docModelToHtml(model),
        inlineImages: collectInlineImages(model),
      });
    }
  };

  return (
    <View style={{flex: 1}}>
      <View
        style={{
          flexDirection: 'row',
          padding: 6,
          borderBottomWidth: 1,
          borderBottomColor: '#eee',
        }}
      >
        <ToolbarButton label="Bold" onPress={commands.bold}>
          B
        </ToolbarButton>
        <ToolbarButton label="Italic" onPress={commands.italic}>
          i
        </ToolbarButton>
        <ToolbarButton label="Underline" onPress={commands.underline}>
          U
        </ToolbarButton>
        <ToolbarButton label="Bulleted list" onPress={commands.bulletList}>
          •
        </ToolbarButton>
        <ToolbarButton label="Numbered list" onPress={commands.numberList}>
          1.
        </ToolbarButton>
      </View>
      <RichEditorView style={{flex: 1}} onChange={handleNativeChange} />
    </View>
  );
}
