const synth = window.speechSynthesis;

// DOM Elements
const textInput = document.getElementById('text-input');
const displayArea = document.getElementById('display-area'); // New display area
const voiceSelectEn = document.getElementById('voice-select-en');
const voiceSelectKo = document.getElementById('voice-select-ko');
const rateInput = document.getElementById('rate');
const rateValue = document.getElementById('rate-value');
const pitchInput = document.getElementById('pitch');
const pitchValue = document.getElementById('pitch-value');
const playBtn = document.getElementById('play-btn');
const pauseBtn = document.getElementById('pause-btn');
const stopBtn = document.getElementById('stop-btn');
const charCount = document.querySelector('.char-count');
const statusIndicator = document.getElementById('status-indicator');
const translateToggle = document.getElementById('translate-toggle'); // New Toggle

// State
let voices = [];
let voiceMap = new Map();

let currentSegments = []; // Store current segments for highlighting
let isTranslating = false; // Flag to track translation state

// Initialize
function init() {
    loadVoices();
    if (synth.onvoiceschanged !== undefined) {
        synth.onvoiceschanged = loadVoices;
    }
}

function loadVoices() {
    voices = synth.getVoices();
    voiceMap.clear();

    // Populate maps and sort if needed
    voices.forEach(v => voiceMap.set(v.name, v));

    // Clear options
    voiceSelectEn.innerHTML = '';
    voiceSelectKo.innerHTML = '';

    // Populate English Voices
    const enVoices = voices.filter(v => v.lang.startsWith('en'));
    enVoices.forEach(voice => {
        const option = createOption(voice);
        voiceSelectEn.appendChild(option);
    });

    // Populate Korean Voices
    const koVoices = voices.filter(v => v.lang.startsWith('ko'));
    koVoices.forEach(voice => {
        const option = createOption(voice);
        voiceSelectKo.appendChild(option);
    });

    // Smart defaults
    const defaultEn = enVoices.find(v => v.name.includes('Samantha')) || enVoices.find(v => v.default) || enVoices[0];
    if (defaultEn) voiceSelectEn.value = defaultEn.name;

    const defaultKo = koVoices.find(v => v.name.includes('Yuna') || v.name.includes('Damien')) || koVoices[0];
    if (defaultKo) voiceSelectKo.value = defaultKo.name;

    if (koVoices.length === 0) {
        const option = document.createElement('option');
        option.textContent = "No Korean voices found";
        option.disabled = true;
        voiceSelectKo.appendChild(option);
    }
}

function createOption(voice) {
    const option = document.createElement('option');
    option.textContent = `${voice.name} (${voice.lang})`;
    option.value = voice.name;
    return option;
}

// Language Detection & Parsing
function parseText(text) {
    const koreanRegex = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;
    const sentenceEndRegex = /[.!?\n]/;

    const segments = [];
    let currentSegment = { text: '', type: 'unknown' };

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const isKorean = koreanRegex.test(char);
        const isNeutral = /[0-9\s\.,!?@#$%^&*()_\-+=:;"'<>\[\]{}]/.test(char);

        // Determine type
        let charType = 'en';
        if (isKorean) charType = 'ko';
        else if (isNeutral) charType = 'neutral';

        // Initialize if unknown
        if (currentSegment.type === 'unknown') {
            currentSegment.type = (charType === 'neutral') ? 'en' : charType; // Default to current thought (usually EN or previous)
        }

        // Logic for splitting
        // 1. Language Change? (Ignore neutral)
        let typeChanged = false;
        if (charType !== 'neutral' && charType !== currentSegment.type) {
            typeChanged = true;
        }

        if (typeChanged) {
            // Push previous
            if (currentSegment.text.length > 0) segments.push(currentSegment);
            currentSegment = { text: char, type: charType };
        } else {
            // Same language (or neutral). Append.
            currentSegment.text += char;

            // 2. Sentence End?
            if (sentenceEndRegex.test(char)) {
                // If it's a newline, always split.
                // If it's punctuation, verify it's not a decimal (not perfect but ok).
                segments.push(currentSegment);
                // Reset for next, default type carries over from this sentence usually, 
                // but let's set to unknown to let next char decide, OR keep same.
                // Resetting to unknown is safer for language detection of next sentence.
                currentSegment = { text: '', type: 'unknown' };
            }
        }
    }

    // Push remaining
    if (currentSegment.text.length > 0) {
        segments.push(currentSegment);
    }

    // Filter empty segments (e.g. from multiple newlines)
    return segments.filter(s => s.text.trim().length > 0);
}

