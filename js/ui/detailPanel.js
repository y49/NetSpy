// ==========================================
// NetSpy - Detail Panel (Postman Style Enhanced)
// ==========================================

import { store } from '../core/store.js';
import { formatBytes, formatTime, escapeHtml, getHeaderValue, prettifyJson, detectContentType } from '../utils.js';
import { renderJsonTree, renderImagePreview, renderVideoPreview, renderAudioPreview, renderHtmlPreview, getContentCategory, getMimeType } from './responseViewer.js';
import { validateJson, validateUrl, validateHeaderName, validateStatusCode } from '../utils/validators.js';
import { KeyValueEditor } from './components/KeyValueEditor.js';

// DOM Elements
let detailView = null;
let emptyState = null;
let editMethod = null;
let editUrl = null;
let sendBtn = null;

// Current state
let currentRequest = null;
let activeRequestTab = 'params';
let activeResponseTab = 'body';
let currentBodyType = 'none';
let isInterceptEditMode = false;
let interceptRequestId = null;
let interceptStage = null; // 'request' or 'response'

// Editable data (for editing mode)
let editableParams = [];
let editableHeaders = [];
let editableBody = '';          // Original body from captured request (for initial parse)
let editableBodyRaw = '';       // For raw/json editing only
const bodyTypeCache = new Map(); // bodyType -> { pairs, raw }

// Editor instances
let paramsEditor = null;
let headersEditor = null;
let bodyEditor = null;
let responseHeadersEditor = null;

// Editable response data (for response intercept)
let editableResponseStatus = 200;
let editableResponseStatusText = 'OK';
let editableResponseHeaders = [];
let editableResponseBody = '';

// ==========================================
// Initialization
// ==========================================

export function init() {
    detailView = document.getElementById('detailView');
    emptyState = document.getElementById('emptyState');
    editMethod = document.getElementById('editMethod');
    editUrl = document.getElementById('editUrl');
    sendBtn = document.getElementById('sendBtn');

    if (!detailView) return;

    setupTabs();
    setupEventListeners();
}

function setupTabs() {
    const requestTabsContainer = document.getElementById('requestTabsContainer');
    if (requestTabsContainer) {
        requestTabsContainer.innerHTML = `
            <button class="section-tab active" data-tab="params">Params</button>
            <button class="section-tab" data-tab="headers">Headers</button>
            <button class="section-tab" data-tab="body">Body</button>
        `;
    }

    const responseTabsContainer = document.getElementById('responseTabsContainer');
    if (responseTabsContainer) {
        responseTabsContainer.innerHTML = `
            <button class="section-tab active" data-tab="resBody">Body</button>
            <button class="section-tab" data-tab="resHeaders">Headers</button>
        `;
    }
}

function setupEventListeners() {
    // Request tabs
    document.getElementById('requestTabsContainer')?.addEventListener('click', (e) => {
        if (e.target.classList.contains('section-tab')) {
            switchRequestTab(e.target.dataset.tab);
        }
    });

    // Response tabs
    document.getElementById('responseTabsContainer')?.addEventListener('click', (e) => {
        if (e.target.classList.contains('section-tab')) {
            switchResponseTab(e.target.dataset.tab);
        }
    });

    // Format buttons
    document.querySelectorAll('.format-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.format-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderResponseBody(btn.dataset.format);
        });
    });

    // Copy/Download
    document.getElementById('copyBody')?.addEventListener('click', copyResponseBody);
    document.getElementById('downloadBody')?.addEventListener('click', downloadResponseBody);

    // URL input → params sync (debounced)
    const urlInput = document.getElementById('editUrl');
    if (urlInput) {
        let urlSyncTimeout;
        urlInput.addEventListener('input', () => {
            clearTimeout(urlSyncTimeout);
            urlSyncTimeout = setTimeout(updateParamsFromUrl, 300);
        });
    }
}

