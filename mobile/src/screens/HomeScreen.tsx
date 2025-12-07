import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights } from '../styles/theme';
import { useApp } from '../context/AppContext';
import ApiService from '../services/api';
import { extractVideoId, parseSummaryHTML, isValidYouTubeUrl } from '../services/utils';

// Default loading messages (used before we get custom ones)
const DEFAULT_MESSAGES = [
  { emoji: '🔬', text: "Analyzing the video structure..." },
  { emoji: '📚', text: "This looks like a popular lecture!" },
  { emoji: '🧠', text: "Extracting key concepts..." },
  { emoji: '⚡', text: "My summarizing skills are legendary!" },
  { emoji: '🎯', text: "Identifying high-yield topics..." },
];

// Emojis to pair with custom messages
const MESSAGE_EMOJIS = ['🔬', '📚', '🧠', '⚡', '🎯', '📝', '💪', '🩺', '🎓', '✨', '🚀', '📖', '🏆', '💡', '⏰'];

export const HomeScreen = () => {
  const navigation = useNavigation();
  const { setVideoUrl, setVideoId, setSections, setTranscript, loading, setLoading, setError } = useApp();
  const [inputUrl, setInputUrl] = useState('');
  const [progressInfo, setProgressInfo] = useState({ 
    message: 'Starting...', 
    progress: 0,
    currentSection: 0,
    totalSections: 0,
    funMessage: DEFAULT_MESSAGES[0],
    elapsedTime: 0,
    customMessages: [] as {emoji: string, text: string}[],
  });
  const messageIndexRef = useRef(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  // Start animated progress and rotating messages
  const startProgressAnimation = (customMsgs?: string[]) => {
    startTimeRef.current = Date.now();
    messageIndexRef.current = 0;
    
    // Convert custom messages to our format with emojis
    const messages = customMsgs && customMsgs.length > 0
      ? customMsgs.map((text, i) => ({ 
          emoji: MESSAGE_EMOJIS[i % MESSAGE_EMOJIS.length], 
          text 
        }))
      : DEFAULT_MESSAGES;
    
    // Store custom messages in state
    if (customMsgs && customMsgs.length > 0) {
      setProgressInfo(prev => ({ ...prev, customMessages: messages }));
    }
    
    // Rotate fun messages every 4 seconds
    timerRef.current = setInterval(() => {
      setProgressInfo(prev => {
        const msgs = (prev.customMessages && prev.customMessages.length > 0) ? prev.customMessages : DEFAULT_MESSAGES;
        messageIndexRef.current = (messageIndexRef.current + 1) % msgs.length;
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        
        // Simulate progress (slowly increasing, caps at 90% until actual completion)
        const simulatedProgress = Math.min(90, Math.floor(elapsed * 1.5));
        
        return {
          ...prev,
          funMessage: msgs[messageIndexRef.current],
          elapsedTime: elapsed,
          progress: Math.max(prev.progress, simulatedProgress),
        };
      });
    }, 4000);
  };

  const stopProgressAnimation = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleSubmit = async () => {
    if (!inputUrl.trim()) {
      Alert.alert('Error', 'Please enter a YouTube URL');
      return;
    }

    if (!isValidYouTubeUrl(inputUrl)) {
      Alert.alert('Invalid URL', 'Please enter a valid YouTube URL');
      return;
    }

    setError(null);
    setLoading(true);
    setProgressInfo({ 
      message: 'Fetching video transcript...', 
      progress: 5,
      currentSection: 0,
      totalSections: 0,
      funMessage: DEFAULT_MESSAGES[0],
      elapsedTime: 0,
      customMessages: [],
    });
    
    startProgressAnimation();

    try {
      const id = extractVideoId(inputUrl);
      if (!id) throw new Error('Invalid YouTube URL');

      setVideoId(id);
      setVideoUrl(inputUrl);

      // Phase 1: Get section titles and content-specific loading messages
      console.log('📡 Fetching sections and loading messages...');
      try {
        const metadata = await ApiService.getVideoMetadata(inputUrl);
        console.log('📡 Video:', metadata.video_title);
        console.log('📡 Sections:', metadata.section_titles?.slice(0, 3));
        console.log('📡 Got', metadata.loading_messages?.length || 0, 'content-specific messages');
        
        // Update with content-specific loading messages
        if (metadata.loading_messages && metadata.loading_messages.length > 0) {
          console.log('📝 Sample:', metadata.loading_messages[0]);
          // Restart animation with custom messages
          stopProgressAnimation();
          startProgressAnimation(metadata.loading_messages);
          
          // Show section count and title
          const sectionCount = metadata.total_sections || 0;
          const shortTitle = metadata.video_title && metadata.video_title.length > 35 
            ? metadata.video_title.substring(0, 35) + '...' 
            : metadata.video_title;
          
          setProgressInfo(prev => ({
            ...prev,
            message: `${sectionCount} sections: ${shortTitle || 'Processing...'}`,
            totalSections: sectionCount,
          }));
        }
      } catch (metaError) {
        console.log('⚠️ Metadata fetch failed, continuing with default messages:', metaError);
      }

      // Phase 2: Full content generation
      console.log('📡 Fetching full transcript summary...');
      const response = await ApiService.getTranscriptSummary(inputUrl);
      
      console.log('📡 Response received, summary length:', response.summary?.length || 0);
      
      // Show completion
      setProgressInfo(prev => ({
        ...prev,
        message: 'Processing complete! 🎉',
        progress: 100,
        funMessage: { emoji: '✅', text: 'All done! Your study materials are ready!' },
      }));
      
      const parsedSections = parseSummaryHTML(response.summary);
      console.log('📡 Parsed sections count:', parsedSections.length);
      
      if (parsedSections.length === 0) {
        throw new Error('No sections could be parsed from the response');
      }
      
      setSections(parsedSections);
      setTranscript(response.transcript);
      
      // Brief pause to show completion message
      await new Promise(resolve => setTimeout(resolve, 500));
      
      console.log('📡 Navigating to VideoSummary...');
      navigation.navigate('VideoSummary' as never);

    } catch (error: any) {
      console.error('Error:', error);
      setError(error.message);
      Alert.alert('Error', error.message);
    } finally {
      stopProgressAnimation();
      setLoading(false);
      setProgressInfo({ 
        message: '', 
        progress: 0, 
        currentSection: 0, 
        totalSections: 0,
        funMessage: DEFAULT_MESSAGES[0],
        elapsedTime: 0,
        customMessages: [],
      });
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => stopProgressAnimation();
  }, []);

  return (
    <LinearGradient colors={[Colors.gradientStart, Colors.gradientEnd]} style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
        <View style={styles.content}>
          <Text style={styles.emoji}>📺</Text>
          <Text style={styles.title}>YouTube Transcript</Text>
          <Text style={styles.title}>Summarizer</Text>
          <Text style={styles.subtitle}>Get AI-powered summaries of any YouTube video</Text>

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="Paste YouTube URL here..."
              placeholderTextColor={Colors.textLight}
              value={inputUrl}
              onChangeText={setInputUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="go"
              onSubmitEditing={handleSubmit}
              editable={!loading}
            />

            <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleSubmit} disabled={loading}>
              {loading ? <ActivityIndicator color={Colors.white} /> : <Text style={styles.buttonText}>Summarize</Text>}
            </TouchableOpacity>
          </View>

          {loading && (
            <View style={styles.loadingContainer}>
              {/* Big emoji */}
              <Text style={styles.loadingEmoji}>{progressInfo.funMessage.emoji}</Text>
              
              {/* Fun rotating message */}
              <Text style={styles.funMessageText}>{progressInfo.funMessage.text}</Text>
              
              {/* Progress bar */}
              <View style={styles.progressBarContainer}>
                <View style={[styles.progressBar, { width: `${progressInfo.progress}%` }]} />
              </View>
              
              {/* Progress info row */}
              <View style={styles.progressInfoRow}>
                <Text style={styles.progressPercent}>{progressInfo.progress}%</Text>
                <Text style={styles.elapsedTime}>
                  {Math.floor(progressInfo.elapsedTime / 60)}:{(progressInfo.elapsedTime % 60).toString().padStart(2, '0')} elapsed
                </Text>
              </View>
              
              {/* Encouragement text */}
              <Text style={styles.encouragementText}>
                {progressInfo.elapsedTime < 30 
                  ? "Hang tight! Great summaries take a moment..."
                  : progressInfo.elapsedTime < 60
                  ? "Still working... longer videos = more sections!"
                  : progressInfo.elapsedTime < 120
                  ? "This is a comprehensive video! Almost there..."
                  : "Processing a lot of content. Worth the wait! 💪"}
              </Text>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, maxWidth: 900, alignSelf: 'center', width: '100%' },
  keyboardView: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: Spacing.lg, width: '100%' },
  emoji: { fontSize: 64, marginBottom: Spacing.md },
  title: { fontSize: FontSizes.xxxl, fontWeight: FontWeights.bold, color: Colors.white, textAlign: 'center' },
  subtitle: { fontSize: FontSizes.md, color: Colors.white, textAlign: 'center', marginTop: Spacing.md, marginBottom: Spacing.xl, opacity: 0.9 },
  inputContainer: { width: '100%', maxWidth: 500 },
  input: { backgroundColor: Colors.white, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, fontSize: FontSizes.md, color: Colors.text, marginBottom: Spacing.md },
  button: { backgroundColor: 'rgba(255, 255, 255, 0.2)', borderRadius: BorderRadius.md, paddingVertical: Spacing.md, alignItems: 'center', borderWidth: 2, borderColor: Colors.white },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: Colors.white, fontSize: FontSizes.lg, fontWeight: FontWeights.semibold },
  loadingContainer: { 
    marginTop: Spacing.xl, 
    alignItems: 'center', 
    width: '100%', 
    maxWidth: 350,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  loadingEmoji: { 
    fontSize: 48, 
    marginBottom: Spacing.sm,
  },
  funMessageText: { 
    color: Colors.white, 
    fontSize: FontSizes.md, 
    textAlign: 'center', 
    fontWeight: FontWeights.semibold,
    marginBottom: Spacing.lg,
    lineHeight: 24,
    minHeight: 50,
  },
  progressBarContainer: { 
    width: '100%', 
    height: 10, 
    backgroundColor: 'rgba(255,255,255,0.2)', 
    borderRadius: 5, 
    overflow: 'hidden',
  },
  progressBar: { 
    height: '100%', 
    backgroundColor: '#4ade80',
    borderRadius: 5,
  },
  progressInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: Spacing.sm,
  },
  progressPercent: { 
    color: Colors.white, 
    fontSize: FontSizes.sm, 
    fontWeight: FontWeights.bold,
  },
  elapsedTime: {
    color: Colors.white,
    fontSize: FontSizes.sm,
    opacity: 0.7,
  },
  encouragementText: {
    color: Colors.white,
    fontSize: FontSizes.xs,
    textAlign: 'center',
    marginTop: Spacing.md,
    opacity: 0.8,
    fontStyle: 'italic',
  },
});


