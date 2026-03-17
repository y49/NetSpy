// Background script for NetSpy extension
console.log("NetSpy background script loaded");
importScripts('js/utils/encoding.js');

// ==========================================
// INTERCEPTION MANAGER - STATE MANAGEMENT
// ==========================================

// Tab level state
const attachedTabs = new Map(); // tabId -> { patterns: [], mode: string }

// InterceptionManager state (global)
const interceptionState = {
    // 主存储：所有活跃的拦截请求
    active: new Map(), // interceptionId -> { networkId, url, normalizedUrl, timestamp, stage, tabId, metadata }

    // URL 映射：用于处理循环请求，同标准化URL只保留最新
    urlLatest: new Map(), // normalizedUrl -> interceptionId

    // 网络 ID 映射：用于响应 Network 事件的清理
    networkToInterception: new Map(), // networkId -> interceptionId
};

// Configuration
const TIMEOUT_MS = 30000; // 30 seconds timeout
const CLEANUP_INTERVAL = 5000; // 5 seconds cleanup scan

// ==========================================
// POLLING REQUEST STRATEGY
// ==========================================
const POLLING_STRATEGY = {
    KEEP_LATEST: 'keep_latest',   // 放行旧请求，只保留最新
    BLOCK_OLD: 'block_old',       // 阻止旧请求，只保留最新
    BLOCK_ALL: 'block_all',       // 阻止所有同 URL 请求（包括新的）
    KEEP_ALL: 'keep_all',         // 全部保留，用户手动处理
    QUEUE: 'queue',               // 队列模式：处理完一个才放行下一个
};

// Default polling strategy (can be changed via message)
let currentPollingStrategy = POLLING_STRATEGY.KEEP_LATEST;

// ==========================================
// URL NORMALIZATION
// ==========================================

// 标准化 URL，移除动态参数
function normalizeUrl(url) {
    try {
        const u = new URL(url);
        // 移除常见的时间戳/随机数参数
        const dynamicParams = ['_t', 't', 'timestamp', '_', 'random', 'v', 'nocache', 'cb', 'callback'];
        dynamicParams.forEach(p => u.searchParams.delete(p));
        // 对于 JSONP 回调参数，只保留参数名不保留值
        for (const [key] of u.searchParams) {
            if (key.toLowerCase().includes('callback') || key.toLowerCase().includes('jsonp')) {
                u.searchParams.set(key, '__callback__');
            }
        }
        return u.origin + u.pathname + '?' + u.searchParams.toString();
    } catch {
        return url.split('?')[0]; // Fallback to just pathname
    }
}

// ==========================================
// INTERCEPTION STATE MANAGEMENT
// ==========================================

// 注册新拦截
function registerInterception(interceptionId, metadata) {
    interceptionState.active.set(interceptionId, metadata);
    interceptionState.urlLatest.set(metadata.normalizedUrl, interceptionId);
    if (metadata.networkId) {
        interceptionState.networkToInterception.set(metadata.networkId, interceptionId);
    }
}

// 移除拦截（统一出口）
function removeFromState(interceptionId) {
    const data = interceptionState.active.get(interceptionId);
    if (!data) return;

    interceptionState.active.delete(interceptionId);

    // 只有当 urlLatest 指向的是当前 ID 才清除
    if (interceptionState.urlLatest.get(data.normalizedUrl) === interceptionId) {
        interceptionState.urlLatest.delete(data.normalizedUrl);
    }

    if (data.networkId) {
        interceptionState.networkToInterception.delete(data.networkId);
    }

    // Also remove from tab's pausedRequests for backward compatibility
    const tabData = attachedTabs.get(data.tabId);
    if (tabData?.pausedRequests) {
        tabData.pausedRequests.delete(interceptionId);
    }
}

// 检查 ID 是否有效
function isValidInterception(interceptionId) {
    return interceptionState.active.has(interceptionId);
}

// ==========================================
// SAFE EXECUTION WRAPPER
// ==========================================

// 检测是否为 Invalid ID 错误
function isInvalidIdError(error) {
    const msg = error?.message || String(error);
    return msg.includes('-32602') ||
        msg.includes('Invalid InterceptionId') ||
        msg.includes('No resource with given identifier');
}

