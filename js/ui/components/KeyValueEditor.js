// ==========================================
// NetSpy - KeyValue Editor Component
// 通用的键值对编辑器（用于 Headers、Params、FormData 等）
// ==========================================

import { eventBus } from '../../core/eventBus.js';
import { store } from '../../core/store.js';

/**
 * KeyValueEditor 组件
 * Postman 风格的键值对编辑器
 */
export class KeyValueEditor {
    /**
     * @param {HTMLElement} container - 容器元素
     * @param {Object} options - 配置选项
     */
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            showCheckbox: true,       // 显示启用/禁用复选框
            showDescription: false,   // 显示描述列
            showBulkEdit: true,       // 显示批量编辑按钮
            showAddButton: true,      // 显示添加按钮
            readOnly: false,          // 只读模式
            placeholder: {
                key: 'Key',
                value: 'Value',
                description: 'Description'
            },
            valueAsTextarea: false,    // 使用 textarea 替代 input
            itemTypes: ['text'],       // 支持的项目类型
            emptyMessage: 'No items yet. Click "Add" to create one.',
            ...options
        };

        if (this.options.itemTypes.includes('file')) {
            this.options.showBulkEdit = false;
        }

        this.items = [];
        this.onChangeCallbacks = [];
        this.bulkEditMode = false;

        this.render();
    }

    /**
     * 设置数据
     */
    setData(items) {
        this.items = (items || []).map(item => ({
            name: item.name || item.key || '',
            value: item.value ?? '',
            enabled: item.enabled !== false,
            description: item.description || '',
            type: item.type || 'text',
            fileName: item.fileName || '',
            fileSize: item.fileSize || 0,
            contentType: item.contentType || '',
        }));
        this.renderItems();
    }

    /**
     * 获取数据
     */
    getData() {
        return this.items.map(item => ({
            name: item.name,
            value: item.value,
            enabled: item.enabled,
            description: item.description,
            type: item.type,
            fileName: item.fileName,
            fileSize: item.fileSize,
            contentType: item.contentType,
        }));
    }

    /**
     * 获取启用的数据
     */
    getEnabledData() {
        return this.items.filter(item => item.enabled && item.name);
    }

    /**
     * 设置只读模式
     */
    setReadOnly(readOnly) {
        this.options.readOnly = readOnly;
        this.renderItems();
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
     * 触发变化事件
     */
    _triggerChange() {
        this.onChangeCallbacks.forEach(cb => cb(this.getData()));
    }

    /**
     * 渲染组件
     */
    render() {
        this.container.innerHTML = '';

        // Create wrapper to avoid overriding container's display (e.g. tab-pane)
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'kv-editor';
        this.container.appendChild(this.wrapper);

        // 工具栏
        if (this.options.showBulkEdit && !this.options.readOnly) {
            const toolbar = document.createElement('div');
            toolbar.className = 'kv-toolbar';
            toolbar.innerHTML = `
                <button class="kv-bulk-btn" title="Bulk Edit">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 20h9"/>
                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
                    </svg>
                    Bulk Edit
                </button>
            `;

            toolbar.querySelector('.kv-bulk-btn').addEventListener('click', () => {
                this.toggleBulkEdit();
            });

            this.wrapper.appendChild(toolbar);
        }

        // 表格容器
        this.tableContainer = document.createElement('div');
        this.tableContainer.className = 'kv-table-container';
        this.wrapper.appendChild(this.tableContainer);

        // 批量编辑容器
        this.bulkContainer = document.createElement('div');
        this.bulkContainer.className = 'kv-bulk-container hidden';
        this.bulkContainer.innerHTML = `
            <textarea class="kv-bulk-textarea" placeholder="key: value (one per line)"></textarea>
            <div class="kv-bulk-actions">
                <button class="kv-bulk-apply">Apply</button>
                <button class="kv-bulk-cancel">Cancel</button>
            </div>
        `;

        this.bulkContainer.querySelector('.kv-bulk-apply').addEventListener('click', () => {
            this.applyBulkEdit();
        });
        this.bulkContainer.querySelector('.kv-bulk-cancel').addEventListener('click', () => {
            this.toggleBulkEdit(false);
        });

        this.wrapper.appendChild(this.bulkContainer);

        this.renderItems();
    }

    /**
     * 渲染项目列表
     */
    renderItems() {
        this.tableContainer.innerHTML = '';

        if (this.items.length === 0 && !this.options.readOnly) {
            // 空状态 - 直接添加一个空行
            this.items.push({ name: '', value: '', enabled: true, description: '', type: 'text', fileName: '', fileSize: 0 });
        }

        // 表格
        const table = document.createElement('table');
        table.className = 'kv-table';

        // 表头
        const thead = document.createElement('thead');
        let headerHtml = '<tr>';
        if (this.options.showCheckbox) {
            headerHtml += '<th class="kv-col-check"></th>';
        }
        headerHtml += `<th class="kv-col-key">${this.options.placeholder.key}</th>`;
        headerHtml += `<th class="kv-col-value">${this.options.placeholder.value}</th>`;
        if (this.options.showDescription) {
            headerHtml += `<th class="kv-col-desc">${this.options.placeholder.description}</th>`;
        }
        if (!this.options.readOnly) {
            headerHtml += '<th class="kv-col-actions"></th>';
        }
        headerHtml += '</tr>';
        thead.innerHTML = headerHtml;
        table.appendChild(thead);

        // 表体
        const tbody = document.createElement('tbody');
        this.items.forEach((item, index) => {
            tbody.appendChild(this._createRow(item, index));
        });
        table.appendChild(tbody);

        this.tableContainer.appendChild(table);

        // 添加按钮
        if (this.options.showAddButton && !this.options.readOnly) {
            const addBtn = document.createElement('button');
            addBtn.className = 'kv-add';
            addBtn.innerHTML = `
                <span class="kv-add-icon">+</span>
                Add ${this.options.placeholder.key}
            `;
            addBtn.addEventListener('click', () => this.addItem());
            this.tableContainer.appendChild(addBtn);
        }
    }

    /**
     * 创建一行
     */
    _createRow(item, index) {
        const tr = document.createElement('tr');
        tr.className = 'kv-row';
        if (!item.enabled) {
            tr.classList.add('disabled');
        }

        const isFile = item.type === 'file';

        // Checkbox
        if (this.options.showCheckbox) {
            const tdCheck = document.createElement('td');
            tdCheck.className = 'kv-col-check';
            if (!this.options.readOnly) {
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = item.enabled;
                checkbox.addEventListener('change', (e) => {
                    this.items[index].enabled = e.target.checked;
                    tr.classList.toggle('disabled', !e.target.checked);
                    this._triggerChange();
                });
                tdCheck.appendChild(checkbox);
            }
            tr.appendChild(tdCheck);
        }

        // Key input
        const tdKey = document.createElement('td');
        tdKey.className = 'kv-col-key';
        const keyInput = document.createElement('input');
        keyInput.type = 'text';
        keyInput.className = 'kv-input';
        keyInput.value = item.name;
        keyInput.placeholder = this.options.placeholder.key;
        keyInput.readOnly = this.options.readOnly || isFile;
        keyInput.addEventListener('input', (e) => {
            this.items[index].name = e.target.value;
            this._triggerChange();
        });
        keyInput.addEventListener('keydown', (e) => {
            if (e.key === 'Tab' && !e.shiftKey && !item.name && !item.value) {
                // Last empty row, Tab to value
            } else if (e.key === 'Enter') {
                this.addItem();
            }
        });
        this._highlightVariables(keyInput);
        tdKey.appendChild(keyInput);
        tr.appendChild(tdKey);

        // Value column
        const tdValue = document.createElement('td');
        tdValue.className = 'kv-col-value';

        if (isFile) {
            // File field: read-only label
            const fileLabel = document.createElement('span');
            fileLabel.className = 'kv-file-label';
            const sizeText = item.fileSize > 0 ? ` (${this._formatFileSize(item.fileSize)})` : ' (binary)';
            fileLabel.textContent = `\u{1F4CE} ${item.fileName || 'unknown'}${sizeText}`;
            tdValue.appendChild(fileLabel);
        } else if (this.options.valueAsTextarea) {
            // Textarea for long values
            const valueTextarea = document.createElement('textarea');
            valueTextarea.className = 'kv-input kv-textarea';
            valueTextarea.value = item.value;
            valueTextarea.placeholder = this.options.placeholder.value;
            valueTextarea.readOnly = this.options.readOnly;
            valueTextarea.rows = 1;
            // Auto-expand
            const autoResize = () => {
                valueTextarea.style.height = 'auto';
                valueTextarea.style.height = valueTextarea.scrollHeight + 'px';
            };
            valueTextarea.addEventListener('input', (e) => {
                this.items[index].value = e.target.value;
                this._triggerChange();
                autoResize();
            });
            valueTextarea.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.addItem();
                }
            });
            this._highlightVariables(valueTextarea);
            tdValue.appendChild(valueTextarea);
            // Initial resize after DOM attachment
            requestAnimationFrame(autoResize);
        } else {
            // Standard input
            const valueInput = document.createElement('input');
            valueInput.type = 'text';
            valueInput.className = 'kv-input';
            valueInput.value = item.value;
            valueInput.placeholder = this.options.placeholder.value;
            valueInput.readOnly = this.options.readOnly;
            valueInput.addEventListener('input', (e) => {
                this.items[index].value = e.target.value;
                this._triggerChange();
            });
            valueInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.addItem();
                }
            });
            this._highlightVariables(valueInput);
            tdValue.appendChild(valueInput);
        }
        tr.appendChild(tdValue);

        // Description input
        if (this.options.showDescription) {
            const tdDesc = document.createElement('td');
            tdDesc.className = 'kv-col-desc';
            const descInput = document.createElement('input');
            descInput.type = 'text';
            descInput.className = 'kv-input';
            descInput.value = item.description;
            descInput.placeholder = this.options.placeholder.description;
            descInput.readOnly = this.options.readOnly;
            descInput.addEventListener('input', (e) => {
                this.items[index].description = e.target.value;
                this._triggerChange();
            });
            tdDesc.appendChild(descInput);
            tr.appendChild(tdDesc);
        }

        // Delete button
        if (!this.options.readOnly) {
            const tdActions = document.createElement('td');
            tdActions.className = 'kv-col-actions';
            const removeBtn = document.createElement('button');
            removeBtn.className = 'kv-remove';
            removeBtn.innerHTML = '&times;';
            removeBtn.title = 'Remove';
            removeBtn.addEventListener('click', () => this.removeItem(index));
            tdActions.appendChild(removeBtn);
            tr.appendChild(tdActions);
        }

        return tr;
    }

    /**
     * 高亮变量 {{var}}
     */
    _highlightVariables(input) {
        // 简单实现：设置特殊样式的 wrapper
        const check = () => {
            if (/\{\{.+?\}\}/.test(input.value)) {
                input.classList.add('has-variable');
            } else {
                input.classList.remove('has-variable');
            }
        };
        input.addEventListener('input', check);
        check();
    }

    /**
     * Format file size for display
     */
    _formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const units = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
    }

    /**
     * 添加项目
     */
    addItem(item = null) {
        this.items.push(item || { name: '', value: '', enabled: true, description: '', type: 'text', fileName: '', fileSize: 0 });
        this.renderItems();

        // 聚焦到新行的 key 输入框
        const rows = this.tableContainer.querySelectorAll('.kv-row');
        const lastRow = rows[rows.length - 1];
        if (lastRow) {
            const keyInput = lastRow.querySelector('.kv-col-key input');
            if (keyInput) keyInput.focus();
        }

        this._triggerChange();
    }

    /**
     * 删除项目
     */
    removeItem(index) {
        this.items.splice(index, 1);
        this.renderItems();
        this._triggerChange();
    }

    /**
     * 切换批量编辑模式
     */
    toggleBulkEdit(show = !this.bulkEditMode) {
        this.bulkEditMode = show;

        if (show) {
            // 转换为文本格式
            const text = this.items
                .filter(item => item.name || item.value)
                .map(item => `${item.name}: ${item.value}`)
                .join('\n');

            this.bulkContainer.querySelector('.kv-bulk-textarea').value = text;
            this.tableContainer.classList.add('hidden');
            this.bulkContainer.classList.remove('hidden');
        } else {
            this.tableContainer.classList.remove('hidden');
            this.bulkContainer.classList.add('hidden');
        }
    }

    /**
     * 应用批量编辑
     */
    applyBulkEdit() {
        const text = this.bulkContainer.querySelector('.kv-bulk-textarea').value;
        const lines = text.split('\n').filter(line => line.trim());

        this.items = lines.map(line => {
            const colonIndex = line.indexOf(':');
            if (colonIndex === -1) {
                return { name: line.trim(), value: '', enabled: true, description: '', type: 'text', fileName: '', fileSize: 0 };
            }
            return {
                name: line.substring(0, colonIndex).trim(),
                value: line.substring(colonIndex + 1).trim(),
                enabled: true,
                description: '',
                type: 'text',
                fileName: '',
                fileSize: 0
            };
        });

        this.toggleBulkEdit(false);
        this.renderItems();
        this._triggerChange();
    }

    /**
     * 从文本导入
     */
    importFromText(text, separator = '\n', kvSeparator = ':') {
        const lines = text.split(separator).filter(line => line.trim());

        this.items = lines.map(line => {
            const sepIndex = line.indexOf(kvSeparator);
            if (sepIndex === -1) {
                return { name: line.trim(), value: '', enabled: true, description: '', type: 'text', fileName: '', fileSize: 0 };
            }
            return {
                name: line.substring(0, sepIndex).trim(),
                value: line.substring(sepIndex + 1).trim(),
                enabled: true,
                description: '',
                type: 'text',
                fileName: '',
                fileSize: 0
            };
        });

        this.renderItems();
        this._triggerChange();
    }

    /**
     * 导出为文本
     */
    exportToText(separator = '\n', kvSeparator = ': ') {
        return this.items
            .filter(item => item.enabled && item.name)
            .map(item => `${item.name}${kvSeparator}${item.value}`)
            .join(separator);
    }

    /**
     * 清空
     */
    clear() {
        this.items = [];
        this.renderItems();
        this._triggerChange();
    }

    /**
     * 销毁组件
     */
    destroy() {
        this.container.innerHTML = '';
        this.onChangeCallbacks = [];
    }
}

