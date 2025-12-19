// ==========================================
// NetSpy - Request Service
// 请求发送服务
// ==========================================

import { eventBus, Events } from '../core/eventBus.js';
import { store } from '../core/store.js';
import { RequestModel, ResponseModel } from '../core/requestModel.js';

/**
 * 请求服务类
 * 负责发送请求和处理响应
 */
class RequestService {
    constructor() {
        this.abortControllers = new Map();
    }

    /**
     * 发送请求
     * @param {RequestModel} request - 请求模型
     * @param {Object} options - 选项
     * @returns {Promise<RequestModel>}
     */
    async send(request, options = {}) {
        const {
            timeout = store.state.settings.timeout || 30000,
            followRedirects = store.state.settings.followRedirects !== false
        } = options;

        const startTime = Date.now();
        const requestId = request.id;

        // 创建 AbortController
        const abortController = new AbortController();
        this.abortControllers.set(requestId, abortController);

        try {
            // 触发发送事件
            eventBus.emit(Events.REQUEST_SENT, request);

            // 解析变量
            const resolvedUrl = store.resolveVariables(request.url);
            const resolvedHeaders = {};
            request.headers.filter(h => h.enabled && h.name).forEach(h => {
                resolvedHeaders[store.resolveVariables(h.name)] = store.resolveVariables(h.value);
            });

            // 构建 fetch 选项
            const fetchOptions = {
                method: request.method,
                headers: resolvedHeaders,
                signal: abortController.signal,
                redirect: followRedirects ? 'follow' : 'manual'
            };

            // 添加 Body
            if (!['GET', 'HEAD'].includes(request.method) && !request.body.isEmpty()) {
                fetchOptions.body = request.body.toSendFormat();

                const contentType = request.body.getContentType();
                if (contentType && !resolvedHeaders['Content-Type']) {
                    fetchOptions.headers['Content-Type'] = contentType;
                }
            }

            // 设置超时
            const timeoutId = setTimeout(() => {
                abortController.abort();
            }, timeout);

            // 发送请求
            let response;
            try {
                response = await fetch(resolvedUrl, fetchOptions);
            } finally {
                clearTimeout(timeoutId);
            }

            // 读取响应体
            const responseBody = await response.text();
            const endTime = Date.now();

            // 解析响应头
            const responseHeaders = [];
            response.headers.forEach((value, name) => {
                responseHeaders.push({ name, value });
            });

            // 创建响应模型
            request.response = new ResponseModel({
                status: response.status,
                statusText: response.statusText,
                headers: responseHeaders,
                body: responseBody,
                size: new Blob([responseBody]).size,
                time: endTime - startTime
            });

            // 更新时间信息
            request.timings.total = endTime - startTime;
            request.meta.timestamp = Date.now();

            // 触发完成事件
            eventBus.emit(Events.REQUEST_COMPLETED, request);

            return request;

        } catch (error) {
            const endTime = Date.now();

            // 处理错误
            if (error.name === 'AbortError') {
                request.response = new ResponseModel({
                    status: 0,
                    statusText: 'Timeout',
                    body: 'Request timed out'
                });
            } else {
                request.response = new ResponseModel({
                    status: 0,
                    statusText: 'Error',
                    body: error.message
                });
            }

            request.timings.total = endTime - startTime;

            // 触发完成事件 (即使失败)
            eventBus.emit(Events.REQUEST_COMPLETED, request);

            return request;

        } finally {
            this.abortControllers.delete(requestId);
        }
    }

    /**
     * 通过 background script 发送请求
     * 用于绕过 CORS 限制
     */
    async sendViaBackground(request, options = {}) {
        const startTime = Date.now();

        // 解析变量
        const resolvedUrl = store.resolveVariables(request.url);
        const resolvedHeaders = {};
        request.headers.filter(h => h.enabled && h.name).forEach(h => {
            resolvedHeaders[store.resolveVariables(h.name)] = store.resolveVariables(h.value);
        });

        // 构建选项
        const fetchOptions = {
            method: request.method,
            headers: resolvedHeaders
        };

        // 添加 Body
        if (!['GET', 'HEAD'].includes(request.method) && !request.body.isEmpty()) {
            const bodyContent = request.body.toSendFormat();
            if (typeof bodyContent === 'string') {
                fetchOptions.body = bodyContent;
            } else if (bodyContent instanceof FormData) {
                // FormData 需要转换为普通对象
                const formDataObj = {};
                bodyContent.forEach((value, key) => {
                    formDataObj[key] = value;
                });
                fetchOptions.body = JSON.stringify(formDataObj);
                fetchOptions.headers['Content-Type'] = 'application/json';
            }

            const contentType = request.body.getContentType();
            if (contentType && !resolvedHeaders['Content-Type']) {
                fetchOptions.headers['Content-Type'] = contentType;
            }
        }

        try {
            // 触发发送事件
            eventBus.emit(Events.REQUEST_SENT, request);

            // 通过 background 发送
            const result = await this._sendMessage({
                type: 'RESEND_REQUEST',
                url: resolvedUrl,
                options: fetchOptions
            });

            const endTime = Date.now();

            if (result.success) {
                request.response = new ResponseModel({
                    status: result.status,
                    statusText: result.statusText,
                    headers: result.headers || [],
                    body: result.body || '',
                    size: new Blob([result.body || '']).size,
                    time: result.time || (endTime - startTime)
                });
            } else {
                request.response = new ResponseModel({
                    status: 0,
                    statusText: 'Error',
                    body: result.error || 'Unknown error'
                });
            }

            request.timings.total = endTime - startTime;
            request.meta.timestamp = Date.now();

            eventBus.emit(Events.REQUEST_COMPLETED, request);

            return request;

        } catch (error) {
            request.response = new ResponseModel({
                status: 0,
                statusText: 'Error',
                body: error.message
            });

            eventBus.emit(Events.REQUEST_COMPLETED, request);

            return request;
        }
    }

    /**
     * 取消请求
     */
    abort(requestId) {
        const controller = this.abortControllers.get(requestId);
        if (controller) {
            controller.abort();
            this.abortControllers.delete(requestId);
        }
    }

    /**
     * 取消所有请求
     */
    abortAll() {
        this.abortControllers.forEach((controller, id) => {
            controller.abort();
        });
        this.abortControllers.clear();
    }

    /**
     * 发送消息到 background
     */
    _sendMessage(message) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(response || { success: false });
                }
            });
        });
    }
}

// 导出单例
export const requestService = new RequestService();

// 兼容旧 API
export async function resendRequest(requestData) {
    const request = new RequestModel(requestData);
    return await requestService.sendViaBackground(request);
}
