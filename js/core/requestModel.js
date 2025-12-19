// ==========================================
// NetSpy - Request Model
// 统一的请求数据模型
// ==========================================

import { BODY_TYPES, REQUEST_SOURCE, HTTP_METHODS } from './constants.js';

/**
 * Header 项
 */
export class HeaderItem {
    constructor(data = {}) {
        this.name = data.name || '';
        this.value = data.value || '';
        this.enabled = data.enabled !== false;
        this.description = data.description || '';
    }

    toJSON() {
        return {
            name: this.name,
            value: this.value,
            enabled: this.enabled,
            description: this.description
        };
    }

    clone() {
        return new HeaderItem(this.toJSON());
    }
}

/**
 * Param 项 (Query Parameters)
 */
export class ParamItem {
    constructor(data = {}) {
        this.name = data.name || '';
        this.value = data.value || '';
        this.enabled = data.enabled !== false;
        this.description = data.description || '';
    }

    toJSON() {
        return {
            name: this.name,
            value: this.value,
            enabled: this.enabled,
            description: this.description
        };
    }

    clone() {
        return new ParamItem(this.toJSON());
    }
}

/**
 * Form Data 项
 */
export class FormDataItem {
    constructor(data = {}) {
        this.name = data.name || '';
        this.value = data.value || '';
        this.type = data.type || 'text'; // 'text' | 'file'
        this.enabled = data.enabled !== false;
        this.fileName = data.fileName || '';
        this.contentType = data.contentType || '';
    }

    toJSON() {
        return {
            name: this.name,
            value: this.value,
            type: this.type,
            enabled: this.enabled,
            fileName: this.fileName,
            contentType: this.contentType
        };
    }

    clone() {
        return new FormDataItem(this.toJSON());
    }
}

/**
 * Request Body
 */
export class RequestBody {
    constructor(data = {}) {
        this.type = data.type || BODY_TYPES.NONE;
        this.rawType = data.rawType || 'text'; // 'text' | 'json' | 'xml' | 'html'
        this.raw = data.raw || '';
        this.formData = (data.formData || []).map(item => new FormDataItem(item));
        this.urlEncoded = (data.urlEncoded || []).map(item => new ParamItem(item));
        this.binary = data.binary || null;
        this.graphql = data.graphql || { query: '', variables: '' };
    }

    toJSON() {
        return {
            type: this.type,
            rawType: this.rawType,
            raw: this.raw,
            formData: this.formData.map(item => item.toJSON()),
            urlEncoded: this.urlEncoded.map(item => item.toJSON()),
            binary: this.binary,
            graphql: this.graphql
        };
    }

    clone() {
        return new RequestBody(this.toJSON());
    }

    /**
     * 获取发送时的 Content-Type
     */
    getContentType() {
        switch (this.type) {
            case BODY_TYPES.NONE:
                return null;
            case BODY_TYPES.RAW:
                const rawTypes = {
                    'text': 'text/plain',
                    'json': 'application/json',
                    'xml': 'application/xml',
                    'html': 'text/html',
                    'javascript': 'application/javascript'
                };
                return rawTypes[this.rawType] || 'text/plain';
            case BODY_TYPES.FORM_DATA:
                return null; // 浏览器自动设置
            case BODY_TYPES.URL_ENCODED:
                return 'application/x-www-form-urlencoded';
            case BODY_TYPES.GRAPHQL:
                return 'application/json';
            default:
                return null;
        }
    }

    /**
     * 转换为发送格式
     */
    toSendFormat() {
        switch (this.type) {
            case BODY_TYPES.NONE:
                return null;
            case BODY_TYPES.RAW:
                return this.raw;
            case BODY_TYPES.FORM_DATA:
                const formData = new FormData();
                this.formData.filter(item => item.enabled).forEach(item => {
                    if (item.type === 'file' && item.value instanceof File) {
                        formData.append(item.name, item.value, item.fileName);
                    } else {
                        formData.append(item.name, item.value);
                    }
                });
                return formData;
            case BODY_TYPES.URL_ENCODED:
                const params = new URLSearchParams();
                this.urlEncoded.filter(item => item.enabled).forEach(item => {
                    params.append(item.name, item.value);
                });
                return params.toString();
            case BODY_TYPES.GRAPHQL:
                return JSON.stringify({
                    query: this.graphql.query,
                    variables: this.graphql.variables ? JSON.parse(this.graphql.variables) : undefined
                });
            default:
                return null;
        }
    }