// 安全执行 Debugger 命令
async function safeExecute(tabId, method, params) {
    const interceptionId = params.requestId;

    // 前置校验
    if (interceptionId && !isValidInterception(interceptionId)) {
        console.warn(`safeExecute: ID already invalid: ${interceptionId}`);
        return { success: false, reason: 'already_invalid' };
    }

    try {
        await chrome.debugger.sendCommand({ tabId }, method, params);
        if (interceptionId) {
            removeFromState(interceptionId);
        }
        return { success: true };
    } catch (error) {
        if (interceptionId) {
            removeFromState(interceptionId);
        }

        // 特定错误静默处理
        if (isInvalidIdError(error)) {
            console.warn(`safeExecute: ID expired during execution: ${interceptionId}`);
            notifyUIRemove(interceptionId, 'expired');
            return { success: false, reason: 'expired' };
        }

        // 其他错误上报
        console.error(`safeExecute failed:`, error);
        return { success: false, reason: 'unknown', error: error.message };
    }
}

// 静默放行（不通知 UI，用于自动处理）
async function silentContinue(tabId, interceptionId, stage = 'request') {
    if (!isValidInterception(interceptionId)) return;

    try {
        if (stage === 'request') {
            await chrome.debugger.sendCommand({ tabId }, 'Fetch.continueRequest', {
                requestId: interceptionId
            });
        } else {
            // For response, get the original data and fulfill
            const data = interceptionState.active.get(interceptionId);
            if (data?.metadata?.responseBody !== undefined) {
                const encodedBody = EncodingUtils.utf8ToBase64(data.metadata.responseBody || '');
                await chrome.debugger.sendCommand({ tabId }, 'Fetch.fulfillRequest', {
                    requestId: interceptionId,
                    responseCode: data.metadata.responseStatus || 200,
                    responseHeaders: data.metadata.responseHeaders || [],
                    body: encodedBody
                });
            } else {
                // No response body, just continue
                await chrome.debugger.sendCommand({ tabId }, 'Fetch.continueRequest', {
                    requestId: interceptionId
                });
            }
        }
    } catch (e) {
        // 忽略所有错误（静默处理）
    }
    removeFromState(interceptionId);
}

// 静默阻止请求（用于 BLOCK_OLD 和 BLOCK_ALL 策略）
async function silentDrop(tabId, interceptionId) {
    if (!isValidInterception(interceptionId)) return;

    try {
        await chrome.debugger.sendCommand({ tabId }, 'Fetch.failRequest', {
            requestId: interceptionId,
            errorReason: 'BlockedByClient'
        });
    } catch (e) {
        // 忽略所有错误（静默处理）
    }
    removeFromState(interceptionId);
}

// UI 通知函数
function notifyUIRemove(interceptionId, reason) {
    chrome.runtime.sendMessage({
        type: 'INTERCEPTION_REMOVED',
        data: { interceptionId, reason }
    }).catch(() => { });
}

// ==========================================
// TIMEOUT CLEANUP
// ==========================================

// 启动超时清理定时器
function startTimeoutWatcher() {
    setInterval(() => {
        const now = Date.now();
        const expiredIds = [];

        for (const [interceptionId, data] of interceptionState.active) {
            if (now - data.timestamp > TIMEOUT_MS) {
                expiredIds.push({ interceptionId, tabId: data.tabId, stage: data.stage });
            }
        }

        // 批量处理过期请求
        expiredIds.forEach(({ interceptionId, tabId, stage }) => {
            console.log(`Timeout cleanup: ${interceptionId}`);
            silentContinue(tabId, interceptionId, stage);
            notifyUIRemove(interceptionId, 'timeout');
        });

        if (expiredIds.length > 0) {
            console.log(`Cleaned up ${expiredIds.length} timed-out interceptions`);
        }
    }, CLEANUP_INTERVAL);
}

// Start the timeout watcher
startTimeoutWatcher();

// ==========================================
// DEBUGGER MANAGEMENT
// ==========================================

// Attach debugger to tab
async function attachDebugger(tabId) {
    if (attachedTabs.has(tabId)) {
        console.log(`Debugger already attached to tab ${tabId}`);
        return true;
    }

    try {
        await chrome.debugger.attach({ tabId }, "1.3");
        attachedTabs.set(tabId, {
            patterns: [],
            mode: 'request',
            pausedRequests: new Map() // Keep for backward compatibility
        });

        // Enable Network domain for loadingFinished/Failed events
        await chrome.debugger.sendCommand({ tabId }, "Network.enable");

        console.log(`Debugger attached to tab ${tabId}`);
        return true;
    } catch (e) {
        console.error(`Failed to attach debugger to tab ${tabId}:`, e);
        return false;
    }
}

