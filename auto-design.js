// Copyright (c) 2026 Gerhard Kanzler — MIT (see LICENSE)
// Auto Design — one-click AI orchestration of:
//   1. Vision-based per-screenshot plan (3D mode, device, position preset, headlines)
//   2. AI-generated tonally matched background via gpt-image-2
//   3. Translation into all project languages
//
// Relies on helpers from magical-titles.js (image collection, provider calls)
// and bg-generator.js (BG_BASE_INSTRUCTION).

const AUTO_DESIGN_POSITION_PRESETS = [
    'centered', 'bleed-bottom', 'bleed-top', 'float-center',
    'tilt-left', 'tilt-right', 'perspective', 'float-bottom'
];
const AUTO_DESIGN_DEVICE_3D_IDS = ['iphone', 'samsung'];

async function runAutoDesign() {
    // ─── Prereq checks ────────────────────────────────────────────────────
    if (!state.screenshots || state.screenshots.length === 0) {
        await showAppAlert('Add some screenshots first.', 'info');
        return;
    }

    const provider = getSelectedProvider();
    const providerConfig = llmProviders[provider];
    const apiKey = localStorage.getItem(providerConfig.storageKey);
    if (!apiKey) {
        await showAppAlert(`Add your ${providerConfig.name} API key in Settings first.`, 'error');
        return;
    }

    const openaiKey = localStorage.getItem('openaiApiKey');
    const willGenerateBackground = !!openaiKey;
    const willTranslate = state.projectLanguages.length > 1;

    // ─── Progress overlay ─────────────────────────────────────────────────
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay visible';
    overlay.id = 'auto-design-progress';
    overlay.innerHTML = `
        <div class="modal" style="text-align: center; min-width: 360px;">
            <div class="modal-icon" style="background: linear-gradient(135deg, rgba(10,132,255,0.2) 0%, rgba(120,60,220,0.2) 100%);">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: #7c3aed; animation: spin 1.4s linear infinite;">
                    <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7-6.3-4.6L5.7 21l2.3-7-6-4.6h7.6z"/>
                </svg>
            </div>
            <h3 class="modal-title">Auto Designing…</h3>
            <p class="modal-message" id="auto-design-status">Starting…</p>
            <p class="modal-message" id="auto-design-detail" style="font-size: 12px; color: var(--text-tertiary); margin-top: 8px;"></p>
        </div>
    `;
    document.body.appendChild(overlay);

    const setStatus = (status, detail = '') => {
        const s = document.getElementById('auto-design-status');
        const d = document.getElementById('auto-design-detail');
        if (s) s.textContent = status;
        if (d) d.textContent = detail;
    };

    try {
        // ─── Step 1: Vision plan ──────────────────────────────────────────
        setStatus('Analyzing screenshots…', `${state.screenshots.length} images via ${providerConfig.name}`);
        const plan = await generateAutoDesignPlan(provider, apiKey);
        console.log('Auto Design plan:', plan);

        // ─── Step 2: Generate background (optional) ───────────────────────
        let bgLuminance = null;
        if (willGenerateBackground && plan.background_prompt) {
            setStatus('Generating background…', 'Using gpt-image-2');
            try {
                bgLuminance = await generateAndApplyAutoBackground(openaiKey, plan.background_prompt);
            } catch (bgErr) {
                console.warn('Background generation failed, continuing without:', bgErr);
            }
        }

        // ─── Step 3: Apply per-screenshot plan ────────────────────────────
        setStatus('Applying design…', 'Setting 3D mode, position presets, headlines');
        applyAutoDesignPlan(plan);

        // ─── Step 3b: Contrast safety — override text color if AI's
        // planned theme doesn't match the BG that was actually generated.
        if (bgLuminance !== null) {
            const planSaidLight = plan.text_theme !== 'dark';
            const bgIsLight = bgLuminance > 0.55;
            const mismatch = (planSaidLight && bgIsLight) || (!planSaidLight && !bgIsLight);
            if (mismatch) {
                console.log(`[auto-design] contrast override — bg lum ${bgLuminance.toFixed(2)}, plan said theme="${plan.text_theme}"`);
                applyContrastSafety(bgLuminance);
            }
        }

        // ─── Step 4: Translations (if multi-lang) ─────────────────────────
        if (willTranslate) {
            setStatus('Translating…', `Into ${state.projectLanguages.length - 1} more languages`);
            try {
                await autoDesignTranslate(provider, apiKey);
            } catch (txErr) {
                console.warn('Translation failed:', txErr);
            }
        }

        overlay.remove();
        const parts = [`${state.screenshots.length} screenshots designed`];
        if (willGenerateBackground) parts.push('background generated');
        if (willTranslate) parts.push(`translated to ${state.projectLanguages.length} languages`);
        await showAppAlert('✨ Auto Design complete — ' + parts.join(' · '), 'success');

    } catch (error) {
        console.error('Auto Design error:', error);
        overlay.remove();
        if (error.message === 'AI_UNAVAILABLE') {
            await showAppAlert('AI service unavailable. Check your API key in Settings.', 'error');
        } else {
            await showAppAlert('Auto Design failed: ' + error.message, 'error');
        }
    }
}

