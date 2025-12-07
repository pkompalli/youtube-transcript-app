from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
import asyncio
from pydantic import BaseModel
from youtube_transcript_api import YouTubeTranscriptApi
try:
    from youtube_transcript_api._errors import (
        TranscriptsDisabled,
        NoTranscriptFound,
        VideoUnavailable
    )
except ImportError:
    # Fallback for different library versions
    TranscriptsDisabled = Exception
    NoTranscriptFound = Exception
    VideoUnavailable = Exception
import re
import os
import logging
from openai import OpenAI
import json

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

app = FastAPI()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

# OpenAI client
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

class VideoRequest(BaseModel):
    url: str

class ChatRequest(BaseModel):
    section_context: str
    question: str
    conversation_history: list = []

class QuizAnswerRequest(BaseModel):
    section_context: str
    question: str
    user_answer: str
    correct_answer: str
    explanation: str

class SectionBatchRequest(BaseModel):
    video_id: str
    sections: list  # List of {index, timestamp, title, content}

# In-memory cache for transcript data (in production, use Redis)
transcript_cache = {}

def extract_video_id(url: str) -> str:
    patterns = [
        r'(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)',
        r'youtube\.com\/watch\?.*v=([^&\n?#]+)',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    
    raise ValueError("Invalid YouTube URL")

def get_transcript(video_id: str):
    """Fetch YouTube transcript using youtube_transcript_api v1.2.3"""
    try:
        logger.info(f"Fetching transcript for: {video_id}")
        
        # Correct API for version 1.2.3:
        # 1. Create instance
        # 2. Call list() to get TranscriptList
        # 3. Iterate and fetch first available
        
        api = YouTubeTranscriptApi()
        transcript_list_obj = api.list(video_id)
        
        # transcript_list_obj is a TranscriptList object, not a regular list
        # We need to iterate through it
        logger.info("Got transcript list object")
        
        # Try to fetch the first available transcript
        transcript_data = None
        
        # The TranscriptList is iterable
        try:
            # Try to find English transcript first
            transcript = transcript_list_obj.find_transcript(['en'])
            transcript_data = transcript.fetch()
            logger.info("Fetched English transcript")
        except:
            # If English not found, try generated English
            try:
                transcript = transcript_list_obj.find_generated_transcript(['en'])
                transcript_data = transcript.fetch()
                logger.info("Fetched auto-generated English transcript")
            except:
                # Get any available transcript
                for transcript in transcript_list_obj:
                    try:
                        transcript_data = transcript.fetch()
                        logger.info(f"Fetched transcript in: {transcript.language_code}")
                        break
                    except:
                        continue
        
        if not transcript_data:
            raise Exception("No transcript available")
        
        logger.info(f"Transcript fetched: {len(transcript_data)} segments")
        
        # Convert transcript objects to dictionaries
        formatted_data = []
        for item in transcript_data:
            # Access as attributes, not dictionary keys
            formatted_data.append({
                'text': item.text if hasattr(item, 'text') else str(item),
                'start': item.start if hasattr(item, 'start') else 0,
                'duration': item.duration if hasattr(item, 'duration') else 0
            })
        
        transcript_text = " ".join([item['text'] for item in formatted_data])
        return transcript_text, formatted_data
        
    except Exception as e:
        logger.error(f"Transcript error: {type(e).__name__}: {str(e)}")
        
        error_msg = str(e).lower()
        
        if 'disabled' in error_msg:
            raise HTTPException(status_code=400, detail="Transcripts are disabled for this video")
        elif 'not found' in error_msg or 'no transcript' in error_msg:
            raise HTTPException(status_code=400, detail="No transcript found for this video")  
        elif 'unavailable' in error_msg:
            raise HTTPException(status_code=400, detail="Video is unavailable")
        else:
            raise HTTPException(status_code=500, detail=f"Failed to fetch transcript: {str(e)}")

def format_timestamp(seconds: float) -> str:
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    
    if hours > 0:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"

def create_sections_with_llm(transcript_text: str, transcript_data: list, video_duration: float):
    """
    User's approach:
    1. Get transcript (done)
    2. Ask LLM to divide into logical sections with titles (LLM returns TEXT divisions)
    3. Find timestamps by matching section text to transcript data (CODE does this)
    4. Generate summaries later
    """
    
    # STEP 1: Determine optimal section count based on video length
    video_minutes = int(video_duration / 60)
    if video_minutes <= 3:
        target_sections = 3
    elif video_minutes <= 5:
        target_sections = 4
    elif video_minutes <= 10:
        target_sections = 5
    elif video_minutes <= 20:
        target_sections = 8
    elif video_minutes <= 40:
        target_sections = 12
    else:
        target_sections = min(20, int(video_minutes / 3))
    
    logger.info(f"Video: {video_minutes} minutes, targeting {target_sections} sections")
    
    # STEP 2: Ask LLM to divide transcript into logical sections
    # LLM returns the CONTENT of each section + title (NOT timestamps)
    system_prompt = f"""You are dividing an educational video transcript into {target_sections} logical sections.

TASK: Split the transcript into {target_sections} coherent sections where each section covers a distinct topic or concept.

For each section, provide:
1. A descriptive TITLE (2-5 words)
2. The FIRST SENTENCE of that section (exact quote from transcript, 10-20 words)

OUTPUT FORMAT (strict JSON array):
[
  {{"title": "Introduction", "first_sentence": "exact first sentence of this section from transcript"}},
  {{"title": "Main Concept", "first_sentence": "exact first sentence of this section from transcript"}},
  ...
]

RULES:
- Return EXACTLY {target_sections} sections
- first_sentence must be EXACT text from the transcript (this is how we find the timestamp)
- Titles should be descriptive, 2-5 words
- Sections should be roughly equal in length
- Break at natural topic transitions
- First section starts at the beginning of the transcript"""

    user_prompt = f"""Divide this {video_minutes}-minute transcript into exactly {target_sections} logical sections.

TRANSCRIPT:
{transcript_text}

Return a JSON array with {target_sections} sections. Each needs "title" and "first_sentence" (exact quote)."""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.3,
            max_tokens=2000
        )
        
        llm_response = response.choices[0].message.content.strip()
        logger.info(f"LLM sections response:\n{llm_response}")
        
        # Parse JSON response
        json_match = re.search(r'\[[\s\S]*\]', llm_response)
        if not json_match:
            logger.error("No JSON array found in response")
            return create_logical_sections_fallback(transcript_data, target_sections)
        
        try:
            llm_sections = json.loads(json_match.group())
            logger.info(f"✅ Parsed {len(llm_sections)} sections from JSON")
        except json.JSONDecodeError as e:
            logger.error(f"JSON parse error: {e}")
            return create_logical_sections_fallback(transcript_data, target_sections)
        
        # STEP 3: Find timestamps by matching first_sentence to transcript data
        # This is done by CODE, not LLM - much more accurate!
        logger.info("\nSTEP 3: Finding timestamps by text matching...")
        
        sections = []
        
        for idx, llm_section in enumerate(llm_sections):
            title = llm_section.get('title', f'Section {idx+1}')
            first_sentence = llm_section.get('first_sentence', '').lower().strip()
            
            # Find this sentence in transcript_data
            best_match_idx = 0
            best_score = 0
            
            # Clean up the search phrase
            search_words = [w for w in first_sentence.split() if len(w) > 2]
            
            if search_words:
                for i in range(len(transcript_data)):
                    # Check this segment and next 3 segments (sentences span segments)
                    combined_text = " ".join([
                        transcript_data[i + j]['text'].lower()
                        for j in range(min(4, len(transcript_data) - i))
                    ])
                    
                    # Count matching words
                    matches = sum(1 for word in search_words if word in combined_text)
                    score = matches / len(search_words)
                    
                    # Exact substring match gets highest score
                    if first_sentence in combined_text:
                        score = 1.0
                    
                    if score > best_score:
                        best_score = score
                        best_match_idx = i
            
            # Get timestamp from matched segment
            if best_score >= 0.5:
                timestamp = int(transcript_data[best_match_idx]['start'])
                logger.info(f"  ✅ '{title}' → {timestamp}s (match: {best_score:.0%})")
            else:
                # Fallback: distribute evenly
                timestamp = int(idx * video_duration / len(llm_sections))
                logger.warning(f"  ⚠️ '{title}' → {timestamp}s (fallback, low match: {best_score:.0%})")
            
            sections.append({
                'timestamp': timestamp,
                'title': title,
                'content': None  # Will be filled next
            })
        
        # Ensure first section starts at 0
        if sections and sections[0]['timestamp'] > 5:
            sections[0]['timestamp'] = 0
        
        # Sort by timestamp
        sections = sorted(sections, key=lambda x: x['timestamp'])
        
        # Remove duplicate timestamps (keep first)
        seen = set()
        unique_sections = []
        for s in sections:
            if s['timestamp'] not in seen:
                seen.add(s['timestamp'])
                unique_sections.append(s)
        sections = unique_sections
        
        # STEP 4: Extract content for each section based on timestamps
        logger.info("\nSTEP 4: Extracting content for each section...")
        
        for i, section in enumerate(sections):
            section_start = section['timestamp']
            section_end = sections[i + 1]['timestamp'] if i < len(sections) - 1 else video_duration
            
            section_content = " ".join([
                seg['text'] for seg in transcript_data 
                if section_start <= seg['start'] < section_end
            ])
            
            section['content'] = section_content
            logger.info(f"  Section {i+1}: {section_start}s → {int(section_end)}s ({len(section_content)} chars)")
        
        if len(sections) < 2:
            logger.warning("Too few sections, using fallback")
            return create_logical_sections_fallback(transcript_data, target_sections)
        
        logger.info(f"✅ Returning {len(sections)} sections")
        return sections
        
    except Exception as e:
        logger.error(f"LLM section creation failed: {e}")
        import traceback
        traceback.print_exc()
        return create_logical_sections_fallback(transcript_data, target_sections)


