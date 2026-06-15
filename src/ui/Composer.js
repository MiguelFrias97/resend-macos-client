import React from 'react';
import {View, Pressable, Text} from 'react-native';
import RichEditorView, {commands} from '../native/RichEditorView';
import {docModelToHtml} from '../editor/docModelToHtml';
import {collectInlineImages} from '../editor/collectInlineImages';
import {useTheme} from './useTheme';
import {SP, RADIUS, TYPE} from './designTokens';

function ToolbarButton({label, onPress, children, color}) {
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
      <Text style={{...TYPE.button, fontWeight: '600', color: color.text}}>
        {children}
      </Text>
    </Pressable>
  );
}

// A rich-text composer: a native NSTextView editor with a formatting toolbar.
// onChange reports the email HTML and the inline images extracted from the
// editor's document model (consumed by the reply/send pipeline in M6).
export default function Composer({onChange}) {
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
        <ToolbarButton label="Bold" onPress={commands.bold} color={btnColor}>
          B
        </ToolbarButton>
        <ToolbarButton label="Italic" onPress={commands.italic} color={btnColor}>
          i
        </ToolbarButton>
        <ToolbarButton label="Underline" onPress={commands.underline} color={btnColor}>
          U
        </ToolbarButton>
        <ToolbarButton label="Bulleted list" onPress={commands.bulletList} color={btnColor}>
          •
        </ToolbarButton>
        <ToolbarButton label="Numbered list" onPress={commands.numberList} color={btnColor}>
          1.
        </ToolbarButton>
      </View>
      <RichEditorView
        style={{flex: 1, minHeight: 80, ...TYPE.body, color: theme.text}}
        onChange={handleNativeChange}
      />
    </View>
  );
}
