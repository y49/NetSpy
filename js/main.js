// ==========================================
// NetSpy - Main Entry Point (with Intercept)
// ==========================================

import { store } from './core/store.js';
import * as toolbar from './ui/toolbar.js';
import * as requestList from './ui/requestList.js';
import * as detailPanel from './ui/detailPanel.js';

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);

async function init() {
    console.log('NetSpy: Initializing...');

    // Initialize UI modules
    toolbar.init();
    requestList.init();
    detailPanel.init();

    // Setup resize handles
    setupResizer();
    setupHorizontalResizer();

    // Subscribe to state changes
    store.subscribe(handleStateChange);

    // Setup global API
    setupGlobalAPI();

    // Start capturing requests
    if (chrome?.devtools?.network) {
        chrome.devtools.network.onRequestFinished.addListener(handleRequest);
    }

    // Listen for navigation
    chrome.devtools.network.onNavigated?.addListener(() => {
        if (!store.state.preserveLog) {
            store.clearRequests();
            detailPanel.showEmpty();
            requestList.render();
        }
    });

    // Listen for intercept messages from background
    chrome.runtime.onMessage.addListener(handleBackgroundMessage);

    // Start periodic sync for paused requests (every 5 seconds)
    // This ensures panel stays in sync with background even if some requests expire
    setInterval(syncPausedRequests, 5000);

    console.log('NetSpy: Initialized successfully');
}

// Sync paused requests with background to remove expired ones
async function syncPausedRequests() {
    // Only sync if intercept is enabled
    const interceptToggle = document.getElementById('interceptToggle');
    if (!interceptToggle?.checked) return;

    const panelPaused = store.state.pausedRequests;
    if (!panelPaused || panelPaused.size === 0) return;

    try {
        // Get actual paused requests from background
        const response = await chrome.runtime.sendMessage({
            type: 'GET_PAUSED_REQUESTS',
            tabId: chrome.devtools.inspectedWindow.tabId
        });

        if (response?.success) {
            const backgroundIds = new Set(response.requests.map(r => r.requestId));
            let removed = 0;

            // Remove any requests that are no longer in background's list
            for (const [id] of panelPaused) {
                if (!backgroundIds.has(id)) {
                    console.log('Removing stale paused request:', id);
                    panelPaused.delete(id);
                    removed++;
                }
            }

            if (removed > 0) {
                console.log(`Synced paused requests: removed ${removed} stale entries`);
                updateInterceptPanel();
            }
        }
    } catch (e) {
        // Ignore sync errors
    }
}

// Get latest paused requests from background (for retry logic)
async function getLatestPausedRequestsFromBackground(urlBase, stage) {
    try {
        const response = await chrome.runtime.sendMessage({
            type: 'GET_PAUSED_REQUESTS',
            tabId: chrome.devtools.inspectedWindow.tabId
        });

        if (response?.success && response.requests) {
            // Update local store with latest data
            store.state.pausedRequests = store.state.pausedRequests || new Map();
            const currentIds = new Set();

            for (const req of response.requests) {
                currentIds.add(req.requestId);
                if (!store.state.pausedRequests.has(req.requestId)) {
                    store.state.pausedRequests.set(req.requestId, req);
                }
            }

            // Find a matching request with the same URL base and stage
            for (const req of response.requests) {
                if (req.url.split('?')[0] === urlBase && req.stage === stage) {
                    return req;
                }
            }
        }
    } catch (e) {
        console.warn('Failed to get latest paused requests:', e);
    }
    return null;
}

// Handle messages from background script
function handleBackgroundMessage(message, sender, sendResponse) {
    console.log('NetSpy: Received message', message.type);

    switch (message.type) {
        case 'REQUEST_PAUSED':
            handleRequestPaused(message);
            break;
        case 'RESPONSE_PAUSED':
            handleResponsePaused(message);
            break;
        case 'REQUEST_CONTINUED':
        case 'REQUEST_DROPPED':
            handleRequestResumed(message);
            break;
        case 'REQUESTS_AUTO_CONTINUED':
            // Polling requests auto-replaced by newer ones
            handleRequestsAutoContinued(message);
            break;
        case 'INTERCEPTION_REMOVED':
            // Single interception removed (expired, timeout, completed, failed, replaced)
            handleInterceptionRemoved(message);
            break;
        case 'INTERCEPTION_DISABLED':
            // Debugger was detached (user cancelled or tab closed)
            handleInterceptionDisabled(message);
            break;
    }

    sendResponse({ received: true });
    return true;
}

