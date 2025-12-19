// ==========================================
// NetSpy - Code Editor Component
// 代码编辑器组件（用于 Body、Response 等）
// ==========================================

import { store } from '../../core/store.js';

/**
 * CodeEditor 组件
 * 简洁的代码编辑器，支持语法高亮
 */
export class CodeEditor {
    /**
     * @param {HTMLElement} container - 容器元素
     * @param {Object} options - 配置选项
     */
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            language: 'text',      // 'text' | 'json' | 'xml' | 'html' | 'javascript'
            readOnly: false,
            lineNumbers: true,
            wordWrap: true,
            placeholder: 'Enter content here...',
            maxHeight: null,
            minHeight: 100,
            ...options
        };

        this.value = '';
        this.onChangeCallbacks = [];

        this.render();
    }

    /**
     * 设置值
     */
    setValue(value, format = false) {
        this.value = value || '';

        if (format && this.options.language === 'json') {
            this.value = this._formatJson(this.value);
        }

        if (this.textarea) {
            this.textarea.value = this.value;
            this._updateHighlight();
            this._updateLineNumbers();
        }
    }

    /**
     * 获取值
     */
    getValue() {
        return this.value;
    }

    /**
     * 设置语言
     */
    setLanguage(language) {
        this.options.language = language;
        this._updateHighlight();
    }

    /**
     * 设置只读模式
     */
    setReadOnly(readOnly) {
        this.options.readOnly = readOnly;
        if (this.textarea) {
            this.textarea.readOnly = readOnly;
            this.container.classList.toggle('readonly', readOnly);
        }
    }

    /**
     * 监听变化
     */
    onChange(callback) {
        this.onChangeCallbacks.push(callback);
        return () => {
            this.onChangeCallbacks = this.onChangeCallbacks.filter(cb => cb !== callback);
        };
    }

    /**
     * 格式化内容
     */
    format() {
        if (this.options.language === 'json') {
            this.setValue(this._formatJson(this.value), false);
            this._triggerChange();
        } else if (this.options.language === 'xml') {
            this.setValue(this._formatXml(this.value), false);
            this._triggerChange();
        }
    }

    /**
     * 渲染组件
     */
    render() {
        this.container.innerHTML = '';
        this.container.className = 'code-editor';
        if (this.options.readOnly) {
            this.container.classList.add('readonly');
        }

        // 工具栏
        const toolbar = document.createElement('div');
        toolbar.className = 'code-toolbar';
        toolbar.innerHTML = `
            <div class="code-language">
                <select class="code-lang-select">
                    <option value="text">Text</option>
                    <option value="json">JSON</option>
                    <option value="xml">XML</option>
                    <option value="html">HTML</option>
                    <option value="javascript">JavaScript</option>
                </select>
            </div>
            <div class="code-actions">
                <button class="code-action-btn" data-action="format" title="Format (Ctrl+Shift+F)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M4 6h16M4 12h16M4 18h16"/>
                    </svg>
                </button>
                <button class="code-action-btn" data-action="copy" title="Copy">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2"/>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                </button>
                <button class="code-action-btn" data-action="wordwrap" title="Toggle Word Wrap">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18M3 12h15a3 3 0 1 1 0 6h-4M3 18h7"/>
                        <path d="m14 15 3 3-3 3"/>
                    </svg>
                </button>
            </div>
        `;

        // 语言选择
        const langSelect = toolbar.querySelector('.code-lang-select');
        langSelect.value = this.options.language;
        langSelect.addEventListener('change', (e) => {
            this.setLanguage(e.target.value);
        });

        // 动作按钮
        toolbar.querySelectorAll('.code-action-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                if (action === 'format') this.format();
                else if (action === 'copy') this._copyToClipboard();
                else if (action === 'wordwrap') this._toggleWordWrap();
            });
        });

        this.container.appendChild(toolbar);

        // 编辑器主体
        const editorBody = document.createElement('div');
        editorBody.className = 'code-body';

        if (this.options.maxHeight) {
            editorBody.style.maxHeight = `${this.options.maxHeight}px`;
        }
        editorBody.style.minHeight = `${this.options.minHeight}px`;

        // 行号
        if (this.options.lineNumbers) {
            this.lineNumbers = document.createElement('div');
            this.lineNumbers.className = 'code-line-numbers';
            editorBody.appendChild(this.lineNumbers);
        }

        // 高亮层
        this.highlightLayer = document.createElement('pre');
        this.highlightLayer.className = 'code-highlight';
        this.highlightLayer.setAttribute('aria-hidden', 'true');
        editorBody.appendChild(this.highlightLayer);

        // 文本输入区
        this.textarea = document.createElement('textarea');
        this.textarea.className = 'code-textarea';
        this.textarea.placeholder = this.options.placeholder;
        this.textarea.readOnly = this.options.readOnly;
        this.textarea.spellcheck = false;
        this.textarea.value = this.value;

        this.textarea.addEventListener('input', () => {
            this.value = this.textarea.value;
            this._updateHighlight();
            this._updateLineNumbers();
            this._triggerChange();
        });

        this.textarea.addEventListener('scroll', () => {
            this.highlightLayer.scrollTop = this.textarea.scrollTop;
            this.highlightLayer.scrollLeft = this.textarea.scrollLeft;
            if (this.lineNumbers) {
                this.lineNumbers.scrollTop = this.textarea.scrollTop;
            }
        });

        this.textarea.addEventListener('keydown', (e) => {
            // Ctrl+Shift+F 格式化
            if (e.ctrlKey && e.shiftKey && e.key === 'F') {
                e.preventDefault();
                this.format();
            }
            // Tab 插入 2 空格
            if (e.key === 'Tab') {
                e.preventDefault();
                this._insertAtCursor('  ');
            }
        });

        editorBody.appendChild(this.textarea);
        this.container.appendChild(editorBody);

        // 初始化
        this._updateHighlight();
        this._updateLineNumbers();
    }

    /**
     * 更新语法高亮
     */
    _updateHighlight() {
        if (!this.highlightLayer) return;

        let highlighted = this._escapeHtml(this.value);

        switch (this.options.language) {
            case 'json':
                highlighted = this._highlightJson(highlighted);
                break;
            case 'xml':
            case 'html':
                highlighted = this._highlightXml(highlighted);
                break;
            case 'javascript':
                highlighted = this._highlightJs(highlighted);
                break;
        }

        // 保持滚动同步需要在末尾添加空白
        this.highlightLayer.innerHTML = highlighted + '\n';
    }

    /**
     * 更新行号
     */
    _updateLineNumbers() {
        if (!this.lineNumbers) return;

        const lines = this.value.split('\n').length;
        let html = '';
        for (let i = 1; i <= lines; i++) {
            html += `<div class="line-num">${i}</div>`;
        }
        this.lineNumbers.innerHTML = html;
    }

    /**
     * HTML 转义
     */
    _escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    /**
     * JSON 高亮
     */
    _highlightJson(text) {
        return text
            .replace(/("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?)/g, (match) => {
                let cls = 'hl-string';
                if (/:$/.test(match)) {
                    cls = 'hl-key';
                }
                return `<span class="${cls}">${match}</span>`;
            })
            .replace(/\b(true|false)\b/g, '<span class="hl-boolean">$1</span>')
            .replace(/\b(null)\b/g, '<span class="hl-null">$1</span>')
            .replace(/\b(-?\d+\.?\d*)\b/g, '<span class="hl-number">$1</span>');
    }

    /**
     * XML/HTML 高亮
     */
    _highlightXml(text) {
        return text
            .replace(/(&lt;\/?)([\w:-]+)/g, '$1<span class="hl-tag">$2</span>')
            .replace(/([\w:-]+)(=)/g, '<span class="hl-attr">$1</span>$2')
            .replace(/(".*?")/g, '<span class="hl-string">$1</span>')
            .replace(/(&lt;!--.*?--&gt;)/gs, '<span class="hl-comment">$1</span>');
    }

    /**
     * JavaScript 高亮（简化版）
     */
    _highlightJs(text) {
        return text
            .replace(/\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await)\b/g,
                '<span class="hl-keyword">$1</span>')
            .replace(/(".*?"|'.*?'|`.*?`)/g, '<span class="hl-string">$1</span>')
            .replace(/(\/\/.*$)/gm, '<span class="hl-comment">$1</span>')
            .replace(/\b(\d+\.?\d*)\b/g, '<span class="hl-number">$1</span>');
    }

    /**
     * 格式化 JSON
     */
    _formatJson(text) {
        try {
            return JSON.stringify(JSON.parse(text), null, 2);
        } catch {
            return text;
        }
    }

    /**
     * 格式化 XML（简化版）
     */
    _formatXml(text) {
        // 简单的 XML 格式化
        let formatted = '';
        let indent = 0;
        const lines = text.replace(/>\s*</g, '>\n<').split('\n');

        lines.forEach(line => {
            if (line.match(/^<\/\w/)) indent--;
            formatted += '  '.repeat(Math.max(0, indent)) + line.trim() + '\n';
            if (line.match(/^<\w[^>]*[^\/]>.*$/) && !line.match(/^<(br|hr|img|input)/i)) indent++;
        });

        return formatted.trim();
    }

    /**
     * 在光标处插入文本
     */
    _insertAtCursor(text) {
        const start = this.textarea.selectionStart;
        const end = this.textarea.selectionEnd;
        const before = this.value.substring(0, start);
        const after = this.value.substring(end);

        this.value = before + text + after;
        this.textarea.value = this.value;
        this.textarea.selectionStart = this.textarea.selectionEnd = start + text.length;

        this._updateHighlight();
        this._updateLineNumbers();
        this._triggerChange();
    }

    /**
     * 复制到剪贴板
     */
    async _copyToClipboard() {
        try {
            await navigator.clipboard.writeText(this.value);
            // 可以添加成功提示
        } catch (err) {
            console.error('Copy failed:', err);
        }
    }

    /**
     * 切换自动换行
     */
    _toggleWordWrap() {
        this.options.wordWrap = !this.options.wordWrap;
        this.textarea.style.whiteSpace = this.options.wordWrap ? 'pre-wrap' : 'pre';
        this.highlightLayer.style.whiteSpace = this.options.wordWrap ? 'pre-wrap' : 'pre';
    }

    /**
     * 触发变化事件
     */
    _triggerChange() {
        this.onChangeCallbacks.forEach(cb => cb(this.value));
    }

    /**
     * 聚焦
     */
    focus() {
        this.textarea?.focus();
    }

    /**
     * 销毁组件
     */
    destroy() {
        this.container.innerHTML = '';
        this.onChangeCallbacks = [];
    }
}

