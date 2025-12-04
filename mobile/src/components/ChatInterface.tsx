import React, { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights } from '../styles/theme';
import { ChatMessage, VideoSection } from '../types';
import { QuestionBubble } from './QuestionBubble';
import ApiService from '../services/api';
import { getSectionContext } from '../services/utils';

interface ChatInterfaceProps {
  section: VideoSection;
  onClose: () => void;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ section, onClose }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [userQuestions, setUserQuestions] = useState(section.userQuestions);
  const scrollViewRef = useRef<ScrollView>(null);

  const handleAskQuestion = async (question: string) => {
    const userMessage: ChatMessage = { role: 'user', content: question };
    setMessages(prev => [...prev, userMessage]);
    setLoading(true);

    try {
      const response = await ApiService.sendChatMessage(getSectionContext(section), question, messages);
      const aiMessage: ChatMessage = { role: 'assistant', content: response.answer };
      setMessages(prev => [...prev, aiMessage]);
      setUserQuestions(response.follow_up_questions);
    } catch (error: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, error occurred.' }]);
    } finally {
      setLoading(false);
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const handleSendMessage = () => {
    if (!inputText.trim() || loading) return;
    const question = inputText.trim();
    setInputText('');
    handleAskQuestion(question);
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={[Colors.gradientStart, Colors.gradientEnd]} style={styles.header}>
        <Text style={styles.headerTitle}>Ask a question</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeButtonText}>×</Text>
        </TouchableOpacity>
      </LinearGradient>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.content} keyboardVerticalOffset={100}>
        <ScrollView ref={scrollViewRef} style={styles.messagesContainer} contentContainerStyle={styles.messagesContent}>
          {messages.length === 0 && <Text style={styles.starterMessage}>Choose a question to start:</Text>}
          {messages.map((msg, idx) => (
            <View key={idx} style={[styles.message, msg.role === 'user' ? styles.userMessage : styles.assistantMessage]}>
              <Text style={[styles.messageText, msg.role === 'user' && styles.userMessageText]}>{msg.content}</Text>
            </View>
          ))}
          {loading && <View style={[styles.message, styles.assistantMessage]}><ActivityIndicator size="small" color={Colors.primary} /></View>}
        </ScrollView>

        <View style={styles.startersWrapper}>
          <Text style={styles.startersLabel}>💭 Ask AI:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.startersContent}>
            {userQuestions.map((q, idx) => (
              <QuestionBubble key={idx} text={q} onPress={() => handleAskQuestion(q)} type="user" />
            ))}
          </ScrollView>
        </View>

        <View style={styles.inputContainer}>
          <TextInput style={styles.input} placeholder="Type your question..." placeholderTextColor={Colors.textLight} value={inputText} onChangeText={setInputText} onSubmitEditing={handleSendMessage} returnKeyType="send" multiline maxLength={500} />
          <TouchableOpacity style={[styles.sendButton, (!inputText.trim() || loading) && styles.sendButtonDisabled]} onPress={handleSendMessage} disabled={!inputText.trim() || loading}>
            <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.md },
  headerTitle: { fontSize: FontSizes.lg, fontWeight: FontWeights.semibold, color: Colors.white },
  closeButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255, 255, 255, 0.2)', justifyContent: 'center', alignItems: 'center' },
  closeButtonText: { fontSize: 24, color: Colors.white, fontWeight: FontWeights.bold },
  content: { flex: 1 },
  messagesContainer: { flex: 1, backgroundColor: '#f8f9ff' },
  messagesContent: { padding: Spacing.md },
  starterMessage: { textAlign: 'center', color: Colors.primary, fontSize: FontSizes.sm, fontWeight: FontWeights.medium, marginVertical: Spacing.md },
  message: { maxWidth: '85%', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm + 2, borderRadius: BorderRadius.md, marginBottom: Spacing.sm },
  userMessage: { alignSelf: 'flex-end', backgroundColor: Colors.primary },
  assistantMessage: { alignSelf: 'flex-start', backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.borderLight },
  messageText: { fontSize: FontSizes.sm, color: Colors.text, lineHeight: 20 },
  userMessageText: { color: Colors.white },
  startersWrapper: { backgroundColor: 'rgba(255, 255, 255, 0.95)', borderTopWidth: 1, borderTopColor: Colors.borderLight, paddingVertical: Spacing.sm },
  startersLabel: { fontSize: FontSizes.xs, fontWeight: FontWeights.semibold, color: Colors.primary, paddingHorizontal: Spacing.md, marginBottom: Spacing.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
  startersContent: { paddingHorizontal: Spacing.md },
  inputContainer: { flexDirection: 'row', padding: Spacing.md, backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.borderLight, alignItems: 'flex-end' },
  input: { flex: 1, backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, fontSize: FontSizes.sm, color: Colors.text, maxHeight: 100, marginRight: Spacing.sm },
  sendButton: { backgroundColor: Colors.primary, paddingHorizontal: Spacing.md + 4, paddingVertical: Spacing.sm + 2, borderRadius: BorderRadius.lg, justifyContent: 'center', alignItems: 'center' },
  sendButtonDisabled: { opacity: 0.5 },
  sendButtonText: { color: Colors.white, fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
});