// Handle paused request
function handleRequestPaused(message) {
    const request = message.request;
    const requestId = request.requestId;

    // Add to paused requests
    store.state.pausedRequests = store.state.pausedRequests || new Map();
    store.state.pausedRequests.set(requestId, {
        id: requestId,
        requestId: requestId, // Keep original requestId for background communication
        url: request.url,
        method: request.method || 'GET',
        headers: request.headers || [],
        postData: request.postData || '',
        stage: request.stage || 'request',
        timestamp: Date.now()
    });

    // Update UI
    updateInterceptPanel();
    requestList.render();
}

// Handle paused response
function handleResponsePaused(message) {
    const request = message.request;
    const requestId = request.requestId;

    console.log('handleResponsePaused:', request);
    console.log('Response body length:', request.responseBody?.length);

    store.state.pausedRequests = store.state.pausedRequests || new Map();
    store.state.pausedRequests.set(requestId, {
        id: requestId,
        requestId: requestId,
        url: request.url || '',
        method: request.method || 'GET',
        responseStatus: request.responseStatus,
        responseStatusText: request.responseStatusText || '',
        headers: request.headers || [],
        responseHeaders: request.responseHeaders || [],
        postData: request.postData || '',
        responseBody: request.responseBody || '',  // Fixed: was 'body'
        stage: request.stage || 'response',
        timestamp: Date.now()
    });

    updateInterceptPanel();
    requestList.render();
}

// Handle resumed/dropped request
function handleRequestResumed(message) {
    const { requestId } = message;

    if (store.state.pausedRequests) {
        store.state.pausedRequests.delete(requestId);
    }

    updateInterceptPanel();
    requestList.render();
}

// Handle auto-continued polling requests (replaced by newer ones)
function handleRequestsAutoContinued(message) {
    const { requestIds } = message;

    if (!requestIds || !store.state.pausedRequests) return;

    let removed = 0;
    for (const requestId of requestIds) {
        if (store.state.pausedRequests.has(requestId)) {
            store.state.pausedRequests.delete(requestId);
            removed++;
        }
    }

    if (removed > 0) {
        console.log(`Auto-replaced ${removed} older polling request(s)`);
        updateInterceptPanel();
        requestList.render();
    }
}

// Handle single interception removed (from InterceptionManager)
function handleInterceptionRemoved(message) {
    const { interceptionId, reason } = message.data || {};

    if (!interceptionId || !store.state.pausedRequests) return;

    if (store.state.pausedRequests.has(interceptionId)) {
        store.state.pausedRequests.delete(interceptionId);
        console.log(`Interception removed (${reason}): ${interceptionId}`);
        updateInterceptPanel();
        requestList.render();

        // If we're currently viewing this request, show empty
        if (store.state.selectedRequestId === interceptionId) {
            detailPanel.showEmpty();
        }
    }
}

// Handle interception disabled (debugger detached by user)
function handleInterceptionDisabled(message) {
    console.log('Interception disabled:', message.reason);

    // Only handle if this is for the current tab
    const currentTabId = chrome.devtools.inspectedWindow.tabId;
    if (message.tabId !== currentTabId) return;

    // Update store
    store.state.interceptionEnabled = false;

    // Clear paused requests
    if (store.state.pausedRequests) {
        store.state.pausedRequests.clear();
    }

    // Update UI - turn off the toggle switch
    const interceptToggle = document.getElementById('interceptToggle');
    if (interceptToggle) {
        interceptToggle.checked = false;
    }

    // Hide intercept panel
    const panel = document.getElementById('interceptPanel');
    if (panel) {
        panel.classList.add('hidden');
    }

    // Re-render request list
    requestList.render();

    console.log('Intercept toggle disabled due to debugger detach');
}

