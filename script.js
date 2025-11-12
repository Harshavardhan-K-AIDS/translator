document.addEventListener('DOMContentLoaded', () => {
    // --- IMPORTANT ---
    // Paste your Gemini API Key here.
    // Do not deploy this with a real key, as it will be visible to everyone.
    const GEMINI_API_KEY = ""; // 👈 PASTE YOUR KEY HERE

    // --- DOM Elements ---
    const modelSelect = "gemini-2.5-flash-preview-09-2025"; // Hardcoded model
    const sourceLangSelect = document.getElementById('source-lang');
    const targetLangSelect = document.getElementById('target-lang');
    const swapLangButton = document.getElementById('swap-lang-btn');
    const inputTextarea = document.getElementById('input-text');
    const outputPlaceholder = document.getElementById('output-placeholder');
    const outputTextDisplay = document.getElementById('output-text-display');
    const proofreadButton = document.getElementById('proofread-btn');
    const translateButton = document.getElementById('translate-btn');
    const charCount = document.getElementById('char-count');
    const copyButton = document.getElementById('copy-btn');
    const messageBox = document.getElementById('message-box');

    // --- Language Data ---
    const languages = {
        'en': 'English',
        'ta': 'Tamil (தமிழ்)',
        'hi': 'Hindi (हिन्दी)',
        'te': 'Telugu (తెలుగు)'
    };

    // --- Constants ---
    const API_URL_BASE = "https://generativelanguage.googleapis.com/v1beta/models/";

    // --- Helper Functions ---

    /**
     * Populates language select dropdowns.
     */
    function populateLanguageSelects() {
        for (const [code, name] of Object.entries(languages)) {
            sourceLangSelect.options.add(new Option(name, code));
            targetLangSelect.options.add(new Option(name, code));
        }
        // Set defaults
        sourceLangSelect.value = 'en';
        targetLangSelect.value = 'ta';
    }

    /**
     * Updates the character count.
     */
    function updateCharCount() {
        const count = inputTextarea.value.length;
        charCount.textContent = `${count} characters`;
    }

    /**
     * Swaps the source and target languages.
     */
    function swapLanguages() {
        const tempValue = sourceLangSelect.value;
        sourceLangSelect.value = targetLangSelect.value;
        targetLangSelect.value = tempValue;
    }

    /**
     * Copies the output text to the clipboard.
     */
    function copyOutput() {
        const textToCopy = outputTextDisplay.textContent;
        if (!textToCopy) return;

        // Using execCommand as a fallback for potential iframe restrictions
        const tempTextArea = document.createElement('textarea');
        tempTextArea.value = textToCopy;
        document.body.appendChild(tempTextArea);
        tempTextArea.select();
        try {
            document.execCommand('copy');
            showMessage("Copied to clipboard!", 'success');
        } catch (err) {
            showMessage("Failed to copy text.", 'danger');
            console.error('Failed to copy text: ', err);
        }
        document.body.removeChild(tempTextArea);
    }


    /**
     * Toggles the loading state of the action buttons.
     * @param {boolean} isLoading - Whether to show the loading state.
     * @param {'translate' | 'proofread' | 'none'} toolType - Which button to show loader on.
     */
    function showLoading(isLoading, toolType = 'none') {
        const buttons = [translateButton, proofreadButton];
        
        buttons.forEach(button => {
            button.disabled = isLoading;
            const span = button.querySelector('span');
            
            // Clear existing spinners
            const existingSpinner = button.querySelector('.spinner-border-sm');
            if (existingSpinner) {
                existingSpinner.remove();
            }

            if (isLoading && button.id === `${toolType}-btn`) {
                // Add spinner to the clicked button
                span.style.display = 'none'; // Hide text
                const spinner = document.createElement('div');
                spinner.className = 'spinner-border spinner-border-sm';
                spinner.setAttribute('role', 'status');
                spinner.innerHTML = `<span class="visually-hidden">Loading...</span>`;
                button.prepend(spinner);
            } else {
                // Restore text on all buttons
                span.style.display = 'inline';
            }
        });
    }


    /**
     * Displays a message to the user.
     * @param {string} message - The message to display.
     * @param {string} type - The type of message ('success', 'danger', 'warning', 'info').
     */
    function showMessage(message, type = 'danger') {
        messageBox.textContent = message;
        messageBox.className = `alert alert-${type}`;
        messageBox.style.display = 'block';
        // Automatically hide after 4 seconds
        setTimeout(() => {
            messageBox.style.display = 'none';
        }, 4000);
    }

    /**
     * Fetches data with exponential backoff retry.
     * @param {string} url - The URL to fetch.
     * @param {object} options - The fetch options.
     * @param {number} maxRetries - Maximum number of retries.
     * @returns {Promise<Response>} - The fetch response.
     */
    async function fetchWithRetry(url, options, maxRetries = 3) {
        let lastError = null;
        for (let i = 0; i < maxRetries; i++) {
            try {
                const response = await fetch(url, options);
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error?.message || `HTTP error! status: ${response.status}`);
                }
                return response; // Success
            } catch (error) {
                lastError = error;
                // Don't log retries to console as errors
                const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        throw lastError; // Throw the last error after all retries
    }

    /**
     * Main handler for the submit button click.
     * @param {'translate' | 'proofread'} toolType - The action to perform.
     */
    async function handleSubmit(toolType) {
        showLoading(true, toolType);
        outputTextDisplay.textContent = '';
        outputPlaceholder.style.display = 'block';
        messageBox.style.display = 'none';

        // --- 1. Get All Values ---
        const model = modelSelect;
        const sourceLangCode = sourceLangSelect.value;
        const targetLangCode = targetLangSelect.value;
        const inputText = inputTextarea.value.trim();

        const sourceLangName = languages[sourceLangCode];
        const targetLangName = languages[targetLangCode];

        // --- 2. Validate Inputs ---
        if (!GEMINI_API_KEY) {
            showMessage('API Key is missing. Please add it to the script.js file.', 'danger');
            showLoading(false);
            return;
        }
        if (!inputText) {
            showMessage('Please enter some text to process.', 'warning');
            showLoading(false);
            return;
        }

        // --- 3. Engineer the Prompt ---
        let systemInstruction = "";
        if (toolType === 'translate') {
            systemInstruction = `You are an expert translator. Translate the following text from ${sourceLangName} to ${targetLangName}. Provide *only* the translated text, without any explanation, preamble, or markdown formatting.`;
        } else { // 'proofread'
            systemInstruction = `You are an expert proofreader and editor. Correct the following ${sourceLangName} text for grammar, spelling, punctuation, and clarity. Provide *only* the corrected text, without any explanation, preamble, or markdown formatting.`;
        }

        // --- 4. Construct API Payload ---
        const apiUrl = `${API_URL_BASE}${model}:generateContent?key=${GEMINI_API_KEY}`;
        const payload = {
            "systemInstruction": {
                "parts": [{ "text": systemInstruction }]
            },
            "contents": [
                { "parts": [{ "text": inputText }] }
            ]
        };

        const fetchOptions = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        };

        // --- 5. Call API and Handle Response ---
        try {
            const response = await fetchWithRetry(apiUrl, fetchOptions);
            const result = await response.json();

            if (result.candidates && result.candidates.length > 0) {
                const outputText = result.candidates[0].content.parts[0].text;
                outputTextDisplay.textContent = outputText.trim();
                outputPlaceholder.style.display = 'none';
            } else {
                showMessage(result.error?.message || 'No valid response from API. Check your prompt or API key.');
            }

        } catch (error) {
            console.error('API Call Failed:', error);
            showMessage(`An error occurred: ${error.message}`);
        } finally {
            showLoading(false);
        }
    }

    // --- Event Listeners ---
    inputTextarea.addEventListener('input', updateCharCount);
    swapLangButton.addEventListener('click', swapLanguages);
    copyButton.addEventListener('click', copyOutput);
    proofreadButton.addEventListener('click', () => handleSubmit('proofread'));
    translateButton.addEventListener('click', () => handleSubmit('translate'));

    // --- Initial Setup ---
    populateLanguageSelects();
    updateCharCount(); // Set initial count
});