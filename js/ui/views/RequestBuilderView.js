// ==========================================
// NetSpy - Request Builder View
// Postman 风格的请求构建器
// ==========================================

import { eventBus, Events } from '../../core/eventBus.js';
import { store } from '../../core/store.js';
import { RequestModel, ResponseModel } from '../../core/requestModel.js';
import { requestService } from '../../services/requestService.js';
import { HTTP_METHODS, BODY_TYPES, COMMON_HEADERS } from '../../core/constants.js';
import { KeyValueEditor } from '../components/KeyValueEditor.js';
import { CodeEditor } from '../components/CodeEditor.js';
import { TabPanel } from '../components/TabPanel.js';

/**
 * RequestBuilderView
 * Postman 风格的请求构建器视图
 */
export class RequestBuilderView {
    constructor(container) {
        this.container = container;
        this.currentRequest = null;
        this.isLoading = false;

        // 子组件
        this.paramsEditor = null;
        this.headersEditor = null;
        this.bodyEditor = null;
        this.formDataEditor = null;
        this.urlEncodedEditor = null;
        this.responseViewer = null;
        this.requestTabs = null;
        this.responseTabs = null;

        this.init();
    }

    /**
     * 初始化视图
     */
    init() {
        this.render();
        this.setupEventListeners();
    }

    /**
     * 渲染视图
     */
    render() {
        this.container.innerHTML = `
            <div class="request-builder">
                <!-- 请求头部：方法 + URL + 发送按钮 -->
                <div class="rb-header">
                    <select class="rb-method-select" id="rbMethod">
                        ${Object.keys(HTTP_METHODS).map(method =>
            `<option value="${method}" style="color: ${HTTP_METHODS[method].color}">${method}</option>`
        ).join('')}
                    </select>
                    <div class="rb-url-wrapper">
                        <input type="text" class="rb-url-input" id="rbUrl" 
                               placeholder="Enter request URL or paste cURL command">
                        <button class="rb-url-dropdown" title="Environment Variables">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </button>
                    </div>
                    <button class="rb-send-btn" id="rbSendBtn">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="22" y1="2" x2="11" y2="13"></line>
                            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                        </svg>
                        <span>Send</span>
                    </button>
                    <button class="rb-save-btn" id="rbSaveBtn" title="Save to Collection">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                            <polyline points="17 21 17 13 7 13 7 21"></polyline>
                            <polyline points="7 3 7 8 15 8"></polyline>
                        </svg>
                    </button>
                </div>

                <!-- 请求配置区 -->
                <div class="rb-request-section">
                    <div class="rb-tabs" id="rbRequestTabs"></div>
                </div>

                <!-- 分隔线 -->
                <div class="rb-divider">
                    <span class="rb-divider-label">RESPONSE</span>
                    <span class="rb-response-meta" id="rbResponseMeta"></span>
                </div>

                <!-- 响应区 -->
                <div class="rb-response-section">
                    <div class="rb-tabs" id="rbResponseTabs"></div>
                </div>
            </div>
        `;

        // 初始化请求 Tabs
        this.initRequestTabs();

        // 初始化响应 Tabs
        this.initResponseTabs();

        // 缓存 DOM 引用
        this.methodSelect = this.container.querySelector('#rbMethod');
        this.urlInput = this.container.querySelector('#rbUrl');
        this.sendBtn = this.container.querySelector('#rbSendBtn');
        this.saveBtn = this.container.querySelector('#rbSaveBtn');
        this.responseMeta = this.container.querySelector('#rbResponseMeta');
    }

