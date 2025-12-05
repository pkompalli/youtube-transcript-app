import React, { createContext, useContext, useState, ReactNode } from 'react';
import { VideoSection } from '../types';

interface AppContextType {
  videoUrl: string;
  setVideoUrl: (url: string) => void;
  videoId: string | null;
  setVideoId: (id: string | null) => void;
  sections: VideoSection[];
  setSections: (sections: VideoSection[]) => void;
  transcript: string;
  setTranscript: (transcript: string) => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [videoUrl, setVideoUrl] = useState('');
  const [videoId, setVideoId] = useState<string | null>(null);
  const [sections, setSections] = useState<VideoSection[]>([]);
  const [transcript, setTranscript] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <AppContext.Provider value={{ videoUrl, setVideoUrl, videoId, setVideoId, sections, setSections, transcript, setTranscript, loading, setLoading, error, setError }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};