// Detach debugger from tab
async function detachDebugger(tabId) {
    if (!attachedTabs.has(tabId)) return true;

    try {
        await chrome.debugger.detach({ tabId });
        attachedTabs.delete(tabId);
        console.log(`Debugger detached from tab ${tabId}`);
        return true;
    } catch (e) {
        console.error(`Failed to detach debugger from tab ${tabId}:`, e);
        return false;
    }
}

// Enable request interception with URL patterns
// interceptMode: 'request' | 'response' | 'both'
async function enableInterception(tabId, patterns = ['*'], interceptMode = 'request') {
    console.log('enableInterception called:', { tabId, patterns, interceptMode });

    if (!attachedTabs.has(tabId)) {
        console.log('Attaching debugger to tab', tabId);
        const attached = await attachDebugger(tabId);
        if (!attached) {
            console.error('Failed to attach debugger');
            return false;
        }
    }

    try {
        // Build pattern configurations based on mode
        const patternConfigs = [];
        patterns.forEach(pattern => {
            if (interceptMode === 'request' || interceptMode === 'both') {
                patternConfigs.push({
                    urlPattern: pattern,
                    requestStage: "Request"
                });
            }
            if (interceptMode === 'response' || interceptMode === 'both') {
                patternConfigs.push({
                    urlPattern: pattern,
                    requestStage: "Response"
                });
            }
        });

        console.log('Enabling Fetch domain with patterns:', patternConfigs);

        // Enable Fetch domain with patterns
        await chrome.debugger.sendCommand({ tabId }, "Fetch.enable", {
            patterns: patternConfigs
        });

        const tabData = attachedTabs.get(tabId);
        tabData.patterns = patterns;
        tabData.interceptMode = interceptMode;
        console.log(`Interception enabled successfully for tab ${tabId}`);
        return true;
    } catch (e) {
        console.error(`Failed to enable interception for tab ${tabId}:`, e);
        return false;
    }
}

// Disable interception
async function disableInterception(tabId) {
    if (!attachedTabs.has(tabId)) return true;

    try {
        await chrome.debugger.sendCommand({ tabId }, "Fetch.disable");
        console.log(`Interception disabled for tab ${tabId}`);
        return true;
    } catch (e) {
        console.error(`Failed to disable interception for tab ${tabId}:`, e);
        return false;
    }
}

// Continue request with optional modifications
async function continueRequest(tabId, requestId, modifications = {}) {
    try {
        // Validate tabId
        if (!tabId) {
            console.error('continueRequest: tabId is missing');
            return { success: false, error: 'tabId is missing' };
        }

        // Validate request is still paused
        const tabData = attachedTabs.get(tabId);
        if (!tabData) {
            console.error('continueRequest: Debugger not attached to tab');
            return { success: false, error: 'Debugger not attached to this tab' };
        }

        if (!tabData.pausedRequests.has(requestId)) {
            console.warn('continueRequest: Request no longer paused (may have expired):', requestId);
            return { success: false, error: 'Request no longer paused (may have expired)' };
        }

        console.log('continueRequest called:', { tabId, requestId, modifications });

        const params = { requestId };

        if (modifications.url) params.url = modifications.url;
        if (modifications.method) params.method = modifications.method;
        if (modifications.headers) {
            params.headers = modifications.headers.map(h => ({
                name: h.name,
                value: String(h.value || '')
            }));
        }
        if (modifications.postData) {
            // postData is now always a pre-serialized string (including multipart)
            // Content-Type with boundary is already set in the headers by the panel
            const postDataStr = typeof modifications.postData === 'string'
                ? modifications.postData
                : JSON.stringify(modifications.postData);

            params.postData = EncodingUtils.utf8ToBase64(postDataStr);
        }

        await chrome.debugger.sendCommand({ tabId }, "Fetch.continueRequest", params);

        // Remove from paused requests
        tabData.pausedRequests.delete(requestId);

        console.log(`Request ${requestId} continued with modifications`);
        return { success: true };
    } catch (e) {
        console.error(`Failed to continue request ${requestId}:`, e);

        // Clean up paused request on error
        const tabData = attachedTabs.get(tabId);
        if (tabData) tabData.pausedRequests.delete(requestId);

        // Check for specific error types
        const errorMsg = e.message || String(e);
        if (errorMsg.includes('Invalid InterceptionId')) {
            return { success: false, error: 'Request has expired or was already handled. Please refresh and try again.' };
        }
        if (errorMsg.includes('No tab with id')) {
            return { success: false, error: 'Tab was closed. Please refresh and try again.' };
        }

        return { success: false, error: errorMsg };
    }
}