function switchRequestTab(tabId) {
    activeRequestTab = tabId;

    document.querySelectorAll('#requestTabsContainer .section-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabId);
    });

    document.querySelectorAll('.request-section .tab-pane').forEach(pane => {
        pane.classList.remove('active');
    });
    document.getElementById(tabId + 'Pane')?.classList.add('active');

    renderRequestContent();
}

function switchResponseTab(tabId) {
    activeResponseTab = tabId;

    document.querySelectorAll('#responseTabsContainer .section-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabId);
    });

    document.querySelectorAll('.response-section .tab-pane').forEach(pane => {
        pane.classList.remove('active');
    });
    document.getElementById(tabId + 'Pane')?.classList.add('active');
}

// ==========================================
// Public API
// ==========================================

// Track the last edited request ID to prevent data loss during refresh
let lastEditedRequestId = null;

export function showRequest(request) {
    if (!request) {
        showEmpty();
        return;
    }

    // Check if this is an intercept edit - must be actually paused
    const isPausedInStore = store.state.pausedRequests?.has(request.id);
    const newIsInterceptEditMode = request.isPaused === true && isPausedInStore;

    // Skip re-initialization if we're showing the same request in intercept edit mode
    // This preserves user's edits (like newly added params) when the panel is refreshed
    const isSameInterceptedRequest = newIsInterceptEditMode &&
        isInterceptEditMode &&
        lastEditedRequestId === request.id;

    currentRequest = request;
    isInterceptEditMode = newIsInterceptEditMode;
    interceptRequestId = isInterceptEditMode ? request.id : null;
    interceptStage = isInterceptEditMode ? (request.stage || null) : null;
    lastEditedRequestId = isInterceptEditMode ? request.id : null;

    console.log('showRequest:', {
        id: request.id,
        isPaused: request.isPaused,
        isPausedInStore,
        isInterceptEditMode,
        interceptStage,
        isSameInterceptedRequest
    });

    // Update button text for intercept mode
    if (sendBtn) {
        if (isInterceptEditMode) {
            if (interceptStage === 'mock') {
                sendBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 9h6v6h-6z"></path><path d="M19 19H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2z"></path></svg><span>Mock Response</span>';
                sendBtn.title = 'Send mock response (no real request)';
            } else if (interceptStage === 'response') {
                sendBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg><span>Continue</span>';
                sendBtn.title = 'Continue with modified response';
            } else {
                sendBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg><span>Continue</span>';
                sendBtn.title = 'Continue with modifications';
            }
        } else {
            sendBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg><span>Send</span>';
            sendBtn.title = 'Send request';
        }
    }

    // Initialize editable data from request (skip if same intercepted request to preserve edits)
    if (!isSameInterceptedRequest) {
        initEditableData();
    }

    emptyState?.classList.add('hidden');
    detailView?.classList.remove('hidden');

    // Only update method/URL if not same intercepted request (preserve user edits)
    if (!isSameInterceptedRequest) {
        if (editMethod) editMethod.value = request.method || 'GET';
        if (editUrl) editUrl.value = request.url || '';
    }

    updateResponseStatus();
    renderRequestContent();
    renderResponseContent();
}

function initEditableData() {
    // Reset editors when switching to a new request
    paramsEditor?.destroy(); paramsEditor = null;
    headersEditor?.destroy(); headersEditor = null;
    bodyEditor?.destroy(); bodyEditor = null;
    responseHeadersEditor?.destroy(); responseHeadersEditor = null;
    bodyTypeCache.clear();

    // Parse params from URL
    editableParams = [];
    try {
        const urlObj = new URL(currentRequest.url);
        urlObj.searchParams.forEach((value, name) => {
            editableParams.push({ name, value, enabled: true });
        });
    } catch (e) { }

    // Copy headers
    editableHeaders = (currentRequest.headers || []).map(h => ({
        name: h.name,
        value: h.value,
        enabled: true
    }));

    // Set body
    editableBody = currentRequest.postData || '';
    editableBodyRaw = editableBody;

    // Detect body type
    const contentType = getHeaderValue(currentRequest.headers, 'content-type').toLowerCase();
    if (/json|\+json/.test(contentType)) {
        currentBodyType = 'json';
    } else if (contentType.includes('x-www-form-urlencoded')) {
        currentBodyType = 'urlencoded';
    } else if (contentType.includes('form-data') || contentType.includes('multipart/')) {
        currentBodyType = 'formdata';
    } else if (editableBody) {
        currentBodyType = 'raw';
    } else {
        currentBodyType = 'none';
    }

    // Initialize response editable data (for response intercept)
    editableResponseStatus = currentRequest.status || 200;
    editableResponseStatusText = currentRequest.statusText || 'OK';
    editableResponseHeaders = (currentRequest.responseHeaders || []).map(h => ({
        name: h.name,
        value: h.value,
        enabled: true
    }));
    editableResponseBody = currentRequest.responseBody || '';
}

