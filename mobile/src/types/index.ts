export interface VideoSection {
  id: number;
  title: string;
  timestamp: string;
  timestampSeconds: number;
  summary: string;
  userQuestions: string[];
  quizQuestions: QuizQuestion[];
}

export interface QuizQuestion {
  question: string;
  options: { A: string; B: string; C: string; D: string };
  correct: string;
  explanation: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface TranscriptResponse {
  summary: string;
  transcript: string;
}

export interface ChatResponse {
  answer: string;
  follow_up_questions: string[];
}

export interface QuizValidationResponse {
  is_correct: boolean;
  feedback: string;
  new_user_questions: string[];
  new_quiz_questions: QuizQuestion[];
}

