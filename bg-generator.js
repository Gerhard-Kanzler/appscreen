// AI Background Generator using OpenAI gpt-image-2
// Copyright (c) 2026 Gerhard Kanzler — MIT (see LICENSE)

const BG_BASE_INSTRUCTION =
    'Subtle minimal background image for an App Store marketing screenshot. ' +
    'This image will be used ONLY as a BACKGROUND — iPhone device mockups and headline text ' +
    'will be overlaid on top, so the background MUST stay quiet, calm, and non-distracting. ' +
    'Low contrast, smooth, atmospheric, designed to recede visually behind foreground content. ' +
    'No focal points, no sharp details, no busy areas, no figures, no objects. ' +
    'No text, no logos, no UI elements, no device frames. ' +
    'Portrait orientation, seamless edges, suitable as a backdrop. ';

const BG_STYLE_PRESETS = [
    {
        id: 'subtle-dark',
        label: 'Subtle Dark',
        description: 'Deep dark, quiet, recessive',
        color: '#0e1318',
        style: 'Deep matte near-black background with a very subtle cool gradient. ' +
            'Charcoal and dark navy tones, minimal variation, slight darkening toward the edges. ' +
            'Calm, restrained, premium feel.'
    },
    {
        id: 'soft-light',
        label: 'Soft Light',
        description: 'Airy pastel, low contrast',
        color: '#f0e7dc',
        style: 'Soft warm light background, gentle pastel gradient. ' +
            'Cream, ivory, and faint peach tones with the smallest hint of rose. ' +
            'Airy, bright, low contrast, calming.'
    },
    {
        id: 'warm-glow',
        label: 'Warm Glow',
        description: 'Dark with warm bottom light',
        color: '#1a1208',
        style: 'Dark background with a very soft warm amber/golden glow rising gently from ' +
            'the bottom and fading into deep brown-black at the top. ' +
            'Subtle vignette at the corners. Restrained, cinematic.'
    },
    {
        id: 'cool-gradient',
        label: 'Cool Gradient',
        description: 'Smooth muted color blend',
        color: '#1d2540',
        style: 'Smooth muted gradient blending deep blue, soft violet, and a touch of teal. ' +
            'Soft fluid transitions, low saturation, no harsh color shifts. Modern and calm.'
    },
    {
        id: 'custom',
        label: 'Custom',
        description: 'Your prompt defines the full style',
        color: '#2a1a3a',
        style: null  // Uses customText verbatim
    }
];

const CACHE_KEY = 'appscreen_bg_gen_cache';

const BG_PATTERNS = [
    { id: 'none', label: 'None', prompt: '' },
    { id: 'diagonal', label: '⁄⁄ Lines', prompt: 'Overlay a clearly visible but subtle diagonal pinstripe pattern across the ENTIRE image — thin parallel lines at roughly 45 degrees, evenly spaced and uniform throughout. The lines should be a recognizable design element, not invisible.' },
    { id: 'grid', label: '▦ Grid', prompt: 'Overlay a clearly visible but subtle fine grid pattern across the ENTIRE image — thin perpendicular lines forming evenly spaced square cells. The grid should be a recognizable design element, not invisible.' },
    { id: 'hexagon', label: '⬡ Hex', prompt: 'Overlay a clearly visible but subtle hexagonal honeycomb pattern across the ENTIRE image — outlined hexagons tiled evenly across the surface. The hexagons should be a recognizable design element, not invisible.' },
    { id: 'dots', label: '· · Dots', prompt: 'Overlay a clearly visible but subtle dot pattern across the ENTIRE image — small circles evenly spaced in a regular grid. The dots should be a recognizable design element, not invisible.' },
    { id: 'waves', label: '∿ Waves', prompt: 'Overlay clearly visible but subtle horizontal wavy line patterns across the ENTIRE image — smooth flowing wave lines repeating across the height. The waves should be a recognizable design element, not invisible.' },
    { id: 'grain', label: '▒ Grain', prompt: 'Apply a clearly visible film grain texture across the ENTIRE image, lending a tactile noisy quality. The grain should be a recognizable element, not invisible.' }
];

let _selectedPattern = 'none';

const _bgGenResults = new Map();