export function showEmpty() {
    detailView?.classList.add('hidden');
    emptyState?.classList.remove('hidden');
    currentRequest = null;
    lastEditedRequestId = null;  // Clear the edit tracking
    // Destroy editor instances
    paramsEditor?.destroy(); paramsEditor = null;
    headersEditor?.destroy(); headersEditor = null;
    bodyEditor?.destroy(); bodyEditor = null;
    responseHeadersEditor?.destroy(); responseHeadersEditor = null;
}

export function getValues() {
    // Sync editor data before collecting values
    if (paramsEditor) editableParams = paramsEditor.getData();
    if (headersEditor) editableHeaders = headersEditor.getData();

    const bodyResult = getBodyForSend();

    return {
        url: editUrl?.value || '',
        method: editMethod?.value || 'GET',
        headers: editableHeaders.filter(h => h.enabled),
        body: bodyResult.body,
        bodyType: currentBodyType,
        bodyBoundary: bodyResult.boundary,
        isInterceptEdit: isInterceptEditMode,
        interceptRequestId: interceptRequestId,
        interceptStage: interceptStage,
        // Response edits (for response intercept)
        responseStatus: editableResponseStatus,
        responseStatusText: editableResponseStatusText,
        responseHeaders: editableResponseHeaders.filter(h => h.enabled),
        responseBody: editableResponseBody
    };
}

export function validate() {
    const errors = [];
    const warnings = [];
    const values = getValues();

    // URL validation
    const urlResult = validateUrl(values.url);
    if (!urlResult.valid) errors.push(urlResult.error);

    // JSON body validation
    if (values.bodyType === 'json' && values.body.trim()) {
        const jsonResult = validateJson(values.body);
        if (!jsonResult.valid) errors.push(`Request body: ${jsonResult.error}`);
    }

    // Response JSON validation (for intercept mode)
    if (values.interceptStage === 'response' || values.interceptStage === 'mock') {
        if (values.responseBody.trim()) {
            // Only validate if it looks like JSON
            const trimmed = values.responseBody.trim();
            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                const jsonResult = validateJson(values.responseBody);
                if (!jsonResult.valid) warnings.push(`Response body JSON: ${jsonResult.error}`);
            }
        }

        // Status code validation
        const statusResult = validateStatusCode(values.responseStatus);
        if (statusResult.warning) warnings.push(statusResult.warning);
    }

    // Header validation
    values.headers.forEach(h => {
        if (h.name) {
            const headerResult = validateHeaderName(h.name);
            if (headerResult.warning) warnings.push(headerResult.warning);
        }
    });

    return { errors, warnings, valid: errors.length === 0 };
}

// ==========================================
// Rendering
// ==========================================

function renderRequestContent() {
    if (!currentRequest) return;

    switch (activeRequestTab) {
        case 'params':
            renderParams();
            break;
        case 'headers':
            renderHeaders();
            break;
        case 'body':
            renderBody();
            break;
    }
}

function renderResponseContent() {
    console.log('renderResponseContent:', {
        isInterceptEditMode,
        interceptStage,
        shouldShowEditable: isInterceptEditMode && (interceptStage === 'response' || interceptStage === 'mock')
    });

    // Show editable response when in response intercept or mock mode
    if (isInterceptEditMode && (interceptStage === 'response' || interceptStage === 'mock')) {
        renderEditableResponse();
    } else {
        // Normal read-only display
        renderResponseBody();
        renderResponseHeaders();
    }
}

