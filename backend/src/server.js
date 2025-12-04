import express from 'express';
import cors from 'cors';
import config from './config/config.js';
import transcriptRoutes from './routes/transcript.js';
import chatRoutes from './routes/chat.js';
import quizRoutes from './routes/quiz.js';

const app = express();

app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '10mb' }));

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/transcript', transcriptRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/quiz', quizRoutes);

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: err.message });
});

const PORT = config.port;
app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
});

export default app;

