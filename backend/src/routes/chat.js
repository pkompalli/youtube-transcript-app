import express from 'express';
import AIService from '../services/aiService.js';

const router = express.Router();

router.post('/', async (req, res, next) => {
  try {
    const { section_context, question, conversation_history = [] } = req.body;
    
    if (!section_context || !question) {
      return res.status(400).json({ detail: 'Missing fields' });
    }

    const answer = await AIService.answerQuestion(question, section_context, conversation_history);
    const followUpQuestions = await AIService.generateFollowUpQuestions(question, answer, section_context);
    
    res.json({ answer, follow_up_questions: followUpQuestions });
    
  } catch (error) {
    next(error);
  }
});

export default router;

