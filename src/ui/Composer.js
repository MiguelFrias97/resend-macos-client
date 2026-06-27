import React from 'react';
import {View, Pressable} from 'react-native';
import RichEditorView, {commands} from '../native/RichEditorView';
import Symbol from '../native/Symbol';
import {docModelToHtml} from '../editor/docModelToHtml';
import {collectInlineImages} from '../editor/collectInlineImages';
import {useTheme} from './useTheme';
import {SP, RADIUS, TYPE} from './designTokens';

function ToolbarButton({label, onPress, symbol, color}) {
  return (
    <Pressable
      accessibilityLabel={label}
      onPress={onPress}
      style={({hovered, pressed}) => ({
        width: 28,
        height: 28,
        borderRadius: RADIUS.sm,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: hovered || pressed ? color.hover : 'transparent',
      })}
    >
      <Symbol name={symbol} size={15} color={color.text} />
    </Pressable>
  );
}

// A rich-text composer: a native NSTextView editor with a formatting toolbar.
// onChange reports the email HTML and the inline images extracted from the
// editor's document model (consumed by the reply/send pipeline in M6).
export default function Composer({onChange, onSubmit, onContentSize}) {
  const theme = useTheme();
  const handleNativeChange = e => {
    const model = e && e.nativeEvent ? e.nativeEvent.model : null;
    if (onChange) {
      onChange({
        html: docModelToHtml(model),
        inlineImages: collectInlineImages(model),
      });
    }
  };
  // ⌘↵ inside the native editor → send.
  const handleNativeSubmit = () => {
    if (onSubmit) onSubmit();
  };

  const btnColor = {text: theme.text, hover: theme.hover};

  return (
    <View style={{flex: 1, backgroundColor: theme.bg}}>
      <View
        style={{
          flexDirection: 'row',
          gap: SP(0.5),
          height: 32,
          alignItems: 'center',
          borderBottomWidth: 1,
          borderBottomColor: theme.divider,
        }}
      >
        <ToolbarButton label="Bold" onPress={commands.bold} symbol="bold" color={btnColor} />
        <ToolbarButton label="Italic" onPress={commands.italic} symbol="italic" color={btnColor} />
        <ToolbarButton label="Underline" onPress={commands.underline} symbol="underline" color={btnColor} />
        <ToolbarButton label="Bulleted list" onPress={commands.bulletList} symbol="list.bullet" color={btnColor} />
        <ToolbarButton label="Numbered list" onPress={commands.numberList} symbol="list.number" color={btnColor} />
      </View>
      <RichEditorView
        style={{flex: 1, minHeight: 60, ...TYPE.body, color: theme.text}}
        onChange={handleNativeChange}
        onSubmit={handleNativeSubmit}
        onContentSizeChange={
          onContentSize
            ? e => onContentSize(e && e.nativeEvent ? e.nativeEvent.height : 0)
            : undefined
        }
      />
    </View>
  );
}
