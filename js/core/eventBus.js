// ==========================================
// NetSpy - Event Bus
// 统一的事件总线，用于模块间通信
// ==========================================

/**
 * 事件定义
 * 所有模块间通信的事件都在这里定义
 */
export const Events = {
    // 请求相关
    REQUEST_CAPTURED: 'request:captured',       // 新请求被捕获
    REQUEST_SELECTED: 'request:selected',       // 请求被选中
    REQUEST_UPDATED: 'request:updated',         // 请求数据更新
    REQUEST_CLEARED: 'request:cleared',         // 请求列表清空
    REQUEST_SENT: 'request:sent',               // 请求发送
    REQUEST_COMPLETED: 'request:completed',     // 请求完成

    // 拦截相关
    INTERCEPT_ENABLED: 'intercept:enabled',     // 拦截开启
    INTERCEPT_DISABLED: 'intercept:disabled',   // 拦截关闭
    INTERCEPT_PAUSED: 'intercept:paused',       // 请求/响应被暂停
    INTERCEPT_RESUMED: 'intercept:resumed',     // 请求/响应恢复
    INTERCEPT_MODIFIED: 'intercept:modified',   // 拦截内容被修改

    // 编辑器相关
    EDITOR_MODE_CHANGED: 'editor:modeChanged',  // 编辑模式切换
    EDITOR_DIRTY: 'editor:dirty',               // 编辑器内容变化
    EDITOR_SAVED: 'editor:saved',               // 编辑保存

    // UI 相关
    UI_TAB_CHANGED: 'ui:tabChanged',            // Tab 切换
    UI_FILTER_CHANGED: 'ui:filterChanged',      // 过滤器变化
    UI_THEME_CHANGED: 'ui:themeChanged',        // 主题切换

    // Collection 相关
    COLLECTION_ADDED: 'collection:added',       // 添加到收藏
    COLLECTION_REMOVED: 'collection:removed',   // 从收藏移除
    COLLECTION_UPDATED: 'collection:updated',   // 收藏更新

    // 环境变量
    ENV_CHANGED: 'env:changed',                 // 环境变量变化
    ENV_VAR_SET: 'env:varSet',                  // 设置变量
    ENV_VAR_REMOVED: 'env:varRemoved'           // 删除变量
};

/**
 * EventBus 类
 * 实现发布-订阅模式的事件总线
 */
class EventBus {
    constructor() {
        this.events = new Map();
        this.onceEvents = new Map();
        this.debugMode = false;
    }

    /**
     * 订阅事件
     * @param {string} event - 事件名称
     * @param {Function} handler - 事件处理函数
     * @returns {Function} - 取消订阅的函数
     */
    on(event, handler) {
        if (!this.events.has(event)) {
            this.events.set(event, new Set());
        }
        this.events.get(event).add(handler);

        // 返回取消订阅的函数
        return () => this.off(event, handler);
    }

    /**
     * 一次性订阅事件
     * @param {string} event - 事件名称
     * @param {Function} handler - 事件处理函数
     * @returns {Function} - 取消订阅的函数
     */
    once(event, handler) {
        if (!this.onceEvents.has(event)) {
            this.onceEvents.set(event, new Set());
        }
        this.onceEvents.get(event).add(handler);

        return () => {
            const handlers = this.onceEvents.get(event);
            if (handlers) {
                handlers.delete(handler);
            }
        };
    }

    /**
     * 取消订阅
     * @param {string} event - 事件名称
     * @param {Function} handler - 事件处理函数
     */
    off(event, handler) {
        const handlers = this.events.get(event);
        if (handlers) {
            handlers.delete(handler);
        }
    }

    /**
     * 触发事件
     * @param {string} event - 事件名称
     * @param {any} data - 事件数据
     */
    emit(event, data) {
        if (this.debugMode) {
            console.log(`[EventBus] ${event}`, data);
        }

        // 处理常规订阅
        const handlers = this.events.get(event);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(data);
                } catch (err) {
                    console.error(`[EventBus] Error in handler for ${event}:`, err);
                }
            });
        }

        // 处理一次性订阅
        const onceHandlers = this.onceEvents.get(event);
        if (onceHandlers) {
            onceHandlers.forEach(handler => {
                try {
                    handler(data);
                } catch (err) {
                    console.error(`[EventBus] Error in once handler for ${event}:`, err);
                }
            });
            this.onceEvents.delete(event);
        }
    }

    /**
     * 等待事件触发
     * @param {string} event - 事件名称
     * @param {number} timeout - 超时时间(ms)
     * @returns {Promise<any>}
     */
    waitFor(event, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.off(event, handler);
                reject(new Error(`Timeout waiting for event: ${event}`));
            }, timeout);

            const handler = (data) => {
                clearTimeout(timer);
                this.off(event, handler);
                resolve(data);
            };

            this.on(event, handler);
        });
    }

    /**
     * 清除所有事件订阅
     */
    clear() {
        this.events.clear();
        this.onceEvents.clear();
    }

    /**
     * 设置调试模式
     * @param {boolean} enabled
     */
    setDebugMode(enabled) {
        this.debugMode = enabled;
    }
}

// 导出单例
export const eventBus = new EventBus();

// 开发环境下暴露到全局（调试用）
if (typeof window !== 'undefined') {
    window.__eventBus = eventBus;
}
