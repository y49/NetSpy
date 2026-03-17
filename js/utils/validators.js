// js/utils/validators.js
// Input validation helpers for the panel UI

/**
 * Validate JSON string. Returns { valid, error, line }
 */
export function validateJson(str) {
    try {
        JSON.parse(str);
        return { valid: true };
    } catch (e) {
        const match = e.message.match(/position (\d+)/);
        const pos = match ? parseInt(match[1]) : -1;
        let line = -1;
        if (pos >= 0) {
            line = str.substring(0, pos).split('\n').length;
        }
        return { valid: false, error: e.message, line };
    }
}

/**
 * Validate HTTP status code. Returns { valid, warning }
 */
export function validateStatusCode(code) {
    const num = parseInt(code);
    if (isNaN(num)) return { valid: false, warning: 'Status code must be a number' };
    if (num < 100 || num > 599) return { valid: true, warning: `Unusual status code: ${num} (standard range: 100-599)` };
    return { valid: true };
}

/**
 * Validate header name. Returns { valid, warning }
 */
export function validateHeaderName(name) {
    if (!name) return { valid: false, warning: 'Header name is empty' };
    if (/[^\w-]/.test(name) && !name.startsWith(':')) {
        return { valid: false, warning: `Invalid characters in header name: "${name}"` };
    }
    // Auto-managed headers — no warning needed, browser/debugger API handles them
    const autoHeaders = ['content-length', 'transfer-encoding', 'host'];
    if (autoHeaders.includes(name.toLowerCase())) {
        return { valid: true };
    }
    return { valid: true };
}

/**
 * Validate URL. Returns { valid, error }
 */
export function validateUrl(str) {
    if (!str) return { valid: false, error: 'URL is empty' };
    try {
        new URL(str);
        return { valid: true };
    } catch (e) {
        return { valid: false, error: 'Invalid URL format' };
    }
}
