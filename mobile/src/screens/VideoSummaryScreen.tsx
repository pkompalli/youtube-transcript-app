import React, { useState, useRef } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Text, Modal } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Colors, Spacing, FontSizes, FontWeights } from '../styles/theme';
import { useApp } from '../context/AppContext';
import { VideoPlayer, VideoPlayerRef } from '../components/VideoPlayer';
import { SectionCard } from '../components/SectionCard';

export const VideoSummaryScreen = () => {
  const navigation = useNavigation();
  const { videoId, sections, transcript } = useApp();
  const [transcriptVisible, setTranscriptVisible] = useState(false);
  const videoPlayerRef = useRef<VideoPlayerRef>(null);

  const handleTimestampPress = (seconds: number) => {
    console.log('Timestamp pressed, seeking to:', seconds);
    videoPlayerRef.current?.seekTo(seconds);
  };

  if (!videoId) {
    return <View style={styles.container}><Text style={styles.errorText}>No video loaded</Text></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Summary</Text>
        <TouchableOpacity onPress={() => setTranscriptVisible(true)} style={styles.transcriptButton}>
          <Text style={styles.transcriptButtonText}>📄</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.videoContainer}>
        <VideoPlayer videoId={videoId} />
      </View>

      <ScrollView style={styles.sectionsContainer} contentContainerStyle={styles.sectionsContent}>
        {sections.map((section) => (
          <SectionCard key={section.id} section={section} onTimestampPress={handleTimestampPress} />
        ))}
        <View style={styles.bottomPadding} />
      </ScrollView>

      <Modal visible={transcriptVisible} animationType="slide" onRequestClose={() => setTranscriptVisible(false)}>
        <View style={styles.transcriptModal}>
          <View style={styles.transcriptHeader}>
            <Text style={styles.transcriptTitle}>Full Transcript</Text>
            <TouchableOpacity onPress={() => setTranscriptVisible(false)} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>×</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.transcriptContent}>
            <Text style={styles.transcriptText}>{transcript}</Text>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface, maxWidth: 900, alignSelf: 'center', width: '100%' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  backButtonText: { fontSize: 28, color: Colors.primary },
  headerTitle: { fontSize: FontSizes.lg, fontWeight: FontWeights.semibold, color: Colors.text },
  transcriptButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  transcriptButtonText: { fontSize: 20 },
  videoContainer: { backgroundColor: Colors.black, width: '100%' },
  sectionsContainer: { flex: 1 },
  sectionsContent: { padding: Spacing.md, paddingBottom: Spacing.xxl },
  bottomPadding: { height: Spacing.xxl },
  errorText: { textAlign: 'center', color: Colors.error, fontSize: FontSizes.md, marginTop: Spacing.xl },
  transcriptModal: { flex: 1, backgroundColor: Colors.white },
  transcriptHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.borderLight },
  transcriptTitle: { fontSize: FontSizes.lg, fontWeight: FontWeights.semibold, color: Colors.text },
  closeButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.borderLight, justifyContent: 'center', alignItems: 'center' },
  closeButtonText: { fontSize: 24, color: Colors.text, fontWeight: FontWeights.bold },
  transcriptContent: { flex: 1, padding: Spacing.md },
  transcriptText: { fontSize: FontSizes.sm, color: Colors.text, lineHeight: 22 },
});

