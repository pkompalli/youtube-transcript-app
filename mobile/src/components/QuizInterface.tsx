import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights } from '../styles/theme';
import { QuizQuestion, VideoSection } from '../types';
import ApiService from '../services/api';
import { getSectionContext } from '../services/utils';

interface QuizInterfaceProps {
  section: VideoSection;
  quizQuestion: QuizQuestion;
  questionIndex: number;
  onAnswered: (isCorrect: boolean, newQuestions: { user: string[]; quiz: QuizQuestion[] }) => void;
  onClose: () => void;
}

export const QuizInterface: React.FC<QuizInterfaceProps> = ({ section, quizQuestion, onAnswered, onClose }) => {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [customAnswer, setCustomAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ isCorrect: boolean; message: string } | null>(null);

  const handleSubmit = async (answer: string) => {
    if (loading || feedback) return;
    
    setLoading(true);
    try {
      const response = await ApiService.validateQuizAnswer(
        getSectionContext(section), 
        quizQuestion.question, 
        answer, 
        quizQuestion.correct, 
        quizQuestion.explanation
      );
      
      setFeedback({ isCorrect: response.is_correct, message: response.feedback });
      
      // Delay before closing to show feedback (matches web behavior)
      setTimeout(() => {
        onAnswered(response.is_correct, { 
          user: response.new_user_questions, 
          quiz: response.new_quiz_questions 
        });
      }, 2000);
    } catch (error) {
      setFeedback({ isCorrect: false, message: 'Error checking answer. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const handleOptionSelect = (letter: string) => {
    if (loading || feedback) return;
    setSelectedOption(letter);
    handleSubmit(letter);
  };

  const handleCustomSubmit = () => {
    if (!customAnswer.trim() || loading || feedback) return;
    handleSubmit(customAnswer.trim());
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🎯 Test Yourself</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeButtonText}>×</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <Text style={styles.question}>{quizQuestion.question}</Text>

        <View style={styles.options}>
          {Object.entries(quizQuestion.options).map(([letter, text]) => {
            const isSelected = selectedOption === letter;
            const isCorrectAnswer = letter === quizQuestion.correct;
            const showResult = feedback && isSelected;
            
            return (
              <TouchableOpacity 
                key={letter} 
                style={[
                  styles.option, 
                  isSelected && styles.optionSelected,
                  showResult && (feedback.isCorrect ? styles.optionCorrect : styles.optionIncorrect),
                  feedback && !isSelected && isCorrectAnswer && styles.optionCorrectHighlight,
                ]} 
                onPress={() => handleOptionSelect(letter)} 
                disabled={!!feedback || loading}
              >
                <Text style={[
                  styles.optionLetter,
                  isSelected && styles.optionLetterSelected,
                  showResult && styles.optionLetterAnswered,
                ]}>
                  {letter}
                </Text>
                <Text style={[
                  styles.optionText, 
                  isSelected && styles.optionTextSelected,
                  showResult && styles.optionTextAnswered,
                ]}>
                  {text}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>OR</Text>
          <View style={styles.dividerLine} />
        </View>

        <View style={styles.customAnswer}>
          <TextInput 
            style={styles.input} 
            placeholder="Type your own answer..." 
            placeholderTextColor={Colors.textLight} 
            value={customAnswer} 
            onChangeText={setCustomAnswer} 
            editable={!feedback && !loading} 
            multiline 
            maxLength={200}
            onSubmitEditing={handleCustomSubmit}
          />
          <TouchableOpacity 
            style={[styles.submitButton, (!customAnswer.trim() || loading || !!feedback) && styles.submitButtonDisabled]} 
            onPress={handleCustomSubmit} 
            disabled={!customAnswer.trim() || loading || !!feedback}
          >
            <Text style={styles.submitButtonText}>Submit</Text>
          </TouchableOpacity>
        </View>

        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.loadingText}>Checking your answer...</Text>
          </View>
        )}
        
        {feedback && (
          <View style={[styles.feedback, feedback.isCorrect ? styles.feedbackCorrect : styles.feedbackIncorrect]}>
            <Text style={styles.feedbackIcon}>{feedback.isCorrect ? '✅' : '❌'}</Text>
            <Text style={styles.feedbackText}>{feedback.message}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: Spacing.md, 
    paddingVertical: Spacing.md, 
    borderBottomWidth: 1, 
    borderBottomColor: Colors.borderLight,
    backgroundColor: Colors.surface,
  },
  headerTitle: { fontSize: FontSizes.lg, fontWeight: FontWeights.semibold, color: Colors.text },
  closeButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.borderLight, justifyContent: 'center', alignItems: 'center' },
  closeButtonText: { fontSize: 24, color: Colors.text, fontWeight: FontWeights.bold },
  content: { flex: 1 },
  contentContainer: { padding: Spacing.md },
  question: { fontSize: FontSizes.md, fontWeight: FontWeights.semibold, color: Colors.text, marginBottom: Spacing.lg, lineHeight: 24 },
  options: { marginBottom: Spacing.md },
  option: { 
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white, 
    borderWidth: 2, 
    borderColor: Colors.borderLight, 
    borderRadius: BorderRadius.md, 
    paddingHorizontal: Spacing.md, 
    paddingVertical: Spacing.md, 
    marginBottom: Spacing.sm,
  },
  optionSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary + '10' },
  optionCorrect: { backgroundColor: '#d4edda', borderColor: Colors.success },
  optionIncorrect: { backgroundColor: '#f8d7da', borderColor: Colors.error },
  optionCorrectHighlight: { borderColor: Colors.success, borderStyle: 'dashed' },
  optionLetter: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surface,
    textAlign: 'center',
    lineHeight: 28,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.textSecondary,
    marginRight: Spacing.sm,
  },
  optionLetterSelected: { backgroundColor: Colors.primary, color: Colors.white },
  optionLetterAnswered: { backgroundColor: 'transparent' },
  optionText: { flex: 1, fontSize: FontSizes.sm, color: Colors.text, fontWeight: FontWeights.medium },
  optionTextSelected: { color: Colors.primary },
  optionTextAnswered: { color: Colors.text },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: Spacing.md },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.borderLight },
  dividerText: { paddingHorizontal: Spacing.md, color: Colors.textLight, fontSize: FontSizes.xs, fontWeight: FontWeights.medium },
  customAnswer: { flexDirection: 'row', marginBottom: Spacing.md, alignItems: 'flex-end' },
  input: { 
    flex: 1, 
    backgroundColor: Colors.surface, 
    borderWidth: 2, 
    borderColor: Colors.borderLight, 
    borderRadius: BorderRadius.md, 
    paddingHorizontal: Spacing.md, 
    paddingVertical: Spacing.sm, 
    fontSize: FontSizes.sm, 
    color: Colors.text, 
    marginRight: Spacing.sm, 
    maxHeight: 80,
  },
  submitButton: { 
    backgroundColor: Colors.primary, 
    paddingHorizontal: Spacing.md, 
    paddingVertical: Spacing.sm + 2, 
    borderRadius: BorderRadius.md,
  },
  submitButtonDisabled: { opacity: 0.5 },
  submitButtonText: { color: Colors.white, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  loadingContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: Spacing.md },
  loadingText: { marginLeft: Spacing.sm, color: Colors.textSecondary, fontSize: FontSizes.sm, fontStyle: 'italic' },
  feedback: { 
    flexDirection: 'row',
    padding: Spacing.md, 
    borderRadius: BorderRadius.md, 
    borderWidth: 2,
    marginTop: Spacing.sm,
  },
  feedbackCorrect: { backgroundColor: '#d4edda', borderColor: Colors.success },
  feedbackIncorrect: { backgroundColor: '#f8d7da', borderColor: Colors.error },
  feedbackIcon: { fontSize: 20, marginRight: Spacing.sm },
  feedbackText: { flex: 1, fontSize: FontSizes.sm, lineHeight: 20, color: Colors.text },
});