// Update intercept panel UI
function updateInterceptPanel() {
    const panel = document.getElementById('interceptPanel');
    const countEl = document.getElementById('pausedCount');
    const listEl = document.getElementById('pausedList');

    const pausedRequests = store.state.pausedRequests || new Map();
    const count = pausedRequests.size;

    // Update count
    if (countEl) countEl.textContent = count;

    // Show/hide panel
    if (panel) {
        panel.classList.toggle('hidden', count === 0);
    }

    // Render paused list
    if (listEl) {
        if (count === 0) {
            listEl.innerHTML = '<div class="paused-empty">No paused requests</div>';
        } else {
            listEl.innerHTML = Array.from(pausedRequests.entries()).map(([id, req]) => `
                <div class="paused-item" data-id="${id}">
                    <div class="paused-info">
                        <span class="paused-method method-${(req.method || 'GET').toLowerCase()}">${req.method || 'GET'}</span>
                        <span class="paused-url" title="${req.url}">${truncateUrl(req.url)}</span>
                        <span class="paused-stage stage-${req.stage}">${req.stage === 'response' ? '📥 Response' : '📤 Request'}</span>
                    </div>
                    <div class="paused-actions">
                        <button class="paused-btn edit-btn" data-id="${id}" data-action="edit">✏️ Edit</button>
                        ${req.stage !== 'response' ? `<button class="paused-btn mock-btn" data-id="${id}" data-action="mock">🎭 Mock</button>` : ''}
                        <button class="paused-btn continue-btn" data-id="${id}" data-action="continue">▶️ Continue</button>
                        <button class="paused-btn drop-btn" data-id="${id}" data-action="drop">🚫 Drop</button>
                    </div>
                </div>
            `).join('');

            // Bind action handlers
            listEl.querySelectorAll('.paused-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    handleInterceptAction(btn.dataset.action, btn.dataset.id);
                });
            });
        }
    }
}

// Handle intercept actions
async function handleInterceptAction(action, requestId) {
    console.log('Intercept action:', action, requestId);

    const pausedRequest = store.state.pausedRequests?.get(requestId);
    if (!pausedRequest) return;

    switch (action) {
        case 'edit':
            // Show in detail panel for editing
            detailPanel.showRequest({
                id: requestId,
                url: pausedRequest.url,
                method: pausedRequest.method,
                headers: pausedRequest.headers,
                postData: pausedRequest.postData,
                // Response info (for response stage)
                status: pausedRequest.responseStatus,
                statusText: pausedRequest.responseStatusText,
                responseHeaders: pausedRequest.responseHeaders || [],
                responseBody: pausedRequest.responseBody || '',
                // Intercept flags
                isPaused: true,
                stage: pausedRequest.stage
            });
            break;

        case 'mock':
            // Show in detail panel for mock response editing
            detailPanel.showRequest({
                id: requestId,
                url: pausedRequest.url,
                method: pausedRequest.method,
                headers: pausedRequest.headers,
                postData: pausedRequest.postData,
                // Empty response for mock
                status: 200,
                statusText: 'OK',
                responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
                responseBody: '{\n  "code": 1,\n  "msg": "success"\n}',
                // Intercept flags - mark as mock mode
                isPaused: true,
                stage: 'mock'
            });
            break;

        case 'continue':
            await sendInterceptResponse(requestId, 'continue', pausedRequest);
            break;

        case 'drop':
            await sendInterceptResponse(requestId, 'drop', pausedRequest);
            break;
    }
}

// Send intercept response to background
async function sendInterceptResponse(requestId, action, data) {
    try {
        const tabId = chrome.devtools.inspectedWindow.tabId;

        // Save request info before sending (for finding it later)
        const pausedReq = store.state.pausedRequests?.get(requestId);
        const requestUrl = pausedReq?.url;

        const response = await chrome.runtime.sendMessage({
            type: action === 'drop' ? 'DROP_REQUEST' : 'CONTINUE_REQUEST',
            tabId: tabId,
            requestId: requestId,
            modifications: data
        });

        console.log('Intercept response result:', response);

        if (response?.success) {
            store.state.pausedRequests?.delete(requestId);
            updateInterceptPanel();

            // If action is continue, try to find and select the completed request
            if (action === 'continue' && requestUrl) {
                console.log('Waiting for request to complete:', requestUrl);

                // Poll for the request to appear in the list (up to 3 seconds)
                let attempts = 0;
                const maxAttempts = 12;
                const checkInterval = setInterval(() => {
                    attempts++;
                    const matchingRequest = [...store.state.requests].reverse().find(r => r.url === requestUrl);

                    console.log(`Attempt ${attempts}: Looking for request, found:`, matchingRequest?.id);

                    if (matchingRequest) {
                        clearInterval(checkInterval);
                        // Select and show the request
                        store.selectRequest(matchingRequest.id);
                        detailPanel.showRequest(matchingRequest);
                        requestList.render();
                        console.log('Jumped to completed request:', matchingRequest.id);
                    } else if (attempts >= maxAttempts) {
                        clearInterval(checkInterval);
                        console.log('Request not found after', maxAttempts, 'attempts');
                    }
                }, 250);
            }
        } else {
            console.error('Intercept action failed:', response?.error);

            // If request has expired, remove it from the paused list
            if (response?.error && (
                response.error.includes('expired') ||
                response.error.includes('no longer paused') ||
                response.error.includes('Invalid InterceptionId')
            )) {
                console.log('Removing expired request from paused list:', requestId);
                store.state.pausedRequests?.delete(requestId);
                updateInterceptPanel();
            }
        }
    } catch (error) {
        console.error('Failed to send intercept response:', error);
    }
}