    /**
     * 初始化请求区 Tabs
     */
    initRequestTabs() {
        const tabsContainer = this.container.querySelector('#rbRequestTabs');

        this.requestTabs = new TabPanel(tabsContainer, {
            tabs: [
                { id: 'params', label: 'Params', badge: null },
                { id: 'headers', label: 'Headers', badge: null },
                { id: 'body', label: 'Body' },
                { id: 'auth', label: 'Auth' }
            ],
            activeTab: 'params'
        });

        // Params Tab
        const paramsPane = this.requestTabs.getContentContainer('params');
        paramsPane.innerHTML = '<div class="rb-params-editor"></div>';
        this.paramsEditor = new KeyValueEditor(paramsPane.querySelector('.rb-params-editor'), {
            placeholder: { key: 'Key', value: 'Value' },
            showDescription: true
        });
        this.paramsEditor.onChange(() => this.syncParamsToUrl());

        // Headers Tab
        const headersPane = this.requestTabs.getContentContainer('headers');
        headersPane.innerHTML = `
            <div class="rb-headers-quick">
                <span class="rb-quick-label">Quick Add:</span>
                ${COMMON_HEADERS.slice(0, 5).map(h =>
            `<button class="rb-quick-btn" data-header="${h.name}">${h.name}</button>`
        ).join('')}
            </div>
            <div class="rb-headers-editor"></div>
        `;
        this.headersEditor = new KeyValueEditor(headersPane.querySelector('.rb-headers-editor'), {
            placeholder: { key: 'Header', value: 'Value' }
        });

        // Quick add header buttons
        headersPane.querySelectorAll('.rb-quick-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const headerName = btn.dataset.header;
                const preset = COMMON_HEADERS.find(h => h.name === headerName);
                if (preset) {
                    this.headersEditor.addItem({ name: preset.name, value: preset.value, enabled: true });
                }
            });
        });

        // Body Tab
        const bodyPane = this.requestTabs.getContentContainer('body');
        bodyPane.innerHTML = `
            <div class="rb-body-type-selector">
                <label class="rb-body-type">
                    <input type="radio" name="rbBodyType" value="none" checked>
                    <span>none</span>
                </label>
                <label class="rb-body-type">
                    <input type="radio" name="rbBodyType" value="form-data">
                    <span>form-data</span>
                </label>
                <label class="rb-body-type">
                    <input type="radio" name="rbBodyType" value="x-www-form-urlencoded">
                    <span>x-www-form-urlencoded</span>
                </label>
                <label class="rb-body-type">
                    <input type="radio" name="rbBodyType" value="raw">
                    <span>raw</span>
                </label>
                <label class="rb-body-type">
                    <input type="radio" name="rbBodyType" value="binary">
                    <span>binary</span>
                </label>
                <select class="rb-raw-type hidden" id="rbRawType">
                    <option value="json">JSON</option>
                    <option value="text">Text</option>
                    <option value="xml">XML</option>
                    <option value="html">HTML</option>
                    <option value="javascript">JavaScript</option>
                </select>
            </div>
            <div class="rb-body-content">
                <div class="rb-body-none active">
                    <p class="rb-empty-hint">This request does not have a body</p>
                </div>
                <div class="rb-body-formdata"></div>
                <div class="rb-body-urlencoded"></div>
                <div class="rb-body-raw"></div>
                <div class="rb-body-binary">
                    <input type="file" id="rbBinaryFile">
                    <label for="rbBinaryFile" class="rb-file-label">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="17 8 12 3 7 8"></polyline>
                            <line x1="12" y1="3" x2="12" y2="15"></line>
                        </svg>
                        <span>Click to select a file</span>
                    </label>
                </div>
            </div>
        `;

        // FormData editor
        this.formDataEditor = new KeyValueEditor(bodyPane.querySelector('.rb-body-formdata'), {
            placeholder: { key: 'Key', value: 'Value' }
        });

        // URL Encoded editor
        this.urlEncodedEditor = new KeyValueEditor(bodyPane.querySelector('.rb-body-urlencoded'), {
            placeholder: { key: 'Key', value: 'Value' }
        });

        // Raw body editor
        this.bodyEditor = new CodeEditor(bodyPane.querySelector('.rb-body-raw'), {
            language: 'json',
            placeholder: 'Enter request body...',
            minHeight: 150
        });

        // Body type change handlers
        bodyPane.querySelectorAll('input[name="rbBodyType"]').forEach(radio => {
            radio.addEventListener('change', (e) => this.handleBodyTypeChange(e.target.value));
        });

        // Raw type change
        bodyPane.querySelector('#rbRawType').addEventListener('change', (e) => {
            this.bodyEditor.setLanguage(e.target.value);
        });

        // Auth Tab
        const authPane = this.requestTabs.getContentContainer('auth');
        authPane.innerHTML = `
            <div class="rb-auth-section">
                <select class="rb-auth-type" id="rbAuthType">
                    <option value="none">No Auth</option>
                    <option value="basic">Basic Auth</option>
                    <option value="bearer">Bearer Token</option>
                    <option value="api-key">API Key</option>
                </select>
                <div class="rb-auth-fields">
                    <div class="rb-auth-none active">
                        <p class="rb-empty-hint">This request does not use any authorization</p>
                    </div>
                    <div class="rb-auth-basic">
                        <div class="rb-auth-field">
                            <label>Username</label>
                            <input type="text" id="rbAuthUsername" placeholder="Username">
                        </div>
                        <div class="rb-auth-field">
                            <label>Password</label>
                            <input type="password" id="rbAuthPassword" placeholder="Password">
                        </div>
                    </div>
                    <div class="rb-auth-bearer">
                        <div class="rb-auth-field">
                            <label>Token</label>
                            <input type="text" id="rbAuthToken" placeholder="Bearer Token">
                        </div>
                    </div>
                    <div class="rb-auth-api-key">
                        <div class="rb-auth-field">
                            <label>Key</label>
                            <input type="text" id="rbApiKey" placeholder="api_key">
                        </div>
                        <div class="rb-auth-field">
                            <label>Value</label>
                            <input type="text" id="rbApiValue" placeholder="Value">
                        </div>
                        <div class="rb-auth-field">
                            <label>Add to</label>
                            <select id="rbApiAddTo">
                                <option value="header">Header</option>
                                <option value="query">Query Params</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Auth type change
        authPane.querySelector('#rbAuthType').addEventListener('change', (e) => {
            this.handleAuthTypeChange(e.target.value);
        });
    }

    /**
     * 初始化响应区 Tabs
     */
    initResponseTabs() {
        const tabsContainer = this.container.querySelector('#rbResponseTabs');

        this.responseTabs = new TabPanel(tabsContainer, {
            tabs: [
                { id: 'body', label: 'Body' },
                { id: 'headers', label: 'Headers' },
                { id: 'cookies', label: 'Cookies' }
            ],
            activeTab: 'body'
        });

        // Body Tab
        const bodyPane = this.responseTabs.getContentContainer('body');
        bodyPane.innerHTML = `
            <div class="rb-response-toolbar">
                <div class="rb-view-toggle">
                    <button class="rb-view-btn active" data-view="pretty">Pretty</button>
                    <button class="rb-view-btn" data-view="raw">Raw</button>
                    <button class="rb-view-btn" data-view="preview">Preview</button>
                </div>
                <div class="rb-response-actions">
                    <button class="rb-action-btn" id="rbCopyResponse" title="Copy">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                    </button>
                    <button class="rb-action-btn" id="rbDownloadResponse" title="Download">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="rb-response-body"></div>
        `;

        this.responseViewer = new CodeEditor(bodyPane.querySelector('.rb-response-body'), {
            language: 'json',
            readOnly: true,
            minHeight: 200
        });

        // View toggle
        bodyPane.querySelectorAll('.rb-view-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                bodyPane.querySelectorAll('.rb-view-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.handleResponseViewChange(btn.dataset.view);
            });
        });

        // Copy button
        bodyPane.querySelector('#rbCopyResponse').addEventListener('click', () => {
            navigator.clipboard.writeText(this.responseViewer.getValue());
        });

        // Download button
        bodyPane.querySelector('#rbDownloadResponse').addEventListener('click', () => {
            this.downloadResponse();
        });

        // Headers Tab
        const headersPane = this.responseTabs.getContentContainer('headers');
        headersPane.innerHTML = '<div class="rb-response-headers"></div>';
        this.responseHeadersEditor = new KeyValueEditor(headersPane.querySelector('.rb-response-headers'), {
            readOnly: true,
            showCheckbox: false,
            showAddButton: false
        });

        // Cookies Tab  
        const cookiesPane = this.responseTabs.getContentContainer('cookies');
        cookiesPane.innerHTML = '<div class="rb-response-cookies"></div>';
        this.responseCookiesEditor = new KeyValueEditor(cookiesPane.querySelector('.rb-response-cookies'), {
            readOnly: true,
            showCheckbox: false,
            showAddButton: false,
            placeholder: { key: 'Name', value: 'Value' }
        });
    }

    /**
     * 设置事件监听
     */
    setupEventListeners() {
        // URL 输入变化 - 自动解析 params
        this.urlInput.addEventListener('input', () => {
            this.parseUrlToParams();
        });

        // URL 粘贴 - 检测 cURL
        this.urlInput.addEventListener('paste', (e) => {
            setTimeout(() => {
                const text = this.urlInput.value;
                if (text.trim().startsWith('curl')) {
                    this.parseCurl(text);
                }
            }, 0);
        });

        // 发送按钮
        this.sendBtn.addEventListener('click', () => this.sendRequest());

        // 保存按钮
        this.saveBtn.addEventListener('click', () => this.saveToCollection());

        // 键盘快捷键
        this.container.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                this.sendRequest();
            }
        });

        // 订阅状态变化
        store.subscribe((state) => {
            // 可以根据需要更新 UI
        });

        // 订阅请求选中事件
        eventBus.on(Events.REQUEST_SELECTED, (request) => {
            if (request) {
                this.loadRequest(request);
            }
        });
    }

    /**
     * 加载请求到编辑器
     */
    loadRequest(request) {
        this.currentRequest = request instanceof RequestModel ? request : new RequestModel(request);

        // 设置方法和 URL
        this.methodSelect.value = this.currentRequest.method;
        this.urlInput.value = this.currentRequest.url;

        // 设置 Params
        this.paramsEditor.setData(this.currentRequest.params);
        this.updateParamsBadge();

        // 设置 Headers
        this.headersEditor.setData(this.currentRequest.headers);
        this.updateHeadersBadge();

        // 设置 Body
        const body = this.currentRequest.body;
        const bodyTypeRadio = this.container.querySelector(`input[name="rbBodyType"][value="${body.type}"]`);
        if (bodyTypeRadio) {
            bodyTypeRadio.checked = true;
            this.handleBodyTypeChange(body.type);
        }

        if (body.type === BODY_TYPES.RAW) {
            this.bodyEditor.setValue(body.raw, true);
            const rawTypeSelect = this.container.querySelector('#rbRawType');
            rawTypeSelect.value = body.rawType || 'json';
            this.bodyEditor.setLanguage(body.rawType || 'json');
        } else if (body.type === BODY_TYPES.FORM_DATA) {
            this.formDataEditor.setData(body.formData);
        } else if (body.type === BODY_TYPES.URL_ENCODED) {
            this.urlEncodedEditor.setData(body.urlEncoded);
        }

        // 设置响应（如果有）
        if (this.currentRequest.response) {
            this.showResponse(this.currentRequest.response);
        } else {
            this.clearResponse();
        }
    }

    /**
     * 获取当前编辑的请求数据
     */
    buildRequest() {
        const method = this.methodSelect.value;
        const url = this.urlInput.value;
        const headers = this.headersEditor.getData();
        const params = this.paramsEditor.getData();

        // 构建 body
        const bodyType = this.container.querySelector('input[name="rbBodyType"]:checked')?.value || 'none';
        let body = { type: bodyType };

        if (bodyType === BODY_TYPES.RAW) {
            body.raw = this.bodyEditor.getValue();
            body.rawType = this.container.querySelector('#rbRawType').value;
        } else if (bodyType === BODY_TYPES.FORM_DATA) {
            body.formData = this.formDataEditor.getData();
        } else if (bodyType === BODY_TYPES.URL_ENCODED) {
            body.urlEncoded = this.urlEncodedEditor.getData();
        }

        // 处理 Auth
        const authType = this.container.querySelector('#rbAuthType').value;
        if (authType === 'basic') {
            const username = this.container.querySelector('#rbAuthUsername').value;
            const password = this.container.querySelector('#rbAuthPassword').value;
            const encoded = btoa(`${username}:${password}`);
            headers.push({ name: 'Authorization', value: `Basic ${encoded}`, enabled: true });
        } else if (authType === 'bearer') {
            const token = this.container.querySelector('#rbAuthToken').value;
            headers.push({ name: 'Authorization', value: `Bearer ${token}`, enabled: true });
        } else if (authType === 'api-key') {
            const key = this.container.querySelector('#rbApiKey').value;
            const value = this.container.querySelector('#rbApiValue').value;
            const addTo = this.container.querySelector('#rbApiAddTo').value;
            if (addTo === 'header') {
                headers.push({ name: key, value: value, enabled: true });
            } else {
                params.push({ name: key, value: value, enabled: true });
            }
        }

        return new RequestModel({
            id: this.currentRequest?.id,
            method,
            url,
            headers,
            params,
            body
        });
    }

    /**
     * 发送请求
     */
    async sendRequest() {
        if (this.isLoading) return;

        const request = this.buildRequest();

        if (!request.url) {
            this.showError('Please enter a URL');
            return;
        }

        this.setLoading(true);
        this.clearResponse();

        try {
            // 同步 params 到 URL
            request.syncParamsToUrl();
            this.urlInput.value = request.url;

            // 发送请求
            const result = await requestService.sendViaBackground(request);

            // 显示响应
            this.showResponse(result.response);

            // 更新当前请求
            this.currentRequest = result;

            // 添加到请求列表
            store.addRequest(result.toJSON());

        } catch (error) {
            this.showError(error.message);
        } finally {
            this.setLoading(false);
        }
    }

    /**
     * 显示响应
     */
    showResponse(response) {
        if (!response) return;

        const res = response instanceof ResponseModel ? response : new ResponseModel(response);

        // 更新状态信息
        const statusClass = res.getStatusCategory();
        this.responseMeta.innerHTML = `
            <span class="rb-status rb-status-${statusClass}">${res.status} ${res.statusText}</span>
            <span class="rb-time">${res.time || 0} ms</span>
            <span class="rb-size">${this.formatSize(res.size)}</span>
        `;

        // 设置响应体
        const contentType = res.getContentType();
        let language = 'text';
        if (res.isJson()) language = 'json';
        else if (res.isXml()) language = 'xml';
        else if (res.isHtml()) language = 'html';

        this.responseViewer.setLanguage(language);
        this.responseViewer.setValue(res.body, language === 'json');

        // 设置响应头
        this.responseHeadersEditor.setData(res.headers);

        // 解析 Cookies
        const cookies = this.parseCookies(res.headers);
        this.responseCookiesEditor.setData(cookies);
    }

    /**
     * 清空响应
     */
    clearResponse() {
        this.responseMeta.innerHTML = '';
        this.responseViewer.setValue('');
        this.responseHeadersEditor.setData([]);
        this.responseCookiesEditor.setData([]);
    }

    /**
     * 显示错误
     */
    showError(message) {
        this.responseMeta.innerHTML = `<span class="rb-status rb-status-error">Error</span>`;
        this.responseViewer.setValue(`Error: ${message}`);
    }

    /**
     * 设置加载状态
     */
    setLoading(loading) {
        this.isLoading = loading;
        this.sendBtn.classList.toggle('loading', loading);
        this.sendBtn.querySelector('span').textContent = loading ? 'Sending...' : 'Send';
    }

    /**
     * 处理 Body 类型切换
     */
    handleBodyTypeChange(type) {
        const bodyContent = this.container.querySelector('.rb-body-content');
        const rawTypeSelect = this.container.querySelector('#rbRawType');

        // 隐藏所有内容区
        bodyContent.querySelectorAll('& > div').forEach(div => div.classList.remove('active'));

        // 显示对应的内容区
        const targetClass = `.rb-body-${type === 'x-www-form-urlencoded' ? 'urlencoded' : type}`;
        const target = bodyContent.querySelector(targetClass);
        if (target) target.classList.add('active');

        // 显示/隐藏 raw 类型选择器
        rawTypeSelect.classList.toggle('hidden', type !== 'raw');
    }

    /**
     * 处理 Auth 类型切换
     */
    handleAuthTypeChange(type) {
        const authFields = this.container.querySelector('.rb-auth-fields');
        authFields.querySelectorAll('& > div').forEach(div => div.classList.remove('active'));

        const target = authFields.querySelector(`.rb-auth-${type}`);
        if (target) target.classList.add('active');
    }

    /**
     * 处理响应视图切换
     */
    handleResponseViewChange(view) {
        // Response view switching (Pretty/Raw/Preview) is not yet implemented
    }

    /**
     * 从 URL 解析参数
     */
    parseUrlToParams() {
        const url = this.urlInput.value;
        try {
            const urlObj = new URL(url);
            const params = [];
            urlObj.searchParams.forEach((value, name) => {
                params.push({ name, value, enabled: true });
            });
            this.paramsEditor.setData(params);
            this.updateParamsBadge();
        } catch {
            // URL 无效，忽略
        }
    }

    /**
     * 将 params 同步到 URL
     */
    syncParamsToUrl() {
        const url = this.urlInput.value;
        try {
            const urlObj = new URL(url);
            urlObj.search = '';

            this.paramsEditor.getEnabledData().forEach(param => {
                if (param.name) {
                    urlObj.searchParams.append(param.name, param.value);
                }
            });

            this.urlInput.value = urlObj.toString();
        } catch {
            // URL 无效，尝试简单拼接
            const base = url.split('?')[0];
            const enabledParams = this.paramsEditor.getEnabledData();
            if (enabledParams.length > 0) {
                const query = enabledParams
                    .filter(p => p.name)
                    .map(p => `${encodeURIComponent(p.name)}=${encodeURIComponent(p.value)}`)
                    .join('&');
                this.urlInput.value = `${base}?${query}`;
            }
        }
        this.updateParamsBadge();
    }

    /**
     * 更新 Params 徽章
     */
    updateParamsBadge() {
        const count = this.paramsEditor.getEnabledData().filter(p => p.name).length;
        this.requestTabs.setBadge('params', count || null);
    }

    /**
     * 更新 Headers 徽章
     */
    updateHeadersBadge() {
        const count = this.headersEditor.getEnabledData().filter(h => h.name).length;
        this.requestTabs.setBadge('headers', count || null);
    }

    /**
     * 解析 cURL 命令
     */
    parseCurl(curlCommand) {
        try {
            // 简单的 cURL 解析
            const methodMatch = curlCommand.match(/-X\s+(\w+)/i);
            const urlMatch = curlCommand.match(/'([^']+)'$|"([^"]+)"$/m) || curlCommand.match(/curl\s+(?:-[^\s]+\s+)*([^\s'"]+)/);
            const headerMatches = curlCommand.matchAll(/-H\s+['"]([^'"]+)['"]/gi);
            const dataMatch = curlCommand.match(/-d\s+['"]([^'"]+)['"]/i) || curlCommand.match(/--data\s+['"]([^'"]+)['"]/i);

            if (urlMatch) {
                this.urlInput.value = urlMatch[1] || urlMatch[2];
                this.parseUrlToParams();
            }

            if (methodMatch) {
                this.methodSelect.value = methodMatch[1].toUpperCase();
            }

            const headers = [];
            for (const match of headerMatches) {
                const [name, ...valueParts] = match[1].split(':');
                headers.push({
                    name: name.trim(),
                    value: valueParts.join(':').trim(),
                    enabled: true
                });
            }
            if (headers.length > 0) {
                this.headersEditor.setData(headers);
                this.updateHeadersBadge();
            }

            if (dataMatch) {
                const bodyType = this.container.querySelector('input[name="rbBodyType"][value="raw"]');
                if (bodyType) {
                    bodyType.checked = true;
                    this.handleBodyTypeChange('raw');
                }
                this.bodyEditor.setValue(dataMatch[1], true);
            }
        } catch (err) {
            console.error('Failed to parse cURL:', err);
        }
    }

    /**
     * 解析 Cookies
     */
    parseCookies(headers) {
        const cookies = [];
        headers.forEach(h => {
            if (h.name.toLowerCase() === 'set-cookie') {
                const parts = h.value.split(';')[0].split('=');
                cookies.push({
                    name: parts[0].trim(),
                    value: parts.slice(1).join('=').trim(),
                    enabled: true
                });
            }
        });
        return cookies;
    }

    /**
     * 保存到 Collection
     */
    saveToCollection() {
        const request = this.buildRequest();

        const name = prompt('Enter a name for this request:', request.getFilename());
        if (!name) return;

        request.name = name;

        // 如果没有 collection，创建一个默认的
        if (store.state.collections.length === 0) {
            store.createCollection('My Collection', 'Default collection');
        }

        const collection = store.state.collections[0];
        store.addToCollection(request.toJSON(), collection.id);

        alert('Saved to collection!');
    }

    /**
     * 下载响应
     */
    downloadResponse() {
        const content = this.responseViewer.getValue();
        if (!content) return;

        const response = this.currentRequest?.response;
        const contentType = response?.getContentType() || 'text/plain';

        let extension = 'txt';
        if (contentType.includes('json')) extension = 'json';
        else if (contentType.includes('xml')) extension = 'xml';
        else if (contentType.includes('html')) extension = 'html';

        const blob = new Blob([content], { type: contentType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `response.${extension}`;
        a.click();
        URL.revokeObjectURL(url);
    }

    /**
     * 格式化大小
     */
    formatSize(bytes) {
        if (!bytes) return '0 B';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    /**
     * 设置只读模式
     */
    setReadOnly(readOnly) {
        this.methodSelect.disabled = readOnly;
        this.urlInput.readOnly = readOnly;
        this.paramsEditor.setReadOnly(readOnly);
        this.headersEditor.setReadOnly(readOnly);
        this.bodyEditor.setReadOnly(readOnly);
        this.formDataEditor.setReadOnly(readOnly);
        this.urlEncodedEditor.setReadOnly(readOnly);
    }

    /**
     * 销毁视图
     */
    destroy() {
        this.paramsEditor?.destroy();
        this.headersEditor?.destroy();
        this.bodyEditor?.destroy();
        this.formDataEditor?.destroy();
        this.urlEncodedEditor?.destroy();
        this.responseViewer?.destroy();
        this.responseHeadersEditor?.destroy();
        this.responseCookiesEditor?.destroy();
        this.requestTabs?.destroy();
        this.responseTabs?.destroy();
        this.container.innerHTML = '';
    }
}

// RequestBuilder 样式
export const RequestBuilderStyles = `
.request-builder {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-panel);
}

