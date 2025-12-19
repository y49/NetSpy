// ==========================================
// Response Viewer - Enhanced Content Rendering
// ==========================================

import { escapeHtml } from '../utils.js';

// ==========================================
// JSON Syntax Highlighting & Folding
// ==========================================

/**
 * Render JSON with syntax highlighting and collapsible nodes
 */
export function renderJsonTree(jsonString, container) {
    try {
        const data = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;
        const html = buildJsonHtml(data, 0, true);

        container.innerHTML = `
            <div class="json-viewer">
                <div class="json-toolbar">
                    <button class="json-btn" id="jsonExpandAll" title="Expand All">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <polyline points="9 21 3 21 3 15"></polyline>
                            <line x1="21" y1="3" x2="14" y2="10"></line>
                            <line x1="3" y1="21" x2="10" y2="14"></line>
                        </svg>
                    </button>
                    <button class="json-btn" id="jsonCollapseAll" title="Collapse All">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="4 14 10 14 10 20"></polyline>
                            <polyline points="20 10 14 10 14 4"></polyline>
                            <line x1="14" y1="10" x2="21" y2="3"></line>
                            <line x1="3" y1="21" x2="10" y2="14"></line>
                        </svg>
                    </button>
                    <input type="text" class="json-search" id="jsonSearch" placeholder="Search...">
                    <button class="json-btn" id="jsonCopy" title="Copy JSON">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                    </button>
                </div>
                <div class="json-content">${html}</div>
            </div>
        `;

        bindJsonEvents(container, jsonString);
    } catch (e) {
        // Fallback to plain text
        container.innerHTML = `<pre class="code-block">${escapeHtml(jsonString)}</pre>`;
    }
}

function buildJsonHtml(data, depth, isLast) {
    if (data === null) return '<span class="json-null">null</span>';
    if (data === undefined) return '<span class="json-undefined">undefined</span>';

    const type = typeof data;

    if (type === 'boolean') {
        return `<span class="json-boolean">${data}</span>`;
    }

    if (type === 'number') {
        return `<span class="json-number">${data}</span>`;
    }

    if (type === 'string') {
        const escaped = escapeHtml(data);
        // Check if it looks like a URL
        if (/^https?:\/\//.test(data)) {
            return `<span class="json-string json-url">"<a href="${escaped}" target="_blank">${escaped}</a>"</span>`;
        }
        return `<span class="json-string">"${escaped}"</span>`;
    }

    if (Array.isArray(data)) {
        if (data.length === 0) {
            return '<span class="json-bracket">[]</span>';
        }

        const items = data.map((item, i) => {
            const comma = i < data.length - 1 ? ',' : '';
            return `<div class="json-item">${buildJsonHtml(item, depth + 1, i === data.length - 1)}${comma}</div>`;
        }).join('');

        return `
            <span class="json-toggle json-expanded" data-depth="${depth}">▼</span>
            <span class="json-bracket">[</span>
            <span class="json-count">${data.length} items</span>
            <div class="json-collapsible">${items}</div>
            <span class="json-bracket">]</span>
        `;
    }

    if (type === 'object') {
        const keys = Object.keys(data);
        if (keys.length === 0) {
            return '<span class="json-bracket">{}</span>';
        }

        const items = keys.map((key, i) => {
            const comma = i < keys.length - 1 ? ',' : '';
            return `
                <div class="json-item">
                    <span class="json-key">"${escapeHtml(key)}"</span>
                    <span class="json-colon">:</span>
                    ${buildJsonHtml(data[key], depth + 1, i === keys.length - 1)}${comma}
                </div>
            `;
        }).join('');

        return `
            <span class="json-toggle json-expanded" data-depth="${depth}">▼</span>
            <span class="json-bracket">{</span>
            <span class="json-count">${keys.length} keys</span>
            <div class="json-collapsible">${items}</div>
            <span class="json-bracket">}</span>
        `;
    }

    return escapeHtml(String(data));
}

