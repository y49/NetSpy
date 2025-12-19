// ==========================================
// NetSpy - Intercept Service
// 请求拦截服务
// ==========================================

import { eventBus, Events } from '../core/eventBus.js';
import { store } from '../core/store.js';
import { EDIT_MODES } from '../core/constants.js';
import { RequestModel } from '../core/requestModel.js';

/**
 * 拦截服务类
 */
class InterceptService {
    constructor() {
        this.currentTabId = null;
        this.initialized = false;
    }

    /**
     * 初始化拦截服务
     */
    init() {
        if (this.initialized) return;

        // 获取当前 Tab ID
        if (chrome?.devtools?.inspectedWindow) {
            chrome.devtools.inspectedWindow.eval('', (result, exception) => {
                this.currentTabId = chrome.devtools.inspectedWindow.tabId;
            });
        }

        // 监听来自 background 的消息
        chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));

        this.initialized = true;
        console.log('[InterceptService] Initialized');
    }

    /**
     * 处理来自 background 的消息
     */
    handleMessage(message, sender, sendResponse) {
        if (message.tabId !== this.currentTabId) return;

        switch (message.type) {
            case 'REQUEST_PAUSED':
                this.handlePausedRequest(message.request, 'request');
                break;
            case 'RESPONSE_PAUSED':
                this.handlePausedRequest(message.request, 'response');
                break;
            case 'INTERCEPT_ERROR':
                console.error('[InterceptService] Error:', message.error);
                break;
            case 'INTERCEPTION_DISABLED':
                store.setIntercept(false);
                break;
        }
    }

    /**
     * 处理暂停的请求/响应
     */
    handlePausedRequest(request, stage) {
        const requestId = request.requestId;

        // 创建暂停条目
        const pausedEntry = {
            ...request,
            stage,
            pausedAt: Date.now()
        };

        // 存储到 paused 列表
        store.addPausedRequest(requestId, pausedEntry);

        // 检查是否已存在
        const existingIndex = store.state.requests.findIndex(r => r.id === requestId);

        if (existingIndex === -1) {
            // 创建新条目
            const newEntry = new RequestModel({
                id: requestId,
                url: request.url,
                method: request.method,
                headers: request.headers || [],
                body: { type: 'raw', raw: request.postData || '' },
                response: stage === 'response' ? {
                    status: request.responseStatus,
                    statusText: 'Paused (Response)',
                    headers: request.responseHeaders || []
                } : null,
                resourceType: 'xhr',
                isApi: true,
                meta: {
                    intercepted: true,
                    interceptStage: stage,
                    isPaused: true,
                    requestModified: false,
                    responseModified: false,
                    mocked: false,
                    dropped: false
                },
                originalRequest: {
                    url: request.url,
                    method: request.method,
                    headers: [...(request.headers || [])],
                    body: request.postData || ''
                },
                originalResponse: stage === 'response' ? {
                    status: request.responseStatus,
                    headers: [...(request.responseHeaders || [])]
                } : null
            });

            store.addRequest(newEntry.toJSON());
        } else {
            // 更新现有条目
            store.updateRequest(requestId, {
                status: stage === 'response' ? request.responseStatus : 'Paused',
                statusText: stage === 'response' ? 'Paused (Response)' : 'Paused (Request)',
                meta: {
                    ...store.state.requests[existingIndex].meta,
                    interceptStage: stage,
                    isPaused: true
                },
                responseHeaders: request.responseHeaders || store.state.requests[existingIndex].responseHeaders,
                originalResponse: stage === 'response' ? {
                    status: request.responseStatus,
                    headers: [...(request.responseHeaders || [])]
                } : store.state.requests[existingIndex].originalResponse
            });
        }

        // 触发事件
        eventBus.emit(Events.INTERCEPT_PAUSED, pausedEntry);
    }

    /**
     * 启用/禁用拦截
     */
    async setEnabled(enabled, mode = 'request', pattern = '*') {
        const message = enabled ? {
            type: 'ENABLE_INTERCEPTION',
            tabId: this.currentTabId,
            patterns: [pattern],
            mode: mode
        } : {
            type: 'DISABLE_INTERCEPTION',
            tabId: this.currentTabId
        };

        const result = await this.sendToBackground(message);

        if (result?.success) {
            store.setIntercept(enabled, mode, pattern);
        }

        return result;
    }

    /**
     * 继续请求（可选修改）
     */
    async continueRequest(requestId, modifications = {}) {
        const result = await this.sendToBackground({
            type: 'CONTINUE_REQUEST',
            tabId: this.currentTabId,
            requestId: requestId,
            modifications: modifications
        });

        if (result?.success) {
            store.removePausedRequest(requestId);

            // 更新请求状态
            const hasModifications = Object.keys(modifications).length > 0;
            store.updateRequest(requestId, {
                status: 'Pending',
                statusText: hasModifications ? 'Modified' : '',
                meta: {
                    isPaused: false,
                    requestModified: hasModifications
                },
                // 如果有修改，更新相应字段
                ...(modifications.url && { url: modifications.url }),
                ...(modifications.method && { method: modifications.method }),
                ...(modifications.headers && { headers: modifications.headers })
            });

            eventBus.emit(Events.INTERCEPT_RESUMED, { requestId, modifications });
        }

        return result;
    }

    /**
     * 修改响应
     */
    async modifyResponse(requestId, modifications = {}) {
        const result = await this.sendToBackground({
            type: 'MODIFY_RESPONSE',
            tabId: this.currentTabId,
            requestId: requestId,
            modifications: modifications
        });

        if (result?.success) {
            store.removePausedRequest(requestId);

            store.updateRequest(requestId, {
                statusText: 'Modified',
                meta: {
                    isPaused: false,
                    responseModified: true
                }
            });

            eventBus.emit(Events.INTERCEPT_RESUMED, { requestId, modifications });
        }

        return result;
    }

    /**
     * 返回 Mock 响应
     */
    async fulfillRequest(requestId, mockResponse) {
        const result = await this.sendToBackground({
            type: 'FULFILL_REQUEST',
            tabId: this.currentTabId,
            requestId: requestId,
            mockResponse: mockResponse
        });

        if (result?.success) {
            store.removePausedRequest(requestId);

            store.updateRequest(requestId, {
                status: mockResponse.status || 200,
                statusText: 'Mocked',
                response: {
                    status: mockResponse.status || 200,
                    statusText: 'OK',
                    headers: mockResponse.headers || [],
                    body: mockResponse.body || ''
                },
                meta: {
                    isPaused: false,
                    mocked: true
                }
            });

            eventBus.emit(Events.INTERCEPT_RESUMED, { requestId, mocked: true });
        }

        return result;
    }

    /**
     * 丢弃请求
     */
    async dropRequest(requestId) {
        // 发送一个空响应来丢弃请求
        const result = await this.sendToBackground({
            type: 'FULFILL_REQUEST',
            tabId: this.currentTabId,
            requestId: requestId,
            mockResponse: {
                status: 0,
                body: ''
            }
        });

        if (result?.success) {
            store.removePausedRequest(requestId);

            store.updateRequest(requestId, {
                status: 'Dropped',
                statusText: 'Dropped',
                meta: {
                    isPaused: false,
                    dropped: true
                }
            });
        }

        return result;
    }

    /**
     * 获取响应体
     */
    async getResponseBody(requestId) {
        const result = await this.sendToBackground({
            type: 'GET_RESPONSE_BODY',
            tabId: this.currentTabId,
            requestId: requestId
        });

        return result?.body || '';
    }

    /**
     * 发送消息到 background
     */
    sendToBackground(message) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('[InterceptService] Background error:', chrome.runtime.lastError);
                    resolve({ success: false, error: chrome.runtime.lastError.message });
                } else {
                    resolve(response || { success: false });
                }
            });
        });
    }

    /**
     * 获取当前 Tab ID
     */
    getTabId() {
        return this.currentTabId;
    }
}

// 导出单例
export const interceptService = new InterceptService();

// 兼容旧 API
export const init = () => interceptService.init();
export const setEnabled = (enabled, mode, pattern) => interceptService.setEnabled(enabled, mode, pattern);
export const continueRequest = (id, mods) => interceptService.continueRequest(id, mods);
export const modifyResponse = (id, mods) => interceptService.modifyResponse(id, mods);
export const fulfillRequest = (id, mock) => interceptService.fulfillRequest(id, mock);
export const getResponseBody = (id) => interceptService.getResponseBody(id);
export const getTabId = () => interceptService.getTabId();