// ─── Step 1: Vision-based plan ─────────────────────────────────────────────

async function generateAutoDesignPlan(provider, apiKey) {
    const sourceLang = state.projectLanguages[0] || 'en';
    const langName = languageNames[sourceLang] || 'English';

    // Collect & compress images (reuse helpers from magical-titles.js)
    const images = [];
    for (const screenshot of state.screenshots) {
        const dataUrl = getScreenshotDataUrl(screenshot, sourceLang);
        if (!dataUrl) continue;
        const compressed = await compressImageForAI(dataUrl);
        if (compressed) images.push(compressed);
    }

    if (images.length === 0) {
        throw new Error('No screenshot images available');
    }

    const prompt = `You are an expert App Store screenshot designer. Analyze these ${images.length} app screenshots and design a complete, cohesive App Store marketing campaign.

Study the app's purpose, target audience, and key features. Then design ${images.length} screenshots that work together as one campaign.

For EACH screenshot, decide:
1. "use3D" (boolean): Should this screenshot use a 3D device mockup? Recommended: true for the hero (index 0) and 1–2 feature highlights; false for the rest to keep visual variety.
2. "device3D" (string): "iphone" or "samsung". Default to "iphone" unless the screenshot UI clearly looks like Android.
3. "position_preset" (string): One of: "centered", "bleed-bottom", "bleed-top", "float-center", "tilt-left", "tilt-right", "perspective", "float-bottom". Vary across screenshots — do NOT use "centered" for every slide; create visual rhythm. Use "perspective" or "bleed-*" sparingly for impact.
4. "headline" (string): Marketing headline, MAX 2–4 words. Punchy, benefit-focused.
5. "subheadline" (string): Supporting line, MAX 4–8 words. Elaborates the headline.

Also design at the project level:
- "project_theme" (string): 2–3 word theme summarizing the campaign
- "background_prompt" (string): A short tonal description for AI background generation — describe the MOOD and TONE the background should match (e.g. "calm minimalist meditation app, soft warm tones" or "energetic fitness, dark with vibrant accents"). Just mood, no specific shapes/textures — those are handled by the background generator.
- "text_theme" (string): "light" or "dark". MUST match the background you describe: pick "light" (white text) for any DARK background (charcoal, navy, black, deep tones), pick "dark" (near-black text) for any LIGHT background (pastel, cream, ivory, soft tones). Headlines and subheadlines must remain readable against the background.

CRITICAL:
- The hero (index 0) MUST focus on the main value proposition / problem the app solves
- Each screenshot needs UNIQUE headlines — no repetition
- Subheadlines should support the headline, not restate it
- All texts in ${langName}
- Use varied position presets across screenshots
- Keep texts SHORT — they appear on small screens
- text_theme MUST contrast with background_prompt — readability is mandatory

Return ONLY valid JSON, no markdown, no explanation:
{
  "project_theme": "...",
  "background_prompt": "...",
  "text_theme": "light",
  "screenshots": [
    { "use3D": true, "device3D": "iphone", "position_preset": "centered", "headline": "...", "subheadline": "..." },
    { "use3D": false, "device3D": "iphone", "position_preset": "tilt-right", "headline": "...", "subheadline": "..." }
  ]
}

The "screenshots" array MUST have exactly ${images.length} entries in the same order as the input.`;

    let responseText;
    if (provider === 'anthropic') {
        responseText = await generateTitlesWithAnthropic(apiKey, images, prompt);
    } else if (provider === 'openai') {
        responseText = await generateTitlesWithOpenAI(apiKey, images, prompt);
    } else if (provider === 'google') {
        responseText = await generateTitlesWithGoogle(apiKey, images, prompt);
    } else {
        throw new Error(`Unknown provider: ${provider}`);
    }

    // Strip markdown code fences and extract JSON
    responseText = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) responseText = jsonMatch[0];

    return JSON.parse(responseText);
}