// Truncate URL for display
function truncateUrl(url, maxLen = 60) {
    if (!url || url.length <= maxLen) return url;
    try {
        const urlObj = new URL(url);
        const path = urlObj.pathname + urlObj.search;
        return urlObj.hostname + (path.length > 30 ? path.substring(0, 30) + '...' : path);
    } catch {
        return url.substring(0, maxLen) + '...';
    }
}

// Handle captured request
function handleRequest(harEntry) {
    if (!store.state.isRecording) return;

    const request = harEntry.request;
    const response = harEntry.response;
    const timings = harEntry.timings;

    const resourceType = harEntry._resourceType || 'other';
    const isApi = resourceType === 'xhr' || resourceType === 'fetch';

    // Check for pending modifications (intercepted & modified requests)
    let modifiedData = null;
    const pendingMods = store.state.pendingModifications;

    // Try to find matching modification by URL (before query params) and timestamp window
    for (const [key, mod] of pendingMods.entries()) {
        const timeDiff = Date.now() - mod.timestamp;
        // Match by original URL prefix and within 10 second window
        if (timeDiff < 10000 && request.url.includes(mod.originalUrlBase)) {
            modifiedData = mod;
            pendingMods.delete(key);
            console.log('Applied pending modification for:', request.url);
            break;
        }
    }

    // Calculate size - try multiple sources
    // HAR bodySize can be -1 (unknown), so check multiple places
    let calculatedSize = response.bodySize;
    if (calculatedSize === undefined || calculatedSize === null || calculatedSize < 0) {
        calculatedSize = response.content?.size;
    }
    if (calculatedSize === undefined || calculatedSize === null || calculatedSize < 0) {
        // Try to get from Content-Length header
        const contentLength = response.headers?.find(h => h.name?.toLowerCase() === 'content-length');
        if (contentLength?.value) {
            calculatedSize = parseInt(contentLength.value, 10);
        }
    }
    // If still no valid size, use 0 (will display as '-')
    if (calculatedSize === undefined || calculatedSize === null || calculatedSize < 0) {
        calculatedSize = 0;
    }

    const entry = {
        id: 'req-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        // Use modified values if available, otherwise original
        url: modifiedData?.url || request.url,
        method: modifiedData?.method || request.method,
        status: response.status,
        statusText: response.statusText,
        resourceType: resourceType,
        isApi: isApi,
        type: resourceType,
        size: calculatedSize,
        time: Date.now(),
        timings: {
            // harEntry.time is the total elapsed time in ms
            total: harEntry.time || 0
        },
        headers: modifiedData?.headers || request.headers || [],
        responseHeaders: response.headers || [],
        postData: modifiedData?.body || request.postData?.text || '',
        responseBody: '',
        _harEntry: harEntry,
        // Mark as modified if intercepted
        wasIntercepted: !!modifiedData,
        wasModified: !!modifiedData
    };

    store.addRequest(entry);
    requestList.render();
}

// Fetch response body
async function fetchResponseBody(request) {
    if (request.responseBody || !request._harEntry) return request;

    return new Promise(resolve => {
        request._harEntry.getContent((content, encoding) => {
            request.responseBody = content || '';
            resolve(request);
        });
    });
}

// Previous state for change detection
let prevSelectedId = null;
let prevRequestCount = 0;

