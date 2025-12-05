import axios from 'axios';
import { TranscriptResponse, ChatResponse, QuizValidationResponse } from '../types';
import { Platform } from 'react-native';

// API URL configuration
// - For iOS simulator: use localhost
// - For Android emulator: use 10.0.2.2 (Android's localhost alias)
// - For physical devices: use your computer's IP address
const getBaseUrl = () => {
  if (__DEV__) {
    // Development mode
    if (Platform.OS === 'android') {
      return 'http://10.0.2.2:8000'; // Android emulator localhost
    }
    return 'http://localhost:8000'; // iOS simulator or web
  }
  // Production - replace with your actual server URL
  return 'http://localhost:8000';
};

const API_BASE_URL = getBaseUrl();

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 120000, // 2 min timeout for long transcripts
});

export const ApiService = {
  async getTranscriptSummary(url: string): Promise<TranscriptResponse> {
    const response = await api.post<TranscriptResponse>('/api/transcript', { url });
    return response.data;
  },

  async sendChatMessage(sectionContext: string, question: string, conversationHistory: any[] = []): Promise<ChatResponse> {
    const response = await api.post<ChatResponse>('/api/chat', {
      section_context: sectionContext,
      question,
      conversation_history: conversationHistory,
    });
    return response.data;
  },

  async validateQuizAnswer(sectionContext: string, question: string, userAnswer: string, correctAnswer: string, explanation: string): Promise<QuizValidationResponse> {
    const response = await api.post<QuizValidationResponse>('/api/quiz/validate', {
      section_context: sectionContext,
      question,
      user_answer: userAnswer,
      correct_answer: correctAnswer,
      explanation,
    });
    return response.data;
  },
};

export default ApiService;