// Fulfill request with modified/mock response
async function fulfillRequest(tabId, requestId, mockResponse) {
    try {
        // Validate tabId
        if (!tabId) {
            console.error('fulfillRequest: tabId is missing');
            return { success: false, error: 'Tab ID is missing' };
        }

        // Check if tab is still attached
        const tabData = attachedTabs.get(tabId);
        if (!tabData) {
            console.warn(`fulfillRequest: Tab ${tabId} is not attached or was closed`);
            return { success: false, error: 'Tab is not attached or was closed' };
        }

        // Check if request is still paused
        if (!tabData.pausedRequests.has(requestId)) {
            console.warn(`fulfillRequest: Request ${requestId} is no longer paused (may have timed out or been handled)`);
            return { success: false, error: 'Request is no longer paused (may have timed out)' };
        }

        console.log('fulfillRequest called:', { tabId, requestId, mockResponse });

        // Encode body as base64 (handle UTF-8)
        let encodedBody = '';
        if (mockResponse.body) {
            encodedBody = EncodingUtils.utf8ToBase64(mockResponse.body);
        }

        const params = {
            requestId,
            responseCode: mockResponse.status || 200,
            responseHeaders: (mockResponse.headers || []).map(h => ({
                name: h.name,
                value: String(h.value || '')
            })),
            body: encodedBody
        };

        // Add responsePhrase if provided
        if (mockResponse.statusText) {
            params.responsePhrase = mockResponse.statusText;
        }

        await chrome.debugger.sendCommand({ tabId }, "Fetch.fulfillRequest", params);

        // Remove from paused requests
        tabData.pausedRequests.delete(requestId);

        console.log(`Request ${requestId} fulfilled with mock response`);
        return { success: true };
    } catch (e) {
        console.error(`Failed to fulfill request ${requestId}:`, e);

        // Clean up paused request on error
        const tabData = attachedTabs.get(tabId);
        if (tabData) tabData.pausedRequests.delete(requestId);

        // Check for specific error types
        const errorMsg = e.message || String(e);
        if (errorMsg.includes('Invalid InterceptionId')) {
            return { success: false, error: 'Request has expired or was already handled. Please refresh and try again.' };
        }
        if (errorMsg.includes('No tab with id')) {
            return { success: false, error: 'Tab was closed. Please refresh and try again.' };
        }

        return { success: false, error: errorMsg };
    }
}

// ==========================================
// DEBUGGER EVENT HANDLERS
// ==========================================

chrome.debugger.onEvent.addListener((source, method, params) => {
    const tabId = source.tabId;

    switch (method) {
        case "Fetch.requestPaused":
            handleRequestPaused(tabId, params);
            break;
        case "Network.loadingFinished":
            handleLoadingFinished(params);
            break;
        case "Network.loadingFailed":
            handleLoadingFailed(params);
            break;
    }
});

chrome.debugger.onDetach.addListener((source, reason) => {
    const tabId = source.tabId;
    console.log(`Debugger detached from tab ${tabId}: ${reason}`);

    // Clean up all interceptions for this tab
    for (const [interceptionId, data] of interceptionState.active) {
        if (data.tabId === tabId) {
            removeFromState(interceptionId);
        }
    }

    attachedTabs.delete(tabId);

    // Notify panel that interception was disabled
    chrome.runtime.sendMessage({
        type: 'INTERCEPTION_DISABLED',
        tabId: tabId,
        reason: reason
    }).catch(() => { }); // Ignore if no listener
});

