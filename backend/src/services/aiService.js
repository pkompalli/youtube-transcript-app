import OpenAI from 'openai';
import config from '../config/config.js';

const openai = new OpenAI({
  apiKey: config.openaiApiKey
});

export class AIService {
  static createLogicalSections(transcriptSegments, secondsPerSection = 60) {
    if (!transcriptSegments || transcriptSegments.length === 0) return [];
    
    const lastSegment = transcriptSegments[transcriptSegments.length - 1];
    const totalDuration = lastSegment.start + (lastSegment.duration || 0);
    const estimatedSections = Math.max(3, Math.floor(totalDuration / secondsPerSection));
    
    console.log(`Video: ~${totalDuration}s, targeting ~${estimatedSections} sections`);
    
    const sections = [];
    let currentSection = [];
    let sectionStartTime = 0;
    
    for (let i = 0; i < transcriptSegments.length; i++) {
      const segment = transcriptSegments[i];
      currentSection.push(segment);
      
      const timeElapsed = segment.start - sectionStartTime;
      const wordCount = currentSection.reduce((sum, s) => sum + s.text.split(' ').length, 0);
      
      // Break at natural pauses after ~60 seconds
      const shouldBreak = (
        timeElapsed >= secondsPerSection &&
        wordCount >= 80 &&
        (segment.text.trim().endsWith('.') || segment.text.trim().endsWith('!') || segment.text.trim().endsWith('?') || i === transcriptSegments.length - 1)
      );
      
      if (shouldBreak && currentSection.length > 0) {
        sections.push({
          start_time: currentSection[0].start,
          segments: [...currentSection]
        });
        currentSection = [];
        if (i < transcriptSegments.length - 1) {
          sectionStartTime = transcriptSegments[i + 1].start;
        }
      }
    }
    
    if (currentSection.length > 0) {
      sections.push({
        start_time: currentSection[0].start,
        segments: currentSection
      });
    }
    
    console.log(`Created ${sections.length} sections (avg ${totalDuration/sections.length}s each)`);
    return sections;
  }