function updateResponseStatus() {
    const statusEl = document.getElementById('responseStatus');
    const timeEl = document.getElementById('responseTime');
    const sizeEl = document.getElementById('responseSize');

    if (statusEl && currentRequest) {
        const status = currentRequest.status;
        statusEl.textContent = status || 'Pending';
        statusEl.className = 'response-status status-' + String(status || '').charAt(0) + 'xx';
    }

    if (timeEl && currentRequest) {
        const duration = currentRequest.timings?.total;
        timeEl.textContent = duration != null ? formatTime(duration) : '-';
    }

    if (sizeEl && currentRequest) {
        sizeEl.textContent = formatBytes(currentRequest.size || 0);
    }
}

// ==========================================
// Params Editor
// ==========================================

function renderParams() {
    const container = document.getElementById('paramsPane');
    if (!container) return;

    if (!paramsEditor) {
        paramsEditor = new KeyValueEditor(container, {
            placeholder: { key: 'Parameter', value: 'Value' },
            showCheckbox: true,
            showBulkEdit: true,
        });
        paramsEditor.onChange(() => {
            editableParams = paramsEditor.getData();
            updateUrlFromParams();
        });
    }
    paramsEditor.setData(editableParams);
}

// ==========================================
// Headers Editor
// ==========================================

function renderHeaders() {
    const container = document.getElementById('headersPane');
    if (!container) return;

    if (!headersEditor) {
        headersEditor = new KeyValueEditor(container, {
            placeholder: { key: 'Header', value: 'Value' },
            showCheckbox: true,
            showBulkEdit: true,
        });
        headersEditor.onChange(() => {
            editableHeaders = headersEditor.getData();
        });
    }
    headersEditor.setData(editableHeaders);
}

// ==========================================
// URL/Params Sync
// ==========================================

function updateUrlFromParams() {
    if (!editUrl) return;

    try {
        const url = new URL(editUrl.value);
        url.search = '';
        const enabledParams = paramsEditor ? paramsEditor.getEnabledData() : editableParams.filter(p => p.enabled && p.name);
        enabledParams.forEach(p => {
            url.searchParams.append(p.name, p.value);
        });
        editUrl.value = url.toString();
    } catch (e) {
        // Invalid URL, skip
    }
}

function updateParamsFromUrl() {
    if (!editUrl) return;
    try {
        const url = new URL(editUrl.value);
        editableParams = [];
        url.searchParams.forEach((value, name) => {
            editableParams.push({ name, value, enabled: true });
        });
        if (paramsEditor && activeRequestTab === 'params') {
            paramsEditor.setData(editableParams);
        }
    } catch (e) {
        // Invalid URL, skip
    }
}

// ==========================================
// Body Editor
// ==========================================

function buildMultipartBody(pairs) {
    const boundary = '----NetSpyFormBoundary' + Math.random().toString(36).substring(2);
    let body = '';
    for (const pair of pairs) {
        body += `--${boundary}\r\n`;
        if (pair.type === 'file') {
            body += `Content-Disposition: form-data; name="${pair.name}"; filename="${pair.fileName}"\r\n\r\n`;
            body += `${pair.value}\r\n`;
        } else {
            body += `Content-Disposition: form-data; name="${pair.name}"\r\n\r\n`;
            body += `${pair.value}\r\n`;
        }
    }
    body += `--${boundary}--\r\n`;
    return { body, boundary };
}

function getBodyForSend() {
    switch (currentBodyType) {
        case 'formdata': {
            if (!bodyEditor) return { body: editableBody, boundary: null };
            const pairs = bodyEditor.getData().filter(p => p.enabled);
            return buildMultipartBody(pairs);
        }
        case 'urlencoded': {
            if (!bodyEditor) return { body: '', boundary: null };
            const pairs = bodyEditor.getEnabledData();
            const body = pairs.map(p => `${encodeURIComponent(p.name)}=${encodeURIComponent(p.value)}`).join('&');
            return { body, boundary: null };
        }
        case 'json':
        case 'raw':
            return { body: editableBodyRaw, boundary: null };
        default:
            return { body: '', boundary: null };
    }
}