// Handle Network.loadingFinished - clean up completed requests
function handleLoadingFinished(params) {
    const networkId = params.requestId;
    const interceptionId = interceptionState.networkToInterception.get(networkId);
    if (interceptionId) {
        console.log(`Network finished, cleaning up: ${interceptionId}`);
        removeFromState(interceptionId);
        notifyUIRemove(interceptionId, 'completed');
    }
}

// Handle Network.loadingFailed - clean up failed requests
function handleLoadingFailed(params) {
    const networkId = params.requestId;
    const interceptionId = interceptionState.networkToInterception.get(networkId);
    if (interceptionId) {
        console.log(`Network failed, cleaning up: ${interceptionId}`);
        removeFromState(interceptionId);
        notifyUIRemove(interceptionId, 'failed');
    }
}

// ==========================================
// REQUEST PAUSED HANDLER (Core Logic)
// ==========================================

async function handleRequestPaused(tabId, params) {
    const tabData = attachedTabs.get(tabId);
    if (!tabData) return;

    const interceptionId = params.requestId;
    const networkId = params.networkId; // May be undefined
    const isResponse = params.responseStatusCode !== undefined;
    const stage = isResponse ? 'response' : 'request';
    const normalizedUrl = normalizeUrl(params.request.url);

    // -------- Step 1: Apply polling strategy for duplicate/polling requests --------
    const hasOldRequest = interceptionState.urlLatest.has(normalizedUrl);
    const oldInterceptionId = hasOldRequest ? interceptionState.urlLatest.get(normalizedUrl) : null;
    const oldData = oldInterceptionId ? interceptionState.active.get(oldInterceptionId) : null;
    const isDuplicate = oldData && oldData.stage === stage && oldInterceptionId !== interceptionId;

    if (isDuplicate) {
        switch (currentPollingStrategy) {
            case POLLING_STRATEGY.KEEP_LATEST:
                // 放行旧请求，只保留最新
                console.log(`[KEEP_LATEST] Continuing older ${stage}: ${oldInterceptionId}`);
                silentContinue(tabId, oldInterceptionId, stage);
                notifyUIRemove(oldInterceptionId, 'replaced');
                break;

            case POLLING_STRATEGY.BLOCK_OLD:
                // 阻止旧请求，只保留最新
                console.log(`[BLOCK_OLD] Dropping older ${stage}: ${oldInterceptionId}`);
                silentDrop(tabId, oldInterceptionId);
                notifyUIRemove(oldInterceptionId, 'blocked');
                break;

            case POLLING_STRATEGY.BLOCK_ALL:
                // 阻止所有同 URL 请求（包括新的）
                console.log(`[BLOCK_ALL] Dropping new ${stage}: ${interceptionId}`);
                silentDrop(tabId, interceptionId);
                return; // Don't register this request

            case POLLING_STRATEGY.QUEUE:
                // 队列模式：如果有旧请求还在，不处理新请求（等旧的处理完）
                console.log(`[QUEUE] Holding new ${stage}, waiting for: ${oldInterceptionId}`);
                // 新请求直接放行，等旧的处理完
                try {
                    if (stage === 'request') {
                        await chrome.debugger.sendCommand({ tabId }, 'Fetch.continueRequest', { requestId: interceptionId });
                    } else {
                        await chrome.debugger.sendCommand({ tabId }, 'Fetch.continueRequest', { requestId: interceptionId });
                    }
                } catch (e) { /* ignore */ }
                return; // Don't register this request

            case POLLING_STRATEGY.KEEP_ALL:
            default:
                // 全部保留，用户手动处理
                console.log(`[KEEP_ALL] Keeping both requests, old: ${oldInterceptionId}, new: ${interceptionId}`);
                break;
        }
    }

    // -------- Step 2: Build paused entry --------
    const pausedEntry = {
        requestId: interceptionId,
        url: params.request.url,
        method: params.request.method,
        headers: Object.entries(params.request.headers || {}).map(([name, value]) => ({ name, value })),
        postData: params.request.postData || '',
        timestamp: Date.now(),
        stage: stage
    };

    // If response stage, include response info and fetch body
    if (isResponse) {
        pausedEntry.responseStatus = params.responseStatusCode;
        pausedEntry.responseStatusText = getStatusText(params.responseStatusCode);
        pausedEntry.responseHeaders = params.responseHeaders || [];

        // Fetch response body
        try {
            const bodyResult = await chrome.debugger.sendCommand({ tabId }, "Fetch.getResponseBody", {
                requestId: interceptionId
            });

            if (bodyResult.base64Encoded) {
                try {
                    pausedEntry.responseBody = EncodingUtils.base64ToUtf8(bodyResult.body);
                } catch (decodeErr) {
                    // Binary content — keep as base64 string with flag
                    pausedEntry.responseBody = atob(bodyResult.body);
                    pausedEntry.isBase64Body = true;
                }
            } else {
                pausedEntry.responseBody = bodyResult.body;
            }

            console.log('Got response body, length:', pausedEntry.responseBody?.length);
        } catch (e) {
            console.warn('Failed to get response body:', e);
            pausedEntry.responseBody = '';
        }
    }

    // -------- Step 3: Register to InterceptionManager state --------
    registerInterception(interceptionId, {
        networkId: networkId,
        url: params.request.url,
        normalizedUrl: normalizedUrl,
        timestamp: Date.now(),
        stage: stage,
        tabId: tabId,
        metadata: pausedEntry // Store full entry for later use
    });

    // -------- Step 4: Also store in tabData for backward compatibility --------
    tabData.pausedRequests.set(interceptionId, pausedEntry);

    // -------- Step 5: Forward to panel --------
    chrome.runtime.sendMessage({
        type: isResponse ? 'RESPONSE_PAUSED' : 'REQUEST_PAUSED',
        tabId: tabId,
        request: pausedEntry
    }).catch(() => { }); // Ignore if no listener

    console.log(`${isResponse ? 'Response' : 'Request'} paused: ${params.request.method} ${params.request.url}`);
}

