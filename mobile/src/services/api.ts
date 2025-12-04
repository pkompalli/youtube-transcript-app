import axios from 'axios';
import { TranscriptResponse, ChatResponse, QuizValidationResponse } from '../types';

const API_BASE_URL = 'http://localhost:3000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 60000,
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