function renderBody() {
    const container = document.getElementById('bodyPane');
    if (!container) return;

    const bodyTypes = [
        { id: 'none', label: 'none' },
        { id: 'formdata', label: 'form-data' },
        { id: 'urlencoded', label: 'x-www-form-urlencoded' },
        { id: 'raw', label: 'raw' },
        { id: 'json', label: 'JSON' }
    ];

    container.innerHTML = `
        <div class="body-editor">
            <div class="body-type-selector">
                ${bodyTypes.map(t => `
                    <label class="body-type ${currentBodyType === t.id ? 'active' : ''}">
                        <input type="radio" name="bodyType" value="${t.id}"
                               ${currentBodyType === t.id ? 'checked' : ''}>
                        <span>${t.label}</span>
                    </label>
                `).join('')}
            </div>
            <div class="body-content-area">
                ${renderBodyContent()}
            </div>
        </div>
    `;

    // Bind body type change
    container.querySelectorAll('input[name="bodyType"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            // Cache current data before switching
            if (currentBodyType === 'formdata' || currentBodyType === 'urlencoded') {
                if (bodyEditor) {
                    bodyTypeCache.set(currentBodyType, { pairs: bodyEditor.getData(), raw: '' });
                }
            } else if (currentBodyType === 'json' || currentBodyType === 'raw') {
                bodyTypeCache.set(currentBodyType, { pairs: [], raw: editableBodyRaw });
            }

            // Destroy body editor if switching away from KV type
            if ((currentBodyType === 'formdata' || currentBodyType === 'urlencoded') &&
                e.target.value !== 'formdata' && e.target.value !== 'urlencoded') {
                bodyEditor?.destroy();
                bodyEditor = null;
            }

            currentBodyType = e.target.value;

            // Restore raw from cache if switching to raw/json
            if (currentBodyType === 'json' || currentBodyType === 'raw') {
                const cached = bodyTypeCache.get(currentBodyType);
                if (cached?.raw) {
                    editableBodyRaw = cached.raw;
                }
            }

            container.querySelectorAll('.body-type').forEach(l => l.classList.remove('active'));
            e.target.closest('.body-type').classList.add('active');

            const contentArea = container.querySelector('.body-content-area');
            if (contentArea) {
                contentArea.innerHTML = renderBodyContent();
                // Initialize KV editor if needed
                if (currentBodyType === 'formdata' || currentBodyType === 'urlencoded') {
                    initBodyKvEditor(container);
                }
            }
            bindBodyEvents(container);
        });
    });

    bindBodyEvents(container);

    // Initialize KV editor if body type is formdata or urlencoded
    if (currentBodyType === 'formdata' || currentBodyType === 'urlencoded') {
        initBodyKvEditor(container);
    }
}

function renderBodyContent() {
    switch (currentBodyType) {
        case 'none':
            return '<div class="body-empty">This request does not have a body</div>';

        case 'json':
            let prettyBody = editableBodyRaw;
            try { prettyBody = prettifyJson(editableBodyRaw); } catch (e) { }
            return `
                <div class="body-textarea-wrapper">
                    <textarea class="body-textarea json" id="bodyTextarea"
                              placeholder='{"key": "value"}'>${escapeHtml(prettyBody)}</textarea>
                </div>
            `;

        case 'raw':
            return `
                <div class="body-textarea-wrapper">
                    <textarea class="body-textarea" id="bodyTextarea"
                              placeholder="Enter raw body content">${escapeHtml(editableBodyRaw)}</textarea>
                </div>
            `;

        case 'urlencoded':
        case 'formdata':
            return '<div id="bodyKvContainer"></div>';

        default:
            return '<div class="body-empty">Select a body type</div>';
    }
}

