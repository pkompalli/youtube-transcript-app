const videoUrlInput = document.getElementById('videoUrl');
const loadBtn = document.getElementById('loadVideo');
const errorDiv = document.getElementById('error');
const videoSection = document.getElementById('videoSection');
const videoFrame = document.getElementById('videoFrame');
const summaryDiv = document.getElementById('summary');
const transcriptDiv = document.getElementById('transcript');
const transcriptSection = document.querySelector('.transcript-section');
const toggleTranscriptBtn = document.getElementById('toggleTranscript');

let transcriptVisible = false;

loadBtn.addEventListener('click', loadVideo);
videoUrlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        loadVideo();
    }
});

toggleTranscriptBtn.addEventListener('click', () => {
    try {
        // Check if transcript is available
        if (!transcriptDiv.textContent || transcriptDiv.textContent.trim() === '' || transcriptDiv.textContent === 'Transcript not available') {
            showError('Transcript is not available for this video.');
            return;
        }
        
        transcriptVisible = !transcriptVisible;
        transcriptSection.style.display = transcriptVisible ? 'block' : 'none';
        toggleTranscriptBtn.textContent = transcriptVisible ? 'Hide Full Transcript' : 'Show Full Transcript';
        
        // Scroll to transcript section when showing
        if (transcriptVisible) {
            setTimeout(() => {
                transcriptSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 100);
        }
    } catch (error) {
        console.error('Error toggling transcript:', error);
        showError('Failed to display transcript. Please try reloading the video.');
    }
});

async function loadVideo() {
    const url = videoUrlInput.value.trim();
    
    if (!url) {
        showError('Please enter a YouTube URL');
        return;
    }

    // Hide previous errors
    errorDiv.style.display = 'none';
    
    // Show loading state
    videoSection.style.display = 'block';
    summaryDiv.innerHTML = '<p class="loading">Loading summary...</p>';
    transcriptSection.style.display = 'none';
    transcriptDiv.textContent = ''; // Clear previous transcript
    transcriptVisible = false;
    toggleTranscriptBtn.textContent = 'Show Full Transcript';
    toggleTranscriptBtn.disabled = true; // Disable until transcript loads

    try {
        // Extract video ID for embedding
        const videoId = extractVideoId(url);
        if (!videoId) {
            throw new Error('Invalid YouTube URL');
        }

        console.log('Loading video:', videoId);

        // Embed video
        videoFrame.src = `https://www.youtube.com/embed/${videoId}`;

        // Fetch transcript and summary with timeout
        console.log('Fetching transcript...');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 minute timeout for long videos
        
        try {
            const response = await fetch('/api/transcript', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ url: url }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                let errorMessage = `Server error (${response.status}): Failed to fetch transcript`;
                try {
                    const error = await response.json();
                    console.error('Server error response:', error);
                    errorMessage = error.detail || error.message || errorMessage;
                } catch (e) {
                    // If response is not JSON, use status text
                    console.error('Failed to parse error response:', e);
                    errorMessage = `${response.status} ${response.statusText}` || errorMessage;
                }
                console.error('Throwing error:', errorMessage);
                throw new Error(errorMessage);
            }

            const data = await response.json();
            console.log('Transcript received, length:', data.transcript ? data.transcript.length : 0);
            
            // Validate data
            if (!data.summary) {
                throw new Error('Summary not available');
            }
            
            // Display summary (it's HTML with sections and links)
            summaryDiv.innerHTML = data.summary;
            
            // Store transcript for toggle - format it nicely
            if (data.transcript && data.transcript.length > 0) {
                // Format transcript with line breaks for readability
                const formattedTranscript = data.transcript
                    .replace(/\s+/g, ' ') // Normalize whitespace
                    .trim();
                transcriptDiv.textContent = formattedTranscript;
                toggleTranscriptBtn.disabled = false; // Enable button
                console.log('Transcript stored successfully');
            } else {
                transcriptDiv.textContent = 'Transcript not available';
                toggleTranscriptBtn.disabled = true; // Keep disabled
                toggleTranscriptBtn.textContent = 'Transcript Not Available';
                console.warn('Transcript is empty or missing');
            }
        } finally {
            clearTimeout(timeoutId);
        }

    } catch (error) {
        console.error('Error loading video:', error);
        console.error('Error details:', {
            name: error.name,
            message: error.message,
            stack: error.stack
        });
        
        if (error.name === 'AbortError') {
            showError('Request timed out. The video transcript may be very long or YouTube is slow to respond. Please try again.');
        } else if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.message.includes('Network request failed'))) {
            showError('Network error. Please check if the server is running on http://localhost:8000 and try again.');
        } else {
            // Show the actual error message from the server
            const errorMsg = error.message || 'An unexpected error occurred. Please try again.';
            showError(errorMsg);
        }
        videoSection.style.display = 'none';
    }
}

function extractVideoId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
        /youtube\.com\/watch\?.*v=([^&\n?#]+)/,
    ];
    
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
            return match[1];
        }
    }
    return null;
}

function showError(message) {
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

