import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal, Dimensions, ActivityIndicator } from 'react-native';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights, Shadows } from '../styles/theme';
import { VideoSection, QuizQuestion, ChatMessage } from '../types';
import { QuestionBubble } from './QuestionBubble';
import { ChatInterface } from './ChatInterface';
import { QuizInterface } from './QuizInterface';
import ApiService from '../services/api';

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
  const [userQuestions, setUserQuestions] = useState<string[]>([]);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizStatuses, setQuizStatuses] = useState<Record<number, 'correct' | 'incorrect' | null>>({});
  const [answeredCount, setAnsweredCount] = useState(0);
  
  // Track expanded state and loading for each section
  const [askAiExpanded, setAskAiExpanded] = useState(false);
  const [askMeExpanded, setAskMeExpanded] = useState(false);
  const [loadingAskAi, setLoadingAskAi] = useState(false);
  const [loadingAskMe, setLoadingAskMe] = useState(false);
  
  // Persist chat conversation history (like web's chatStates[sectionId])
  const [conversationHistory, setConversationHistory] = useState<ChatMessage[]>([]);

  // Generate questions on-demand when "Ask AI" is clicked
  const handleAskAiClick = async () => {
    if (askAiExpanded) {
      // Already expanded, just collapse
      setAskAiExpanded(false);
      return;
    }
    
    if (userQuestions.length > 0) {
      // Already have questions, just expand
      setAskAiExpanded(true);
      return;
    }
    
    // Generate questions
    setLoadingAskAi(true);
    try {
      console.log('💭 Generating Ask AI questions for:', section.title);
      const result = await ApiService.generateQuizForSection(section.title, section.content);
      setUserQuestions(result.user_questions);
      if (result.quiz_questions.length > 0) {
        setQuizQuestions(result.quiz_questions);
      }
      setAskAiExpanded(true);
      console.log('✅ Got', result.user_questions.length, 'user questions');
    } catch (error) {
      console.error('Failed to generate questions:', error);
    } finally {
      setLoadingAskAi(false);
    }
  };

  // Generate quiz questions on-demand when "Ask Me" is clicked
  const handleAskMeClick = async () => {
    if (askMeExpanded) {
      // Already expanded, just collapse
      setAskMeExpanded(false);
      return;
    }
    
    if (quizQuestions.length > 0) {
      // Already have questions, just expand
      setAskMeExpanded(true);
      return;
    }
    
    // Generate questions
    setLoadingAskMe(true);
    try {
      console.log('🎯 Generating Ask Me questions for:', section.title);
      const result = await ApiService.generateQuizForSection(section.title, section.content);
      setQuizQuestions(result.quiz_questions);
      if (result.user_questions.length > 0) {
        setUserQuestions(result.user_questions);
      }
      setAskMeExpanded(true);
      console.log('✅ Got', result.quiz_questions.length, 'quiz questions');
    } catch (error) {
      console.error('Failed to generate questions:', error);
    } finally {
      setLoadingAskMe(false);
    }
  };

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

        {/* Ask AI - clickable header */}
        <View style={styles.questionsWrapper}>
          <TouchableOpacity 
            style={styles.sectionHeader} 
            onPress={handleAskAiClick}
            disabled={loadingAskAi}
          >
            <Text style={styles.sectionHeaderText}>💭 Ask AI</Text>
            {loadingAskAi && <ActivityIndicator size="small" color={Colors.primary} style={styles.headerLoader} />}
            {!loadingAskAi && <Text style={styles.expandIcon}>{askAiExpanded ? '▼' : '▶'}</Text>}
          </TouchableOpacity>
          
          {askAiExpanded && userQuestions.length > 0 && (
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false} 
              contentContainerStyle={styles.questionsContent}
              nestedScrollEnabled={true}
              directionalLockEnabled={true}
            >
              {userQuestions.map((q, idx) => (
                <QuestionBubble 
                  key={idx} 
                  text={q} 
                  onPress={() => handleUserQuestionPress(q)} 
                  type="user" 
                />
              ))}
            </ScrollView>
          )}
        </View>

        {/* Ask Me - clickable header (quiz questions) */}
        <View style={styles.questionsWrapper}>
          <TouchableOpacity 
            style={styles.sectionHeader} 
            onPress={handleAskMeClick}
            disabled={loadingAskMe}
          >
            <Text style={styles.sectionHeaderText}>🎯 Ask Me</Text>
            {loadingAskMe && <ActivityIndicator size="small" color={Colors.primary} style={styles.headerLoader} />}
            {!loadingAskMe && <Text style={styles.expandIcon}>{askMeExpanded ? '▼' : '▶'}</Text>}
          </TouchableOpacity>
          
          {askMeExpanded && quizQuestions.length > 0 && (
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false} 
              contentContainerStyle={styles.questionsContent}
              nestedScrollEnabled={true}
              directionalLockEnabled={true}
            >
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
          )}
        </View>
        
        {/* Extra padding at bottom for scroll */}
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Chat button - floating (moved outside ScrollView for proper z-index) */}
      <TouchableOpacity style={styles.chatButton} onPress={handleChatButtonPress}>
        <Text style={styles.chatButtonText}>💬</Text>
        {conversationHistory.length > 0 && (
          <View style={styles.chatBadge}>
            <Text style={styles.chatBadgeText}>{Math.ceil(conversationHistory.length / 2)}</Text>
          </View>
        )}
      </TouchableOpacity>

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
    position: 'relative',
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.xs,
  },
  sectionHeaderText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.primary,
    flex: 1,
  },
  expandIcon: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  headerLoader: {
    marginLeft: Spacing.sm,
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