function parseUrlEncodedBody(body) {
    if (!body) return [];
    try {
        const params = new URLSearchParams(body);
        const result = [];
        params.forEach((value, name) => result.push({ name, value }));
        return result;
    } catch {
        return [];
    }
}

// Parse multipart/form-data body
function parseFormDataBody(body) {
    if (!body) return [];

    const result = [];

    // First, check if body is already JSON array of pairs (from previous edits)
    if (body.trim().startsWith('[')) {
        try {
            const parsed = JSON.parse(body);
            if (Array.isArray(parsed) && parsed.length > 0 && 'name' in parsed[0]) {
                return parsed.map(p => ({ name: p.name || '', value: p.value || '' }));
            }
        } catch (e) {
            // Not valid JSON, continue with normal parsing
        }
    }

    // Find boundary from Content-Type header or body
    const contentType = getHeaderValue(currentRequest?.headers, 'content-type') || '';
    const ctBoundaryMatch = contentType.match(/boundary=([^\s;]+)/i);
    let boundary;

    if (ctBoundaryMatch) {
        boundary = ctBoundaryMatch[1].replace(/^["']|["']$/g, ''); // Strip quotes
    } else {
        // Fallback: detect from body
        const bodyBoundaryMatch = body.match(/^(-{2,}[\w-]+)/m);
        if (bodyBoundaryMatch) {
            boundary = bodyBoundaryMatch[1];
        }
    }

    if (!boundary) {
        // Fallback: try as urlencoded
        return parseUrlEncodedBody(body);
    }

    const parts = body.split(boundary).filter(part => part.trim() && part.trim() !== '--');

    for (const part of parts) {
        // Find Content-Disposition header
        const dispositionMatch = part.match(/Content-Disposition:\s*form-data;\s*name\s*[=:]\s*"?([^";\r\n]+)"?/i);
        if (dispositionMatch) {
            const name = dispositionMatch[1].trim();

            // Detect filename for file fields
            const filenameMatch = part.match(/filename\s*=\s*"?([^";\r\n]+)"?/i);

            // Find the value (after double line break or just after the header)
            const headerEndIndex = part.indexOf('\r\n\r\n');
            let value = '';

            if (headerEndIndex !== -1) {
                value = part.substring(headerEndIndex + 4).trim();
            } else {
                // Try single line breaks
                const singleBreakIndex = part.indexOf('\n\n');
                if (singleBreakIndex !== -1) {
                    value = part.substring(singleBreakIndex + 2).trim();
                } else {
                    // Try to get value after the last header line
                    const lines = part.split(/\r?\n/);
                    let valueStarted = false;
                    const valueLines = [];
                    for (const line of lines) {
                        if (valueStarted) {
                            valueLines.push(line);
                        } else if (line.trim() === '') {
                            valueStarted = true;
                        }
                    }
                    value = valueLines.join('\n').trim();
                }
            }

            // Clean up trailing boundary markers
            value = value.replace(/^-{2,}[\w]*$/, '').trim();

            if (filenameMatch) {
                result.push({
                    name,
                    value,
                    type: 'file',
                    fileName: filenameMatch[1].trim(),
                    fileSize: 0,
                    enabled: true,
                });
            } else {
                result.push({ name, value, type: 'text', enabled: true });
            }
        }
    }

    return result;
}

function bindBodyEvents(container) {
    const textarea = container.querySelector('#bodyTextarea');
    if (textarea) {
        textarea.addEventListener('input', (e) => {
            editableBodyRaw = e.target.value;
        });
    }
}

function initBodyKvEditor(container) {
    const kvContainer = container.querySelector('#bodyKvContainer');
    if (!kvContainer) return;

    // Destroy previous instance
    bodyEditor?.destroy();

    bodyEditor = new KeyValueEditor(kvContainer, {
        placeholder: { key: 'Key', value: 'Value' },
        showCheckbox: true,
        showBulkEdit: currentBodyType !== 'formdata',
        valueAsTextarea: true,
        itemTypes: currentBodyType === 'formdata' ? ['text', 'file'] : ['text'],
    });

    // Load data: from cache first, then parse from original body
    const cached = bodyTypeCache.get(currentBodyType);
    if (cached?.pairs?.length) {
        bodyEditor.setData(cached.pairs);
    } else {
        const pairs = currentBodyType === 'formdata'
            ? parseFormDataBody(editableBody)
            : parseUrlEncodedBody(editableBody);
        bodyEditor.setData(pairs);
    }
}

