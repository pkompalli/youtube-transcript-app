import React, { useState, useRef, useCallback } from 'react';
import { 
  View, 
  ScrollView, 
  StyleSheet, 
  TouchableOpacity, 
  Text, 
  Modal, 
  Dimensions,
  FlatList,
  NativeSyntheticEvent,
  NativeScrollEvent
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Colors, Spacing, FontSizes, FontWeights } from '../styles/theme';
import { useApp } from '../context/AppContext';
import { VideoPlayer, VideoPlayerRef } from '../components/VideoPlayer';
import { SectionCard } from '../components/SectionCard';
import { VideoSection } from '../types';

const { width: screenWidth } = Dimensions.get('window');

export const VideoSummaryScreen = () => {
  const navigation = useNavigation();
  const { videoId, sections, transcript } = useApp();
  const [transcriptVisible, setTranscriptVisible] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const videoPlayerRef = useRef<VideoPlayerRef>(null);
  const flatListRef = useRef<FlatList>(null);

  const handleTimestampPress = (seconds: number) => {
    console.log('👆 Timestamp pressed, seeking to:', seconds);
    if (videoPlayerRef.current) {
      console.log('📹 Calling seekTo from timestamp press');
      videoPlayerRef.current.seekTo(seconds);
    } else {
      console.log('❌ videoPlayerRef.current is null on timestamp press');
    }
  };

  // When swipe completes, seek video to new section's timestamp
  const onMomentumScrollEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const index = Math.round(event.nativeEvent.contentOffset.x / (screenWidth - 32));
    console.log('📜 Scroll ended, calculated index:', index, 'current:', currentIndex);
    
    if (index !== currentIndex && index >= 0 && index < sections.length) {
      setCurrentIndex(index);
      const section = sections[index];
      console.log(`🔄 Swiped to section ${index}: ${section.title}, seeking to ${section.timestampSeconds}s`);
      
      if (videoPlayerRef.current) {
        console.log('📹 videoPlayerRef exists, calling seekTo');
        videoPlayerRef.current.seekTo(section.timestampSeconds);
      } else {
        console.log('❌ videoPlayerRef is null!');
      }
    }
  }, [currentIndex, sections]);

  // Navigate to specific section
  const goToSection = (index: number) => {
    if (index >= 0 && index < sections.length) {
      flatListRef.current?.scrollToIndex({ index, animated: true });
      setCurrentIndex(index);
      videoPlayerRef.current?.seekTo(sections[index].timestampSeconds);
    }
  };

  const renderSectionCard = ({ item, index }: { item: VideoSection; index: number }) => (
    <View style={styles.cardWrapper}>
      <SectionCard 
        section={item} 
        onTimestampPress={handleTimestampPress}
      />
    </View>
  );

  if (!videoId) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>No video loaded</Text>
      </View>
    );
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
        <VideoPlayer ref={videoPlayerRef} videoId={videoId} />
      </View>

      {/* Section indicator dots */}
      <View style={styles.pagination}>
        {sections.map((_, index) => (
          <TouchableOpacity 
            key={index} 
            onPress={() => goToSection(index)}
            style={styles.dotTouchable}
          >
            <View style={[
              styles.dot, 
              index === currentIndex && styles.dotActive
            ]} />
          </TouchableOpacity>
        ))}
      </View>

      {/* Section counter */}
      <Text style={styles.sectionCounter}>
        Section {currentIndex + 1} of {sections.length}
      </Text>

      {/* Horizontal swipeable sections */}
      <FlatList
        ref={flatListRef}
        data={sections}
        renderItem={renderSectionCard}
        keyExtractor={(item) => item.id.toString()}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumScrollEnd}
        snapToInterval={screenWidth - 32}
        snapToAlignment="center"
        decelerationRate="fast"
        contentContainerStyle={styles.flatListContent}
        getItemLayout={(_, index) => ({
          length: screenWidth - 32,
          offset: (screenWidth - 32) * index,
          index,
        })}
      />

      {/* Swipe hint */}
      <Text style={styles.swipeHint}>← Swipe to navigate sections →</Text>

      <Modal visible={transcriptVisible} animationType="slide" onRequestClose={() => setTranscriptVisible(false)}>
        <View style={styles.transcriptModal}>
          <View style={styles.transcriptHeader}>
            <Text style={styles.transcriptTitle}>📄 Full Transcript</Text>
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
  container: { flex: 1, backgroundColor: Colors.surface },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingHorizontal: Spacing.md, 
    paddingVertical: Spacing.sm, 
    backgroundColor: Colors.white, 
    borderBottomWidth: 1, 
    borderBottomColor: Colors.borderLight 
  },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  backButtonText: { fontSize: 28, color: Colors.primary },
  headerTitle: { fontSize: FontSizes.lg, fontWeight: FontWeights.semibold, color: Colors.text },
  transcriptButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  transcriptButtonText: { fontSize: 20 },
  videoContainer: { backgroundColor: Colors.black, width: '100%' },
  
  // Pagination dots
  pagination: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.white,
  },
  dotTouchable: {
    padding: 4,
  },
  dot: { 
    width: 8, 
    height: 8, 
    borderRadius: 4, 
    backgroundColor: Colors.borderLight,
    marginHorizontal: 4,
  },
  dotActive: { 
    backgroundColor: Colors.primary,
    width: 24,
  },
  
  sectionCounter: {
    textAlign: 'center',
    fontSize: FontSizes.xs,
    color: Colors.textSecondary,
    paddingBottom: Spacing.xs,
    backgroundColor: Colors.white,
  },
  
  // Horizontal FlatList
  flatListContent: {
    paddingHorizontal: Spacing.md,
  },
  cardWrapper: {
    width: screenWidth - 32,
    paddingRight: Spacing.md,
  },
  
  swipeHint: {
    textAlign: 'center',
    fontSize: FontSizes.xs,
    color: Colors.textLight,
    paddingVertical: Spacing.sm,
    fontStyle: 'italic',
  },
  
  errorText: { textAlign: 'center', color: Colors.error, fontSize: FontSizes.md, marginTop: Spacing.xl },
  transcriptModal: { flex: 1, backgroundColor: Colors.white },
  transcriptHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: Spacing.md, 
    paddingVertical: Spacing.md, 
    borderBottomWidth: 1, 
    borderBottomColor: Colors.borderLight 
  },
  transcriptTitle: { fontSize: FontSizes.lg, fontWeight: FontWeights.semibold, color: Colors.text },
  closeButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.borderLight, justifyContent: 'center', alignItems: 'center' },
  closeButtonText: { fontSize: 24, color: Colors.text, fontWeight: FontWeights.bold },
  transcriptContent: { flex: 1, padding: Spacing.md },
  transcriptText: { fontSize: FontSizes.sm, color: Colors.text, lineHeight: 22 },
});
