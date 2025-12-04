import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights } from '../styles/theme';

interface QuestionBubbleProps {
  text: string;
  onPress: () => void;
  used?: boolean;
  type?: 'user' | 'quiz';
  status?: 'correct' | 'incorrect' | null;
}

export const QuestionBubble: React.FC<QuestionBubbleProps> = ({ text, onPress, used = false, type = 'user', status = null }) => {
  const getBackgroundColor = () => {
    if (status === 'correct') return Colors.success;
    if (status === 'incorrect') return Colors.error;
    return Colors.white;
  };

  const getTextColor = () => {
    if (status) return Colors.white;
    return Colors.text;
  };

  const getBorderColor = () => {
    if (status) return 'transparent';
    return type === 'quiz' ? Colors.quizGradientStart : Colors.primary;
  };

  const getIcon = () => {
    if (status === 'correct') return '✅ ';
    if (status === 'incorrect') return '❌ ';
    return '';
  };

  return (
    <TouchableOpacity style={[styles.container, { backgroundColor: getBackgroundColor(), borderColor: getBorderColor() }]} onPress={onPress} disabled={used && !status}>
      <Text style={[styles.text, { color: getTextColor() }]} numberOfLines={2}>{getIcon()}{text}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderRadius: BorderRadius.xl, borderWidth: 2, marginRight: Spacing.sm, minWidth: 150, maxWidth: 280 },
  text: { fontSize: FontSizes.sm, fontWeight: FontWeights.medium },
});

