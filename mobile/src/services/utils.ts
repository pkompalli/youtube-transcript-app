import { VideoSection, QuizQuestion } from '../types';

export const extractVideoId = (url: string): string | null => {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/watch\?.*v=([^&\n?#]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
};

export const parseSummaryHTML = (html: string): VideoSection[] => {
  const sections: VideoSection[] = [];
  
  console.log('📝 parseSummaryHTML called, HTML length:', html?.length || 0);
  
  if (!html || html.length === 0) {
    console.log('❌ Empty HTML received');
    return sections;
  }
  
  // Match video-section with optional additional classes (loaded, skeleton, etc.)
  const sectionRegex = /<div class="video-section([^"]*)" data-section-id="(\d+)"[^>]*>([\s\S]*?)(?=<div class="video-section|$)/g;
  const sectionMatches = Array.from(html.matchAll(sectionRegex));
  
  console.log('📝 Regex matches found:', sectionMatches.length);
  
  for (const match of sectionMatches) {
    const classes = match[1];
    const sectionId = parseInt(match[2]);
    let sectionHTML = match[3].replace(/<\/div>\s*$/, '');
    
    console.log(`📝 Section ${sectionId}: classes="${classes}", HTML length: ${sectionHTML.length}`);
    
    // Skip skeleton sections (they're placeholders for lazy loading)
    if (classes.includes('skeleton')) {
      console.log(`⏭️ Skipping skeleton section ${sectionId}`);
      continue;
    }
    
    // Check if quiz is already loaded or needs lazy loading
    const hasQuizMatch = match[0].match(/data-has-quiz="(true|false)"/);
    const hasQuiz = hasQuizMatch ? hasQuizMatch[1] === 'true' : true;
    
    // Get content from data attribute if available
    const contentMatch = match[0].match(/data-content="([^"]*)"/);
    const dataContent = contentMatch ? contentMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&') : '';
    
    // Get title from data attribute
    const dataTitleMatch = match[0].match(/data-title="([^"]*)"/);
    const dataTitle = dataTitleMatch ? dataTitleMatch[1] : '';
    
    const titleMatch = sectionHTML.match(/<h2><a[^>]*>([^<]+)<\/a><\/h2>/);
    const title = titleMatch ? titleMatch[1] : `Section ${sectionId}`;
    
    const timestampMatch = title.match(/^(\d+:\d+(?::\d+)?)\s*-\s*(.+)$/);
    const timestamp = timestampMatch ? timestampMatch[1] : '0:00';
    const sectionTitle = timestampMatch ? timestampMatch[2] : (dataTitle || title);
    const timestampSeconds = parseTimestamp(timestamp);
    
    const summaryMatch = sectionHTML.match(/<p>([\s\S]*?)<\/p>/);
    const summary = summaryMatch ? summaryMatch[1].trim() : '';
    
    const userQuestions: string[] = [];
    const userQuestionsMatches = sectionHTML.matchAll(/class="starter-question-btn"[^>]*>([^<]+)<\/button>/g);
    for (const qMatch of userQuestionsMatches) {
      userQuestions.push(qMatch[1].trim());
    }
    
    const quizQuestions: QuizQuestion[] = [];
    const quizMatches = sectionHTML.matchAll(/data-quiz="([^"]+)"/g);
    for (const qMatch of quizMatches) {
      try {
        const decoded = qMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
        quizQuestions.push(JSON.parse(decoded));
      } catch (e) {}
    }
    
    sections.push({
      id: sectionId,
      title: sectionTitle,
      timestamp,
      timestampSeconds,
      summary: summary || 'No summary',
      content: dataContent || summary || 'No content', // Use data-content if available
      userQuestions: userQuestions.slice(0, 3),
      quizQuestions: quizQuestions.slice(0, 3),
      hasQuiz,
    });
    
    console.log(`✅ Parsed section ${sectionId}: "${sectionTitle}" at ${timestamp}, hasQuiz: ${hasQuiz}`);
  }
  
  console.log(`📝 Total sections parsed: ${sections.length}`);
  return sections;
};

export const parseTimestamp = (timestamp: string): number => {
  const parts = timestamp.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
};

export const getSectionContext = (section: VideoSection): string => {
  // Use the full content for better AI context (matches web behavior)
  return `Section: ${section.timestamp} - ${section.title}\n\nContent: ${section.content || section.summary}`;
};

export const isValidYouTubeUrl = (url: string): boolean => {
  return extractVideoId(url) !== null;
};