function showBgGeneratorModal() {
    const openaiKey = localStorage.getItem('openaiApiKey');
    if (!openaiKey) {
        showAppAlert('OpenAI API key required for background generation (gpt-image-2).\nPlease add it in Settings.', 'error');
        return;
    }

    // Restore cache (in-memory persists across opens; also reload from localStorage)
    const cache = loadCache();
    if (cache) {
        _bgGenResults.clear();
        for (const [id, dataUrl] of Object.entries(cache.images || {})) {
            _bgGenResults.set(id, dataUrl);
        }
        if (cache.pattern) _selectedPattern = cache.pattern;
    }

    // Restore prompt text first so initial Custom card state reflects it
    const promptEl = document.getElementById('bg-generator-prompt');
    if (cache && cache.prompt) promptEl.value = cache.prompt;
    const promptHasText = promptEl.value.trim().length > 0;

    // Build the card grid (cached images shown if present, otherwise placeholders)
    document.getElementById('bg-generator-grid').innerHTML = BG_STYLE_PRESETS.map(p => `
        <div class="bg-gen-card${p.id === 'custom' ? ' bg-gen-card-wide' : ''}" id="bg-gen-card-${p.id}"></div>
    `).join('');
    BG_STYLE_PRESETS.forEach(p => {
        if (_bgGenResults.has(p.id)) renderCardState(p, 'ready');
        else if (p.id === 'custom' && !promptHasText) renderCardState(p, 'disabled');
        else renderCardState(p, 'idle');
    });

    // Build pattern chip selector
    const chipsContainer = document.getElementById('bg-gen-pattern-chips');
    chipsContainer.innerHTML = BG_PATTERNS.map(p => `
        <button type="button" class="bg-gen-pattern-chip${p.id === _selectedPattern ? ' active' : ''}" data-pattern="${p.id}">${p.label}</button>
    `).join('');
    chipsContainer.querySelectorAll('.bg-gen-pattern-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            _selectedPattern = chip.dataset.pattern;
            chipsContainer.querySelectorAll('.bg-gen-pattern-chip').forEach(c => c.classList.toggle('active', c === chip));
        });
    });

    const regenBtn = document.getElementById('bg-generator-regen');
    regenBtn.textContent = _bgGenResults.size > 0 ? 'Regenerate' : 'Generate';
    regenBtn.disabled = false;
    document.getElementById('bg-generator-modal').classList.add('visible');
}

// Render a card in one of: 'idle' (placeholder), 'loading' (spinner), 'ready' (image), 'error', 'disabled'
function renderCardState(preset, state) {
    const card = document.getElementById(`bg-gen-card-${preset.id}`);
    if (!card) return;

    card.className = `bg-gen-card${preset.id === 'custom' ? ' bg-gen-card-wide' : ''} bg-gen-card-${state}`;

    if (state === 'ready') {
        const dataUrl = _bgGenResults.get(preset.id);
        card.innerHTML = `
            <img src="${dataUrl}" class="bg-gen-img" alt="${preset.label}">
            <div class="bg-gen-card-overlay">
                <span class="bg-gen-card-name">${preset.label}</span>
                <button class="bg-gen-apply-btn">Apply</button>
            </div>
        `;
        card.querySelector('.bg-gen-apply-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            applyGeneratedBackground(preset.id);
        });
        card.addEventListener('click', () => applyGeneratedBackground(preset.id));
        card.addEventListener('mouseenter', () => showHoverPreview(dataUrl, preset.label));
        card.addEventListener('mouseleave', hideHoverPreview);
    } else if (state === 'loading') {
        card.innerHTML = `
            <div class="bg-gen-spinner-wrap" style="background:${preset.color};">
                <div class="bg-gen-spinner"></div>
                <div class="bg-gen-spinner-label">${preset.label}</div>
            </div>
        `;
    } else if (state === 'error') {
        card.innerHTML = `
            <div class="bg-gen-error-wrap" style="background:${preset.color};">
                <div class="bg-gen-error-label">${preset.label}</div>
                <div class="bg-gen-error-msg">Generation failed</div>
            </div>
        `;
    } else if (state === 'disabled') {
        card.innerHTML = `
            <div class="bg-gen-placeholder" style="background:${preset.color}; opacity: 0.55;">
                <div class="bg-gen-placeholder-label">${preset.label}</div>
                <div class="bg-gen-placeholder-desc">Enter a prompt above to enable</div>
            </div>
        `;
    } else { // idle
        card.innerHTML = `
            <div class="bg-gen-placeholder" style="background:${preset.color};">
                <div class="bg-gen-placeholder-label">${preset.label}</div>
                <div class="bg-gen-placeholder-desc">${preset.description}</div>
            </div>
        `;
    }
}

function hideBgGeneratorModal() {
    document.getElementById('bg-generator-modal').classList.remove('visible');
    hideHoverPreview();
}

function showHoverPreview(dataUrl, label) {
    const preview = document.getElementById('bg-gen-hover-preview');
    preview.innerHTML = `<img src="${dataUrl}" alt="${label}"><span class="bg-gen-hover-label">${label}</span>`;
    preview.classList.add('visible');
}

function hideHoverPreview() {
    const preview = document.getElementById('bg-gen-hover-preview');
    if (preview) preview.classList.remove('visible');
}