/* Header */
.rb-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    background: var(--bg-panel);
    border-bottom: 1px solid var(--border-light);
}

.rb-method-select {
    padding: 10px 12px;
    background: var(--bg-input);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    color: var(--accent-primary);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    outline: none;
    min-width: 100px;
}

.rb-url-wrapper {
    flex: 1;
    display: flex;
    position: relative;
}

.rb-url-input {
    flex: 1;
    padding: 10px 40px 10px 14px;
    background: var(--bg-input);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: 13px;
    outline: none;
    transition: var(--transition-fast);
}

.rb-url-input:focus {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.15);
}

.rb-url-dropdown {
    position: absolute;
    right: 4px;
    top: 50%;
    transform: translateY(-50%);
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: 4px;
}

.rb-url-dropdown:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
}

.rb-send-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    background: linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%);
    border: none;
    border-radius: 8px;
    color: white;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(124, 58, 237, 0.35);
    transition: all 0.2s ease;
}

.rb-send-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(124, 58, 237, 0.45);
}

.rb-send-btn.loading {
    opacity: 0.7;
    cursor: wait;
}

.rb-save-btn {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 8px;
    color: var(--text-secondary);
    cursor: pointer;
    transition: var(--transition-fast);
}

.rb-save-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
}

/* Request Section */
.rb-request-section {
    flex: 1;
    min-height: 200px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.rb-tabs {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

/* Body Type Selector */
.rb-body-type-selector {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-light);
}

.rb-body-type {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-secondary);
    cursor: pointer;
}

