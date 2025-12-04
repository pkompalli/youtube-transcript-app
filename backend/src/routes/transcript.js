import express from 'express';
import YouTubeService from '../services/youtubeService.js';
import AIService from '../services/aiService.js';

const router = express.Router();

router.post('/', async (req, res, next) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ detail: 'URL required' });
    }

    console.log('Processing:', url);
    
    const videoId = YouTubeService.extractVideoId(url);
    const { text: transcriptText, segments: transcriptData } = await YouTubeService.getTranscript(videoId);
    
    console.log(`Transcript: ${transcriptData.length} segments`);
    
    const logicalSections = AIService.createLogicalSections(transcriptData);
    console.log(`Sections: ${logicalSections.length}`);
    
    const sectionsHtml = [];
    const usedTitles = new Set();
    
    for (let i = 0; i < logicalSections.length; i++) {
      const section = logicalSections[i];
      const sectionText = section.segments.map(s => s.text).join(' ');
      
      if (sectionText.trim().length < 50) continue;
      
      console.log(`\nSection ${i + 1}/${logicalSections.length}`);
      
      try {
        const { summary, title } = await AIService.summarizeSection(sectionText, Array.from(usedTitles));
        
        let sectionTitle = title || `Section ${i + 1}`;
        usedTitles.add(sectionTitle.toLowerCase());
        
        const userQuestions = await AIService.generateSectionQuestions(summary, sectionTitle);
        const quizQuestions = await AIService.generateQuizQuestions(summary, sectionTitle);
        
        const timestampSeconds = Math.floor(section.start_time);
        const timestampDisplay = YouTubeService.formatTimestamp(section.start_time);
        const fullTitle = `${timestampDisplay} - ${sectionTitle}`;
        
        let questionsHtml = `<div class="chat-container" data-section-id="${i}">
          <button class="chat-toggle-btn" onclick="toggleChat(${i})">
            <span class="chat-icon">💬</span>
          </button>
          <div class="chat-window" id="chat-${i}" style="display: none;">
            <div class="chat-header">
              <span>Ask a question</span>
              <button class="chat-close-btn" onclick="toggleChat(${i})">×</button>
            </div>
            <div class="chat-messages" id="chat-messages-${i}">
              <div class="chat-starter-message">Choose a question:</div>
            </div>
            <div class="chat-starters-wrapper">
              <div class="starters-label">💭 Ask AI:</div>
              <div class="chat-starters" id="chat-starters-${i}">`;
        
        userQuestions.forEach((q, idx) => {
          questionsHtml += `<button class="starter-question-btn" onclick="askQuestion(${i}, ${idx}, this)">${q}</button>`;
        });
        
        questionsHtml += `</div><div class="starters-label">🎯 Test:</div><div class="quiz-starters" id="quiz-starters-${i}">`;
        
        quizQuestions.forEach((quiz, idx) => {
          const escaped = JSON.stringify(quiz).replace(/"/g, '&quot;');
          questionsHtml += `<button class="quiz-question-btn" onclick="startQuiz(${i}, ${idx}, this)" data-quiz="${escaped}">${quiz.question}</button>`;
        });
        
        questionsHtml += `</div></div><div class="quiz-area" id="quiz-area-${i}" style="display: none;"></div><div class="chat-input-area"><input type="text" class="chat-input" id="chat-input-${i}" placeholder="Type your question..."><button class="chat-send-btn" onclick="sendMessage(${i})">Send</button></div></div></div>`;
        
        const sectionHtml = `<div class="video-section" data-section-id="${i}"><h2><a href="https://www.youtube.com/watch?v=${videoId}&t=${timestampSeconds}s">${fullTitle}</a></h2><p>${summary}</p>${questionsHtml}</div>`;
        
        console.log(`Section ${i+1} complete - Summary: ${summary.substring(0, 50)}...`);
        
        sectionsHtml.push(sectionHtml);
        
      } catch (error) {
        console.error(`Section ${i + 1} failed:`, error.message);
      }
    }
    
    if (sectionsHtml.length === 0) {
      return res.status(500).json({ detail: 'Failed to generate sections' });
    }
    
    const summary = sectionsHtml.join('');
    
    console.log(`✅ Complete: ${sectionsHtml.length} sections, ${summary.length} chars\n`);
    
    res.json({ summary, transcript: transcriptText });
    
  } catch (error) {
    console.error('Error:', error.message);
    next(error);
  }
});

export default router;

