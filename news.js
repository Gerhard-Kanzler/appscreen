// News content loader and renderer. Shared between index.html (badge) and news.html (page).

let _newsCache = null;

async function loadNewsMarkdown() {
    if (_newsCache !== null) return _newsCache;
    try {
        const res = await fetch('news.md', { cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        _newsCache = await res.text();
    } catch (err) {
        console.warn('Failed to load news.md:', err);
        _newsCache = '';
    }
    return _newsCache;
}

// Tiny markdown -> HTML converter for the news page.
// Supports: # h1 -> section, ## h2 -> feature heading, lists (-), **bold**, `code`,
// [text](url), ![alt](url) images, paragraphs.
function renderNewsMarkdown(md) {
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const inline = s => esc(s)
        .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" loading="lazy">')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

    const lines = md.replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let para = [];
    let list = null;
    let sectionOpen = false;

    const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(' '))}</p>`); para = []; } };
    const flushList = () => { if (list) { out.push(`<ul>${list.map(li => `<li>${inline(li)}</li>`).join('')}</ul>`); list = null; } };
    const closeSection = () => { if (sectionOpen) { out.push('</section>'); sectionOpen = false; } };

    for (const raw of lines) {
        const line = raw.trim();
        if (!line) { flushPara(); flushList(); continue; }
        const h2 = line.match(/^#\s+(.+)/);
        const h3 = line.match(/^##\s+(.+)/);
        const li = line.match(/^[-*]\s+(.+)/);
        if (h2) {
            flushPara(); flushList(); closeSection();
            out.push(`<section class="news-section"><h2>${inline(h2[1])}</h2>`);
            sectionOpen = true;
        }
        else if (h3) { flushPara(); flushList(); out.push(`<h3>${inline(h3[1])}</h3>`); }
        else if (li) { flushPara(); (list = list || []).push(li[1]); }
        else { flushList(); para.push(line); }
    }
    flushPara();
    flushList();
    closeSection();
    return out.join('\n');
}

function newsFingerprint(md) {
    // Cheap, stable, no crypto: first H1 line + length.
    const first = (md.split('\n').find(l => /^#\s+/.test(l)) || '').trim();
    return `${first}|${md.length}`;
}