// Handle state changes
function handleStateChange(newState) {
    if (newState.requests.length !== prevRequestCount) {
        prevRequestCount = newState.requests.length;
        requestList.render();
    }

    if (newState.selectedRequestId !== prevSelectedId) {
        prevSelectedId = newState.selectedRequestId;
        const selected = newState.requests.find(r => r.id === newState.selectedRequestId);

        if (selected) {
            fetchResponseBody(selected).then(() => {
                detailPanel.showRequest(selected);
            });
        } else {
            detailPanel.showEmpty();
        }
    }

    toolbar.update();
}

// Setup resize handle
function setupResizer() {
    const resizer = document.getElementById('resizer');
    const leftPanel = document.getElementById('leftPanel');

    if (!resizer || !leftPanel) return;

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        startWidth = leftPanel.offsetWidth;
        resizer.classList.add('active');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const delta = e.clientX - startX;
        const newWidth = Math.min(Math.max(startWidth + delta, 300), window.innerWidth - 400);
        leftPanel.style.width = newWidth + 'px';
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            resizer.classList.remove('active');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });
}

// Setup horizontal resize handle (between request and response sections)
function setupHorizontalResizer() {
    const hResizer = document.getElementById('hResizer');
    const requestSection = document.querySelector('.request-section');
    const responseSection = document.querySelector('.response-section');
    const detailView = document.getElementById('detailView');

    if (!hResizer || !requestSection || !responseSection || !detailView) return;

    let isResizing = false;
    let startY = 0;
    let startHeight = 0;

    hResizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        startY = e.clientY;
        startHeight = requestSection.offsetHeight;
        hResizer.classList.add('active');
        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const delta = e.clientY - startY;
        const detailViewHeight = detailView.offsetHeight;
        const minHeight = 100;
        const maxHeight = detailViewHeight - 150; // Leave room for response section
        const newHeight = Math.min(Math.max(startHeight + delta, minHeight), maxHeight);
        requestSection.style.flex = `0 0 ${newHeight}px`;
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            hResizer.classList.remove('active');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });
}

// Setup global API
function setupGlobalAPI() {
    window.NetSpy = {
        clear: () => {
            store.clearRequests();
            detailPanel.showEmpty();
            requestList.render();
        },

        sendRequest: sendRequest,

        handleInterceptAction: handleInterceptAction,

        downloadAsFile: (mimeType) => detailPanel.downloadResponseBody(mimeType)
    };

    document.getElementById('sendBtn')?.addEventListener('click', window.NetSpy.sendRequest);
}