function bindJsonEvents(container, originalJson) {
    // Toggle collapse/expand
    container.querySelectorAll('.json-toggle').forEach(toggle => {
        toggle.addEventListener('click', () => {
            const collapsible = toggle.parentElement.querySelector('.json-collapsible');
            const count = toggle.parentElement.querySelector('.json-count');

            if (toggle.classList.contains('json-expanded')) {
                toggle.classList.remove('json-expanded');
                toggle.classList.add('json-collapsed');
                toggle.textContent = '▶';
                if (collapsible) collapsible.style.display = 'none';
                if (count) count.style.display = 'inline';
            } else {
                toggle.classList.remove('json-collapsed');
                toggle.classList.add('json-expanded');
                toggle.textContent = '▼';
                if (collapsible) collapsible.style.display = 'block';
                if (count) count.style.display = 'none';
            }
        });
    });

    // Expand all
    container.querySelector('#jsonExpandAll')?.addEventListener('click', () => {
        container.querySelectorAll('.json-toggle').forEach(toggle => {
            toggle.classList.remove('json-collapsed');
            toggle.classList.add('json-expanded');
            toggle.textContent = '▼';
        });
        container.querySelectorAll('.json-collapsible').forEach(el => el.style.display = 'block');
        container.querySelectorAll('.json-count').forEach(el => el.style.display = 'none');
    });

    // Collapse all
    container.querySelector('#jsonCollapseAll')?.addEventListener('click', () => {
        container.querySelectorAll('.json-toggle').forEach(toggle => {
            toggle.classList.remove('json-expanded');
            toggle.classList.add('json-collapsed');
            toggle.textContent = '▶';
        });
        container.querySelectorAll('.json-collapsible').forEach(el => el.style.display = 'none');
        container.querySelectorAll('.json-count').forEach(el => el.style.display = 'inline');
    });

    // Search
    let searchTimeout;
    container.querySelector('#jsonSearch')?.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            highlightSearch(container, e.target.value);
        }, 200);
    });

    // Copy - use fallback method for DevTools panel
    container.querySelector('#jsonCopy')?.addEventListener('click', () => {
        try {
            const pretty = JSON.stringify(JSON.parse(originalJson), null, 2);
            copyToClipboard(pretty);
            showCopyFeedback(container.querySelector('#jsonCopy'));
        } catch (e) {
            copyToClipboard(originalJson);
            showCopyFeedback(container.querySelector('#jsonCopy'));
        }
    });
}

// Fallback clipboard copy for DevTools panel (navigator.clipboard is blocked)
function copyToClipboard(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy');
    } catch (e) {
        console.warn('Copy failed:', e);
    }
    document.body.removeChild(textarea);
}