.rb-body-type input {
    accent-color: var(--accent-primary);
}

.rb-body-type:has(input:checked) {
    color: var(--accent-primary);
    font-weight: 500;
}

.rb-raw-type {
    margin-left: auto;
    padding: 4px 8px;
    background: var(--bg-input);
    border: 1px solid var(--border-light);
    border-radius: 4px;
    font-size: 11px;
    color: var(--text-primary);
}

.rb-body-content > div {
    display: none;
    padding: 12px;
}

.rb-body-content > div.active {
    display: block;
}

.rb-empty-hint {
    text-align: center;
    color: var(--text-muted);
    font-size: 13px;
    padding: 40px 20px;
}

/* Headers Quick Add */
.rb-headers-quick {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border-light);
    flex-wrap: wrap;
}

.rb-quick-label {
    font-size: 11px;
    color: var(--text-muted);
}

.rb-quick-btn {
    padding: 4px 8px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-light);
    border-radius: 4px;
    font-size: 11px;
    color: var(--text-secondary);
    cursor: pointer;
    transition: var(--transition-fast);
}

.rb-quick-btn:hover {
    background: var(--accent-primary);
    border-color: var(--accent-primary);
    color: white;
}

/* Auth Section */
.rb-auth-section {
    padding: 12px;
}