def create_logical_sections_fallback(transcript_data: list, target_count: int = 4):
    """Fallback: Divide transcript evenly into sections"""
    logger.info(f"Using fallback section creation for {target_count} sections")
    
    if not transcript_data:
        return []
    
    total_duration = transcript_data[-1]['start'] + transcript_data[-1].get('duration', 0)
    seconds_per_section = total_duration / target_count
    
    sections = []
    
    for i in range(target_count):
        target_start = i * seconds_per_section
        
        # Find transcript segment closest to this timestamp
        closest_idx = 0
        min_diff = abs(transcript_data[0]['start'] - target_start)
        
        for idx, item in enumerate(transcript_data):
            diff = abs(item['start'] - target_start)
            if diff < min_diff:
                min_diff = diff
                closest_idx = idx
        
        # Get content for this section
        next_start = (i + 1) * seconds_per_section
        section_content = ""
        for item in transcript_data[closest_idx:]:
            if item['start'] >= next_start and i < target_count - 1:
                break
            section_content += item['text'] + " "
        
        sections.append({
            'timestamp': int(transcript_data[closest_idx]['start']),
            'title': None,  # Will be generated later
            'content': section_content
        })
    
    return sections


def create_logical_sections_fallback_old(transcript_data: list, seconds_per_section: int = 60):
    """Create logical sections - roughly 1 section per minute of video"""
    if not transcript_data:
        return []
    
    # Calculate total video duration
    if len(transcript_data) > 0:
        last_item = transcript_data[-1]
        total_duration = last_item['start'] + last_item.get('duration', 0)
        estimated_sections = max(3, int(total_duration / seconds_per_section))
    else:
        estimated_sections = 4
    
    logger.info(f"Video duration: ~{total_duration:.0f}s, targeting ~{estimated_sections} sections")
    
    sections = []
    current_section = []
    section_start_time = 0
    
    for i, item in enumerate(transcript_data):
        current_section.append(item)
        
        # Check if we should break into new section
        time_elapsed = item['start'] - section_start_time
        word_count = sum(len(seg['text'].split()) for seg in current_section)
        
        # Break conditions:
        # 1. Time: roughly 60 seconds elapsed
        # 2. Words: at least 80 words accumulated (avoid tiny sections)
        # 3. Look for natural pauses (sentences ending with ., ?, !)
        should_break = (
            time_elapsed >= seconds_per_section and 
            word_count >= 80 and
            (item['text'].rstrip().endswith(('.', '?', '!')) or i == len(transcript_data) - 1)
        )
        
        if should_break and len(current_section) > 0:
            sections.append({
                "start_time": current_section[0]['start'],
                "segments": current_section.copy()
            })
            current_section = []
            if i < len(transcript_data) - 1:
                section_start_time = transcript_data[i + 1]['start']
    
    # Add remaining segments as final section
    if len(current_section) > 0:
        sections.append({
            "start_time": current_section[0]['start'],
            "segments": current_section
        })
    
    logger.info(f"Created {len(sections)} sections (avg {total_duration/len(sections):.0f}s per section)")
    return sections

