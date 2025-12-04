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
  onAnswered: (isCorrect: boolean, newQuestions: any) => void;
  onClose: () => void;
}

export const QuizInterface: React.FC<QuizInterfaceProps> = ({ section, quizQuestion, onAnswered, onClose }) => {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [customAnswer, setCustomAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ isCorrect: boolean; message: string } | null>(null);

  const handleSubmit = async (answer: string) => {
    setLoading(true);
    try {
      const response = await ApiService.validateQuizAnswer(getSectionContext(section), quizQuestion.question, answer, quizQuestion.correct, quizQuestion.explanation);
      setFeedback({ isCorrect: response.is_correct, message: response.feedback });
      setTimeout(() => onAnswered(response.is_correct, { user: response.new_user_questions, quiz: response.new_quiz_questions }), 2000);
    } catch (error) {
      setFeedback({ isCorrect: false, message: 'Error checking answer' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Test Yourself</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeButtonText}>×</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        <Text style={styles.question}>{quizQuestion.question}</Text>

        <View style={styles.options}>
          {Object.entries(quizQuestion.options).map(([letter, text]) => (
            <TouchableOpacity key={letter} style={[styles.option, selectedOption === letter && styles.optionSelected, feedback && selectedOption === letter && (feedback.isCorrect ? styles.optionCorrect : styles.optionIncorrect)]} onPress={() => { setSelectedOption(letter); handleSubmit(letter); }} disabled={!!feedback || loading}>
              <Text style={[styles.optionText, selectedOption === letter && feedback && styles.optionTextAnswered]}>{letter}) {text}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.customAnswer}>
          <TextInput style={styles.input} placeholder="Or type answer..." placeholderTextColor={Colors.textLight} value={customAnswer} onChangeText={setCustomAnswer} editable={!feedback && !loading} multiline maxLength={200} />
          <TouchableOpacity style={[styles.submitButton, (!customAnswer.trim() || loading || !!feedback) && styles.submitButtonDisabled]} onPress={() => handleSubmit(customAnswer.trim())} disabled={!customAnswer.trim() || loading || !!feedback}>
            <Text style={styles.submitButtonText}>Submit</Text>
          </TouchableOpacity>
        </View>

        {loading && <View style={styles.loadingContainer}><ActivityIndicator size="small" color={Colors.primary} /><Text style={styles.loadingText}>Checking...</Text></View>}
        {feedback && <View style={[styles.feedback, feedback.isCorrect ? styles.feedbackCorrect : styles.feedbackIncorrect]}><Text style={styles.feedbackText}>{feedback.message}</Text></View>}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  headerTitle: { fontSize: FontSizes.lg, fontWeight: FontWeights.semibold, color: Colors.text },
  closeButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.borderLight, justifyContent: 'center', alignItems: 'center' },
  closeButtonText: { fontSize: 24, color: Colors.text, fontWeight: FontWeights.bold },
  content: { flex: 1, padding: Spacing.md },
  question: { fontSize: FontSizes.md, fontWeight: FontWeights.semibold, color: Colors.text, marginBottom: Spacing.md, lineHeight: 24 },
  options: { marginBottom: Spacing.md },
  option: { backgroundColor: Colors.white, borderWidth: 2, borderColor: Colors.quizGradientStart, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, marginBottom: Spacing.sm },
  optionSelected: { borderColor: Colors.quizGradientEnd, backgroundColor: Colors.quizGradientStart + '10' },
  optionCorrect: { backgroundColor: Colors.success, borderColor: Colors.success },
  optionIncorrect: { backgroundColor: Colors.error, borderColor: Colors.error },
  optionText: { fontSize: FontSizes.sm, color: Colors.text, fontWeight: FontWeights.medium },
  optionTextAnswered: { color: Colors.white },
  customAnswer: { flexDirection: 'row', marginBottom: Spacing.md, alignItems: 'flex-end' },
  input: { flex: 1, backgroundColor: Colors.surface, borderWidth: 2, borderColor: Colors.quizGradientStart + '80', borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, fontSize: FontSizes.sm, color: Colors.text, marginRight: Spacing.sm, maxHeight: 80 },
  submitButton: { backgroundColor: Colors.quizGradientStart, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderRadius: BorderRadius.md },
  submitButtonDisabled: { opacity: 0.5 },
  submitButtonText: { color: Colors.white, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  loadingContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: Spacing.md },
  loadingText: { marginLeft: Spacing.sm, color: Colors.textSecondary, fontSize: FontSizes.sm, fontStyle: 'italic' },
  feedback: { padding: Spacing.md, borderRadius: BorderRadius.md, borderWidth: 2 },
  feedbackCorrect: { backgroundColor: '#d4edda', borderColor: Colors.success },
  feedbackIncorrect: { backgroundColor: '#f8d7da', borderColor: Colors.error },
  feedbackText: { fontSize: FontSizes.sm, lineHeight: 20, color: Colors.text },
});