.rb-auth-type {
    padding: 8px 12px;
    background: var(--bg-input);
    border: 1px solid var(--border-light);
    border-radius: 6px;
    font-size: 12px;
    color: var(--text-primary);
    margin-bottom: 16px;
}

.rb-auth-fields > div {
    display: none;
}

.rb-auth-fields > div.active {
    display: block;
}

.rb-auth-field {
    margin-bottom: 12px;
}

.rb-auth-field label {
    display: block;
    margin-bottom: 4px;
    font-size: 11px;
    color: var(--text-secondary);
}

.rb-auth-field input,
.rb-auth-field select {
    width: 100%;
    padding: 8px 12px;
    background: var(--bg-input);
    border: 1px solid var(--border-light);
    border-radius: 6px;
    font-size: 12px;
    color: var(--text-primary);
    outline: none;
}

.rb-auth-field input:focus {
    border-color: var(--accent-primary);
}

/* Divider */
.rb-divider {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 16px;
    background: var(--bg-secondary);
    border-top: 1px solid var(--border-light);
    border-bottom: 1px solid var(--border-light);
}

.rb-divider-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    letter-spacing: 0.05em;
}

.rb-response-meta {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 12px;
}

.rb-status {
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 600;
}

.rb-status-2xx {
    background: rgba(16, 185, 129, 0.2);
    color: var(--success);
}