// Send request via background script
async function sendRequest() {
    const sendBtn = document.getElementById('sendBtn');
    const values = detailPanel.getValues();

    // Validate before sending
    const validation = detailPanel.validate();
    if (!validation.valid) {
        console.error('Validation errors:', validation.errors);
        if (sendBtn) {
            sendBtn.classList.add('error');
            sendBtn.innerHTML = '✗ ' + validation.errors[0];
            setTimeout(() => {
                sendBtn.classList.remove('error');
                sendBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg><span>Send</span>';
            }, 3000);
        }
        return;
    }
    if (validation.warnings.length > 0) {
        console.warn('Validation warnings:', validation.warnings);
    }

    if (!values.url) {
        console.error('No URL specified');
        return;
    }

    const isInterceptMode = values.isInterceptEdit;
    console.log('Sending request:', values, 'Intercept mode:', isInterceptMode);

    // Update button state
    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.innerHTML = '<span class="spinner"></span> ' + (isInterceptMode ? 'Continuing...' : 'Sending...');
    }

    try {
        // Build headers array for intercept mode, object for normal mode
        const headersArray = values.headers.map(h => ({ name: h.name, value: h.value }));
        const headersObject = {};
        values.headers.forEach(h => {
            if (h.name) headersObject[h.name] = h.value;
        });

        // Prepare body based on type
        let requestBody = undefined;
        let contentType = null;

        switch (values.bodyType) {
            case 'json':
                contentType = 'application/json';
                requestBody = values.body;
                break;
            case 'urlencoded':
                contentType = 'application/x-www-form-urlencoded';
                requestBody = values.body;
                break;
            case 'formdata':
                if (values.bodyModified) {
                    // Body was rebuilt — use new boundary
                    if (values.bodyBoundary) {
                        contentType = `multipart/form-data; boundary=${values.bodyBoundary}`;
                    } else {
                        contentType = 'multipart/form-data';
                    }
                    requestBody = values.body;
                }
                // If not modified, keep original Content-Type header (with original boundary)
                break;
            case 'raw':
                requestBody = values.body;
                break;
            default:
                // none - no body
                break;
        }

        // Set content-type header (update both headersObject and headersArray)
        if (contentType) {
            headersObject['Content-Type'] = contentType;
            // Update headersArray to match — replace existing Content-Type or add new one
            const ctIdx = headersArray.findIndex(h => h.name.toLowerCase() === 'content-type');
            if (ctIdx >= 0) {
                headersArray[ctIdx].value = contentType;
            } else {
                headersArray.push({ name: 'Content-Type', value: contentType });
            }
        }

        let response;

        // Check if this is still a valid paused request in the store
        const isPausedInStore = isInterceptMode &&
            values.interceptRequestId &&
            store.state.pausedRequests?.has(values.interceptRequestId);

        if (isPausedInStore) {
            const tabId = chrome.devtools.inspectedWindow.tabId;

            if (values.interceptStage === 'response' || values.interceptStage === 'mock') {
                // Response/Mock intercept: use FULFILL_REQUEST to send modified response
                let requestIdToUse = values.interceptRequestId;
                let retryCount = 0;
                const maxRetries = 3;

                while (retryCount < maxRetries) {
                    response = await chrome.runtime.sendMessage({
                        type: 'FULFILL_REQUEST',
                        tabId: tabId,
                        requestId: requestIdToUse,
                        mockResponse: {
                            status: values.responseStatus || 200,
                            statusText: values.responseStatusText || 'OK',
                            headers: values.responseHeaders.map(h => ({ name: h.name, value: h.value })),
                            body: values.responseBody || ''
                        }
                    });

                    if (response?.success) {
                        break; // Success, exit retry loop
                    }

                    // Failed - try to find a newer request with same URL base
                    retryCount++;
                    console.log(`Fulfill failed (attempt ${retryCount}), looking for newer request...`);

                    // Remove the failed request from store
                    store.state.pausedRequests?.delete(requestIdToUse);

                    // Find another paused request with similar URL - fetch from background for latest data
                    const urlBase = values.url.split('?')[0];
                    const newerRequest = await getLatestPausedRequestsFromBackground(urlBase, values.interceptStage);

                    if (newerRequest && newerRequest.requestId !== requestIdToUse) {
                        console.log(`Found newer request from background: ${newerRequest.requestId}, retrying...`);
                        requestIdToUse = newerRequest.requestId;
                    } else {
                        // No newer request found, break and throw error
                        console.log('No newer request found in background');
                        break;
                    }
                }

                if (response?.success) {
                    // Save URL for finding the request later
                    const requestUrl = values.url;

                    // Remove from paused requests
                    store.state.pausedRequests?.delete(requestIdToUse);
                    updateInterceptPanel();

                    // Update button
                    if (sendBtn) {
                        sendBtn.classList.add('success');
                        sendBtn.innerHTML = values.interceptStage === 'mock' ? '✓ Mocked' : '✓ Response Modified';
                        setTimeout(() => {
                            sendBtn.classList.remove('success');
                            sendBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg><span>Send</span>';
                        }, 2000);
                    }

                    // Poll for the completed request and jump to it
                    console.log('Waiting for intercepted response to complete:', requestUrl);
                    let attempts = 0;
                    const maxAttempts = 12;
                    const checkInterval = setInterval(() => {
                        attempts++;
                        const matchingRequest = [...store.state.requests].reverse().find(r => r.url === requestUrl);

                        if (matchingRequest) {
                            clearInterval(checkInterval);
                            store.selectRequest(matchingRequest.id);
                            detailPanel.showRequest(matchingRequest);
                            requestList.render();
                            console.log('Jumped to completed request:', matchingRequest.id);
                        } else if (attempts >= maxAttempts) {
                            clearInterval(checkInterval);
                            console.log('Request not found after', maxAttempts, 'attempts');
                        }
                    }, 250);
                } else {
                    // Request has expired - handle gracefully without throwing
                    console.warn('Intercept request expired, cleaning up:', values.interceptRequestId);

                    // Clean up all related paused requests
                    store.state.pausedRequests?.delete(values.interceptRequestId);
                    store.state.pausedRequests?.delete(requestIdToUse);
                    updateInterceptPanel();

                    // Show expired status on button
                    if (sendBtn) {
                        sendBtn.classList.add('warning');
                        sendBtn.innerHTML = '⚠️ Expired';
                        setTimeout(() => {
                            sendBtn.classList.remove('warning');
                            sendBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg><span>Send</span>';
                        }, 2000);
                    }

                    // Show empty state since this request is no longer valid
                    detailPanel.showEmpty();
                    return; // Exit gracefully without throwing
                }
            } else {
                // Request intercept: use CONTINUE_REQUEST
                let requestIdToUse = values.interceptRequestId;
                let retryCount = 0;
                const maxRetries = 3;

                while (retryCount < maxRetries) {
                    const modifications = {};

                    if (values.bodyType === 'formdata' && !values.bodyModified) {
                        // Formdata body NOT modified — pass nothing, let Chrome
                        // use the entire original request as-is (preserves binary files)
                    } else {
                        modifications.url = values.url;
                        modifications.method = values.method;
                        modifications.headers = headersArray;
                        if (requestBody !== undefined) {
                            modifications.postData = requestBody;
                        }
                    }

                    response = await chrome.runtime.sendMessage({
                        type: 'CONTINUE_REQUEST',
                        tabId: tabId,
                        requestId: requestIdToUse,
                        modifications
                    });

                    if (response?.success) {
                        break; // Success, exit retry loop
                    }

                    // Failed - try to find a newer request with same URL base
                    retryCount++;
                    console.log(`Continue failed (attempt ${retryCount}), looking for newer request...`);

                    // Remove the failed request from store
                    store.state.pausedRequests?.delete(requestIdToUse);

                    // Find another paused request with similar URL - fetch from background for latest data
                    const urlBase = values.url.split('?')[0];
                    const newerRequest = await getLatestPausedRequestsFromBackground(urlBase, 'request');

                    if (newerRequest && newerRequest.requestId !== requestIdToUse) {
                        console.log(`Found newer request from background: ${newerRequest.requestId}, retrying...`);
                        requestIdToUse = newerRequest.requestId;
                    } else {
                        // No newer request found, break and throw error
                        console.log('No newer request found in background');
                        break;
                    }
                }

                if (response?.success) {
                    // Get the original paused request info
                    const pausedReq = store.state.pausedRequests?.get(requestIdToUse);
                    const requestUrl = values.url;

                    // Store modifications for later matching when onRequestFinished fires
                    const originalUrlBase = pausedReq?.url?.split('?')[0] || values.url.split('?')[0];
                    store.state.pendingModifications.set(requestIdToUse, {
                        originalUrlBase: originalUrlBase,
                        url: values.url,
                        method: values.method,
                        headers: headersArray,
                        body: requestBody || '',
                        timestamp: Date.now()
                    });

                    console.log('Stored pending modification for:', originalUrlBase);

                    // Remove from paused requests
                    store.state.pausedRequests?.delete(requestIdToUse);
                    updateInterceptPanel();

                    // Update button
                    if (sendBtn) {
                        sendBtn.classList.add('success');
                        sendBtn.innerHTML = '✓ Continued';
                        setTimeout(() => {
                            sendBtn.classList.remove('success');
                            sendBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg><span>Send</span>';
                        }, 2000);
                    }

                    // Poll for the completed request and jump to it
                    console.log('Waiting for intercepted request to complete:', requestUrl);
                    let attempts = 0;
                    const maxAttempts = 12;
                    const checkInterval = setInterval(() => {
                        attempts++;
                        const matchingRequest = [...store.state.requests].reverse().find(r => r.url === requestUrl);

                        if (matchingRequest) {
                            clearInterval(checkInterval);
                            store.selectRequest(matchingRequest.id);
                            detailPanel.showRequest(matchingRequest);
                            requestList.render();
                            console.log('Jumped to completed request:', matchingRequest.id);
                        } else if (attempts >= maxAttempts) {
                            clearInterval(checkInterval);
                            console.log('Request not found after', maxAttempts, 'attempts');
                        }
                    }, 250);
                } else {
                    // Request has expired - handle gracefully without throwing
                    console.warn('Intercept request expired, cleaning up:', values.interceptRequestId);

                    // Clean up all related paused requests
                    store.state.pausedRequests?.delete(values.interceptRequestId);
                    store.state.pausedRequests?.delete(requestIdToUse);
                    updateInterceptPanel();

                    // Show expired status on button
                    if (sendBtn) {
                        sendBtn.classList.add('warning');
                        sendBtn.innerHTML = '⚠️ Expired';
                        setTimeout(() => {
                            sendBtn.classList.remove('warning');
                            sendBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg><span>Send</span>';
                        }, 2000);
                    }

                    // Show empty state since this request is no longer valid
                    detailPanel.showEmpty();
                    return; // Exit gracefully without throwing
                }
            }

        } else {
            // Normal send request
            const sendData = {
                url: values.url,
                method: values.method,
                headers: headersObject,
                body: requestBody,
                bodyType: values.bodyType
            };
            // For formdata, send pairs so background can use FormData API
            if (values.bodyType === 'formdata' && values.bodyPairs) {
                sendData.bodyPairs = values.bodyPairs.map(p => ({
                    name: p.name,
                    value: p.value,
                    type: p.type || 'text',
                    fileName: p.fileName || '',
                    contentType: p.contentType || '',
                }));
            }
            response = await chrome.runtime.sendMessage({
                type: 'SEND_REQUEST',
                data: sendData
            });

            console.log('Response received:', response);

            if (response?.success) {
                // Detect resource type from Content-Type header
                const contentType = response.data.headers?.find(h => h.name?.toLowerCase() === 'content-type')?.value || '';
                let resourceType = 'xhr';
                if (contentType.startsWith('image/')) resourceType = 'img';
                else if (contentType.startsWith('video/') || contentType.startsWith('audio/')) resourceType = 'media';
                else if (contentType.includes('javascript')) resourceType = 'js';
                else if (contentType.includes('css')) resourceType = 'css';
                else if (contentType.includes('html')) resourceType = 'document';
                else if (contentType.includes('json') || contentType.includes('xml')) resourceType = 'xhr';

                // Calculate size - for base64, decode the actual byte size
                let bodySize = 0;
                if (response.data.isBase64 && response.data.body) {
                    // Base64 string length * 3/4 gives approximate byte size
                    bodySize = Math.floor(response.data.body.length * 3 / 4);
                } else if (response.data.body) {
                    bodySize = response.data.body.length;
                }

                const entry = {
                    id: 'req-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                    url: values.url,
                    method: values.method,
                    status: response.data.status,
                    statusText: response.data.statusText,
                    resourceType: resourceType,
                    isApi: resourceType === 'xhr',
                    type: resourceType,
                    size: bodySize,
                    time: Date.now(),
                    timings: { total: response.data.time || 0 },
                    headers: values.headers,
                    responseHeaders: response.data.headers || [],
                    postData: values.body,
                    responseBody: response.data.body || '',
                    isBase64: response.data.isBase64 || false,  // Flag for binary content
                    isSent: true
                };

                store.addRequest(entry);
                store.selectRequest(entry.id);
                requestList.render();
                detailPanel.showRequest(entry);

                if (sendBtn) {
                    sendBtn.classList.add('success');
                    sendBtn.innerHTML = '✓ ' + response.data.status;
                    setTimeout(() => {
                        sendBtn.classList.remove('success');
                        sendBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg><span>Send</span>';
                    }, 2000);
                }
            } else {
                throw new Error(response?.error || 'Request failed');
            }
        }

    } catch (error) {
        console.error('Send request error:', error);

        // If error indicates request has expired, clean up the paused request
        const errorMsg = error.message || String(error);
        if (values?.interceptRequestId && (
            errorMsg.includes('expired') ||
            errorMsg.includes('no longer paused') ||
            errorMsg.includes('Invalid InterceptionId') ||
            errorMsg.includes('Fulfill failed') ||
            errorMsg.includes('Continue failed')
        )) {
            console.log('Removing expired intercept request:', values.interceptRequestId);
            store.state.pausedRequests?.delete(values.interceptRequestId);
            updateInterceptPanel();
        }

        if (sendBtn) {
            sendBtn.classList.add('error');
            sendBtn.innerHTML = '✗ Error';
            setTimeout(() => {
                sendBtn.classList.remove('error');
                sendBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg><span>Send</span>';
            }, 2000);
        }
    } finally {
        if (sendBtn) {
            sendBtn.disabled = false;
        }
    }
}