// ─── Step 2: Background generation ─────────────────────────────────────────

async function generateAndApplyAutoBackground(openaiKey, contextPrompt) {
    const fullPrompt = BG_BASE_INSTRUCTION +
        `Style: ${contextPrompt}. Smooth, calm, atmospheric, low contrast — must recede behind foreground iPhone mockups and headlines.`;

    console.log('[auto-design → background]', fullPrompt);

    const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiKey}`
        },
        body: JSON.stringify({
            model: 'gpt-image-2',
            prompt: fullPrompt,
            n: 1,
            size: '1024x1536',
            quality: 'medium',
            output_format: 'jpeg',
            output_compression: 85
        })
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `Background API error ${response.status}`);
    }

    const data = await response.json();
    const dataUrl = `data:image/jpeg;base64,${data.data[0].b64_json}`;

    // Load image and apply to all screenshots
    const img = new Image();
    await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = dataUrl;
    });

    for (const screenshot of state.screenshots) {
        if (!screenshot.background) screenshot.background = {};
        screenshot.background.type = 'image';
        screenshot.background.image = img;
        screenshot.background.imageFit = 'cover';
    }

    // Reflect in sidebar preview
    const preview = document.getElementById('bg-image-preview');
    if (preview) {
        preview.src = dataUrl;
        preview.style.display = 'block';
    }

    // Return the actual image luminance so the caller can sanity-check
    // text color against the BG that was actually generated.
    return sampleImageLuminance(img);
}

// Returns 0..1 — Rec. 709 luminance averaged across a downsampled grid.
function sampleImageLuminance(img) {
    const W = 40, H = 60;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, W, H);
    const data = ctx.getImageData(0, 0, W, H).data;
    let total = 0;
    const samples = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
        total += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    }
    return total / samples;
}

// Override text colors based on actual background luminance.
// Threshold 0.55 slightly favors light text on borderline backgrounds.
function applyContrastSafety(luminance) {
    const headlineColor = luminance > 0.55 ? '#1a1a1a' : '#ffffff';
    const subheadlineColor = luminance > 0.55 ? '#333333' : '#ffffff';
    for (const screenshot of state.screenshots) {
        if (!screenshot.text) screenshot.text = { headlines: {}, subheadlines: {} };
        screenshot.text.headlineColor = headlineColor;
        screenshot.text.subheadlineColor = subheadlineColor;
    }
    syncUIWithState();
    updateCanvas();
    saveState();
}

// ─── Step 3: Apply per-screenshot plan ─────────────────────────────────────

function applyAutoDesignPlan(plan) {
    const sourceLang = state.projectLanguages[0] || 'en';
    const screenshotPlans = Array.isArray(plan.screenshots) ? plan.screenshots : [];

    // Pick text colors from the project-level theme. Fallback to 'light' (white)
    // if AI didn't specify — matches current state defaults.
    const theme = plan.text_theme === 'dark' ? 'dark' : 'light';
    const headlineColor = theme === 'dark' ? '#1a1a1a' : '#ffffff';
    const subheadlineColor = theme === 'dark' ? '#333333' : '#ffffff';

    for (let i = 0; i < state.screenshots.length; i++) {
        const sp = screenshotPlans[i];
        if (!sp) continue;

        const screenshot = state.screenshots[i];

        // 3D mode + device
        if (typeof sp.use3D === 'boolean') {
            screenshot.use3D = sp.use3D;
        }
        if (sp.device3D && AUTO_DESIGN_DEVICE_3D_IDS.includes(sp.device3D)) {
            screenshot.device3D = sp.device3D;
        }

        // Position preset (modifies screenshot.screenshot.{scale,x,y,rotation,perspective})
        if (sp.position_preset && AUTO_DESIGN_POSITION_PRESETS.includes(sp.position_preset)) {
            try {
                applyPositionPreset(i, sp.position_preset);
            } catch (e) {
                console.warn(`applyPositionPreset failed for index ${i}:`, e);
            }
        }

        // Headlines + subheadlines in source language
        if (!screenshot.text) screenshot.text = { headlines: {}, subheadlines: {} };
        if (!screenshot.text.headlines) screenshot.text.headlines = {};
        if (!screenshot.text.subheadlines) screenshot.text.subheadlines = {};

        if (sp.headline) {
            screenshot.text.headlines[sourceLang] = sp.headline;
            screenshot.text.headlineEnabled = true;
        }
        if (sp.subheadline) {
            screenshot.text.subheadlines[sourceLang] = sp.subheadline;
            screenshot.text.subheadlineEnabled = true;
        }

        // Text colors driven by project theme — readability over white-on-white
        screenshot.text.headlineColor = headlineColor;
        screenshot.text.subheadlineColor = subheadlineColor;
    }

    syncUIWithState();
    updateCanvas();
    saveState();
}

// ─── Step 4: Translate ─────────────────────────────────────────────────────

async function autoDesignTranslate(provider, apiKey) {
    const sourceLang = state.projectLanguages[0] || 'en';
    const targetLangs = state.projectLanguages.filter(l => l !== sourceLang);
    if (targetLangs.length === 0) return;

    // Collect texts to translate
    const texts = [];
    state.screenshots.forEach((screenshot, index) => {
        const text = screenshot.text || state.text;
        const headline = text.headlines?.[sourceLang] || '';
        if (headline.trim()) texts.push({ type: 'headline', screenshotIndex: index, text: headline });
        const sub = text.subheadlines?.[sourceLang] || '';
        if (sub.trim()) texts.push({ type: 'subheadline', screenshotIndex: index, text: sub });
    });

    if (texts.length === 0) return;

    // Build context-rich prompt (same format as translateAllText)
    const targetLangNames = targetLangs.map(l => `${languageNames[l]} (${l})`).join(', ');
    const groups = {};
    texts.forEach((item, i) => {
        if (!groups[item.screenshotIndex]) groups[item.screenshotIndex] = { headline: null, subheadline: null, indices: {} };
        groups[item.screenshotIndex][item.type] = item.text;
        groups[item.screenshotIndex].indices[item.type] = i;
    });

    let contextualTexts = '';
    Object.keys(groups).sort((a, b) => Number(a) - Number(b)).forEach(idx => {
        const g = groups[idx];
        contextualTexts += `\nScreenshot ${Number(idx) + 1}:\n`;
        if (g.headline !== null) contextualTexts += `  [${g.indices.headline}] Headline: "${g.headline}"\n`;
        if (g.subheadline !== null) contextualTexts += `  [${g.indices.subheadline}] Subheadline: "${g.subheadline}"\n`;
    });

    const prompt = `You are a professional translator for App Store screenshot marketing copy. Translate the following texts from ${languageNames[sourceLang]} to: ${targetLangNames}.

