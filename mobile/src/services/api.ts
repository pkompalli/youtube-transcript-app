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
  timeout: 1200000, // 20 min timeout for very long videos
});

export interface ProgressCallback {
  (progress: {
    stage: string;
    message: string;
    progress: number;
    currentSection?: number;
    totalSections?: number;
  }): void;
}

export interface LoadingMessagesCallback {
  (data: {
    messages: string[];
    sectionTitles: string[];
    subject: string;
  }): void;
}

export const ApiService = {
  // Streaming version with progress updates and custom loading messages
  async getTranscriptSummaryWithProgress(
    url: string, 
    onProgress: ProgressCallback,
    onLoadingMessages?: LoadingMessagesCallback
  ): Promise<TranscriptResponse> {
    const response = await fetch(`${API_BASE_URL}/api/transcript/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Streaming not supported');
    }

    const decoder = new TextDecoder();
    let result: TranscriptResponse | null = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'progress') {
                onProgress({
                  stage: data.stage,
                  message: data.message,
                  progress: data.progress,
                  currentSection: data.currentSection,
                  totalSections: data.totalSections,
                });
              } else if (data.type === 'loading_messages' && onLoadingMessages) {
                // Received custom loading messages from LLM
                onLoadingMessages({
                  messages: data.messages,
                  sectionTitles: data.section_titles,
                  subject: data.subject,
                });
              } else if (data.type === 'result') {
                result = {
                  summary: data.summary,
                  transcript: data.transcript,
                };
              } else if (data.type === 'error') {
                throw new Error(data.message);
              }
            } catch (e) {
              // Skip invalid JSON lines
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (!result) {
      throw new Error('No result received from server');
    }

    return result;
  },

  // Generate quiz on demand for a section
  async generateQuizForSection(sectionTitle: string, sectionContent: string): Promise<{
    user_questions: string[];
    quiz_questions: Array<{
      question: string;
      options: { A: string; B: string; C: string; D: string };
      correct: string;
      explanation: string;
    }>;
  }> {
    const response = await api.post('/api/section/quiz', {
      section_title: sectionTitle,
      section_content: sectionContent,
    });
    return response.data;
  },

  // Metadata fetch - gets section titles and generates content-specific messages
  async getVideoMetadata(url: string): Promise<{
    video_id: string;
    video_title?: string;
    section_titles?: string[];
    total_sections?: number;
    loading_messages: string[];
  }> {
    const response = await api.post('/api/video-metadata', { url });
    return response.data;
  },

  // Full transcript and summary
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