.rb-status-3xx {
    background: rgba(245, 158, 11, 0.2);
    color: var(--warning);
}

.rb-status-4xx,
.rb-status-5xx,
.rb-status-error {
    background: rgba(239, 68, 68, 0.2);
    color: var(--error);
}

.rb-time,
.rb-size {
    color: var(--text-muted);
}

/* Response Section */
.rb-response-section {
    flex: 1;
    min-height: 200px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.rb-response-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border-light);
}

.rb-view-toggle {
    display: flex;
    gap: 2px;
    background: var(--bg-secondary);
    padding: 2px;
    border-radius: 6px;
}

.rb-view-btn {
    padding: 6px 12px;
    background: transparent;
    border: none;
    border-radius: 4px;
    font-size: 11px;
    color: var(--text-secondary);
    cursor: pointer;
    transition: var(--transition-fast);
}

.rb-view-btn:hover {
    color: var(--text-primary);
}

.rb-view-btn.active {
    background: var(--bg-panel);
    color: var(--text-primary);
    box-shadow: var(--shadow-sm);
}

.rb-response-actions {
    display: flex;
    gap: 4px;
}

.rb-action-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--text-secondary);
    cursor: pointer;
    transition: var(--transition-fast);
}

.rb-action-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
}

/* File Upload */
.rb-body-binary input[type="file"] {
    display: none;
}

.rb-file-label {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 40px;
    border: 2px dashed var(--border-color);
    border-radius: 8px;
    color: var(--text-muted);
    cursor: pointer;
    transition: var(--transition-fast);
}

.rb-file-label:hover {
    border-color: var(--accent-primary);
    color: var(--accent-primary);
    background: rgba(124, 58, 237, 0.05);
}
`;