function highlightSearch(container, query) {
    // Remove existing highlights
    container.querySelectorAll('.json-highlight').forEach(el => {
        el.outerHTML = el.innerHTML;
    });

    if (!query) return;

    const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
    const walker = document.createTreeWalker(
        container.querySelector('.json-content'),
        NodeFilter.SHOW_TEXT,
        null,
        false
    );

    const textNodes = [];
    while (walker.nextNode()) {
        if (regex.test(walker.currentNode.textContent)) {
            textNodes.push(walker.currentNode);
        }
        regex.lastIndex = 0;
    }

    textNodes.forEach(node => {
        const span = document.createElement('span');
        span.innerHTML = node.textContent.replace(regex, '<mark class="json-highlight">$1</mark>');
        node.parentNode.replaceChild(span, node);
    });
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function showCopyFeedback(btn) {
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '✓';
    btn.classList.add('copied');
    setTimeout(() => {
        btn.innerHTML = originalHtml;
        btn.classList.remove('copied');
    }, 1500);
}

// ==========================================
// Media Preview (Image, Video, Audio)
// ==========================================

/**
 * Render image preview
 */
export function renderImagePreview(base64Data, mimeType, container) {
    const dataUrl = base64Data.startsWith('data:') ? base64Data : `data:${mimeType};base64,${base64Data}`;

    container.innerHTML = `
        <div class="media-preview">
            <div class="media-toolbar">
                <span class="media-info">${mimeType}</span>
                <button class="media-btn" id="mediaDownload" title="Download">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    Download
                </button>
            </div>
            <div class="media-content">
                <img src="${dataUrl}" alt="Response Image" class="preview-image">
            </div>
        </div>
    `;

    container.querySelector('#mediaDownload')?.addEventListener('click', () => {
        downloadDataUrl(dataUrl, `image.${getExtension(mimeType)}`);
    });
}

/**
 * Render video preview
 */
export function renderVideoPreview(base64Data, mimeType, container) {
    const dataUrl = base64Data.startsWith('data:') ? base64Data : `data:${mimeType};base64,${base64Data}`;

    container.innerHTML = `
        <div class="media-preview">
            <div class="media-toolbar">
                <span class="media-info">${mimeType}</span>
                <button class="media-btn" id="mediaDownload" title="Download">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    Download
                </button>
            </div>
            <div class="media-content">
                <video src="${dataUrl}" controls class="preview-video"></video>
            </div>
        </div>
    `;

    container.querySelector('#mediaDownload')?.addEventListener('click', () => {
        downloadDataUrl(dataUrl, `video.${getExtension(mimeType)}`);
    });
}

/**
 * Render audio preview
 */
export function renderAudioPreview(base64Data, mimeType, container) {
    const dataUrl = base64Data.startsWith('data:') ? base64Data : `data:${mimeType};base64,${base64Data}`;

    container.innerHTML = `
        <div class="media-preview">
            <div class="media-toolbar">
                <span class="media-info">${mimeType}</span>
                <button class="media-btn" id="mediaDownload" title="Download">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    Download
                </button>
            </div>
            <div class="media-content">
                <audio src="${dataUrl}" controls class="preview-audio"></audio>
            </div>
        </div>
    `;

    container.querySelector('#mediaDownload')?.addEventListener('click', () => {
        downloadDataUrl(dataUrl, `audio.${getExtension(mimeType)}`);
    });
}

/**
 * Render HTML preview in iframe
 */
export function renderHtmlPreview(htmlContent, container) {
    container.innerHTML = `
        <div class="html-preview">
            <div class="media-toolbar">
                <span class="media-info">text/html</span>
                <button class="media-btn" id="htmlViewSource" title="View Source">📄 Source</button>
                <button class="media-btn" id="htmlPreview" title="Preview">👁 Preview</button>
            </div>
            <div class="html-content">
                <iframe srcdoc="${escapeHtml(htmlContent)}" sandbox="allow-same-origin" class="preview-iframe"></iframe>
            </div>
        </div>
    `;

    const contentDiv = container.querySelector('.html-content');
    const iframe = container.querySelector('.preview-iframe');

    container.querySelector('#htmlViewSource')?.addEventListener('click', () => {
        contentDiv.innerHTML = `<pre class="code-block">${escapeHtml(htmlContent)}</pre>`;
    });

    container.querySelector('#htmlPreview')?.addEventListener('click', () => {
        contentDiv.innerHTML = `<iframe srcdoc="${escapeHtml(htmlContent)}" sandbox="allow-same-origin" class="preview-iframe"></iframe>`;
    });
}

// ==========================================
// Utility Functions
// ==========================================

function downloadDataUrl(dataUrl, filename) {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    link.click();
}

function getExtension(mimeType) {
    const map = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/gif': 'gif',
        'image/webp': 'webp',
        'image/svg+xml': 'svg',
        'video/mp4': 'mp4',
        'video/webm': 'webm',
        'audio/mpeg': 'mp3',
        'audio/wav': 'wav',
        'audio/ogg': 'ogg',
    };
    return map[mimeType] || 'bin';
}

/**
 * Detect content type from headers and body
 */
export function getContentCategory(headers, body) {
    const contentType = getContentTypeHeader(headers);

    if (!contentType) {
        // Try to detect from body
        if (body && body.trim().startsWith('{')) return 'json';
        if (body && body.trim().startsWith('[')) return 'json';
        if (body && body.trim().startsWith('<')) return 'html';
        return 'text';
    }

    const ct = contentType.toLowerCase();

    if (ct.includes('application/json') || ct.includes('+json')) return 'json';
    if (ct.includes('text/html') || ct.includes('application/xhtml')) return 'html';
    if (ct.includes('text/xml') || ct.includes('application/xml') || ct.includes('+xml')) return 'xml';
    if (ct.includes('image/')) return 'image';
    if (ct.includes('video/')) return 'video';
    if (ct.includes('audio/')) return 'audio';
    if (ct.includes('application/pdf')) return 'pdf';
    if (ct.includes('text/css')) return 'css';
    if (ct.includes('text/javascript') || ct.includes('application/javascript')) return 'javascript';

    return 'text';
}

function getContentTypeHeader(headers) {
    if (!headers) return null;

    for (const h of headers) {
        if (h.name?.toLowerCase() === 'content-type') {
            return h.value;
        }
    }
    return null;
}

export function getMimeType(headers) {
    const ct = getContentTypeHeader(headers);
    if (!ct) return 'application/octet-stream';
    return ct.split(';')[0].trim();
}