def generate_section_questions(section_summary: str, section_title: str) -> list:
    system_prompt = """You are an educational assistant helping medical students deeply understand video content for their studies and exam preparation. Generate 3 specific, probing questions that help students grasp essentials and prepare for exams.

QUESTION TYPES (use a mix):
- CLARITY: "What exactly does [concept] mean?" "Can you break down [term]?"
- DEPTH: "Why does [X] happen?" "How does [X] actually work?" "What's the mechanism behind [X]?"
- CONNECTIONS: "How does [X] relate to [Y]?" "What's the difference between [X] and [Y]?"
- IMPLICATIONS: "Why is [X] important?" "What happens if [X]?" "What are the consequences of [X]?"
- CLINICAL RELEVANCE: "How is this relevant clinically?" "What's the practical application of [X]?"
- EXAM-FOCUSED: "What's the key concept I need to remember about [X]?" "What are the main differences between [X] and [Y]?"

REQUIREMENTS FOR MED STUDENTS:
- Questions must help grasp ESSENTIAL concepts for understanding and exams
- Focus on clinically relevant aspects when applicable
- Emphasize mechanisms, differences, and "why" questions (common in med exams)
- Questions must be SPECIFIC to the actual concepts/terms in the content
- Use the actual terminology from the section
- Natural, conversational tone (how students actually ask)
- Each question should probe a different aspect
- 10-20 words per question
- Start with: What, Why, How, Can you explain, What's the difference, etc.

Format: Return ONLY 3 questions, one per line, numbered 1-3."""

    user_prompt = f"""Based on this section about "{section_title}", generate 3 probing questions that help medical students grasp essentials and prepare for exams:

Section content:
{section_summary}

Generate 3 questions that ask WHY, HOW, WHAT'S THE DIFFERENCE, or seek CLARITY about specific concepts mentioned above. Focus on what's essential for understanding and exam preparation. Use the actual terms and concepts from the content."""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.7,
            max_tokens=200
        )
        
        questions_text = response.choices[0].message.content.strip()
        questions = []
        for line in questions_text.split('\n'):
            line = line.strip()
            line = re.sub(r'^\d+[\.)]\s*', '', line)
            line = line.strip('"\'')
            if line and len(line) > 10:
                questions.append(line)
        
        if len(questions) < 3:
            fallbacks = [
                "Why does this work the way it does?",
                "How does this concept connect to the bigger picture?",
                "What's the key difference between the approaches mentioned?"
            ]
            while len(questions) < 3:
                questions.append(fallbacks[len(questions)])
        
        return questions[:3]
        
    except Exception as e:
        logger.warning(f"Failed to generate questions: {e}")
        return [
            "Can you explain the reasoning behind this?",
            "What's the fundamental difference here?",
            "Why is this approach used instead of alternatives?"
        ]

def generate_quiz_questions(section_summary: str, section_title: str) -> list:
    system_prompt = """You are creating quiz questions for medical students to test their understanding. Generate 3 multiple-choice questions that assess comprehension of key concepts.

CRITICAL: Generate questions ONLY from the actual content provided. DO NOT use generic placeholders.

QUESTION REQUIREMENTS:
- Test essential concepts, mechanisms, differences, or clinical applications FROM THE CONTENT
- Questions should be clear and unambiguous
- Focus on what's important for exams and understanding
- Mix difficulty: some recall, some application
- Use specific details from the content

ANSWER OPTIONS:
- Provide 4 plausible options (A, B, C, D)
- One correct answer based on the content
- Distractors should be plausible but clearly wrong
- Keep options concise but specific

STRICT FORMAT (copy exactly):
Q: [Specific question about the content]
A) [Specific option from content]
B) [Specific option from content]
C) [Specific option from content]
D) [Specific option from content]
CORRECT: [A or B or C or D]
EXPLANATION: [Why this is correct based on the content]

---

[Next question with same format]

IMPORTANT: Every question and option MUST use actual information from the provided content."""

    user_prompt = f"""Section: "{section_title}"

Content to create quiz questions from:
{section_summary}

Create 3 multiple-choice quiz questions that test understanding of THIS SPECIFIC CONTENT. Use actual details, mechanisms, and facts from the text above. Do not use generic placeholders."""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.7,
            max_tokens=1000
        )
        
        quiz_text = response.choices[0].message.content.strip()
        logger.info(f"Quiz generation response: {quiz_text[:200]}...")
        
        quiz_questions = []
        question_blocks = quiz_text.split('---')
        
        for idx, block in enumerate(question_blocks):
            block = block.strip()
            if not block:
                continue
            
            question_match = re.search(r'Q:\s*(.+?)(?=\n[A-D]\))', block, re.DOTALL)
            if not question_match:
                continue
            
            question = question_match.group(1).strip()
            
            options = {}
            for letter in ['A', 'B', 'C', 'D']:
                option_match = re.search(rf'{letter}\)\s*(.+?)(?=\n[A-D]\)|CORRECT:|$)', block, re.DOTALL)
                if option_match:
                    options[letter] = option_match.group(1).strip()
            
            correct_match = re.search(r'CORRECT:\s*([A-D])', block, re.IGNORECASE)
            correct = correct_match.group(1).upper() if correct_match else 'A'
            
            explanation_match = re.search(r'EXPLANATION:\s*(.+?)(?=$)', block, re.DOTALL | re.IGNORECASE)
            explanation = explanation_match.group(1).strip() if explanation_match else "This is the correct answer."
            
            if len(options) == 4 and question:
                quiz_questions.append({
                    'question': question,
                    'options': options,
                    'correct': correct,
                    'explanation': explanation
                })
        
        if len(quiz_questions) >= 3:
            return quiz_questions[:3]
        
        # Fallback
        return [{
            'question': f'What is discussed in {section_title}?',
            'options': {'A': section_title, 'B': 'Other topic', 'C': 'Different concept', 'D': 'Unrelated'},
            'correct': 'A',
            'explanation': f'This section focuses on {section_title}.'
        }] * 3
        
    except Exception as e:
        logger.error(f"Failed to generate quiz: {e}")
        return [{
            'question': 'What is the key concept?',
            'options': {'A': 'Concept A', 'B': 'Concept B', 'C': 'Concept C', 'D': 'Concept D'},
            'correct': 'C',
            'explanation': 'Based on content.'
        }] * 3