// CSS 样式
export const CodeEditorStyles = `
.code-editor {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border-light);
    border-radius: 8px;
    overflow: hidden;
    background: var(--bg-input);
}

.code-editor.readonly {
    background: var(--bg-secondary);
}

.code-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 10px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-light);
}

.code-lang-select {
    padding: 4px 8px;
    background: var(--bg-input);
    border: 1px solid var(--border-light);
    border-radius: 4px;
    color: var(--text-primary);
    font-size: 11px;
    cursor: pointer;
    outline: none;
}

.code-actions {
    display: flex;
    gap: 4px;
}

.code-action-btn {
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

.code-action-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
}

.code-body {
    position: relative;
    display: flex;
    overflow: auto;
}

.code-line-numbers {
    flex-shrink: 0;
    padding: 12px 8px;
    background: var(--bg-secondary);
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.5;
    text-align: right;
    user-select: none;
    border-right: 1px solid var(--border-light);
}

.line-num {
    min-width: 24px;
}

.code-highlight,
.code-textarea {
    flex: 1;
    padding: 12px;
    margin: 0;
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-wrap: break-word;
    tab-size: 2;
}

.code-highlight {
    position: absolute;
    inset: 0;
    left: 40px; /* 行号宽度 */
    pointer-events: none;
    color: var(--text-primary);
    background: transparent;
    overflow: hidden;
}

.code-textarea {
    position: relative;
    width: 100%;
    resize: none;
    border: none;
    background: transparent;
    color: transparent;
    caret-color: var(--text-primary);
    outline: none;
    z-index: 1;
}

.code-textarea::placeholder {
    color: var(--text-muted);
}

.code-editor:not(:has(.code-line-numbers)) .code-highlight {
    left: 0;
}

/* 语法高亮颜色 */
.hl-key {
    color: #7c3aed;
}

.hl-string {
    color: #16a34a;
}

.hl-number {
    color: #0891b2;
}

.hl-boolean {
    color: #dc2626;
}

.hl-null {
    color: #64748b;
}

.hl-tag {
    color: #dc2626;
}

.hl-attr {
    color: #7c3aed;
}

.hl-comment {
    color: #64748b;
    font-style: italic;
}

.hl-keyword {
    color: #7c3aed;
    font-weight: 500;
}

/* 深色模式调整 */
@media (prefers-color-scheme: dark) {
    .hl-key {
        color: #a78bfa;
    }
    
    .hl-string {
        color: #4ade80;
    }
    
    .hl-number {
        color: #22d3ee;
    }
    
    .hl-boolean {
        color: #f87171;
    }
    
    .hl-tag {
        color: #f87171;
    }
    
    .hl-attr {
        color: #a78bfa;
    }
    
    .hl-keyword {
        color: #a78bfa;
    }
}
`;