// ==========================================
// Response Rendering
// ==========================================

function renderResponseBody(format = 'pretty') {
    const container = document.getElementById('resBodyPane');
    if (!container || !currentRequest) return;

    const body = currentRequest.responseBody || '';

    if (!body) {
        container.innerHTML = '<div class="body-empty">No response body</div>';
        return;
    }

    const category = getContentCategory(currentRequest.responseHeaders, body);
    const mimeType = getMimeType(currentRequest.responseHeaders);
    const isBase64 = currentRequest.isBase64 || false;

    console.log('Rendering response:', { category, mimeType, bodyLength: body.length, isBase64 });

    switch (category) {
        case 'json':
            // Use enhanced JSON tree viewer
            renderJsonTree(body, container);
            break;

        case 'image':
            // Image preview - if already base64, use directly; otherwise it needs conversion
            if (isBase64) {
                renderImagePreview(body, mimeType, container);
            } else {
                // Try to render as base64 anyway (HAR data is usually base64)
                renderImagePreview(body, mimeType, container);
            }
            break;

        case 'video':
            // Video preview
            if (isBase64) {
                renderVideoPreview(body, mimeType, container);
            } else {
                renderVideoPreview(body, mimeType, container);
            }
            break;

        case 'audio':
            // Audio preview
            if (isBase64) {
                renderAudioPreview(body, mimeType, container);
            } else {
                renderAudioPreview(body, mimeType, container);
            }
            break;

        case 'html':
            // HTML preview with source toggle
            renderHtmlPreview(body, container);
            break;

        case 'xml':
        case 'css':
        case 'javascript':
        default:
            // Plain text with syntax highlighting class
            let displayBody = body;
            if (format === 'pretty' && category === 'json') {
                try { displayBody = prettifyJson(body); } catch (e) { }
            }
            container.innerHTML = `<pre class="code-block code-${category}">${escapeHtml(displayBody)}</pre>`;
            break;
    }
}