def generate_loading_messages(subject: str, section_titles: list) -> list:
    """Generate fun, topic-specific loading messages using LLM."""
    try:
        titles_str = ", ".join(section_titles[:5])  # Use first 5 titles
        
        prompt = f"""Generate 8 fun, encouraging loading messages for a medical student studying: "{subject}"
Topics covered: {titles_str}

Requirements:
- Each message should be 10-20 words
- Be encouraging, fun, slightly humorous
- Reference the actual subject matter when possible
- Mix of: progress updates, encouragement, fun facts, motivation
- Appropriate for med students preparing for exams

Format: Return ONLY a JSON array of strings, no other text.
Example: ["Message 1", "Message 2", ...]"""

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.8,
            max_tokens=400
        )
        
        # Parse JSON array
        content = response.choices[0].message.content.strip()
        messages = json.loads(content)
        logger.info(f"Generated {len(messages)} custom loading messages")
        return messages
        
    except Exception as e:
        logger.warning(f"Failed to generate custom messages: {e}")
        return []


def generate_section_html(section_data: dict, section_index: int, total_sections: int, video_id: str, generate_quiz: bool = True) -> str:
    """Generate HTML for a single section. Quiz generation can be deferred for faster loading."""
    try:
        section_start_time = section_data['timestamp']
        section_content = section_data.get('content', '')
        section_header = section_data.get('title', f'Section {section_index + 1}')
        
        # Generate summary
        summary_prompt = f"""Summarize this section in 30-40 words.

Topic: {section_header}

Content:
{section_content}

REQUIREMENTS:
- 30-40 words (2-3 sentences)
- Focus on essentials only
- Include key facts and mechanisms
- Be concise and complete

Write 30-40 words."""

        summary_response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "Create brief 30-40 word summaries for educational content."},
                {"role": "user", "content": summary_prompt}
            ],
            temperature=0.5,
            max_tokens=120
        )
        
        section_summary = summary_response.choices[0].message.content.strip()
        section_summary = re.sub(r'^(TITLE|SUMMARY|HEADER|CONCEPT):\s*', '', section_summary, flags=re.IGNORECASE).strip()
        
        logger.info(f"  Section {section_index + 1}: Summary generated ({len(section_summary.split())} words)")
        
        # Build HTML
        timestamp_seconds = int(section_start_time)
        timestamp_display = format_timestamp(section_start_time)
        section_display_title = f"{timestamp_display} - {section_header}"
        i = section_index
        
        if generate_quiz:
            # Full generation with questions and quiz
            questions = generate_section_questions(section_summary, section_header)
            quiz_questions = generate_quiz_questions(section_summary, section_header)
            
            questions_html = f'<div class="chat-container" data-section-id="{i}">'
            questions_html += f'<button class="chat-toggle-btn" onclick="toggleChat({i})"><span class="chat-icon">💬</span></button>'
            questions_html += f'<div class="chat-window" id="chat-{i}" style="display: none;">'
            questions_html += f'<div class="chat-header"><span>Ask a question</span><button class="chat-close-btn" onclick="toggleChat({i})">×</button></div>'
            questions_html += f'<div class="chat-messages" id="chat-messages-{i}"><div class="chat-starter-message">Choose a question to start the conversation:</div></div>'
            questions_html += '<div class="chat-starters-wrapper"><div class="starters-label">💭 Ask the AI:</div>'
            questions_html += f'<div class="chat-starters" id="chat-starters-{i}">'
            
            for q_idx, question in enumerate(questions):
                questions_html += f'<button class="starter-question-btn" onclick="askQuestion({i}, {q_idx}, this)">{question}</button>'
            
            questions_html += '</div><div class="starters-label">🎯 Test yourself:</div>'
            questions_html += f'<div class="quiz-starters" id="quiz-starters-{i}">'
            
            for q_idx, quiz_q in enumerate(quiz_questions):
                escaped_quiz = json.dumps(quiz_q).replace('"', '&quot;')
                questions_html += f'<button class="quiz-question-btn" onclick="startQuiz({i}, {q_idx}, this)" data-quiz="{escaped_quiz}">{quiz_q["question"]}</button>'
            
            questions_html += '</div></div>'
            questions_html += f'<div class="quiz-area" id="quiz-area-{i}" style="display: none;">'
            questions_html += f'<div class="quiz-question-text" id="quiz-question-{i}"></div>'
            questions_html += f'<div class="quiz-options" id="quiz-options-{i}"></div>'
            questions_html += f'<div class="quiz-custom-answer" id="quiz-custom-{i}">'
            questions_html += f'<input type="text" class="quiz-input" id="quiz-input-{i}" placeholder="Or type your answer...">'
            questions_html += f'<button class="quiz-submit-btn" onclick="submitCustomAnswer({i})">Submit</button>'
            questions_html += '</div>'
            questions_html += f'<div class="quiz-feedback" id="quiz-feedback-{i}" style="display: none;"></div>'
            questions_html += '</div>'
            questions_html += f'<div class="chat-input-area">'
            questions_html += f'<input type="text" class="chat-input" id="chat-input-{i}" placeholder="Type your question..." onkeypress="handleChatEnter(event, {i})">'
            questions_html += f'<button class="chat-send-btn" onclick="sendMessage({i})">Send</button>'
            questions_html += '</div></div></div>'
            
            has_quiz_attr = 'data-has-quiz="true"'
        else:
            # On-demand generation - clickable headers that generate questions when clicked
            questions_html = f'''<div class="on-demand-container" data-section-id="{i}">
                <div class="expandable-section" id="ask-ai-section-{i}">
                    <button class="section-header-btn" onclick="toggleAskAI({i})">
                        <span>💭 Ask AI</span>
                        <span class="expand-icon" id="ask-ai-icon-{i}">▶</span>
                        <span class="header-loader" id="ask-ai-loader-{i}" style="display: none;"></span>
                    </button>
                    <div class="questions-container" id="ask-ai-questions-{i}" style="display: none;"></div>
                </div>
                <div class="expandable-section" id="ask-me-section-{i}">
                    <button class="section-header-btn" onclick="toggleAskMe({i})">
                        <span>🎯 Ask Me</span>
                        <span class="expand-icon" id="ask-me-icon-{i}">▶</span>
                        <span class="header-loader" id="ask-me-loader-{i}" style="display: none;"></span>
                    </button>
                    <div class="questions-container" id="ask-me-questions-{i}" style="display: none;"></div>
                </div>
            </div>'''
            has_quiz_attr = 'data-has-quiz="false"'
        
        section_html = f'<div class="video-section loaded" data-section-id="{i}" {has_quiz_attr} data-content="{section_content[:500].replace(chr(34), "&quot;")}" data-title="{section_header}"><h2><a href="https://www.youtube.com/watch?v={video_id}&t={timestamp_seconds}s">{section_display_title}</a></h2><p>{section_summary}</p>{questions_html}</div>'
        
        return section_html
        
    except Exception as e:
        logger.error(f"Failed to generate section {section_index + 1}: {e}")
        return f'<div class="video-section error" data-section-id="{section_index}"><p>Failed to load section</p></div>'


