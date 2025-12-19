// ==========================================
// NetSpy - Capture Service
// 网络请求捕获服务
// ==========================================

import { eventBus, Events } from '../core/eventBus.js';
import { store } from '../core/store.js';
import { RequestModel, fromHAREntry } from '../core/requestModel.js';

/**
 * 捕获服务类
 */
class CaptureService {
    constructor() {
        this.initialized = false;
    }

    /**
     * 初始化捕获
     */
    init() {
        if (this.initialized) return;

        // 监听 DevTools HAR 请求
        if (chrome?.devtools?.network) {
            chrome.devtools.network.onRequestFinished.addListener(
                this.handleRequest.bind(this)
            );
            this.initialized = true;
            console.log('[CaptureService] Initialized');
        } else {
            console.warn('[CaptureService] DevTools API not available');
        }
    }

    /**
     * 处理捕获的请求
     */
    handleRequest(harEntry) {
        // 检查是否在录制
        if (!store.state.isRecording) return;

        // 转换为 RequestModel
        const request = fromHAREntry(harEntry);

        // 检查是否被拦截处理过
        const existingEntry = this.findExistingRequest(request);

        if (existingEntry) {
            // 更新已存在的拦截请求
            store.updateRequest(existingEntry.id, {
                status: request.response?.status,
                statusText: request.response?.statusText,
                size: request.response?.size,
                timings: request.timings,
                response: request.response?.toJSON?.() || request.response,
                meta: {
                    ...existingEntry.meta,
                    isPaused: false
                },
                _harEntry: harEntry
            });
            return;
        }

        // 添加新请求
        store.addRequest(request.toJSON());
    }

    /**
     * 查找已存在的请求（用于拦截场景）
     */
    findExistingRequest(request) {
        return store.state.requests.find(r => {
            // 必须是被拦截的请求
            if (!r.intercepted && !r.meta?.intercepted) return false;
            // 跳过已丢弃的请求
            if (r.dropped || r.meta?.dropped) return false;

            // 匹配 URL 和方法
            if (r.url === request.url && r.method === request.method) return true;

            // 匹配原始 URL（针对修改后的请求）
            if (r.originalRequest?.url === request.url && r.method === request.method) return true;

            // 匹配等待响应的请求
            if (r.status === 'Pending' && r.method === request.method) {
                const rBase = r.url.split('?')[0];
                const reqBase = request.url.split('?')[0];
                return rBase === reqBase;
            }

            return false;
        });
    }

    /**
     * 获取请求的响应体
     */
    async getResponseBody(request) {
        if (request.responseBody || request.response?.body) {
            return request.responseBody || request.response?.body;
        }

        if (request._harEntry) {
            return new Promise((resolve) => {
                request._harEntry.getContent((content, encoding) => {
                    const body = content || '';

                    // 更新请求
                    if (request.response) {
                        request.response.body = body;
                        request.response.encoding = encoding || '';
                    }
                    request.responseBody = body;

                    resolve(body);
                });
            });
        }

        return '';
    }

    /**
     * 清空所有捕获
     */
    clear() {
        store.clearRequests();
    }

    /**
     * 设置录制状态
     */
    setRecording(enabled) {
        store.state.isRecording = enabled;
    }

    /**
     * 销毁服务
     */
    destroy() {
        // Chrome API 没有提供移除监听器的方法
        this.initialized = false;
    }
}

// 导出单例
export const captureService = new CaptureService();

// 兼容旧 API
export const init = () => captureService.init();
export const getResponseBody = (req) => captureService.getResponseBody(req);
export const clear = () => captureService.clear();
export const setRecording = (enabled) => captureService.setRecording(enabled);