Headlines and subheadlines on the same screenshot must remain thematically consistent. Translations must be SHORT — similar length to originals. Marketing-focused, culturally appropriate, natural in each language.

Source texts (${languageNames[sourceLang]}):
${contextualTexts}

Respond ONLY with a JSON object:
{
  "0": {"de": "...", "fr": "...", ...},
  "1": {"de": "...", ...}
}
Where keys (0, 1, …) correspond to the [N] indices above.
Target language codes: ${targetLangs.join(', ')}`;

    let responseText;
    if (provider === 'anthropic') {
        responseText = await translateWithAnthropic(apiKey, prompt);
    } else if (provider === 'openai') {
        responseText = await translateWithOpenAI(apiKey, prompt);
    } else if (provider === 'google') {
        responseText = await translateWithGoogle(apiKey, prompt);
    }

    responseText = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) responseText = jsonMatch[0];

    const translations = JSON.parse(responseText);

    texts.forEach((item, index) => {
        const itemTranslations = translations[index] || translations[String(index)];
        if (!itemTranslations) return;
        const screenshot = state.screenshots[item.screenshotIndex];
        const text = screenshot.text || state.text;
        targetLangs.forEach(lang => {
            if (!itemTranslations[lang]) return;
            if (item.type === 'headline') {
                if (!text.headlines) text.headlines = {};
                text.headlines[lang] = itemTranslations[lang];
            } else {
                if (!text.subheadlines) text.subheadlines = {};
                text.subheadlines[lang] = itemTranslations[lang];
                text.subheadlineEnabled = true;
            }
        });
    });

    syncUIWithState();
    updateCanvas();
    saveState();
}

// ─── Wire up button ────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('auto-design-btn');
    if (btn) btn.addEventListener('click', runAutoDesign);
});
