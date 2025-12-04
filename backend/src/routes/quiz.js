import express from 'express';
import AIService from '../services/aiService.js';

const router = express.Router();

router.post('/validate', async (req, res, next) => {
  try {
    const { section_context, question, user_answer, correct_answer, explanation } = req.body;
    
    if (!section_context || !question || !user_answer) {
      return res.status(400).json({ detail: 'Missing fields' });
    }

    const isCorrect = await AIService.validateAnswer(question, user_answer, correct_answer, explanation);
    
    const feedback = isCorrect 
      ? `✅ Correct! ${explanation}` 
      : `❌ Not quite. The correct answer is ${correct_answer}. ${explanation}`;
    
    const contextParts = section_context.split('\n\n');
    const sectionTitle = contextParts[0]?.replace('Section: ', '') || 'Section';
    const sectionContent = contextParts[1]?.replace('Content: ', '') || section_context;
    
    const newUserQuestions = await AIService.generateSectionQuestions(sectionContent, sectionTitle);
    const newQuizQuestions = await AIService.generateQuizQuestions(sectionContent, sectionTitle);
    
    res.json({
      is_correct: isCorrect,
      feedback,
      new_user_questions: newUserQuestions,
      new_quiz_questions: newQuizQuestions
    });
    
  } catch (error) {
    next(error);
  }
});

export default router;

