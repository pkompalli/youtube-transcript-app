import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal } from 'react-native';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../styles/theme';
import { VideoSection } from '../types';
import { QuestionBubble } from './QuestionBubble';
import { ChatInterface } from './ChatInterface';
import { QuizInterface } from './QuizInterface';

interface SectionCardProps {
  section: VideoSection;
  onTimestampPress: (seconds: number) => void;
}

export const SectionCard: React.FC<SectionCardProps> = ({ section, onTimestampPress }) => {
  const [chatVisible, setChatVisible] = useState(false);
  const [quizVisible, setQuizVisible] = useState(false);
  const [selectedQuizIndex, setSelectedQuizIndex] = useState(0);
  const [userQuestions, setUserQuestions] = useState(section.userQuestions);
  const [quizQuestions, setQuizQuestions] = useState(section.quizQuestions);
  const [quizStatuses, setQuizStatuses] = useState<Record<number, 'correct' | 'incorrect' | null>>({});

  const handleQuizAnswered = (isCorrect: boolean, newQuestions: any) => {
    setQuizStatuses(prev => ({ ...prev, [selectedQuizIndex]: isCorrect ? 'correct' : 'incorrect' }));
    setTimeout(() => {
      setQuizVisible(false);
      setUserQuestions(newQuestions.user);
      setQuizQuestions(newQuestions.quiz);
    }, 2500);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.header} onPress={() => onTimestampPress(section.timestampSeconds)}>
        <Text style={styles.title}>{section.title}</Text>
        <Text style={styles.timestamp}>{section.timestamp}</Text>
      </TouchableOpacity>

      <Text style={styles.summary}>{section.summary}</Text>

      <TouchableOpacity style={styles.chatButton} onPress={() => setChatVisible(true)}>
        <Text style={styles.chatButtonText}>💬</Text>
      </TouchableOpacity>

      <View style={styles.questionsWrapper}>
        <Text style={styles.label}>💭 Ask AI:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.questionsContent}>
          {userQuestions.map((q, idx) => (
            <QuestionBubble key={idx} text={q} onPress={() => setChatVisible(true)} type="user" />
          ))}
        </ScrollView>
      </View>

      <View style={styles.questionsWrapper}>
        <Text style={styles.label}>🎯 Test:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.questionsContent}>
          {quizQuestions.map((quiz, idx) => (
            <QuestionBubble key={idx} text={quiz.question} onPress={() => { setSelectedQuizIndex(idx); setQuizVisible(true); }} type="quiz" status={quizStatuses[idx]} used={!!quizStatuses[idx]} />
          ))}
        </ScrollView>
      </View>

      <Modal visible={chatVisible} animationType="slide" onRequestClose={() => setChatVisible(false)}>
        <ChatInterface section={section} onClose={() => setChatVisible(false)} />
      </Modal>

      <Modal visible={quizVisible} animationType="slide" onRequestClose={() => setQuizVisible(false)}>
        <QuizInterface section={section} quizQuestion={quizQuestions[selectedQuizIndex]} questionIndex={selectedQuizIndex} onAnswered={handleQuizAnswered} onClose={() => setQuizVisible(false)} />
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { backgroundColor: Colors.white, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.md, ...Shadows.medium },
  header: { marginBottom: Spacing.sm },
  title: { fontSize: FontSizes.lg, fontWeight: FontWeights.semibold, color: Colors.primary, marginBottom: Spacing.xs },
  timestamp: { fontSize: FontSizes.sm, color: Colors.textSecondary, fontWeight: FontWeights.medium },
  summary: { fontSize: FontSizes.sm, color: Colors.text, lineHeight: 20, marginBottom: Spacing.md },
  chatButton: { position: 'absolute', top: Spacing.md, right: Spacing.md, width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', ...Shadows.medium },
  chatButtonText: { fontSize: 24 },
  questionsWrapper: { marginTop: Spacing.sm },
  label: { fontSize: FontSizes.xs, fontWeight: FontWeights.semibold, color: Colors.primary, marginBottom: Spacing.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
  questionsContent: { paddingVertical: Spacing.xs },
});