// Helper to get status text
function getStatusText(code) {
    const statusTexts = {
        200: 'OK', 201: 'Created', 204: 'No Content',
        301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified',
        400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found',
        500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable'
    };
    return statusTexts[code] || '';
}

// Get response body for a paused response
async function getResponseBody(tabId, requestId) {
    try {
        const result = await chrome.debugger.sendCommand({ tabId }, "Fetch.getResponseBody", {
            requestId: requestId
        });
        // result.body is base64 encoded if result.base64Encoded is true
        if (result.base64Encoded) {
            try {
                return EncodingUtils.base64ToUtf8(result.body);
            } catch (e) {
                return atob(result.body); // Fallback for binary
            }
        }
        return result.body;
    } catch (e) {
        console.error(`Failed to get response body for ${requestId}:`, e);
        return null;
    }
}

// Continue response with modified body
async function continueWithModifiedResponse(tabId, requestId, modifications) {
    try {
        const tabData = attachedTabs.get(tabId);
        if (!tabData) {
            console.error(`No tab data found for tab ${tabId}`);
            return { success: false, error: 'Debugger not attached to tab' };
        }

        const pausedReq = tabData.pausedRequests.get(requestId);
        if (!pausedReq) {
            console.error(`No paused request found for ${requestId}`);
            return { success: false, error: 'Request not found in paused queue' };
        }

        // Format headers for Chrome debugger - it expects [{name, value}] format
        let formattedHeaders = modifications.headers || pausedReq.responseHeaders || [];
        // Ensure headers are in correct format
        if (Array.isArray(formattedHeaders)) {
            formattedHeaders = formattedHeaders.map(h => {
                if (h.name && h.value !== undefined) {
                    return { name: h.name, value: String(h.value) };
                }
                return h;
            });
        }

        const params = {
            requestId,
            responseCode: modifications.status || pausedReq.responseStatus || 200,
            responseHeaders: formattedHeaders,
            body: EncodingUtils.utf8ToBase64(modifications.body || '')
        };

        console.log('Fulfilling response with params:', {
            requestId,
            responseCode: params.responseCode,
            headersCount: formattedHeaders.length,
            bodyLength: modifications.body?.length || 0
        });

        await chrome.debugger.sendCommand({ tabId }, "Fetch.fulfillRequest", params);

        tabData.pausedRequests.delete(requestId);
        console.log(`Response ${requestId} continued with modifications`);
        return { success: true };
    } catch (e) {
        console.error(`Failed to continue response ${requestId}:`, e);
        return { success: false, error: e.message || 'Failed to modify response' };
    }
}