    /**
     * 判断是否为空
     */
    isEmpty() {
        if (this.type === BODY_TYPES.NONE) return true;
        if (this.type === BODY_TYPES.RAW) return !this.raw.trim();
        if (this.type === BODY_TYPES.FORM_DATA) return this.formData.length === 0;
        if (this.type === BODY_TYPES.URL_ENCODED) return this.urlEncoded.length === 0;
        return true;
    }
}

/**
 * Response Model
 */
export class ResponseModel {
    constructor(data = {}) {
        this.status = data.status || 0;
        this.statusText = data.statusText || '';
        this.headers = (data.headers || []).map(h => new HeaderItem(h));
        this.body = data.body || '';
        this.size = data.size || 0;
        this.time = data.time || 0;
        this.encoding = data.encoding || '';
    }

    toJSON() {
        return {
            status: this.status,
            statusText: this.statusText,
            headers: this.headers.map(h => h.toJSON()),
            body: this.body,
            size: this.size,
            time: this.time,
            encoding: this.encoding
        };
    }

    clone() {
        return new ResponseModel(this.toJSON());
    }

    /**
     * 获取指定 header 的值
     */
    getHeader(name) {
        const header = this.headers.find(h => h.name.toLowerCase() === name.toLowerCase());
        return header ? header.value : '';
    }

    /**
     * 获取 Content-Type
     */
    getContentType() {
        return this.getHeader('content-type').split(';')[0].trim().toLowerCase();
    }

    /**
     * 判断是否为 JSON
     */
    isJson() {
        const ct = this.getContentType();
        return ct.includes('json') || ct.includes('+json');
    }

    /**
     * 判断是否为 XML
     */
    isXml() {
        const ct = this.getContentType();
        return ct.includes('xml') || ct.includes('+xml');
    }

    /**
     * 判断是否为 HTML
     */
    isHtml() {
        return this.getContentType().includes('html');
    }

    /**
     * 判断是否为图片
     */
    isImage() {
        return this.getContentType().startsWith('image/');
    }

    /**
     * 获取状态码分类
     */
    getStatusCategory() {
        if (this.status >= 100 && this.status < 200) return '1xx';
        if (this.status >= 200 && this.status < 300) return '2xx';
        if (this.status >= 300 && this.status < 400) return '3xx';
        if (this.status >= 400 && this.status < 500) return '4xx';
        if (this.status >= 500) return '5xx';
        return 'pending';
    }
}

/**
 * Request Model
 * 统一的请求数据模型
 */
