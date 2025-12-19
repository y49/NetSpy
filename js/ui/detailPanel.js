// ==========================================
// NetSpy - Detail Panel (Postman Style Enhanced)
// ==========================================

import { store } from '../core/store.js';
import { formatBytes, formatTime, escapeHtml, getHeaderValue, prettifyJson, detectContentType } from '../utils.js';
import { renderJsonTree, renderImagePreview, renderVideoPreview, renderAudioPreview, renderHtmlPreview, getContentCategory, getMimeType } from './responseViewer.js';
import { validateJson, validateUrl, validateHeaderName, validateStatusCode } from '../utils/validators.js';

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
let editableBody = '';
let editableBodyPairs = []; // For form-data/urlencoded
const bodyTypeCache = new Map(); // bodyType -> { body, pairs }

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
}

export function getValues() {
    return {
        url: editUrl?.value || '',
        method: editMethod?.value || 'GET',
        headers: editableHeaders.filter(h => h.enabled),
        body: editableBody,
        bodyPairs: editableBodyPairs,
        bodyType: currentBodyType,
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

    container.innerHTML = `
        <div class="kv-editor">
            <div class="kv-header">
                <span class="kv-title">Query Parameters</span>
                <button class="kv-add-btn" id="addParamBtn">+ Add</button>
            </div>
            <table class="kv-table">
                <thead>
                    <tr>
                        <th class="kv-check"></th>
                        <th>Key</th>
                        <th>Value</th>
                        <th class="kv-actions"></th>
                    </tr>
                </thead>
                <tbody id="paramsTableBody">
                    ${editableParams.map((p, i) => createKVRow(p, i, 'param')).join('')}
                </tbody>
            </table>
            ${editableParams.length === 0 ? '<div class="kv-empty">No parameters. Click "+ Add" to create one.</div>' : ''}
        </div>
    `;

    // Bind events
    container.querySelector('#addParamBtn')?.addEventListener('click', () => addParam());
    bindKVEvents(container, 'param', editableParams, renderParams);
}

function addParam() {
    editableParams.push({ name: '', value: '', enabled: true });
    renderParams();
    // Focus on new row
    const inputs = document.querySelectorAll('#paramsTableBody .kv-input.key');
    inputs[inputs.length - 1]?.focus();
}

// ==========================================
// Headers Editor
// ==========================================

function renderHeaders() {
    const container = document.getElementById('headersPane');
    if (!container) return;

    container.innerHTML = `
        <div class="kv-editor">
            <div class="kv-header">
                <span class="kv-title">Request Headers</span>
                <button class="kv-add-btn" id="addHeaderBtn">+ Add</button>
            </div>
            <table class="kv-table">
                <thead>
                    <tr>
                        <th class="kv-check"></th>
                        <th>Key</th>
                        <th>Value</th>
                        <th class="kv-actions"></th>
                    </tr>
                </thead>
                <tbody id="headersTableBody">
                    ${editableHeaders.map((h, i) => createKVRow(h, i, 'header')).join('')}
                </tbody>
            </table>
            ${editableHeaders.length === 0 ? '<div class="kv-empty">No headers. Click "+ Add" to create one.</div>' : ''}
        </div>
    `;

    container.querySelector('#addHeaderBtn')?.addEventListener('click', () => addHeader());
    bindKVEvents(container, 'header', editableHeaders, renderHeaders);
}

function addHeader() {
    editableHeaders.push({ name: '', value: '', enabled: true });
    renderHeaders();
    const inputs = document.querySelectorAll('#headersTableBody .kv-input.key');
    inputs[inputs.length - 1]?.focus();
}

// ==========================================
// KV Row Helper
// ==========================================

function createKVRow(item, index, type) {
    return `
        <tr class="kv-row ${!item.enabled ? 'disabled' : ''}" data-index="${index}">
            <td class="kv-check">
                <input type="checkbox" ${item.enabled ? 'checked' : ''} data-action="toggle">
            </td>
            <td>
                <input type="text" class="kv-input key" value="${escapeHtml(item.name)}" 
                       placeholder="Key" data-field="name">
            </td>
            <td>
                <input type="text" class="kv-input value" value="${escapeHtml(item.value)}" 
                       placeholder="Value" data-field="value">
            </td>
            <td class="kv-actions">
                <button class="kv-delete-btn" data-action="delete" title="Delete">×</button>
            </td>
        </tr>
    `;
}

function bindKVEvents(container, type, dataArray, renderFn) {
    const tbody = container.querySelector('tbody');
    if (!tbody) return;

    tbody.addEventListener('change', (e) => {
        const row = e.target.closest('tr');
        const index = parseInt(row?.dataset.index);
        if (isNaN(index)) return;

        if (e.target.dataset.action === 'toggle') {
            dataArray[index].enabled = e.target.checked;
            row.classList.toggle('disabled', !e.target.checked);
        } else if (e.target.dataset.field) {
            dataArray[index][e.target.dataset.field] = e.target.value;
        }

        updateUrlFromParams();
    });

    tbody.addEventListener('input', (e) => {
        const row = e.target.closest('tr');
        const index = parseInt(row?.dataset.index);
        if (isNaN(index) || !e.target.dataset.field) return;

        dataArray[index][e.target.dataset.field] = e.target.value;
        updateUrlFromParams();
    });

    tbody.addEventListener('click', (e) => {
        if (e.target.dataset.action === 'delete') {
            const row = e.target.closest('tr');
            const index = parseInt(row?.dataset.index);
            if (!isNaN(index)) {
                dataArray.splice(index, 1);
                renderFn();
                updateUrlFromParams();
            }
        }
    });
}

function updateUrlFromParams() {
    if (!editUrl) return;

    try {
        const url = new URL(editUrl.value);
        url.search = '';
        editableParams.filter(p => p.enabled && p.name).forEach(p => {
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
        // Re-render params tab if active
        if (activeRequestTab === 'params') {
            renderParams();
        }
    } catch (e) {
        // Invalid URL, skip
    }
}

// ==========================================
// Body Editor
// ==========================================

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
            // Cache current body data before switching
            bodyTypeCache.set(currentBodyType, {
                body: editableBody,
                pairs: [...editableBodyPairs]
            });

            currentBodyType = e.target.value;

            // Restore cached data if available
            const cached = bodyTypeCache.get(currentBodyType);
            if (cached) {
                editableBody = cached.body;
                editableBodyPairs = cached.pairs;
            }

            container.querySelectorAll('.body-type').forEach(l => l.classList.remove('active'));
            e.target.closest('.body-type').classList.add('active');

            const contentArea = container.querySelector('.body-content-area');
            if (contentArea) contentArea.innerHTML = renderBodyContent();
            bindBodyEvents(container);
        });
    });

    bindBodyEvents(container);
}