def summarize_text(text: str, transcript_data: list, video_id: str) -> str:
    logger.info(f"Starting summarization - {len(transcript_data)} segments")
    
    if not transcript_data:
        return "<p>No transcript available.</p>"
    
    # Step 1: Calculate video duration for context
    if transcript_data:
        last_item = transcript_data[-1]
        video_duration = last_item['start'] + last_item.get('duration', 0)
        video_minutes = int(video_duration / 60)
    else:
        video_minutes = 5  # default
    
    # Step 2: Ask LLM to intelligently divide into 3-4 logical sections
    logger.info(f"Asking LLM to create logical sections for {video_minutes} min video")
    
    sections_data = create_sections_with_llm(text, transcript_data, video_duration)
    logger.info(f"LLM created {len(sections_data)} sections")
    
    sections_html = []
    
    # STEP 5: For each section, generate header and summary
    logger.info("\nSTEP 5: Generating headers and summaries for each section...")
    
    for i, section_data in enumerate(sections_data):
        logger.info(f"\nAnalyzing section {i+1}/{len(sections_data)}")
        
        try:
            section_start_time = section_data['timestamp']
            section_content = section_data.get('content', '')
            
            # Use title from LLM if provided, otherwise generate one
            if section_data.get('title'):
                section_header = section_data['title']
                logger.info(f"  📌 Using LLM title: '{section_header}'")
            else:
                # Generate header from content
                header_prompt = f"""This is section {i+1} of {len(sections_data)} from an educational video. Read the content and create a natural, descriptive header.

REQUIREMENTS:
- 2-4 words that flow naturally
- Should fit into a sequence with other sections
- Descriptive and specific (not generic)
- Medical/scientific terminology if appropriate
- Think: if this were a textbook chapter, what would it be called?

Examples of GOOD headers:
- "Hematoma Formation"
- "Inflammatory Response Cascade"
- "Soft Callus Development"
- "Bone Remodeling Process"

Examples of BAD headers:
- "Section Overview"
- "Key Points"
- "Important Information"
- "Next Steps"

SECTION CONTENT:
{section_content}

Return ONLY the header (2-4 words, no quotes, no explanation)."""

                header_response = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {"role": "system", "content": "Create natural, descriptive headers that flow well in sequence."},
                        {"role": "user", "content": header_prompt}
                    ],
                    temperature=0.6,
                    max_tokens=25
                )
                
                section_header = header_response.choices[0].message.content.strip().strip('"\'').strip('.')
                logger.info(f"  📌 Generated header: '{section_header}'")
            
            # Then, summarize the section
            summary_prompt = f"""Summarize this section in 30-40 words.

Topic: {section_header}

Content:
{section_content}

REQUIREMENTS:
- 30-40 words (2-3 sentences)
- Focus on essentials only
- Include key facts and mechanisms
- Be concise and complete

Write 30-40 words."""

            summary_response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "Create brief 30-40 word summaries for educational content."},
                    {"role": "user", "content": summary_prompt}
                ],
                temperature=0.5,
                max_tokens=120
            )
            
            section_summary = summary_response.choices[0].message.content.strip()
            
            # Clean up any prefixes
            section_summary = re.sub(r'^(TITLE|SUMMARY|HEADER|CONCEPT):\s*', '', section_summary, flags=re.IGNORECASE).strip()
            
            word_count = len(section_summary.split())
            logger.info(f"  Summary: {word_count} words - {section_summary[:80]}...")
            
            # Generate questions
            questions = generate_section_questions(section_summary, section_header)
            quiz_questions = generate_quiz_questions(section_summary, section_header)
            
            # Format HTML with precise timestamp link
            timestamp_seconds = int(section_start_time)
            timestamp_display = format_timestamp(section_start_time)
            section_display_title = f"{timestamp_display} - {section_header}"
            
            # Build questions HTML
            questions_html = f'<div class="chat-container" data-section-id="{i}">'
            questions_html += f'<button class="chat-toggle-btn" onclick="toggleChat({i})"><span class="chat-icon">💬</span></button>'
            questions_html += f'<div class="chat-window" id="chat-{i}" style="display: none;">'
            questions_html += f'<div class="chat-header"><span>Ask a question</span><button class="chat-close-btn" onclick="toggleChat({i})">×</button></div>'
            questions_html += f'<div class="chat-messages" id="chat-messages-{i}"><div class="chat-starter-message">Choose a question to start the conversation:</div></div>'
            questions_html += '<div class="chat-starters-wrapper"><div class="starters-label">💭 Ask the AI:</div>'
            questions_html += f'<div class="chat-starters" id="chat-starters-{i}">'
            
            for q_idx, question in enumerate(questions):
                questions_html += f'<button class="starter-question-btn" onclick="askQuestion({i}, {q_idx}, this)">{question}</button>'
            
            questions_html += '</div><div class="starters-label">🎯 Test yourself:</div>'
            questions_html += f'<div class="quiz-starters" id="quiz-starters-{i}">'
            
            for q_idx, quiz_q in enumerate(quiz_questions):
                escaped_quiz = json.dumps(quiz_q).replace('"', '&quot;')
                questions_html += f'<button class="quiz-question-btn" onclick="startQuiz({i}, {q_idx}, this)" data-quiz="{escaped_quiz}">{quiz_q["question"]}</button>'
            
            questions_html += '</div></div>'
            questions_html += f'<div class="quiz-area" id="quiz-area-{i}" style="display: none;">'
            questions_html += f'<div class="quiz-question-text" id="quiz-question-{i}"></div>'
            questions_html += f'<div class="quiz-options" id="quiz-options-{i}"></div>'
            questions_html += f'<div class="quiz-custom-answer" id="quiz-custom-{i}">'
            questions_html += f'<input type="text" class="quiz-input" id="quiz-input-{i}" placeholder="Or type your answer...">'
            questions_html += f'<button class="quiz-submit-btn" onclick="submitCustomAnswer({i})">Submit</button>'
            questions_html += '</div>'
            questions_html += f'<div class="quiz-feedback" id="quiz-feedback-{i}" style="display: none;"></div>'
            questions_html += '</div>'
            questions_html += f'<div class="chat-input-area">'
            questions_html += f'<input type="text" class="chat-input" id="chat-input-{i}" placeholder="Type your question..." onkeypress="handleChatEnter(event, {i})">'
            questions_html += f'<button class="chat-send-btn" onclick="sendMessage({i})">Send</button>'
            questions_html += '</div></div></div>'
            
            section_html = f'<div class="video-section" data-section-id="{i}"><h2><a href="https://www.youtube.com/watch?v={video_id}&t={timestamp_seconds}s">{section_display_title}</a></h2><p>{section_summary}</p>{questions_html}</div>'
            sections_html.append(section_html)
            
            logger.info(f"  ✅ HTML built for section {i+1}")
            
        except Exception as e:
            logger.warning(f"Failed to process section {i+1}: {e}")
            continue
    
    if not sections_html:
        logger.error("No sections generated!")
        return "<p>Unable to generate summary.</p>"
    
    final_html = "".join(sections_html)
    logger.info(f"\n🎉 COMPLETE: Generated {len(sections_html)} sections, {len(final_html)} chars total\n")
    return final_html