export class RequestModel {
    constructor(data = {}) {
        // 基本信息
        this.id = data.id || `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.name = data.name || '';
        this.description = data.description || '';

        // 请求数据
        this.method = (data.method || 'GET').toUpperCase();
        this.url = data.url || '';
        this.headers = (data.headers || []).map(h => new HeaderItem(h));
        this.params = (data.params || []).map(p => new ParamItem(p));
        this.body = new RequestBody(data.body || {});

        // 响应数据
        this.response = data.response ? new ResponseModel(data.response) : null;

        // 时间信息
        this.timings = data.timings || {
            total: 0,
            dns: 0,
            connect: 0,
            ssl: 0,
            send: 0,
            wait: 0,
            receive: 0
        };

        // 元数据
        this.meta = {
            source: data.source || data.meta?.source || REQUEST_SOURCE.MANUAL,
            timestamp: data.time || data.meta?.timestamp || Date.now(),
            intercepted: data.intercepted || data.meta?.intercepted || false,
            interceptStage: data.interceptStage || data.meta?.interceptStage || null,
            isPaused: data.isPaused || data.meta?.isPaused || false,
            requestModified: data.requestModified || data.meta?.requestModified || false,
            responseModified: data.responseModified || data.meta?.responseModified || false,
            mocked: data.mocked || data.meta?.mocked || false,
            dropped: data.dropped || data.meta?.dropped || false
        };

        // 原始数据 (用于比较)
        this.originalRequest = data.originalRequest || null;
        this.originalResponse = data.originalResponse || null;

        // HAR 引用 (用于获取响应体)
        this._harEntry = data._harEntry || null;

        // 资源类型
        this.resourceType = data.resourceType || data.type || 'other';
        this.contentType = data.contentType || '';
        this.isApi = data.isApi || false;
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            method: this.method,
            url: this.url,
            headers: this.headers.map(h => h.toJSON()),
            params: this.params.map(p => p.toJSON()),
            body: this.body.toJSON(),
            response: this.response?.toJSON() || null,
            timings: { ...this.timings },
            meta: { ...this.meta },
            originalRequest: this.originalRequest,
            originalResponse: this.originalResponse,
            resourceType: this.resourceType,
            contentType: this.contentType,
            isApi: this.isApi
        };
    }

    clone() {
        const data = this.toJSON();
        data.id = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        return new RequestModel(data);
    }

    // ==========================================
    // URL 处理
    // ==========================================

    /**
     * 从 URL 中解析参数到 params
     */
    parseParamsFromUrl() {
        try {
            const urlObj = new URL(this.url);
            this.params = [];
            urlObj.searchParams.forEach((value, name) => {
                this.params.push(new ParamItem({ name, value, enabled: true }));
            });
        } catch {
            // URL 无效，忽略
        }
    }

    /**
     * 将 params 同步到 URL
     */
    syncParamsToUrl() {
        try {
            const urlObj = new URL(this.getBaseUrl());
            // 清除现有参数
            urlObj.search = '';
            // 添加启用的参数
            this.params.filter(p => p.enabled && p.name).forEach(p => {
                urlObj.searchParams.append(p.name, p.value);
            });
            this.url = urlObj.toString();
        } catch {
            // URL 无效，尝试简单拼接
            const base = this.getBaseUrl();
            const enabledParams = this.params.filter(p => p.enabled && p.name);
            if (enabledParams.length > 0) {
                const query = enabledParams.map(p =>
                    `${encodeURIComponent(p.name)}=${encodeURIComponent(p.value)}`
                ).join('&');
                this.url = `${base}?${query}`;
            }
        }
    }

    /**
     * 获取不带参数的基础 URL
     */
    getBaseUrl() {
        try {
            const urlObj = new URL(this.url);
            return `${urlObj.origin}${urlObj.pathname}`;
        } catch {
            return this.url.split('?')[0];
        }
    }

    /**
     * 获取域名
     */
    getDomain() {
        try {
            return new URL(this.url).hostname;
        } catch {
            return '';
        }
    }

    /**
     * 获取路径
     */
    getPath() {
        try {
            const urlObj = new URL(this.url);
            return urlObj.pathname + urlObj.search;
        } catch {
            return this.url;
        }
    }

    /**
     * 获取文件名
     */
    getFilename() {
        try {
            const path = new URL(this.url).pathname;
            return path.split('/').pop() || path;
        } catch {
            return this.url;
        }
    }

    // ==========================================
    // Headers 处理
    // ==========================================

    /**
     * 获取指定 header 的值
     */
    getHeader(name) {
        const header = this.headers.find(h =>
            h.name.toLowerCase() === name.toLowerCase() && h.enabled
        );
        return header ? header.value : '';
    }

    /**
     * 设置 header (如果不存在则添加)
     */
    setHeader(name, value) {
        const existing = this.headers.find(h => h.name.toLowerCase() === name.toLowerCase());
        if (existing) {
            existing.value = value;
            existing.enabled = true;
        } else {
            this.headers.push(new HeaderItem({ name, value, enabled: true }));
        }
    }

    /**
     * 删除 header
     */
    removeHeader(name) {
        this.headers = this.headers.filter(h => h.name.toLowerCase() !== name.toLowerCase());
    }

    /**
     * 获取启用的 headers (用于发送)
     */
    getEnabledHeaders() {
        return this.headers
            .filter(h => h.enabled && h.name)
            .reduce((acc, h) => {
                acc[h.name] = h.value;
                return acc;
            }, {});
    }

    // ==========================================
    // 导出格式
    // ==========================================

    /**
     * 转换为 Fetch API 的选项
     */
    toFetchOptions() {
        const options = {
            method: this.method,
            headers: this.getEnabledHeaders()
        };

        // 添加 Body
        if (!['GET', 'HEAD'].includes(this.method) && !this.body.isEmpty()) {
            options.body = this.body.toSendFormat();

            // 设置 Content-Type (如果不是 FormData)
            const contentType = this.body.getContentType();
            if (contentType) {
                options.headers['Content-Type'] = contentType;
            }
        }

        return options;
    }

    /**
     * 转换为 cURL 命令
     */
    toCurl() {
        let curl = `curl -X ${this.method}`;

        // Headers
        this.headers.filter(h => h.enabled && h.name).forEach(h => {
            curl += ` \\\n  -H '${h.name}: ${h.value}'`;
        });

        // Body
        if (!['GET', 'HEAD'].includes(this.method) && this.body.type !== BODY_TYPES.NONE) {
            if (this.body.type === BODY_TYPES.RAW) {
                const escaped = this.body.raw.replace(/'/g, "'\\''");
                curl += ` \\\n  -d '${escaped}'`;
            } else if (this.body.type === BODY_TYPES.URL_ENCODED) {
                const data = this.body.urlEncoded
                    .filter(item => item.enabled)
                    .map(item => `${encodeURIComponent(item.name)}=${encodeURIComponent(item.value)}`)
                    .join('&');
                curl += ` \\\n  -d '${data}'`;
            } else if (this.body.type === BODY_TYPES.FORM_DATA) {
                this.body.formData.filter(item => item.enabled).forEach(item => {
                    if (item.type === 'file') {
                        curl += ` \\\n  -F '${item.name}=@${item.fileName || "file"}'`;
                    } else {
                        curl += ` \\\n  -F '${item.name}=${item.value}'`;
                    }
                });
            }
        }

        // URL
        curl += ` \\\n  '${this.url}'`;

        return curl;
    }

    /**
     * 转换为 HAR 格式
     */
    toHAR() {
        const har = {
            request: {
                method: this.method,
                url: this.url,
                headers: this.headers.filter(h => h.enabled).map(h => ({
                    name: h.name,
                    value: h.value
                })),
                queryString: this.params.filter(p => p.enabled).map(p => ({
                    name: p.name,
                    value: p.value
                })),
                postData: null
            },
            response: this.response ? {
                status: this.response.status,
                statusText: this.response.statusText,
                headers: this.response.headers.map(h => ({
                    name: h.name,
                    value: h.value
                })),
                content: {
                    size: this.response.size,
                    text: this.response.body
                }
            } : null,
            timings: this.timings
        };

        // PostData
        if (!this.body.isEmpty()) {
            har.request.postData = {
                mimeType: this.body.getContentType() || 'text/plain',
                text: typeof this.body.toSendFormat() === 'string' ? this.body.toSendFormat() : ''
            };
        }

        return har;
    }

    // ==========================================
    // 状态判断
    // ==========================================

    /**
     * 获取状态码
     */
    get status() {
        return this.response?.status || (this.meta.isPaused ? 'Paused' : 'Pending');
    }

    /**
     * 获取状态文本
     */
    get statusText() {
        if (this.meta.isPaused) {
            return this.meta.interceptStage === 'response' ? 'Paused (Response)' : 'Paused (Request)';
        }
        return this.response?.statusText || '';
    }

    /**
     * 获取大小
     */
    get size() {
        return this.response?.size || 0;
    }

    /**
     * 获取总时间
     */
    get time() {
        return this.timings?.total || 0;
    }

    /**
     * 是否已完成
     */
    get isComplete() {
        return this.response && this.response.status > 0;
    }

    /**
     * 是否成功
     */
    get isSuccess() {
        return this.response && this.response.status >= 200 && this.response.status < 300;
    }

    /**
     * 是否有错误
     */
    get isError() {
        return this.response && this.response.status >= 400;
    }
}

/**
 * 从 HAR Entry 创建 RequestModel
 */
export function fromHAREntry(harEntry) {
    const req = harEntry.request;
    const res = harEntry.response;
    const timings = harEntry.timings || {};

    const request = new RequestModel({
        url: req.url,
        method: req.method,
        headers: req.headers || [],
        body: {
            type: req.postData ? 'raw' : 'none',
            raw: req.postData?.text || ''
        },
        resourceType: (harEntry._resourceType || 'other').toLowerCase(),
        contentType: (res.headers || []).find(h =>
            h.name.toLowerCase() === 'content-type'
        )?.value?.toLowerCase() || '',
        isApi: ['xhr', 'fetch', 'xmlhttprequest'].includes((harEntry._resourceType || '').toLowerCase()),
        timings: {
            total: harEntry.time || 0,
            dns: timings.dns || 0,
            connect: timings.connect || 0,
            ssl: timings.ssl || 0,
            send: timings.send || 0,
            wait: timings.wait || 0,
            receive: timings.receive || 0
        },
        response: {
            status: res.status,
            statusText: res.statusText,
            headers: res.headers || [],
            body: '',
            size: res.content?.size || res._transferSize || 0
        },
        source: REQUEST_SOURCE.CAPTURE,
        _harEntry: harEntry
    });

    return request;
}

/**
 * 创建新的空请求
 */
export function createEmptyRequest() {
    return new RequestModel({
        method: 'GET',
        url: '',
        source: REQUEST_SOURCE.MANUAL
    });
}