// Translation Service
async function translateText(text) {
    try {
        // Using MyMemory API for demo/free translation
        // Note: Production apps should use a paid API like Google Cloud Translation or DeepL to avoid rate limits/quality issues.
        const encodedText = encodeURIComponent(text);
        const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodedText}&langpair=ko|en`);
        const data = await response.json();

        if (data && data.responseData) {
            return data.responseData.translatedText;
        }
        throw new Error('Translation failed');
    } catch (error) {
        console.error('Translation Error:', error);
        return '[Translation Failed]';
    }
}

// Speak Function
async function speak() {
    if (synth.speaking) {
        console.error('already speaking');
        return;
    }

    let text = textInput.value;

    if (text !== '') {
        setSpeakingState(true); // Set state immediately

        // info: Check Translation Mode
        if (translateToggle.checked) {
            isTranslating = true;
            statusIndicator.innerHTML = '<span class="pulse"></span> Translating...';

            try {
                const translation = await translateText(text);

                // If stopped during translation
                if (!isTranslating) {
                    console.log('Translation cancelled by user');
                    return;
                }

                text = `${text}\n\n${translation}`; // Combine original + translation
            } catch (err) {
                console.error(err);
                if (!isTranslating) return; // Cancelled
            } finally {
                isTranslating = false;
            }

            statusIndicator.innerHTML = '<span class="pulse"></span> Speaking...';
        }

        // Check if stopped/reset happened while waiting (redundant safety)
        if (statusIndicator.classList.contains('hidden')) return;

        // Parse Text
        currentSegments = parseText(text);

        // Prep UI for Highlighting
        prepareDisplayArea(currentSegments);

        // If cancellation happened during translation
        if (!statusIndicator.classList.contains('hidden') === false) return;

        currentSegments.forEach((segment, index) => {
            const utterance = new SpeechSynthesisUtterance(segment.text);

            // Assign voice
            if (segment.type === 'ko') {
                const koVoiceName = voiceSelectKo.value;
                const v = voiceMap.get(koVoiceName);
                if (v) utterance.voice = v;
            } else {
                const enVoiceName = voiceSelectEn.value;
                const v = voiceMap.get(enVoiceName);
                if (v) utterance.voice = v;
            }

            utterance.rate = rateInput.value;
            utterance.pitch = pitchInput.value;

            // HIGHLIGHTING LOGIC
            utterance.onstart = () => {
                highlightSegment(index);
            };

            utterance.onend = () => {
                unhighlightSegment(index);
                if (index === currentSegments.length - 1) {
                    setSpeakingState(false);
                }
            };

            utterance.onerror = () => {
                console.error('Utterance error');
                // Don't disable immediately if just one segment errors, but for simplicity:
                if (index === currentSegments.length - 1) setSpeakingState(false);
            };

            synth.speak(utterance);
        });
    }
}

function prepareDisplayArea(segments) {
    // Hide textarea, show display div
    textInput.classList.add('hidden');
    displayArea.classList.remove('hidden');
    displayArea.innerHTML = ''; // Clear

    segments.forEach((seg, index) => {
        const span = document.createElement('span');
        span.textContent = seg.text;
        span.id = `seg-${index}`;
        span.classList.add('segment'); // for potential future styling
        displayArea.appendChild(span);
    });
}

function highlightSegment(index) {
    // Remove previous highlights (safety)
    document.querySelectorAll('.highlight').forEach(el => el.classList.remove('highlight'));

    // Add new
    const el = document.getElementById(`seg-${index}`);
    if (el) {
        el.classList.add('highlight');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' }); // Auto-scroll
    }
}

function unhighlightSegment(index) {
    const el = document.getElementById(`seg-${index}`);
    if (el) el.classList.remove('highlight');
}

// UI Helpers
function setSpeakingState(isSpeaking) {
    if (isSpeaking) {
        statusIndicator.classList.remove('hidden');
        pauseBtn.disabled = false;
        stopBtn.disabled = false;
        playBtn.disabled = true;
    } else {
        statusIndicator.classList.add('hidden');
        pauseBtn.disabled = true;
        stopBtn.disabled = true;
        playBtn.disabled = false;

        // Don't auto-revert UI here anymore. 
        // User must click display to edit.
        // textInput.classList.remove('hidden');
        // displayArea.classList.add('hidden');

        // Cancel everything if we force stop
        if (synth.speaking) synth.cancel();
    }
}

// Click to Edit
displayArea.addEventListener('click', () => {
    if (!synth.speaking) {
        textInput.classList.remove('hidden');
        displayArea.classList.add('hidden');
        displayArea.innerHTML = ''; // Clear content
        textInput.focus();
    }
});

// Event Listeners
playBtn.addEventListener('click', () => {
    if (synth.paused) {
        synth.resume();
        // Restore highlight state? Difficult because state is lost. 
        // Simplest is to just resume. Highlighting might desync if paused long, 
        // but 'onstart' events usually fire correctly for next chunks.
        statusIndicator.classList.remove('hidden');
    } else {
        speak();
    }
});

pauseBtn.addEventListener('click', () => {
    if (synth.speaking && !synth.paused) {
        synth.pause();
        statusIndicator.classList.add('hidden');
        pauseBtn.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            Resume
        `;
    } else if (synth.paused) {
        synth.resume();
        statusIndicator.classList.remove('hidden');
        pauseBtn.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
            Pause
        `;
    }
});

stopBtn.addEventListener('click', () => {
    // Check if translating
    if (isTranslating) {
        isTranslating = false; // Flag to cancel
        setSpeakingState(false);
        // Explicitly hide indicator as setSpeakingState handles buttons but checking indicator class in speak()
        statusIndicator.classList.add('hidden');
        return;
    }

    if (synth.speaking) {
        synth.cancel();
        // setSpeakingState(false) will be called by onend/onerror, 
        // but force it here for immediate UI feedback in case of lag
        setSpeakingState(false);
    }
});

rateInput.addEventListener('change', e => (rateValue.textContent = rateInput.value));
pitchInput.addEventListener('change', e => (pitchValue.textContent = pitchInput.value));

textInput.addEventListener('input', () => {
    charCount.textContent = `${textInput.value.length} characters`;
});

init();