function buildPrompt(preset, customText) {
    const patternObj = BG_PATTERNS.find(p => p.id === _selectedPattern);
    const patternText = patternObj && patternObj.prompt ? ' ' + patternObj.prompt : '';

    if (preset.id === 'custom') {
        // Custom slot: user's text defines the full style; only base instruction + pattern are shared
        return BG_BASE_INSTRUCTION + 'Style (user-defined): ' + customText + patternText;
    }

    const contextLine = customText
        ? `App context for tonal matching: ${customText}. The background should feel right for this app, but it remains a quiet backdrop only — do not depict the app itself. `
        : '';

    return BG_BASE_INSTRUCTION + contextLine + 'Style: ' + preset.style + patternText;
}

// ─── Cache ──────────────────────────────────────────────────────────────────

function saveCache() {
    try {
        const images = {};
        for (const [id, dataUrl] of _bgGenResults) images[id] = dataUrl;
        const payload = JSON.stringify({
            images,
            prompt: document.getElementById('bg-generator-prompt')?.value || '',
            pattern: _selectedPattern,
            ts: Date.now()
        });
        localStorage.setItem(CACHE_KEY, payload);
    } catch (e) {
        console.warn('bg-gen cache save failed:', e.message);
    }
}

function loadCache() {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

async function generateSingleBackground(apiKey, preset, customText) {
    const finalPrompt = buildPrompt(preset, customText);
    console.log(`[bg-gen → ${preset.id}] pattern="${_selectedPattern}"`, finalPrompt);

    const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'gpt-image-2',
            prompt: finalPrompt,
            n: 1,
            size: '1024x1536',
            quality: 'medium',
            output_format: 'jpeg',
            output_compression: 85
        })
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        if (response.status === 401 || response.status === 403) throw new Error('AI_UNAVAILABLE');
        throw new Error(err.error?.message || `API error ${response.status}`);
    }

    const data = await response.json();
    return `data:image/jpeg;base64,${data.data[0].b64_json}`;
}

async function runBgGeneration(apiKey) {
    const regenBtn = document.getElementById('bg-generator-regen');
    regenBtn.disabled = true;

    const customText = document.getElementById('bg-generator-prompt').value.trim();

    // Decide which presets to generate. Custom slot is skipped if prompt is empty.
    const presetsToRun = BG_STYLE_PRESETS.filter(p => p.id !== 'custom' || customText);

    // Mark targets loading; disable Custom slot if no prompt
    BG_STYLE_PRESETS.forEach(p => {
        if (p.id === 'custom' && !customText) renderCardState(p, 'disabled');
        else renderCardState(p, 'loading');
    });

    const results = await Promise.allSettled(
        presetsToRun.map(p => generateSingleBackground(apiKey, p, customText))
    );

    results.forEach((result, i) => {
        const preset = presetsToRun[i];
        if (result.status === 'fulfilled') {
            _bgGenResults.set(preset.id, result.value);
            renderCardState(preset, 'ready');
        } else {
            console.error(`bg-gen ${preset.id} failed:`, result.reason);
            renderCardState(preset, 'error');
        }
    });

    saveCache();

    regenBtn.textContent = 'Regenerate';
    regenBtn.disabled = false;
}

function applyGeneratedBackground(presetId) {
    const dataUrl = _bgGenResults.get(presetId);
    if (!dataUrl) return;

    const img = new Image();
    img.onload = () => {
        setBackground('type', 'image');
        setBackground('image', img);
        setBackground('imageFit', 'cover');

        const preview = document.getElementById('bg-image-preview');
        preview.src = dataUrl;
        preview.style.display = 'block';

        syncUIWithState();
        updateCanvas();
        hideBgGeneratorModal();
    };
    img.src = dataUrl;
}

// Wire up event listeners once DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('bg-ai-generate-btn')
        .addEventListener('click', showBgGeneratorModal);

    document.getElementById('bg-generator-cancel')
        .addEventListener('click', hideBgGeneratorModal);

    document.getElementById('bg-generator-modal')
        .addEventListener('click', (e) => {
            if (e.target.id === 'bg-generator-modal') hideBgGeneratorModal();
        });

    document.getElementById('bg-generator-regen')
        .addEventListener('click', () => {
            const apiKey = localStorage.getItem('openaiApiKey');
            if (apiKey) runBgGeneration(apiKey);
        });

    // Live-update the Custom card placeholder as the user types
    document.getElementById('bg-generator-prompt')
        .addEventListener('input', (e) => {
            const customPreset = BG_STYLE_PRESETS.find(p => p.id === 'custom');
            if (!customPreset) return;
            const hasText = e.target.value.trim().length > 0;
            const hasCached = _bgGenResults.has('custom');
            if (hasCached) return; // don't disturb a cached result
            renderCardState(customPreset, hasText ? 'idle' : 'disabled');
        });
});
