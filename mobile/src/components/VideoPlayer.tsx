import React, { useRef, useImperativeHandle, forwardRef, useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, Dimensions, Platform } from 'react-native';

interface VideoPlayerProps {
  videoId: string;
}

export interface VideoPlayerRef {
  seekTo: (seconds: number) => void;
}

const screenWidth = Dimensions.get('window').width > 900 ? 900 : Dimensions.get('window').width;
const videoHeight = (screenWidth * 9) / 16;

// Web implementation using iframe with YouTube JS API
const VideoPlayerWeb = forwardRef<VideoPlayerRef, VideoPlayerProps>(({ videoId }, ref) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const playerRef = useRef<any>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Load YouTube IFrame API
    if (!(window as any).YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
    }

    // Wait for API to be ready
    const checkAPI = setInterval(() => {
      if ((window as any).YT && (window as any).YT.Player) {
        clearInterval(checkAPI);
        initPlayer();
      }
    }, 100);

    return () => clearInterval(checkAPI);
  }, []);

  useEffect(() => {
    // Reinitialize player when videoId changes
    if ((window as any).YT && (window as any).YT.Player) {
      if (playerRef.current) {
        playerRef.current.destroy();
      }
      initPlayer();
    }
  }, [videoId]);

  const initPlayer = () => {
    const containerId = `youtube-player-${videoId}`;
    
    // Make sure container exists
    const container = document.getElementById(containerId);
    if (!container) {
      console.log('Container not found, waiting...');
      setTimeout(initPlayer, 100);
      return;
    }

    playerRef.current = new (window as any).YT.Player(containerId, {
      videoId: videoId,
      playerVars: {
        playsinline: 1,
        enablejsapi: 1,
        origin: window.location.origin,
      },
      events: {
        onReady: () => {
          console.log('✅ YouTube player ready (web)');
          setIsReady(true);
        },
        onStateChange: (event: any) => {
          console.log('🎬 Player state (web):', event.data);
        },
      },
    });
  };

  useImperativeHandle(ref, () => ({
    seekTo: (seconds: number) => {
      console.log('🎯 seekTo (web):', seconds, 'isReady:', isReady);
      if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
        playerRef.current.seekTo(seconds, true);
        playerRef.current.playVideo();
        console.log('⏩ Seek and play executed (web)');
      } else {
        console.log('❌ Player not ready for seek');
      }
    },
  }), [isReady]);

  return (
    <View style={styles.container}>
      <div 
        id={`youtube-player-${videoId}`} 
        style={{ width: '100%', height: '100%' }}
      />
    </View>
  );
});

// Native implementation using react-native-youtube-iframe
const VideoPlayerNative = forwardRef<VideoPlayerRef, VideoPlayerProps>(({ videoId }, ref) => {
  // Dynamic import to avoid web bundling issues
  const YoutubePlayer = require('react-native-youtube-iframe').default;
  
  const playerRef = useRef<any>(null);
  const [playing, setPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);

  const onReady = useCallback(() => {
    console.log('✅ YouTube player ready (native)');
    setIsReady(true);
  }, []);

  const onStateChange = useCallback((state: string) => {
    console.log('🎬 Player state (native):', state);
    if (state === 'ended') {
      setPlaying(false);
    } else if (state === 'playing') {
      setPlaying(true);
    } else if (state === 'paused') {
      setPlaying(false);
    }
  }, []);

  useImperativeHandle(ref, () => ({
    seekTo: async (seconds: number) => {
      console.log('🎯 seekTo (native):', seconds, 'isReady:', isReady);
      
      if (!playerRef.current) {
        console.log('❌ playerRef is null');
        return;
      }

      try {
        setPlaying(true);
        setTimeout(async () => {
          console.log('⏩ Seeking to', seconds);
          await playerRef.current?.seekTo(seconds, true);
        }, 100);
      } catch (error) {
        console.error('❌ Seek error:', error);
      }
    },
  }), [isReady]);

  return (
    <View style={styles.container}>
      <YoutubePlayer
        ref={playerRef}
        height={videoHeight}
        width={screenWidth}
        videoId={videoId}
        play={playing}
        onReady={onReady}
        onChangeState={onStateChange}
        webViewProps={{
          allowsInlineMediaPlayback: true,
          mediaPlaybackRequiresUserAction: false,
        }}
      />
    </View>
  );
});

// Export platform-specific component
export const VideoPlayer = forwardRef<VideoPlayerRef, VideoPlayerProps>((props, ref) => {
  if (Platform.OS === 'web') {
    return <VideoPlayerWeb {...props} ref={ref} />;
  }
  return <VideoPlayerNative {...props} ref={ref} />;
});

const styles = StyleSheet.create({
  container: { 
    width: '100%', 
    height: videoHeight,
    backgroundColor: '#000',
  },
});