function renderBodyContent() {
    switch (currentBodyType) {
        case 'none':
            return '<div class="body-empty">This request does not have a body</div>';

        case 'json':
            let prettyBody = editableBody;
            try { prettyBody = prettifyJson(editableBody); } catch (e) { }
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
                              placeholder="Enter raw body content">${escapeHtml(editableBody)}</textarea>
                </div>
            `;

        case 'urlencoded':
            const urlencodedPairs = parseUrlEncodedBody(editableBody);
            return renderKvBodyTable(urlencodedPairs);

        case 'formdata':
            const formDataPairs = parseFormDataBody(editableBody);
            return renderKvBodyTable(formDataPairs);

        default:
            return '<div class="body-empty">Select a body type</div>';
    }
}

function renderKvBodyTable(pairs) {
    return `
        <table class="kv-table">
            <thead>
                <tr><th>Key</th><th>Value</th><th></th></tr>
            </thead>
            <tbody id="bodyKvTable">
                ${pairs.map((p, i) => `
                    <tr data-index="${i}">
                        <td><input type="text" class="kv-input" value="${escapeHtml(p.name)}" data-field="name"></td>
                        <td><textarea class="kv-input kv-value" data-field="value" rows="1">${escapeHtml(p.value)}</textarea></td>
                        <td><button class="kv-delete-btn" data-action="delete">×</button></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        <button class="kv-add-btn body-add-btn" id="addBodyKvBtn">+ Add</button>
    `;
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

            result.push({ name, value });
        }
    }

    return result;
}

function bindBodyEvents(container) {
    const textarea = container.querySelector('#bodyTextarea');
    if (textarea) {
        textarea.addEventListener('input', (e) => {
            editableBody = e.target.value;
        });
    }

    const addBtn = container.querySelector('#addBodyKvBtn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            const pairs = parseUrlEncodedBody(editableBody);
            pairs.push({ name: '', value: '' });
            editableBody = pairs.map(p => `${encodeURIComponent(p.name)}=${encodeURIComponent(p.value)}`).join('&');
            const contentArea = container.querySelector('.body-content-area');
            if (contentArea) contentArea.innerHTML = renderBodyContent();
            bindBodyEvents(container);
        });
    }

    const kvTable = container.querySelector('#bodyKvTable');
    if (kvTable) {
        kvTable.addEventListener('input', (e) => {
            if (e.target.dataset.field) {
                updateBodyFromKv(container);
            }
        });
        kvTable.addEventListener('click', (e) => {
            if (e.target.dataset.action === 'delete') {
                const row = e.target.closest('tr');
                row?.remove();
                updateBodyFromKv(container);
            }
        });
    }
}

