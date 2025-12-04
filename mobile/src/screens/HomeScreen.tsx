import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights } from '../styles/theme';
import { useApp } from '../context/AppContext';
import ApiService from '../services/api';
import { extractVideoId, parseSummaryHTML, isValidYouTubeUrl } from '../services/utils';

export const HomeScreen = () => {
  const navigation = useNavigation();
  const { setVideoUrl, setVideoId, setSections, setTranscript, loading, setLoading, setError } = useApp();
  const [inputUrl, setInputUrl] = useState('');

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

    try {
      const id = extractVideoId(inputUrl);
      if (!id) throw new Error('Invalid YouTube URL');

      setVideoId(id);
      setVideoUrl(inputUrl);

      const response = await ApiService.getTranscriptSummary(inputUrl);
      const parsedSections = parseSummaryHTML(response.summary);
      
      setSections(parsedSections);
      setTranscript(response.transcript);

      navigation.navigate('VideoSummary' as never);

    } catch (error: any) {
      setError(error.message);
      Alert.alert('Error', error.message);
    } finally {
      setLoading(false);
    }
  };

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
              <ActivityIndicator size="large" color={Colors.white} />
              <Text style={styles.loadingText}>Processing video... This may take a moment</Text>
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
  loadingContainer: { marginTop: Spacing.xl, alignItems: 'center' },
  loadingText: { color: Colors.white, fontSize: FontSizes.sm, marginTop: Spacing.md, textAlign: 'center' },
});