function renderResponseHeaders() {
    const container = document.getElementById('resHeadersPane');
    if (!container) return;

    const headers = currentRequest?.responseHeaders || [];

    container.innerHTML = `
        <div class="kv-editor">
            <div class="kv-header">
                <span class="kv-title">Response Headers</span>
                <span class="kv-count">${headers.length} items</span>
            </div>
            ${headers.length === 0 ?
            '<div class="kv-empty">No response headers</div>' :
            `<table class="kv-table readonly">
                    <thead><tr><th>Name</th><th>Value</th></tr></thead>
                    <tbody>
                        ${headers.map(h => `
                            <tr class="kv-row">
                                <td class="kv-key">${escapeHtml(h.name)}</td>
                                <td class="kv-value">${escapeHtml(h.value)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>`
        }
        </div>
    `;
}

// Editable Response (for response intercept)
function renderEditableResponse() {
    const bodyPane = document.getElementById('resBodyPane');
    const headersPane = document.getElementById('resHeadersPane');

    if (bodyPane) {
        // Status selector + Body editor
        const statusOptions = [200, 201, 204, 301, 302, 304, 400, 401, 403, 404, 500, 502, 503];

        // Auto-prettify JSON if possible
        let displayBody = editableResponseBody;
        try {
            const parsed = JSON.parse(editableResponseBody);
            displayBody = JSON.stringify(parsed, null, 2);
            if (displayBody !== editableResponseBody) {
                editableResponseBody = displayBody;  // Update the editable data too
            }
        } catch (e) { /* Not JSON, keep original */ }

        bodyPane.innerHTML = `
            <div class="response-editor">
                <div class="response-status-editor">
                    <label>Status Code:</label>
                    <select id="editResponseStatus" class="status-select">
                        ${statusOptions.map(s => `
                            <option value="${s}" ${s === editableResponseStatus ? 'selected' : ''}>${s} ${getStatusText(s)}</option>
                        `).join('')}
                        <option value="custom" ${!statusOptions.includes(editableResponseStatus) ? 'selected' : ''}>Custom...</option>
                    </select>
                    <input type="number" id="editResponseStatusCustom" class="status-input"
                           value="${editableResponseStatus}"
                           style="display: ${statusOptions.includes(editableResponseStatus) ? 'none' : 'inline-block'}">
                </div>

                <div class="response-body-editor">
                    <div class="response-body-header">
                        <label>Response Body:</label>
                        <div class="response-body-actions">
                            <button class="body-action-btn" id="formatJsonBtn" title="Format JSON">📐 Format</button>
                            <button class="body-action-btn" id="minifyJsonBtn" title="Minify JSON">📦 Minify</button>
                        </div>
                    </div>
                    <textarea id="editResponseBody" class="response-body-textarea"
                              placeholder="Enter response body...">${escapeHtml(displayBody)}</textarea>
                </div>
            </div>
        `;

        // Bind events
        const statusSelect = bodyPane.querySelector('#editResponseStatus');
        const statusCustom = bodyPane.querySelector('#editResponseStatusCustom');
        const bodyTextarea = bodyPane.querySelector('#editResponseBody');

        statusSelect?.addEventListener('change', (e) => {
            if (e.target.value === 'custom') {
                statusCustom.style.display = 'inline-block';
                statusCustom.focus();
            } else {
                statusCustom.style.display = 'none';
                editableResponseStatus = parseInt(e.target.value);
                editableResponseStatusText = getStatusText(editableResponseStatus);
            }
        });

        statusCustom?.addEventListener('input', (e) => {
            editableResponseStatus = parseInt(e.target.value) || 200;
            editableResponseStatusText = getStatusText(editableResponseStatus) || '';
        });

        bodyTextarea?.addEventListener('input', (e) => {
            editableResponseBody = e.target.value;
        });

        // Format JSON button
        bodyPane.querySelector('#formatJsonBtn')?.addEventListener('click', () => {
            try {
                const parsed = JSON.parse(bodyTextarea.value);
                const formatted = JSON.stringify(parsed, null, 2);
                bodyTextarea.value = formatted;
                editableResponseBody = formatted;
            } catch (e) {
                console.warn('Invalid JSON, cannot format');
            }
        });

        // Minify JSON button
        bodyPane.querySelector('#minifyJsonBtn')?.addEventListener('click', () => {
            try {
                const parsed = JSON.parse(bodyTextarea.value);
                const minified = JSON.stringify(parsed);
                bodyTextarea.value = minified;
                editableResponseBody = minified;
            } catch (e) {
                console.warn('Invalid JSON, cannot minify');
            }
        });
    }

    if (headersPane) {
        if (!responseHeadersEditor) {
            responseHeadersEditor = new KeyValueEditor(headersPane, {
                placeholder: { key: 'Header', value: 'Value' },
                showCheckbox: true,
                showBulkEdit: true,
            });
            responseHeadersEditor.onChange(() => {
                editableResponseHeaders = responseHeadersEditor.getData();
            });
        }
        responseHeadersEditor.setData(editableResponseHeaders);
    }
}

function getStatusText(code) {
    const texts = {
        200: 'OK', 201: 'Created', 204: 'No Content',
        301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified',
        400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found',
        500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable'
    };
    return texts[code] || '';
}

// ==========================================
// Actions
// ==========================================

export function copyResponseBody() {
    const body = currentRequest?.responseBody || '';
    if (body) navigator.clipboard.writeText(body);
}

export function downloadResponseBody() {
    const body = currentRequest?.responseBody || '';
    if (!body) return;

    const blob = new Blob([body], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'response.txt';
    a.click();
    URL.revokeObjectURL(url);
}
