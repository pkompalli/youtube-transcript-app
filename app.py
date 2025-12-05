from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
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

@app.post("/api/transcript")
async def get_transcript_summary(request: VideoRequest):
    logger.info(f"Transcript request: {request.url}")
    try:
        video_id = extract_video_id(request.url)
        logger.info(f"Video ID: {video_id}")
        
        transcript_text, transcript_data = get_transcript(video_id)
        logger.info(f"Transcript fetched: {len(transcript_text)} chars, {len(transcript_data)} segments")
        
        summary = summarize_text(transcript_text, transcript_data, video_id)
        
        return {
            "summary": summary,
            "transcript": transcript_text
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error: {e}")
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
