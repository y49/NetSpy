// ==========================================
// NetSpy - Utility Functions
// ==========================================

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes) {
    // Handle unknown/invalid sizes: null, undefined, 0, or negative values (HAR uses -1 for unknown)
    if (bytes === 0 || bytes === undefined || bytes === null || bytes < 0) return '-';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/**
 * Format milliseconds to human readable duration string
 */
export function formatTime(ms) {
    if (ms === undefined || ms === null || isNaN(ms)) return '-';
    if (ms < 1000) return Math.round(ms) + ' ms';
    return (ms / 1000).toFixed(2) + ' s';
}

/**
 * Format timestamp to HH:MM:SS format
 */
export function formatTimestamp(timestamp) {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

/**
 * Get domain from URL
 */
export function getDomain(url) {
    try {
        return new URL(url).hostname;
    } catch {
        return url || '';
    }
}

/**
 * Get path from URL
 */
export function getPath(url) {
    try {
        const u = new URL(url);
        return u.pathname + u.search;
    } catch {
        return url || '';
    }
}

/**
 * Get filename from URL
 */
export function getFilename(url) {
    try {
        const path = new URL(url).pathname;
        return path.split('/').pop() || path;
    } catch {
        return url || '';
    }
}

/**
 * Get header value by name from headers array
 */
export function getHeaderValue(headers, name) {
    if (!headers || !Array.isArray(headers)) return '';
    const header = headers.find(h => h.name?.toLowerCase() === name?.toLowerCase());
    return header?.value || '';
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Debounce function
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

/**
 * Throttle function
 */
export function throttle(func, limit) {
    let inThrottle;
    return function (...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * Detect content type from headers or body
 */
export function detectContentType(headers, body) {
    const contentType = getHeaderValue(headers, 'content-type').toLowerCase();

    if (contentType.includes('json')) return 'json';
    if (contentType.includes('xml')) return 'xml';
    if (contentType.includes('html')) return 'html';
    if (contentType.includes('javascript')) return 'javascript';
    if (contentType.includes('css')) return 'css';
    if (contentType.includes('image')) return 'image';

    // Try to detect from body
    if (body) {
        const trimmed = body.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
        if (trimmed.startsWith('<?xml') || trimmed.startsWith('<')) return 'xml';
    }

    return 'text';
}

/**
 * Pretty print JSON
 */
export function prettifyJson(json) {
    try {
        if (typeof json === 'string') {
            return JSON.stringify(JSON.parse(json), null, 2);
        }
        return JSON.stringify(json, null, 2);
    } catch {
        return json;
    }
}

/**
 * Simple JSON syntax highlighting
 */
export function highlightJson(str) {
    if (!str) return '';
    return escapeHtml(str)
        .replace(/"([^"]+)":/g, '<span class="json-key">"$1"</span>:')
        .replace(/: "([^"]*)"/g, ': <span class="json-string">"$1"</span>')
        .replace(/: (\d+)/g, ': <span class="json-number">$1</span>')
        .replace(/: (true|false)/g, ': <span class="json-boolean">$1</span>')
        .replace(/: (null)/g, ': <span class="json-null">$1</span>');
}

/**
 * Create DOM element helper
 */
export function createElement(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);

    Object.entries(attrs).forEach(([key, value]) => {
        if (key === 'className') {
            el.className = value;
        } else if (key === 'style' && typeof value === 'object') {
            Object.assign(el.style, value);
        } else if (key.startsWith('on') && typeof value === 'function') {
            el.addEventListener(key.slice(2).toLowerCase(), value);
        } else {
            el.setAttribute(key, value);
        }
    });

    children.forEach(child => {
        if (typeof child === 'string') {
            el.appendChild(document.createTextNode(child));
        } else if (child) {
            el.appendChild(child);
        }
    });

    return el;
}