// CSS 样式（将通过 style.css 引入）
export const KeyValueEditorStyles = `
.kv-editor {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.kv-toolbar {
    display: flex;
    justify-content: flex-end;
    padding: 4px 0;
}

.kv-bulk-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: transparent;
    border: 1px solid var(--border-light);
    border-radius: 4px;
    font-size: 11px;
    color: var(--text-secondary);
    cursor: pointer;
    transition: var(--transition-fast);
}

.kv-bulk-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
}

.kv-table-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.kv-table {
    width: 100%;
    border-collapse: collapse;
}

.kv-table th {
    padding: 6px 8px;
    text-align: left;
    font-size: 11px;
    font-weight: 500;
    color: var(--text-muted);
    border-bottom: 1px solid var(--border-light);
}

.kv-table td {
    padding: 4px 4px;
}

.kv-row.disabled {
    opacity: 0.5;
}

.kv-row.disabled .kv-input {
    text-decoration: line-through;
}

.kv-col-check {
    width: 28px;
    text-align: center;
}

.kv-col-check input {
    accent-color: var(--accent-primary);
}

.kv-col-key {
    width: 30%;
}

.kv-col-value {
    width: auto;
}

.kv-col-desc {
    width: 20%;
}

.kv-col-actions {
    width: 28px;
    text-align: center;
}

.kv-input {
    width: 100%;
    padding: 6px 10px;
    background: var(--bg-input);
    border: 1px solid var(--border-light);
    border-radius: 4px;
    color: var(--text-primary);
    font-size: 12px;
    font-family: var(--font-mono);
    outline: none;
    transition: var(--transition-fast);
}

.kv-input:focus {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.15);
}

.kv-input:read-only {
    background: var(--bg-secondary);
    cursor: default;
}

.kv-input.has-variable {
    color: var(--warning);
}

.kv-remove {
    width: 24px;
    height: 24px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    font-size: 16px;
    cursor: pointer;
    border-radius: 4px;
    transition: var(--transition-fast);
}

.kv-remove:hover {
    background: rgba(239, 68, 68, 0.2);
    color: var(--error);
}

.kv-add {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: transparent;
    border: 1px dashed var(--border-color);
    border-radius: 6px;
    color: var(--text-muted);
    font-size: 12px;
    cursor: pointer;
    transition: var(--transition-fast);
}

.kv-add:hover {
    border-color: var(--accent-primary);
    color: var(--accent-primary);
    background: rgba(124, 58, 237, 0.05);
}

.kv-add-icon {
    font-size: 16px;
    font-weight: 300;
}

.kv-bulk-container {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.kv-bulk-textarea {
    width: 100%;
    min-height: 200px;
    padding: 12px;
    background: var(--bg-input);
    border: 1px solid var(--border-light);
    border-radius: 6px;
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: 12px;
    resize: vertical;
    outline: none;
}

.kv-bulk-textarea:focus {
    border-color: var(--accent-primary);
}

.kv-bulk-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
}

.kv-bulk-apply,
.kv-bulk-cancel {
    padding: 6px 16px;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    transition: var(--transition-fast);
}

.kv-bulk-apply {
    background: var(--accent-primary);
    border: none;
    color: white;
}

.kv-bulk-apply:hover {
    background: var(--accent-hover);
}

.kv-bulk-cancel {
    background: transparent;
    border: 1px solid var(--border-color);
    color: var(--text-secondary);
}

.kv-bulk-cancel:hover {
    background: var(--bg-hover);
}
`;
