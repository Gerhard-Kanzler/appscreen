// LLM Provider Configuration
// Centralized configuration for all AI translation providers and models
// Copyright (c) 2024 YUZUHub, (c) 2026 Gerhard Kanzler — MIT (see LICENSE)

const llmProviders = {
    anthropic: {
        name: 'Anthropic (Claude)',
        keyPrefix: 'sk-ant-',
        storageKey: 'claudeApiKey',
        modelStorageKey: 'anthropicModel',
        models: [
            { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5 ($)' },
            { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5 ($$)' },
            { id: 'claude-opus-4-5-20251101', name: 'Claude Opus 4.5 ($$$)' }
        ],
        defaultModel: 'claude-sonnet-4-5-20250929'
    },
    openai: {
        name: 'OpenAI (GPT)',
        keyPrefix: 'sk-',
        storageKey: 'openaiApiKey',
        modelStorageKey: 'openaiModel',
        models: [
            { id: 'gpt-5.1-2025-11-13', name: 'GPT-5.1 ($$$)' },
            { id: 'gpt-5-mini-2025-08-07', name: 'GPT-5 Mini ($$)' },
            { id: 'gpt-5-nano-2025-08-07', name: 'GPT-5 Nano ($)' }
        ],
        defaultModel: 'gpt-5-mini-2025-08-07'
    },
    google: {
        name: 'Google (Gemini)',
        keyPrefix: 'AIza',
        storageKey: 'googleApiKey',
        modelStorageKey: 'googleModel',
        models: [
            { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (Preview) ($$)' },
            { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro (Preview) ($$$)' },
            { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite ($)' },
            { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash ($$)' },
            { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro ($$$)' }
        ],
        defaultModel: 'gemini-2.5-flash'
    }
};

/**
 * Get the selected model for a provider
 * @param {string} provider - Provider key (anthropic, openai, google)
 * @returns {string} - Model ID
 */
function getSelectedModel(provider) {
    const config = llmProviders[provider];
    if (!config) return null;
    return localStorage.getItem(config.modelStorageKey) || config.defaultModel;
}

/**
 * Get the selected provider
 * @returns {string} - Provider key
 */
function getSelectedProvider() {
    return localStorage.getItem('aiProvider') || 'anthropic';
}

/**
 * Get API key for a provider
 * @param {string} provider - Provider key
 * @returns {string|null} - API key or null
 */
function getApiKey(provider) {
    const config = llmProviders[provider];
    if (!config) return null;
    return localStorage.getItem(config.storageKey);
}

/**
 * Validate API key format for a provider
 * @param {string} provider - Provider key
 * @param {string} key - API key to validate
 * @returns {boolean} - Whether key format is valid
 */
function validateApiKeyFormat(provider, key) {
    const config = llmProviders[provider];
    if (!config) return false;
    return key.startsWith(config.keyPrefix);
}

/**
 * Generate HTML options for model select dropdown
 * @param {string} provider - Provider key
 * @param {string} selectedModel - Currently selected model ID (optional)
 * @param {Array} modelsOverride - Optional list of {id, name} to use instead of the static config
 * @returns {string} - HTML string of option elements
 */
function generateModelOptions(provider, selectedModel = null, modelsOverride = null) {
    const config = llmProviders[provider];
    if (!config) return '';

    const selected = selectedModel || getSelectedModel(provider);
    const models = modelsOverride || config.models;
    return models.map(model =>
        `<option value="${model.id}"${model.id === selected ? ' selected' : ''}>${model.name}</option>`
    ).join('\n');
}

/**
 * Fetch available chat/text models from a provider's API.
 * Filters to models suitable for text generation and returns [{id, name}].
 * Throws on network / auth errors so callers can show status.
 * @param {string} provider - Provider key (anthropic, openai, google)
 * @param {string} apiKey - API key for the provider
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
async function fetchProviderModels(provider, apiKey) {
    if (!apiKey) throw new Error('Missing API key');

    if (provider === 'anthropic') {
        const res = await fetch('https://api.anthropic.com/v1/models?limit=100', {
            method: 'GET',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return (data.data || [])
            .filter(m => typeof m.id === 'string' && m.id.startsWith('claude-'))
            .map(m => ({ id: m.id, name: m.display_name || m.id }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    if (provider === 'openai') {
        const res = await fetch('https://api.openai.com/v1/models', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const blocklist = ['instruct', 'embedding', 'embed', 'whisper', 'tts', 'dall-e', 'image', 'audio', 'realtime', 'transcribe', 'moderation', 'davinci', 'babbage', 'search'];
        return (data.data || [])
            .filter(m => typeof m.id === 'string' && m.id.startsWith('gpt-'))
            .filter(m => !blocklist.some(term => m.id.toLowerCase().includes(term)))
            .map(m => ({ id: m.id, name: m.id }))
            .sort((a, b) => b.id.localeCompare(a.id));
    }

    if (provider === 'google') {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=200`, {
            method: 'GET'
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return (data.models || [])
            .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
            .filter(m => typeof m.name === 'string' && m.name.includes('gemini'))
            .filter(m => !/embedding|aqa|imagen|vision-only/i.test(m.name))
            .map(m => {
                const id = m.name.replace(/^models\//, '');
                return { id, name: m.displayName || id };
            })
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    throw new Error(`Unknown provider: ${provider}`);
}