@app.get("/")
async def read_root():
    return FileResponse("index.html")

@app.post("/api/video-metadata")
async def get_video_metadata(request: VideoRequest):
    """
    Gets section titles and generates content-specific loading messages.
    This does transcript + section analysis, then caches for the main request.
    """
    logger.info(f"Metadata request: {request.url}")
    try:
        video_id = extract_video_id(request.url)
        logger.info(f"Video ID: {video_id}")
        
        # Get video title quickly via oEmbed
        video_title = get_video_title_fast(video_id)
        logger.info(f"Video title: {video_title}")
        
        # Fetch transcript and create sections (this gives us section titles)
        transcript_text, transcript_data = get_transcript(video_id)
        logger.info(f"Transcript fetched: {len(transcript_text)} chars")
        
        # Calculate video duration
        if transcript_data:
            last_item = transcript_data[-1]
            video_duration = last_item['start'] + last_item.get('duration', 0)
        else:
            video_duration = 0
        
        # Get section metadata from LLM - this gives us the actual topics!
        sections_data = create_sections_with_llm(transcript_text, transcript_data, video_duration)
        section_titles = [s.get('title', f'Section {i+1}') for i, s in enumerate(sections_data)]
        logger.info(f"Section titles: {section_titles}")
        
        # Cache for the main transcript request (saves re-processing)
        transcript_cache[video_id] = {
            'sections': sections_data,
            'transcript_text': transcript_text
        }
        
        # Generate loading messages based on ACTUAL section content
        loading_messages = generate_section_based_messages(video_title, section_titles)
        
        return {
            "video_id": video_id,
            "video_title": video_title,
            "section_titles": section_titles,
            "total_sections": len(sections_data),
            "loading_messages": loading_messages,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Metadata error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def get_video_title_fast(video_id: str) -> str:
    """Get video title quickly using YouTube oEmbed (no API key needed)."""
    try:
        import urllib.request
        url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
        with urllib.request.urlopen(url, timeout=3) as response:
            data = json.loads(response.read().decode())
            return data.get('title', 'Educational Video')
    except Exception as e:
        logger.warning(f"Could not fetch video title: {e}")
        return "Educational Video"


def generate_section_based_messages(video_title: str, section_titles: list) -> list:
    """Generate sophisticated, content-specific loading messages for medical students."""
    try:
        sections_str = ", ".join(section_titles[:8])
        
        prompt = f"""You're creating loading screen messages for a medical education app.

Video: "{video_title}"
Topics covered: {sections_str}

Generate 12 loading messages that:
1. Reference SPECIFIC concepts from the section titles above
2. Include relevant clinical pearls, board-style facts, or mechanism insights
3. Are written for medical students (USMLE-level sophistication)
4. Mix high-yield facts with the specific topics being covered
5. Are 12-20 words each
6. NO generic "loading" or "processing" language

Examples of GOOD messages (specific, clinical, sophisticated):
- "Reviewing membrane transport? Remember: Na+/K+-ATPase uses 30% of cellular ATP 🔬"
- "Cell signaling coming up: G-proteins are GTPases - hydrolysis = signal termination"
- "Cardiac cycle insight: S1 from AV valve closure, S2 from semilunar valve closure"
- "Renal physiology: PCT reabsorbs 65% of filtered Na+ - highest of any segment"

Examples of BAD messages (generic, too simple):
- "Learning about cells!"
- "Almost done loading..."
- "This is exciting stuff!"

Return ONLY a JSON array of 12 strings. Reference the ACTUAL topics: {sections_str}"""

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=700
        )
        
        content = response.choices[0].message.content.strip()
        # Handle potential markdown code blocks
        if '```' in content:
            content = content.split('```')[1]
            if content.startswith('json'):
                content = content[4:]
            content = content.strip()
        messages = json.loads(content)
        logger.info(f"Generated {len(messages)} section-based loading messages")
        return messages
        
    except Exception as e:
        logger.warning(f"Failed to generate section-based messages: {e}")
        # Fallback using actual section titles
        fallback = []
        for title in section_titles[:6]:
            fallback.append(f"Preparing section: {title}...")
        fallback.extend([
            f"Analyzing: {video_title[:40]}...",
            "Extracting high-yield concepts...",
        ])
        return fallback

