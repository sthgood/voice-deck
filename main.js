const synth = window.speechSynthesis;

// DOM Elements
const textInput = document.getElementById('text-input');
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

// State
let voices = [];
let voiceMap = new Map();

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
    // Attempt to select 'Samantha' or 'Google US English' for EN
    const defaultEn = enVoices.find(v => v.name.includes('Samantha')) || enVoices.find(v => v.default) || enVoices[0];
    if (defaultEn) voiceSelectEn.value = defaultEn.name;

    // Attempt to select 'Yuna' or 'Google Korean' for KO
    const defaultKo = koVoices.find(v => v.name.includes('Yuna') || v.name.includes('Damien') || v.name.includes('Sin-ji')) || koVoices[0];
    if (defaultKo) voiceSelectKo.value = defaultKo.name;

    // Fallback if no Korean voices found (e.g. some minimalist setups)
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
    // Regex for Korean characters (Hangul Syllables, Jamo, Compatibility Jamo)
    const koreanRegex = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;

    const segments = [];
    let currentSegment = { text: '', type: 'unknown' };

    // Simple character-by-character scan (can be optimized but safe for short texts)
    // Heuristic: treat numbers/spaces/punctuation as "neutral" or belonging to the PREVIOUS language type
    // to avoid chopping sentences too aggressively.

    for (let char of text) {
        const isKorean = koreanRegex.test(char);
        const isNeutral = /[0-9\s\.,!?@#$%^&*()_\-+=:;"'<>\[\]{}]/.test(char);

        let charType = 'en';
        if (isKorean) charType = 'ko';
        else if (isNeutral) charType = 'neutral';

        // Initialization
        if (currentSegment.type === 'unknown') {
            currentSegment.type = (charType === 'neutral') ? 'en' : charType; // Default start neutral to EN or KO
            currentSegment.text += char;
            continue;
        }

        // Logic:
        // If current is EN, and char is KO -> switch
        // If current is EN, and char is NEUTRAL -> stay EN
        // If current is EN, and char is EN -> stay EN

        // If current is KO, and char is KO -> stay KO
        // If current is KO, and char is NEUTRAL -> stay KO
        // If current is KO, and char is EN -> switch

        if (charType === 'neutral') {
            currentSegment.text += char;
        } else if (charType === currentSegment.type) {
            currentSegment.text += char;
        } else {
            // Push old segment
            if (currentSegment.text.trim().length > 0) {
                segments.push(currentSegment);
            }
            // Start new
            currentSegment = { text: char, type: charType };
        }
    }

    // Push last segment
    if (currentSegment.text.trim().length > 0) {
        segments.push(currentSegment);
    }

    return segments;
}

// Speak Function
async function speak() {
    if (synth.speaking) {
        console.error('already speaking');
        return;
    }

    const text = textInput.value;
    if (text !== '') {
        setSpeakingState(true);

        const segments = parseText(text);

        // We queue them all up immediately. The browser handles the queue.
        segments.forEach((segment, index) => {
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

            // Simple cleanup on last item
            if (index === segments.length - 1) {
                utterance.onend = () => {
                    setSpeakingState(false);
                };
                utterance.onerror = () => {
                    setSpeakingState(false);
                };
            }

            synth.speak(utterance);
        });
    }
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
    }
}

// Event Listeners
playBtn.addEventListener('click', () => {
    if (synth.paused) {
        synth.resume();
        setSpeakingState(true);
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
    if (synth.speaking) {
        synth.cancel();
        setSpeakingState(false);
        pauseBtn.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
            Pause
        `;
    }
});

rateInput.addEventListener('change', e => (rateValue.textContent = rateInput.value));
pitchInput.addEventListener('change', e => (pitchValue.textContent = pitchInput.value));

textInput.addEventListener('input', () => {
    charCount.textContent = `${textInput.value.length} characters`;
});

init();
