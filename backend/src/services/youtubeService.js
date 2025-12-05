import { Innertube } from 'youtubei.js';
import axios from 'axios';
import config from '../config/config.js';

export class YouTubeService {
  static extractVideoId(url) {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /youtube\.com\/watch\?.*v=([^&\n?#]+)/
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    
    throw new Error('Invalid YouTube URL');
  }

  static async getTranscript(videoId) {
    try {
      console.log('Fetching transcript for video:', videoId);
      
      const youtube = await Innertube.create();
      const info = await youtube.getInfo(videoId);
      
      const transcriptData = await info.getTranscript();
      
      if (!transcriptData || !transcriptData.transcript) {
        throw new Error('No transcript available');
      }
      
      const segments = transcriptData.transcript.content?.body?.initial_segments || [];
      
      if (segments.length === 0) {
        throw new Error('No transcript segments found');
      }
      
      const formattedSegments = segments.map(segment => ({
        text: segment.snippet?.text || '',
        start: (segment.start_ms || 0) / 1000,
        duration: ((segment.end_ms || segment.start_ms) - segment.start_ms || 0) / 1000
      })).filter(s => s.text.trim().length > 0);
      
      const transcriptText = formattedSegments.map(s => s.text).join(' ');
      
      console.log('Transcript fetched:', formattedSegments.length, 'segments');
      
      return {
        text: transcriptText,
        segments: formattedSegments
      };
      
    } catch (error) {
      console.error('Transcript error:', error.message);
      throw new Error(`Failed to fetch transcript: ${error.message}`);
    }
  }

  static async getVideoChapters(videoId) {
    try {
      const youtube = await Innertube.create();
      const info = await youtube.getInfo(videoId);
      
      if (info.watch_next_feed?.chapters?.length > 0) {
        return info.watch_next_feed.chapters.map(chapter => ({
          title: chapter.title,
          start: chapter.time_range_start_millis / 1000
        }));
      }
      
      return [];
    } catch (error) {
      return [];
    }
  }

  static formatTimestamp(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}

export default YouTubeService;