function updateBodyFromKv(container) {
    const rows = container.querySelectorAll('#bodyKvTable tr');
    const pairs = [];
    rows.forEach(row => {
        const inputs = row.querySelectorAll('.kv-input');
        if (inputs.length >= 2) {
            pairs.push({ name: inputs[0].value, value: inputs[1].value });
        }
    });

    editableBodyPairs = pairs;

    if (currentBodyType === 'formdata') {
        // Rebuild as multipart/form-data
        const boundary = '----NetSpyFormBoundary' + Math.random().toString(36).substr(2);
        let multipartBody = '';
        for (const pair of pairs) {
            multipartBody += `--${boundary}\r\n`;
            multipartBody += `Content-Disposition: form-data; name="${pair.name}"\r\n\r\n`;
            multipartBody += `${pair.value}\r\n`;
        }
        multipartBody += `--${boundary}--\r\n`;
        editableBody = multipartBody;
    } else {
        // URL-encoded format
        editableBody = pairs.map(p => `${encodeURIComponent(p.name)}=${encodeURIComponent(p.value)}`).join('&');
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
        // Editable headers table
        headersPane.innerHTML = `
            <div class="kv-editor">
                <div class="kv-header">
                    <span class="kv-title">Response Headers</span>
                    <button class="kv-add-btn" id="addResHeaderBtn">+ Add</button>
                </div>
                <table class="kv-table">
                    <thead><tr><th></th><th>Name</th><th>Value</th><th></th></tr></thead>
                    <tbody id="resHeadersTable">
                        ${editableResponseHeaders.map((h, i) => `
                            <tr data-index="${i}">
                                <td><input type="checkbox" class="kv-checkbox" ${h.enabled ? 'checked' : ''} data-field="enabled"></td>
                                <td><input type="text" class="kv-input" value="${escapeHtml(h.name)}" data-field="name"></td>
                                <td><input type="text" class="kv-input" value="${escapeHtml(h.value)}" data-field="value"></td>
                                <td><button class="kv-delete-btn" data-action="delete">×</button></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        // Bind header events
        const addBtn = headersPane.querySelector('#addResHeaderBtn');
        const table = headersPane.querySelector('#resHeadersTable');

        addBtn?.addEventListener('click', () => {
            editableResponseHeaders.push({ name: '', value: '', enabled: true });
            renderEditableResponse();
        });

        table?.addEventListener('input', (e) => {
            const row = e.target.closest('tr');
            const index = parseInt(row?.dataset.index);
            const field = e.target.dataset.field;
            if (index >= 0 && field) {
                if (field === 'enabled') {
                    editableResponseHeaders[index].enabled = e.target.checked;
                } else {
                    editableResponseHeaders[index][field] = e.target.value;
                }
            }
        });

        table?.addEventListener('click', (e) => {
            if (e.target.dataset.action === 'delete') {
                const row = e.target.closest('tr');
                const index = parseInt(row?.dataset.index);
                if (index >= 0) {
                    editableResponseHeaders.splice(index, 1);
                    renderEditableResponse();
                }
            }
        });
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

