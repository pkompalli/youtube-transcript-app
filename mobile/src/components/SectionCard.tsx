import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal, Dimensions } from 'react-native';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../styles/theme';
import { VideoSection, QuizQuestion, ChatMessage } from '../types';
import { QuestionBubble } from './QuestionBubble';
import { ChatInterface } from './ChatInterface';
import { QuizInterface } from './QuizInterface';

const screenHeight = Dimensions.get('window').height;

interface SectionCardProps {
  section: VideoSection;
  onTimestampPress: (seconds: number) => void;
}

export const SectionCard: React.FC<SectionCardProps> = ({ section, onTimestampPress }) => {
  const [chatVisible, setChatVisible] = useState(false);
  const [quizVisible, setQuizVisible] = useState(false);
  const [selectedQuizIndex, setSelectedQuizIndex] = useState(0);
  const [initialQuestion, setInitialQuestion] = useState<string | undefined>(undefined);
  const [userQuestions, setUserQuestions] = useState(section.userQuestions);
  const [quizQuestions, setQuizQuestions] = useState(section.quizQuestions);
  const [quizStatuses, setQuizStatuses] = useState<Record<number, 'correct' | 'incorrect' | null>>({});
  const [answeredCount, setAnsweredCount] = useState(0);
  
  // Persist chat conversation history (like web's chatStates[sectionId])
  const [conversationHistory, setConversationHistory] = useState<ChatMessage[]>([]);

  // Handle clicking a user question - opens chat and auto-asks the question (like web)
  const handleUserQuestionPress = (question: string) => {
    setInitialQuestion(question);
    setChatVisible(true);
  };

  // Open chat without auto-asking (just the chat button)
  const handleChatButtonPress = () => {
    setInitialQuestion(undefined);
    setChatVisible(true);
  };

  const handleChatClose = () => {
    setChatVisible(false);
    setInitialQuestion(undefined);
  };

  // Update conversation history from ChatInterface
  const handleConversationUpdate = (messages: ChatMessage[]) => {
    setConversationHistory(messages);
  };

  const handleQuizAnswered = (isCorrect: boolean, newQuestions: { user: string[]; quiz: QuizQuestion[] }) => {
    setQuizStatuses(prev => ({ ...prev, [selectedQuizIndex]: isCorrect ? 'correct' : 'incorrect' }));
    
    // Add quiz Q&A to conversation history (like web does)
    const quizQ = quizQuestions[selectedQuizIndex];
    const quizMessages: ChatMessage[] = [
      { role: 'user', content: `Quiz: ${quizQ.question}` },
      { role: 'assistant', content: isCorrect ? `✅ Correct! ${quizQ.explanation}` : `❌ The correct answer is ${quizQ.correct}. ${quizQ.explanation}` }
    ];
    setConversationHistory(prev => [...prev, ...quizMessages]);
    
    const newCount = answeredCount + 1;
    setAnsweredCount(newCount);
    
    // After 3 quiz answers, replace all questions with new ones (matches web behavior)
    if (newCount >= 3) {
      setUserQuestions(newQuestions.user);
      setQuizQuestions(newQuestions.quiz);
      setQuizStatuses({});
      setAnsweredCount(0);
    }
    
    setTimeout(() => {
      setQuizVisible(false);
    }, 2500);
  };

  const handleUserQuestionsUpdated = (newQuestions: string[]) => {
    setUserQuestions(newQuestions);
  };

  // Create a modified section with current questions for the interfaces
  const currentSection: VideoSection = {
    ...section,
    userQuestions,
    quizQuestions,
  };

  return (
    <View style={styles.container}>
      {/* Chat button - floating */}
      <TouchableOpacity style={styles.chatButton} onPress={handleChatButtonPress}>
        <Text style={styles.chatButtonText}>💬</Text>
        {/* Show badge if there's conversation history */}
        {conversationHistory.length > 0 && (
          <View style={styles.chatBadge}>
            <Text style={styles.chatBadgeText}>{Math.ceil(conversationHistory.length / 2)}</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Scrollable content inside card */}
      <ScrollView 
        style={styles.scrollContent} 
        showsVerticalScrollIndicator={true}
        nestedScrollEnabled={true}
        contentContainerStyle={styles.scrollContentContainer}
      >
        <TouchableOpacity style={styles.header} onPress={() => onTimestampPress(section.timestampSeconds)}>
          <Text style={styles.timestamp}>{section.timestamp}</Text>
          <Text style={styles.title}>{section.title}</Text>
        </TouchableOpacity>

        <Text style={styles.summary}>{section.summary}</Text>

        <View style={styles.questionsWrapper}>
          <Text style={styles.label}>💭 Ask AI:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.questionsContent}>
            {userQuestions.map((q, idx) => (
              <QuestionBubble 
                key={idx} 
                text={q} 
                onPress={() => handleUserQuestionPress(q)} 
                type="user" 
              />
            ))}
          </ScrollView>
        </View>

        <View style={styles.questionsWrapper}>
          <Text style={styles.label}>🎯 Test:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.questionsContent}>
            {quizQuestions.map((quiz, idx) => (
              <QuestionBubble 
                key={idx} 
                text={quiz.question} 
                onPress={() => { setSelectedQuizIndex(idx); setQuizVisible(true); }} 
                type="quiz" 
                status={quizStatuses[idx]} 
                used={!!quizStatuses[idx]} 
              />
            ))}
          </ScrollView>
        </View>
        
        {/* Extra padding at bottom for scroll */}
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Chat Modal - slides up from bottom, 65% height */}
      <Modal 
        visible={chatVisible} 
        animationType="slide" 
        transparent={true}
        onRequestClose={handleChatClose}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={handleChatClose} />
          <View style={styles.modalContent}>
            <ChatInterface 
              section={currentSection} 
              initialQuestion={initialQuestion}
              conversationHistory={conversationHistory}
              onClose={handleChatClose}
              onQuestionsUpdated={handleUserQuestionsUpdated}
              onConversationUpdate={handleConversationUpdate}
            />
          </View>
        </View>
      </Modal>

      {/* Quiz Modal - slides up from bottom, 65% height */}
      <Modal 
        visible={quizVisible} 
        animationType="slide" 
        transparent={true}
        onRequestClose={() => setQuizVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setQuizVisible(false)} />
          <View style={styles.modalContent}>
            <QuizInterface 
              section={currentSection} 
              quizQuestion={quizQuestions[selectedQuizIndex]} 
              questionIndex={selectedQuizIndex} 
              onAnswered={handleQuizAnswered} 
              onClose={() => setQuizVisible(false)} 
            />
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { 
    flex: 1,
    backgroundColor: Colors.white, 
    borderRadius: BorderRadius.md, 
    ...Shadows.medium,
    overflow: 'hidden',
  },
  scrollContent: {
    flex: 1,
  },
  scrollContentContainer: {
    padding: Spacing.md,
    paddingTop: Spacing.md,
  },
  header: { 
    marginBottom: Spacing.sm,
    paddingRight: 56, // Space for chat button
  },
  timestamp: { 
    fontSize: FontSizes.xs, 
    color: Colors.textSecondary, 
    fontWeight: FontWeights.medium,
    marginBottom: 4,
  },
  title: { 
    fontSize: FontSizes.lg, 
    fontWeight: FontWeights.semibold, 
    color: Colors.primary,
  },
  summary: { 
    fontSize: FontSizes.sm, 
    color: Colors.text, 
    lineHeight: 22, 
    marginBottom: Spacing.md,
  },
  chatButton: { 
    position: 'absolute', 
    top: Spacing.md, 
    right: Spacing.md, 
    width: 44, 
    height: 44, 
    borderRadius: 22, 
    backgroundColor: Colors.primary, 
    justifyContent: 'center', 
    alignItems: 'center', 
    ...Shadows.medium,
    zIndex: 10,
  },
  chatButtonText: { fontSize: 20 },
  chatBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: Colors.error,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  chatBadgeText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: FontWeights.bold,
  },
  questionsWrapper: { marginTop: Spacing.sm },
  label: { 
    fontSize: FontSizes.xs, 
    fontWeight: FontWeights.semibold, 
    color: Colors.primary, 
    marginBottom: Spacing.xs, 
    textTransform: 'uppercase', 
    letterSpacing: 0.5 
  },
  questionsContent: { paddingVertical: Spacing.xs },
  // Modal styles - 65% height, slides up from bottom
  modalOverlay: { 
    flex: 1, 
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalContent: { 
    height: screenHeight * 0.65,
    backgroundColor: Colors.white, 
    borderTopLeftRadius: 20, 
    borderTopRightRadius: 20, 
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 10,
  },
});
