import React, { useRef, useState } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import YoutubePlayer from 'react-native-youtube-iframe';

interface VideoPlayerProps {
  videoId: string;
}

const screenWidth = Dimensions.get('window').width > 900 ? 900 : Dimensions.get('window').width;
const videoHeight = (screenWidth * 9) / 16;

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ videoId }) => {
  const [playing, setPlaying] = useState(false);

  return (
    <View style={styles.container}>
      <YoutubePlayer height={videoHeight} width={screenWidth} play={playing} videoId={videoId} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' },
});