// ==========================================
// MESSAGE HANDLING FROM PANEL
// ==========================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
        try {
            switch (message.type) {
                case 'ATTACH_DEBUGGER':
                    const attached = await attachDebugger(message.tabId);
                    sendResponse({ success: attached });
                    break;

                case 'DETACH_DEBUGGER':
                    const detached = await detachDebugger(message.tabId);
                    sendResponse({ success: detached });
                    break;

                case 'ENABLE_INTERCEPTION':
                    const enabled = await enableInterception(message.tabId, message.patterns, message.mode || 'request');
                    sendResponse({ success: enabled });
                    break;

                case 'DISABLE_INTERCEPTION':
                    const disabled = await disableInterception(message.tabId);
                    sendResponse({ success: disabled });
                    break;

                case 'CONTINUE_REQUEST':
                    const continued = await continueRequest(message.tabId, message.requestId, message.modifications);
                    sendResponse(continued);  // continued is already { success: true/false, error?: ... }
                    break;

                case 'FULFILL_REQUEST':
                    const fulfilled = await fulfillRequest(message.tabId, message.requestId, message.mockResponse);
                    sendResponse(fulfilled);  // fulfilled is already { success: true/false, error?: ... }
                    break;

                case 'GET_PAUSED_REQUESTS':
                    const tabData = attachedTabs.get(message.tabId);
                    const pausedList = tabData ? Array.from(tabData.pausedRequests.values()) : [];
                    sendResponse({ success: true, requests: pausedList });
                    break;

                case 'GET_INTERCEPTION_STATUS':
                    const isActive = attachedTabs.has(message.tabId);
                    const patterns = isActive ? attachedTabs.get(message.tabId).patterns : [];
                    sendResponse({ success: true, active: isActive, patterns: patterns });
                    break;

                case 'SET_POLLING_STRATEGY':
                    const validStrategies = Object.values(POLLING_STRATEGY);
                    if (validStrategies.includes(message.strategy)) {
                        currentPollingStrategy = message.strategy;
                        console.log('Polling strategy set to:', currentPollingStrategy);
                        sendResponse({ success: true, strategy: currentPollingStrategy });
                    } else {
                        sendResponse({ success: false, error: 'Invalid strategy' });
                    }
                    break;

                case 'GET_POLLING_STRATEGY':
                    sendResponse({
                        success: true,
                        strategy: currentPollingStrategy,
                        options: POLLING_STRATEGY
                    });
                    break;

                case 'GET_RESPONSE_BODY':
                    const body = await getResponseBody(message.tabId, message.requestId);
                    sendResponse({ success: body !== null, body: body });
                    break;

                case 'MODIFY_RESPONSE':
                    const modifyResult = await continueWithModifiedResponse(message.tabId, message.requestId, message.modifications);
                    sendResponse(modifyResult);
                    break;

                case 'RESEND_REQUEST':
                    try {
                        const startTime = Date.now();
                        const fetchResponse = await fetch(message.url, message.options);
                        const responseBody = await fetchResponse.text();
                        const responseHeaders = [];
                        fetchResponse.headers.forEach((value, name) => {
                            responseHeaders.push({ name, value });
                        });
                        sendResponse({
                            success: true,
                            status: fetchResponse.status,
                            statusText: fetchResponse.statusText,
                            headers: responseHeaders,
                            body: responseBody,
                            time: Date.now() - startTime
                        });
                    } catch (fetchError) {
                        sendResponse({ success: false, error: fetchError.message });
                    }
                    break;

                case 'SEND_REQUEST':
                    try {
                        const startTime = Date.now();
                        const requestData = message.data;

                        const fetchOptions = {
                            method: requestData.method || 'GET'
                        };

                        // Helper function to validate and filter headers
                        // HTTP/2 pseudo-headers (starting with ':') and headers with invalid characters cause fetch errors
                        const filterValidHeaders = (headers) => {
                            if (!headers || typeof headers !== 'object') return {};
                            const filtered = {};
                            for (const [name, value] of Object.entries(headers)) {
                                // Skip HTTP/2 pseudo-headers (start with ':')
                                if (name.startsWith(':')) continue;
                                // Skip headers with invalid characters (spaces, certain special chars)
                                if (!/^[\w-]+$/.test(name)) continue;
                                // Skip empty header names
                                if (!name.trim()) continue;
                                filtered[name] = value;
                            }
                            return filtered;
                        };

                        // Handle different body types
                        if (requestData.body && requestData.method !== 'GET' && requestData.method !== 'HEAD') {
                            if (requestData.bodyType === 'formdata' && requestData.body.type === 'formdata') {
                                // Build FormData from pairs
                                const formData = new FormData();
                                (requestData.body.pairs || []).forEach(pair => {
                                    formData.append(pair.name, pair.value);
                                });
                                fetchOptions.body = formData;
                                // Don't set headers - browser will set content-type with boundary
                            } else {
                                // Use body as-is for other types
                                fetchOptions.body = requestData.body;
                                fetchOptions.headers = filterValidHeaders(requestData.headers);
                            }
                        } else {
                            fetchOptions.headers = filterValidHeaders(requestData.headers);
                        }

                        const fetchResponse = await fetch(requestData.url, fetchOptions);
                        const responseHeaders = [];
                        fetchResponse.headers.forEach((value, name) => {
                            responseHeaders.push({ name, value });
                        });

                        // Detect if response is binary
                        const contentType = fetchResponse.headers.get('content-type') || '';
                        const isBinary = /^(image|video|audio|application\/octet-stream|application\/pdf)/.test(contentType) ||
                            contentType.includes('font') ||
                            contentType.includes('wasm');

                        let responseBody;
                        let isBase64 = false;

                        if (isBinary) {
                            // Read as ArrayBuffer and convert to base64
                            const arrayBuffer = await fetchResponse.arrayBuffer();
                            const bytes = new Uint8Array(arrayBuffer);
                            let binary = '';
                            for (let i = 0; i < bytes.byteLength; i++) {
                                binary += String.fromCharCode(bytes[i]);
                            }
                            responseBody = btoa(binary);
                            isBase64 = true;
                        } else {
                            // Read as text
                            responseBody = await fetchResponse.text();
                        }

                        sendResponse({
                            success: true,
                            data: {
                                status: fetchResponse.status,
                                statusText: fetchResponse.statusText,
                                headers: responseHeaders,
                                body: responseBody,
                                isBase64: isBase64,
                                time: Date.now() - startTime
                            }
                        });
                    } catch (fetchError) {
                        console.error('SEND_REQUEST error:', fetchError);
                        sendResponse({ success: false, error: fetchError.message });
                    }
                    break;

                case 'DROP_REQUEST':
                    try {
                        const tabId = message.tabId || (sender.tab ? sender.tab.id : null);
                        if (tabId && attachedTabs.has(tabId)) {
                            const tabData = attachedTabs.get(tabId);
                            await chrome.debugger.sendCommand({ tabId }, "Fetch.failRequest", {
                                requestId: message.requestId,
                                errorReason: "Aborted"
                            });
                            tabData.pausedRequests.delete(message.requestId);
                        }
                        sendResponse({ success: true });
                    } catch (dropError) {
                        console.error('DROP_REQUEST error:', dropError);
                        sendResponse({ success: false, error: dropError.message });
                    }
                    break;

                default:
                    sendResponse({ success: false, error: 'Unknown message type' });
            }
        } catch (e) {
            sendResponse({ success: false, error: e.message });
        }
    })();
    return true; // Keep channel open for async response
});

// ==========================================
// NOTIFICATION HELPERS
// ==========================================

function showNotification(title, message) {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon.png',
        title: title,
        message: message,
        priority: 2
    });
}

function showDevToolsInstructions() {
    showNotification(
        '🕵️ NetSpy Activated',
        'Press F12 (or Ctrl+Shift+I) to open DevTools, then select the NetSpy tab'
    );
}

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
    if (command === 'open-netspy') {
        console.log('Keyboard shortcut triggered');
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (tab) {
            if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
                showNotification(
                    '⚠️ Cannot Use Here',
                    'NetSpy cannot be used on Chrome internal pages'
                );
            } else {
                showDevToolsInstructions();
            }
        }
    }
});

// Show welcome notification only on first install
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log("NetSpy extension installed");
        showNotification(
            '🎉 NetSpy Installed',
            'Click the extension icon to get started'
        );
    }
});

// Cleanup when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
    if (attachedTabs.has(tabId)) {
        attachedTabs.delete(tabId);
        console.log(`Tab ${tabId} closed, cleaned up debugger state`);
    }
});
