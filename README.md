# YouTube Video Summarizer

A web application that embeds YouTube videos and provides transcript summaries.

## Features

- Embed YouTube videos in a responsive iframe
- Automatically fetch video transcripts
- Generate and display summaries
- Toggle full transcript view

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. (Optional) Set YouTube API Key:
   - The app includes a default API key, but you can set your own via environment variable:
   ```bash
   export YOUTUBE_API_KEY=your_api_key_here
   ```
   - Or create a `.env` file with:
   ```
   YOUTUBE_API_KEY=your_api_key_here
   ```

3. Run the application:
```bash
python app.py
```

4. Open your browser and navigate to:
```
http://localhost:8000
```

## Usage

1. Enter a YouTube video URL in the input field
2. Click "Load Video" or press Enter
3. The video will be embedded and a summary will appear below
4. Click "Show Full Transcript" to view the complete transcript

## Notes

- **API Key Required**: The app uses the official YouTube Data API v3 with your API key to fetch transcripts. This is more reliable than scraping methods.
- The app uses a simple extractive summarization method (first few sentences)
- For better summaries, you can integrate with OpenAI API or other LLM services
- Some videos may not have transcripts available
- API Quota: YouTube Data API has daily quotas. If you exceed the quota, you'll need to wait or upgrade your API plan

## Troubleshooting

**"Failed to fetch transcript" or rate limiting:**
- Wait 5-10 minutes between requests if you're testing multiple videos
- Some videos don't have transcripts enabled by the creator
- YouTube may temporarily block requests if too many are made quickly

**Alternative (if rate limiting persists):**
If you need more reliable access, you could use the official YouTube Data API v3 (requires API key), but the current implementation works without one.