@app.post("/api/transcript")
async def get_transcript_summary(request: VideoRequest):
    """
    Progressive loading approach:
    1. Fast response with section metadata + first batch of rendered sections
    2. Client can request remaining sections via /api/sections/batch
    
    Uses cached data from /api/video-metadata if available.
    """
    logger.info(f"Transcript request: {request.url}")
    try:
        video_id = extract_video_id(request.url)
        logger.info(f"Video ID: {video_id}")
        
        # Check if we have cached data from metadata endpoint
        cached = transcript_cache.get(video_id)
        if cached and 'sections' in cached and 'transcript_text' in cached:
            logger.info(f"Using cached metadata for {video_id}")
            sections_data = cached['sections']
            transcript_text = cached['transcript_text']
        else:
            # Fetch fresh if not cached
            transcript_text, transcript_data = get_transcript(video_id)
            logger.info(f"Transcript fetched: {len(transcript_text)} chars, {len(transcript_data)} segments")
            
            # Calculate video duration
            if transcript_data:
                last_item = transcript_data[-1]
                video_duration = last_item['start'] + last_item.get('duration', 0)
            else:
                video_duration = 0
            
            # Get section metadata from LLM
            sections_data = create_sections_with_llm(transcript_text, transcript_data, video_duration)
            
            # Cache for future use
            transcript_cache[video_id] = {
                'sections': sections_data,
                'transcript_text': transcript_text
            }
        
        total_sections = len(sections_data)
        logger.info(f"Using {total_sections} sections")
        
        # Get section titles
        section_titles = [s.get('title', f'Section {i+1}') for i, s in enumerate(sections_data)]
        subject = section_titles[0] if section_titles else "this video"
        
        # Generate sections - NO quiz pre-generation (all on-demand now)
        logger.info(f"Generating {total_sections} sections (summary only, quiz on-demand)...")
        
        all_sections_html = []
        for i in range(total_sections):
            logger.info(f"Generating section {i + 1}/{total_sections}...")
            html = generate_section_html(sections_data[i], i, total_sections, video_id, generate_quiz=False)
            all_sections_html.append(html)
        
        final_html = "".join(all_sections_html)
        
        # Build section metadata (all loaded)
        sections_meta = []
        for i, section in enumerate(sections_data):
            sections_meta.append({
                'index': i,
                'timestamp': section['timestamp'],
                'title': section.get('title', f'Section {i + 1}'),
                'loaded': True
            })
        
        logger.info(f"🎉 Generated all {total_sections} sections, {len(final_html)} chars")
        
        return {
            "summary": final_html,
            "transcript": transcript_text,
            "video_id": video_id,
            "total_sections": total_sections,
            "loaded_sections": total_sections,
            "sections_meta": sections_meta,
            "section_titles": section_titles,
            "subject": subject
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/transcript/stream")
async def get_transcript_summary_stream(request: VideoRequest):
    """
    Streaming version that sends progress updates via Server-Sent Events.
    """
    async def generate_stream():
        try:
            # Send initial progress
            yield f"data: {json.dumps({'type': 'progress', 'stage': 'init', 'message': 'Starting...', 'progress': 0})}\n\n"
            
            video_id = extract_video_id(request.url)
            yield f"data: {json.dumps({'type': 'progress', 'stage': 'transcript', 'message': 'Fetching transcript...', 'progress': 5})}\n\n"
            
            transcript_text, transcript_data = get_transcript(video_id)
            yield f"data: {json.dumps({'type': 'progress', 'stage': 'transcript', 'message': f'Transcript loaded ({len(transcript_data)} segments)', 'progress': 15})}\n\n"
            
            # Calculate video duration
            if transcript_data:
                last_item = transcript_data[-1]
                video_duration = last_item['start'] + last_item.get('duration', 0)
            else:
                video_duration = 0
            
            yield f"data: {json.dumps({'type': 'progress', 'stage': 'sections', 'message': 'Analyzing content structure...', 'progress': 20})}\n\n"
            
            # Get section metadata
            sections_data = create_sections_with_llm(transcript_text, transcript_data, video_duration)
            total_sections = len(sections_data)
            
            yield f"data: {json.dumps({'type': 'progress', 'stage': 'sections', 'message': f'Found {total_sections} sections', 'progress': 25, 'totalSections': total_sections})}\n\n"
            
            # Generate topic-specific loading messages from section titles
            section_titles = [s.get('title', f'Section {i+1}') for i, s in enumerate(sections_data)]
            subject = section_titles[0] if section_titles else "this video"
            loading_messages = generate_loading_messages(subject, section_titles)
            
            # Send loading messages to client
            yield f"data: {json.dumps({'type': 'loading_messages', 'messages': loading_messages, 'section_titles': section_titles, 'subject': subject})}\n\n"
            
            # Generate all sections with progress updates (quiz only for first few)
            FULL_QUIZ_SECTIONS = 4
            all_sections_html = []
            for i in range(total_sections):
                section_title = sections_data[i].get('title', f'Section {i + 1}')
                progress = 30 + int((i / total_sections) * 65)  # 30-95%
                generate_quiz = i < FULL_QUIZ_SECTIONS
                
                yield f"data: {json.dumps({'type': 'progress', 'stage': 'generating', 'message': f'Section {i + 1}/{total_sections}: {section_title}', 'progress': progress, 'currentSection': i + 1, 'totalSections': total_sections})}\n\n"
                
                html = generate_section_html(sections_data[i], i, total_sections, video_id, generate_quiz=generate_quiz)
                all_sections_html.append(html)
            
            final_html = "".join(all_sections_html)
            
            # Build section metadata
            sections_meta = []
            for i, section in enumerate(sections_data):
                sections_meta.append({
                    'index': i,
                    'timestamp': section['timestamp'],
                    'title': section.get('title', f'Section {i + 1}'),
                    'loaded': True
                })
            
            yield f"data: {json.dumps({'type': 'progress', 'stage': 'complete', 'message': 'Complete!', 'progress': 100})}\n\n"
            
            # Send final result
            result = {
                'type': 'result',
                'summary': final_html,
                'transcript': transcript_text,
                'video_id': video_id,
                'total_sections': total_sections,
                'sections_meta': sections_meta
            }
            yield f"data: {json.dumps(result)}\n\n"
            
        except Exception as e:
            logger.error(f"Stream error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
    
    return StreamingResponse(
        generate_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@app.post("/api/sections/batch")
async def get_sections_batch(request: SectionBatchRequest):
    """Load a batch of sections on demand."""
    logger.info(f"Batch request for video {request.video_id}: {len(request.sections)} sections")
    
    try:
        video_id = request.video_id
        results = []
        
        for section_data in request.sections:
            section_index = section_data['index']
            logger.info(f"  Generating section {section_index + 1}...")
            
            html = generate_section_html(section_data, section_index, len(request.sections), video_id)
            results.append({
                'index': section_index,
                'html': html
            })
        
        logger.info(f"✅ Batch complete: {len(results)} sections")
        return {"sections": results}
        
    except Exception as e:
        logger.error(f"Batch error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class QuizGenerateRequest(BaseModel):
    section_title: str
    section_content: str

@app.post("/api/section/quiz")
async def generate_section_quiz_on_demand(request: QuizGenerateRequest):
    """Generate quiz questions for a section on demand."""
    logger.info(f"On-demand quiz request for: {request.section_title}")
    
    try:
        # Generate questions
        questions = generate_section_questions(request.section_content, request.section_title)
        quiz_questions = generate_quiz_questions(request.section_content, request.section_title)
        
        return {
            "user_questions": questions,
            "quiz_questions": quiz_questions
        }
        
    except Exception as e:
        logger.error(f"Quiz generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/chat")
async def chat_with_section(request: ChatRequest):
    try:
        messages = [
            {"role": "system", "content": """You are an educational assistant helping medical students understand video content. Provide brief, clear answers that help students grasp essential concepts for their studies and exams.

REQUIREMENTS:
- Keep answers BRIEF (2-4 sentences max)
- Focus on essential information
- Use clear, simple language
- Include mechanisms, differences, or clinical relevance when appropriate
- Be direct and helpful"""},
            {"role": "system", "content": f"Section content:\n{request.section_context}"}
        ]
        
        messages.extend(request.conversation_history)
        messages.append({"role": "user", "content": request.question})
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            temperature=0.7,
            max_tokens=150
        )
        
        answer = response.choices[0].message.content.strip()
        
        # Generate follow-up questions
        follow_up_response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "Generate 3 follow-up questions that build on the conversation. Format: one per line, numbered 1-3."},
                {"role": "user", "content": f"Q: {request.question}\nA: {answer}\n\nGenerate 3 follow-up questions."}
            ],
            temperature=0.7,
            max_tokens=200
        )
        
        follow_up_text = follow_up_response.choices[0].message.content.strip()
        follow_up_questions = []
        for line in follow_up_text.split('\n'):
            cleaned = line.strip()
            cleaned = re.sub(r'^\d+[\.)]\s*', '', cleaned)
            cleaned = cleaned.strip('"\'')
            if cleaned and len(cleaned) > 10:
                follow_up_questions.append(cleaned)
        
        while len(follow_up_questions) < 3:
            follow_up_questions.append('Can you elaborate?')
        
        return {
            "answer": answer,
            "follow_up_questions": follow_up_questions[:3]
        }
        
    except Exception as e:
        logger.error(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/quiz/validate")
async def validate_quiz_answer(request: QuizAnswerRequest):
    try:
        user_letter = request.user_answer.strip().upper()
        correct_letter = request.correct_answer.strip().upper()
        
        is_correct = user_letter == correct_letter
        
        # For written answers
        if len(request.user_answer) > 1:
            eval_response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "Evaluate if student answer is correct. Answer YES or NO only."},
                    {"role": "user", "content": f"Question: {request.question}\nCorrect: {request.explanation}\nStudent: {request.user_answer}\n\nCorrect?"}
                ],
                temperature=0.3,
                max_tokens=10
            )
            is_correct = "YES" in eval_response.choices[0].message.content.upper()
        
        feedback = f"✅ Correct! {request.explanation}" if is_correct else f"❌ Not quite. The correct answer is {request.correct_answer}. {request.explanation}"
        
        # Extract section info
        context_parts = request.section_context.split('\n\n')
        section_title = context_parts[0].replace('Section: ', '') if context_parts else "Section"
        section_content = context_parts[1].replace('Content: ', '') if len(context_parts) > 1 else request.section_context
        
        # Generate new questions
        new_user_questions = generate_section_questions(section_content, section_title)
        new_quiz_questions = generate_quiz_questions(section_content, section_title)
        
        return {
            "is_correct": is_correct,
            "feedback": feedback,
            "new_user_questions": new_user_questions,
            "new_quiz_questions": new_quiz_questions
        }
        
    except Exception as e:
        logger.error(f"Quiz validation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