  static async summarizeSection(sectionText, usedTitles = []) {
    const wordCount = sectionText.split(' ').length;
    const targetWords = Math.min(70, Math.max(40, Math.floor(wordCount * 0.3)));
    
    let usedTitlesContext = '';
    if (usedTitles.length > 0) {
      usedTitlesContext = `\n\nIMPORTANT: These titles are already used, choose different: ${usedTitles.slice(0, 5).join(', ')}`;
    }
    
    const systemPrompt = `You are summarizing a section of a video transcript. Your PRIMARY goal is to PRESERVE ALL ESSENTIAL INFORMATION while making it readable.

CRITICAL: DO NOT OMIT IMPORTANT DETAILS
- Include ALL key facts, numbers, statistics, examples
- Include ALL important concepts, explanations, and details
- Include names, places, specific terms mentioned
- If the section is information-dense, use more words (up to 70) to preserve content
- Better to be slightly longer than to lose essential information

WRITING STYLE:
- Write in a clear, conversational tone
- Present content directly - don't use "the video discusses" or "this section explains"
- Make it easy to read while keeping ALL important information

TITLE REQUIREMENT:
- Create a 1-3 word title that captures the ESSENCE of this section
- Title must be ACCURATE and UNIQUE
- Format as: TITLE: [your title here]`;

    const userPrompt = `Summarize this section of the video transcript. Your summary should be approximately ${targetWords} words, but it's MORE IMPORTANT to preserve ALL essential information than to hit an exact word count.

INCLUDE EVERYTHING IMPORTANT:
- All key facts and details
- All numbers, statistics, examples
- All important concepts and explanations
- All names, places, specific terms
- Any information that would be valuable to the reader

If the section has a lot of important information, use more words (up to 70) to ensure nothing is lost. It's better to be comprehensive than to omit details.

Write clearly and conversationally. Present what was said directly.

After your summary, add: TITLE: [1-3 word title capturing the essence]${usedTitlesContext}

Transcript section:
${sectionText}`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.5,
        max_tokens: 250
      });

      const fullResponse = response.choices[0].message.content.trim();
      
      console.log('AI Full Response:', fullResponse);
      
      // Extract title and summary more carefully
      let title = null;
      let summary = fullResponse;
      
      // Look for TITLE: at the end
      if (fullResponse.includes('TITLE:')) {
        const parts = fullResponse.split(/TITLE:/i);
        summary = parts[0].trim();
        if (parts[1]) {
          title = parts[1].trim().split('\n')[0].trim().replace(/[.!?]/g, '').replace(/['"]/g, '');
          const titleWords = title.split(' ').filter(w => w.length > 0);
          title = titleWords.slice(0, 3).join(' ');
        }
      }
      
      // If summary is still empty, use full response
      if (!summary || summary.trim().length === 0) {
        console.warn('Empty summary after parsing, using full response');
        summary = fullResponse.replace(/TITLE:.*$/i, '').trim();
      }
      
      // Fallback title if none found
      if (!title) {
        const words = summary.split(' ').slice(0, 3);
        title = words.join(' ');
      }
      
      console.log('Final summary length:', summary.length);
      console.log('Final title:', title);
      
      return { summary, title };
    } catch (error) {
      console.error('Summarization error:', error);
      throw new Error(`Failed to summarize section: ${error.message}`);
    }
  }

  static async generateSectionQuestions(sectionSummary, sectionTitle) {
    const systemPrompt = `Generate 3 specific questions medical students might ask. Be conversational and focused on clarity, mechanisms, and clinical relevance.

Format: Return ONLY 3 questions, one per line, numbered 1-3.`;

    const userPrompt = `Section: "${sectionTitle}"
Content: ${sectionSummary}

Generate 3 questions students would ask about this (Why? How? What's the difference? etc.)`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 200
      });

      const questionsText = response.choices[0].message.content.trim();
      
      const questions = [];
      const lines = questionsText.split('\n');
      for (const line of lines) {
        const cleaned = line.trim().replace(/^\d+[\.)]\s*/, '').replace(/['"]/g, '');
        if (cleaned && cleaned.length > 10) {
          questions.push(cleaned);
        }
      }
      
      const fallbacks = [
        'Why does this work the way it does?',
        'How does this concept connect to the bigger picture?',
        'What\'s the key difference mentioned here?'
      ];
      
      while (questions.length < 3) {
        questions.push(fallbacks[questions.length]);
      }
      
      return questions.slice(0, 3);
    } catch (error) {
      console.error('Question generation error:', error);
      return [
        'Can you explain the reasoning behind this?',
        'What\'s the fundamental difference here?',
        'Why is this approach used?'
      ];
    }
  }

  static async generateQuizQuestions(sectionSummary, sectionTitle) {
    const systemPrompt = `Create 3 multiple-choice quiz questions for medical students based ONLY on the provided content.

STRICT FORMAT for each:
Q: [Question]
A) [Option A]
B) [Option B]
C) [Option C]
D) [Option D]
CORRECT: [A/B/C/D]
EXPLANATION: [Why correct]

---

Use actual content details, not placeholders.`;

    const userPrompt = `Create 3 quiz questions from this content:

${sectionSummary}

Use specific details from above.`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 1000
      });

      const quizText = response.choices[0].message.content.trim();
      
      const quizQuestions = [];
      const blocks = quizText.split('---');
      
      for (const block of blocks) {
        const trimmed = block.trim();
        if (!trimmed) continue;
        
        const questionMatch = trimmed.match(/Q:\s*(.+?)(?=\n[A-D]\))/s);
        if (!questionMatch) continue;
        
        const question = questionMatch[1].trim();
        
        const options = {};
        for (const letter of ['A', 'B', 'C', 'D']) {
          const optionMatch = trimmed.match(new RegExp(`${letter}\\)\\s*(.+?)(?=\\n[A-D]\\)|CORRECT:|$)`, 's'));
          if (optionMatch) {
            options[letter] = optionMatch[1].trim();
          }
        }
        
        const correctMatch = trimmed.match(/CORRECT:\s*([A-D])/i);
        const correct = correctMatch ? correctMatch[1].toUpperCase() : 'A';
        
        const explanationMatch = trimmed.match(/EXPLANATION:\s*(.+?)$/is);
        const explanation = explanationMatch ? explanationMatch[1].trim() : 'Correct based on content.';
        
        if (Object.keys(options).length === 4 && question) {
          quizQuestions.push({ question, options, correct, explanation });
        }
      }
      
      if (quizQuestions.length >= 3) return quizQuestions.slice(0, 3);
      
      return [{
        question: `What is the main concept in ${sectionTitle}?`,
        options: { A: 'Concept A', B: sectionTitle, C: 'Concept C', D: 'Concept D' },
        correct: 'B',
        explanation: `This section focuses on ${sectionTitle}.`
      }];
    } catch (error) {
      console.error('Quiz generation error:', error);
      return [{
        question: 'What is discussed in this section?',
        options: { A: 'Topic A', B: 'Topic B', C: 'Topic C', D: 'Topic D' },
        correct: 'C',
        explanation: 'Based on section content.'
      }];
    }
  }

  static async answerQuestion(question, sectionContext, conversationHistory = []) {
    const systemPrompt = `You are an educational assistant for medical students. Provide brief (2-4 sentences), clear answers.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'system', content: `Section: ${sectionContext}` },
      ...conversationHistory,
      { role: 'user', content: question }
    ];

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.7,
        max_tokens: 150
      });

      return response.choices[0].message.content.trim();
    } catch (error) {
      throw new Error(`Failed to generate answer: ${error.message}`);
    }
  }

  static async generateFollowUpQuestions(question, answer, sectionContext) {
    const systemPrompt = `Generate 3 follow-up questions that build on the previous Q&A. Format: one per line, numbered 1-3.`;
    const userPrompt = `Q: ${question}\nA: ${answer}\n\nGenerate 3 follow-up questions.`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 200
      });

      const questionsText = response.choices[0].message.content.trim();
      
      const questions = [];
      for (const line of questionsText.split('\n')) {
        const cleaned = line.trim().replace(/^\d+[\.)]\s*/, '').replace(/['"]/g, '');
        if (cleaned && cleaned.length > 10) questions.push(cleaned);
      }
      
      while (questions.length < 3) {
        questions.push('Can you elaborate on that?');
      }
      
      return questions.slice(0, 3);
    } catch (error) {
      return ['Can you explain more?', 'What are the implications?', 'How does this relate?'];
    }
  }

  static async validateAnswer(question, userAnswer, correctAnswer, explanation) {
    const userLetter = userAnswer.trim().toUpperCase();
    const correctLetter = correctAnswer.trim().toUpperCase();
    
    if (userAnswer.length === 1) {
      return userLetter === correctLetter;
    }
    
    // For written answers
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Evaluate if student answer is correct. Answer YES or NO only.' },
          { role: 'user', content: `Question: ${question}\nCorrect: ${explanation}\nStudent: ${userAnswer}\n\nIs student correct?` }
        ],
        temperature: 0.3,
        max_tokens: 10
      });

      return response.choices[0].message.content.toUpperCase().includes('YES');
    } catch (error) {
      return false;
    }
  }
}

export default AIService;
