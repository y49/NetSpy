# KV Editor Unification Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify all KV editors (Params, Headers, Body, Response Headers) to use the `KeyValueEditor` component, fixing form-data/urlencoded bugs and refactoring the body data flow.

**Architecture:** Enhance `KeyValueEditor` with `valueAsTextarea` and file field support, then migrate all four inline KV editors in `detailPanel.js` to use it. Body data flow changes from re-parsing raw strings on every render to pairs-as-source-of-truth with serialization only on send.

**Tech Stack:** Vanilla JS (ES modules), Chrome Extension MV3, CSS custom properties

---

## File Structure

| File | Role | Change |
|------|------|--------|
| `js/ui/components/KeyValueEditor.js` | Reusable KV editor component | Enhanced: schema extension, valueAsTextarea, file fields |
| `js/ui/detailPanel.js` | Request/response detail panel | Refactored: all editors use KeyValueEditor, new data flow |
| `js/main.js` | Panel initialization & event handling | Updated: `sendRequest()` body handling uses pre-serialized body |
| `styles/kv-editor.css` | KV editor styles | Modified: remove dead classes, add file label + textarea styles |

---

### Task 1: Enhance KeyValueEditor — Schema Extension

**Files:**
- Modify: `js/ui/components/KeyValueEditor.js:18-65`

- [ ] **Step 1: Update constructor to accept new options**

In `js/ui/components/KeyValueEditor.js`, update the constructor's default options (line 20-33):

```javascript
constructor(container, options = {}) {
    this.container = container;
    this.options = {
        showCheckbox: true,
        showDescription: false,
        showBulkEdit: true,
        showAddButton: true,
        readOnly: false,
        valueAsTextarea: false,     // NEW
        itemTypes: ['text'],        // NEW: ['text'] or ['text', 'file']
        placeholder: {
            key: 'Key',
            value: 'Value',
            description: 'Description'
        },
        emptyMessage: 'No items yet. Click "Add" to create one.',
        ...options
    };

    // Disable bulk edit when file items are supported (would lose file metadata)
    if (this.options.itemTypes.includes('file')) {
        this.options.showBulkEdit = false;
    }

    this.items = [];
    this.onChangeCallbacks = [];
    this.bulkEditMode = false;

    this.render();
}
```

- [ ] **Step 2: Update `setData()` to preserve extra fields**

Replace `setData()` (line 45-53):

```javascript
setData(items) {
    this.items = (items || []).map(item => ({
        name: item.name || item.key || '',
        value: item.value || '',
        enabled: item.enabled !== false,
        description: item.description || '',
        type: item.type || 'text',
        fileName: item.fileName || '',
        fileSize: item.fileSize || 0,
    }));
    this.renderItems();
}
```

- [ ] **Step 3: Update `getData()` to return all fields**

Replace `getData()` (line 58-65):

```javascript
getData() {
    return this.items.map(item => ({
        name: item.name,
        value: item.value,
        enabled: item.enabled,
        description: item.description,
        type: item.type,
        fileName: item.fileName,
        fileSize: item.fileSize,
    }));
}
```

- [ ] **Step 4: Update `addItem()` default item to include new fields**

Replace the default item in `addItem()` (line 338):

```javascript
addItem(item = null) {
    this.items.push(item || { name: '', value: '', enabled: true, description: '', type: 'text', fileName: '', fileSize: 0 });
    this.renderItems();

    // Focus on new row's key input
    const rows = this.tableContainer.querySelectorAll('.kv-row');
    const lastRow = rows[rows.length - 1];
    if (lastRow) {
        const keyInput = lastRow.querySelector('.kv-col-key input');
        if (keyInput) keyInput.focus();
    }

    this._triggerChange();
}
```

- [ ] **Step 5: Update `renderItems()` empty-state push to include new fields**

In `renderItems()` (line 163), update the empty item:

```javascript
this.items.push({ name: '', value: '', enabled: true, description: '', type: 'text', fileName: '', fileSize: 0 });
```

- [ ] **Step 6: Update `applyBulkEdit()` and `importFromText()` to include new fields**

In `applyBulkEdit()` (lines 390-401), update the item creation to include schema fields:

```javascript
return {
    name: line.substring(0, colonIndex).trim(),
    value: line.substring(colonIndex + 1).trim(),
    enabled: true,
    description: '',
    type: 'text',
    fileName: '',
    fileSize: 0,
};
```

Same for the no-colon case and `importFromText()` (lines 414-425) — add `type: 'text', fileName: '', fileSize: 0` to all item creation objects.

- [ ] **Step 7: Update `destroy()` to clear container className**

In `destroy()` (line 453-456), add className reset:

```javascript
destroy() {
    this.container.innerHTML = '';
    this.container.className = '';
    this.onChangeCallbacks = [];
}
```

- [ ] **Step 8: Commit**

```bash
git add js/ui/components/KeyValueEditor.js
git commit -m "feat(KeyValueEditor): extend schema with type, fileName, fileSize fields"
```

---

### Task 2: Enhance KeyValueEditor — valueAsTextarea and File Field Rendering

**Files:**
- Modify: `js/ui/components/KeyValueEditor.js:213-316`

- [ ] **Step 1: Update `_createRow()` to support file fields and textarea**

Replace the value input section in `_createRow()` (lines 262-282) and add file field handling. The full updated `_createRow()`:

```javascript
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
```

- [ ] **Step 2: Add `_formatFileSize()` helper method**

Add after `_highlightVariables()` method (after line 332):

```javascript
/**
 * Format file size for display
 */
_formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}
```

- [ ] **Step 3: Commit**

```bash
git add js/ui/components/KeyValueEditor.js
git commit -m "feat(KeyValueEditor): add valueAsTextarea and file field rendering"
```

---

### Task 3: CSS — File Label and Textarea Styles + Dead Code Cleanup

**Files:**
- Modify: `styles/kv-editor.css`

- [ ] **Step 1: Remove dead CSS classes**

Remove the following classes that are ONLY used by inline HTML being deleted:
- `.kv-add-btn` (lines 117-132) — replaced by KeyValueEditor's `.kv-add`
- `.kv-delete-btn` (lines 139-159) — replaced by KeyValueEditor's `.kv-remove`
- `.kv-actions` (lines 134-137) — replaced by `.kv-col-actions`
- `.kv-input.key` and `.kv-input.value` (lines 102-108) — component doesn't use subclasses
- `.kv-check` (lines 62-65, 80-82) — replaced by `.kv-col-check`

**Keep** these classes — still used by the read-only `renderResponseHeaders()` view (lines 929-957):
- `.kv-header`, `.kv-title`, `.kv-count`, `.kv-empty`, `.kv-key`, `.kv-value`

**Important:** This task should be applied AFTER Tasks 4-6 and 9-10 complete the migration. If applied before, the UI will break temporarily.

- [ ] **Step 2: Add file label and textarea styles**

Add at the end of the file:

```css
/* File field label */
.kv-file-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    background: var(--bg-tertiary);
    border-radius: var(--radius-sm);
    font-size: 12px;
    color: var(--text-secondary);
    font-family: var(--font-mono);
}

/* Textarea value (auto-expanding) */
.kv-textarea {
    resize: none;
    overflow: hidden;
    min-height: 28px;
    line-height: 1.4;
}
```

- [ ] **Step 3: Commit**

```bash
git add styles/kv-editor.css
git commit -m "style: add file label and textarea styles, remove dead KV classes"
```

---

### Task 4: Migrate Params Editor to KeyValueEditor

**Files:**
- Modify: `js/ui/detailPanel.js:5-8` (imports)
- Modify: `js/ui/detailPanel.js:395-433` (renderParams, addParam)
- Modify: `js/ui/detailPanel.js:543-573` (updateUrlFromParams, updateParamsFromUrl)

- [ ] **Step 1: Add KeyValueEditor import**

Add at line 5 of `detailPanel.js`, after existing imports:

```javascript
import { KeyValueEditor } from './components/KeyValueEditor.js';
```

- [ ] **Step 2: Add editor instance variables**

After line 31 (`const bodyTypeCache = new Map();`), add:

```javascript
// Editor instances
let paramsEditor = null;
let headersEditor = null;
let bodyEditor = null;
let responseHeadersEditor = null;
```

- [ ] **Step 3: Replace `renderParams()` function**

Replace the entire `renderParams()` function (lines 395-425) and delete `addParam()` (lines 427-433):

```javascript
function renderParams() {
    const container = document.getElementById('paramsPane');
    if (!container) return;

    if (!paramsEditor) {
        paramsEditor = new KeyValueEditor(container, {
            placeholder: { key: 'Parameter', value: 'Value' },
            showCheckbox: true,
            showBulkEdit: true,
        });
        paramsEditor.onChange(() => {
            editableParams = paramsEditor.getData();
            updateUrlFromParams();
        });
    }
    paramsEditor.setData(editableParams);
}
```

- [ ] **Step 4: Update `updateUrlFromParams()` to use editor**

Replace `updateUrlFromParams()` (lines 543-556):

```javascript
function updateUrlFromParams() {
    if (!editUrl) return;

    try {
        const url = new URL(editUrl.value);
        url.search = '';
        const enabledParams = paramsEditor ? paramsEditor.getEnabledData() : editableParams.filter(p => p.enabled && p.name);
        enabledParams.forEach(p => {
            url.searchParams.append(p.name, p.value);
        });
        editUrl.value = url.toString();
    } catch (e) {
        // Invalid URL, skip
    }
}
```

- [ ] **Step 5: Update `updateParamsFromUrl()` to use editor**

Replace `updateParamsFromUrl()` (lines 558-573):

```javascript
function updateParamsFromUrl() {
    if (!editUrl) return;
    try {
        const url = new URL(editUrl.value);
        editableParams = [];
        url.searchParams.forEach((value, name) => {
            editableParams.push({ name, value, enabled: true });
        });
        if (paramsEditor && activeRequestTab === 'params') {
            paramsEditor.setData(editableParams);
        }
    } catch (e) {
        // Invalid URL, skip
    }
}
```

- [ ] **Step 6: Commit**

```bash
git add js/ui/detailPanel.js
git commit -m "refactor: migrate Params editor to KeyValueEditor component"
```

---

### Task 5: Migrate Headers Editor to KeyValueEditor

**Files:**
- Modify: `js/ui/detailPanel.js:439-475` (renderHeaders, addHeader)

- [ ] **Step 1: Replace `renderHeaders()` and delete `addHeader()`**

Replace the entire `renderHeaders()` function (lines 439-467) and delete `addHeader()` (lines 470-475):

```javascript
function renderHeaders() {
    const container = document.getElementById('headersPane');
    if (!container) return;

    if (!headersEditor) {
        headersEditor = new KeyValueEditor(container, {
            placeholder: { key: 'Header', value: 'Value' },
            showCheckbox: true,
            showBulkEdit: true,
        });
        headersEditor.onChange(() => {
            editableHeaders = headersEditor.getData();
        });
    }
    headersEditor.setData(editableHeaders);
}
```

Note: Unlike old `bindKVEvents()`, this does NOT call `updateUrlFromParams()` — fixing the latent bug where editing headers triggered URL reconstruction.

- [ ] **Step 2: Commit**

```bash
git add js/ui/detailPanel.js
git commit -m "refactor: migrate Headers editor to KeyValueEditor component"
```

---

### Task 6: Delete Old Inline KV Helper Functions

**Files:**
- Modify: `js/ui/detailPanel.js:481-541`

- [ ] **Step 1: Delete `createKVRow()` and `bindKVEvents()`**

Delete the entire `createKVRow()` function (lines 481-500) and `bindKVEvents()` function (lines 502-541). These are now fully replaced by `KeyValueEditor` internals.

- [ ] **Step 2: Verify no remaining references**

Search for `createKVRow` and `bindKVEvents` in the file — there should be zero references after deleting `renderParams()` and `renderHeaders()` inline HTML.

- [ ] **Step 3: Commit**

```bash
git add js/ui/detailPanel.js
git commit -m "refactor: remove obsolete createKVRow and bindKVEvents helpers"
```

---

### Task 7: Enhance `parseFormDataBody()` for File Detection

**Files:**
- Modify: `js/ui/detailPanel.js:707-787`

- [ ] **Step 1: Update `parseFormDataBody()` to detect file fields**

Replace the inner loop of `parseFormDataBody()` (the `for (const part of parts)` block, lines 746-784):

```javascript
for (const part of parts) {
    // Find Content-Disposition header
    const dispositionMatch = part.match(/Content-Disposition:\s*form-data;\s*name\s*[=:]\s*"?([^";\r\n]+)"?/i);
    if (dispositionMatch) {
        const name = dispositionMatch[1].trim();

        // Detect filename for file fields
        const filenameMatch = part.match(/filename\s*=\s*"?([^";\r\n]+)"?/i);

        // Find the value (after double line break or just after the header)
        const headerEndIndex = part.indexOf('\r\n\r\n');
        let value = '';

        if (headerEndIndex !== -1) {
            value = part.substring(headerEndIndex + 4).trim();
        } else {
            // Try single line breaks
            const singleBreakIndex = part.indexOf('\n\n');
            if (singleBreakIndex !== -1) {
                value = part.substring(singleBreakIndex + 2).trim();
            } else {
                // Try to get value after the last header line
                const lines = part.split(/\r?\n/);
                let valueStarted = false;
                const valueLines = [];
                for (const line of lines) {
                    if (valueStarted) {
                        valueLines.push(line);
                    } else if (line.trim() === '') {
                        valueStarted = true;
                    }
                }
                value = valueLines.join('\n').trim();
            }
        }

        // Clean up trailing boundary markers
        value = value.replace(/^-{2,}[\w]*$/, '').trim();

        if (filenameMatch) {
            // File field
            result.push({
                name,
                value,
                type: 'file',
                fileName: filenameMatch[1].trim(),
                fileSize: value.length,
                enabled: true,
            });
        } else {
            // Text field
            result.push({ name, value, type: 'text', enabled: true });
        }
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add js/ui/detailPanel.js
git commit -m "feat: parseFormDataBody now detects file fields with filename metadata"
```

---

### Task 8: Refactor Body Editor — New Data Flow and Functions

**Files:**
- Modify: `js/ui/detailPanel.js:26-31` (state variables)
- Modify: `js/ui/detailPanel.js:272-289` (getValues)
- Add new functions: `getBodyForSend()`, `buildMultipartBody()`

- [ ] **Step 1: Update state variables**

Replace lines 29-31:

```javascript
// Old:
let editableBody = '';
let editableBodyPairs = []; // For form-data/urlencoded
const bodyTypeCache = new Map(); // bodyType -> { body, pairs }

// New:
let editableBody = '';          // Original body from captured request (for initial parse)
let editableBodyRaw = '';       // For raw/json editing only
const bodyTypeCache = new Map(); // bodyType -> { pairs, raw }
```

Note: `editableBodyPairs` is removed. `editableBody` is kept only for the initial parse on first render.

- [ ] **Step 2: Add `buildMultipartBody()` function**

Add before `renderBody()` function:

```javascript
function buildMultipartBody(pairs) {
    const boundary = '----NetSpyFormBoundary' + Math.random().toString(36).substring(2);
    let body = '';
    for (const pair of pairs) {
        body += `--${boundary}\r\n`;
        if (pair.type === 'file') {
            body += `Content-Disposition: form-data; name="${pair.name}"; filename="${pair.fileName}"\r\n\r\n`;
            body += `${pair.value}\r\n`;
        } else {
            body += `Content-Disposition: form-data; name="${pair.name}"\r\n\r\n`;
            body += `${pair.value}\r\n`;
        }
    }
    body += `--${boundary}--\r\n`;
    return { body, boundary };
}
```

- [ ] **Step 3: Add `getBodyForSend()` function**

Add after `buildMultipartBody()`:

```javascript
function getBodyForSend() {
    switch (currentBodyType) {
        case 'formdata': {
            if (!bodyEditor) return { body: editableBody, boundary: null };
            const pairs = bodyEditor.getData().filter(p => p.enabled);
            return buildMultipartBody(pairs);
        }
        case 'urlencoded': {
            if (!bodyEditor) return { body: '', boundary: null };
            const pairs = bodyEditor.getEnabledData();
            const body = pairs.map(p => `${encodeURIComponent(p.name)}=${encodeURIComponent(p.value)}`).join('&');
            return { body, boundary: null };
        }
        case 'json':
        case 'raw':
            return { body: editableBodyRaw, boundary: null };
        default:
            return { body: '', boundary: null };
    }
}
```

- [ ] **Step 4: Update `getValues()` to use `getBodyForSend()`**

Replace `getValues()` (lines 272-289):

```javascript
export function getValues() {
    // Sync editor data before collecting values
    if (paramsEditor) editableParams = paramsEditor.getData();
    if (headersEditor) editableHeaders = headersEditor.getData();

    const bodyResult = getBodyForSend();

    return {
        url: editUrl?.value || '',
        method: editMethod?.value || 'GET',
        headers: editableHeaders.filter(h => h.enabled),
        body: bodyResult.body,
        bodyType: currentBodyType,
        bodyBoundary: bodyResult.boundary,
        isInterceptEdit: isInterceptEditMode,
        interceptRequestId: interceptRequestId,
        interceptStage: interceptStage,
        // Response edits (for response intercept)
        responseStatus: editableResponseStatus,
        responseStatusText: editableResponseStatusText,
        responseHeaders: editableResponseHeaders.filter(h => h.enabled),
        responseBody: editableResponseBody
    };
}
```

Note: `bodyPairs` removed from return value, `bodyBoundary` added.

- [ ] **Step 5: Update `validate()` to use `editableBodyRaw`**

In `validate()` (line 301), change:

```javascript
// Old:
if (values.bodyType === 'json' && values.body.trim()) {

// No change needed — values.body now comes from getBodyForSend()
// which returns editableBodyRaw for json type. This is correct.
```

No code change needed here — just verify the logic is correct.

- [ ] **Step 6: Update `initEditData()` to set `editableBodyRaw`**

Find where `editableBody` is set from the captured request (around line 230-252). Add after `editableBody = ...`:

```javascript
editableBodyRaw = editableBody; // Initialize raw editor content
```

- [ ] **Step 7: Commit**

```bash
git add js/ui/detailPanel.js
git commit -m "feat: add getBodyForSend and buildMultipartBody for new body data flow"
```

---

### Task 9: Migrate Body Editor to KeyValueEditor

**Files:**
- Modify: `js/ui/detailPanel.js:579-853` (renderBody, renderBodyContent, bindBodyEvents, etc.)

- [ ] **Step 1: Replace `renderBodyContent()` for KV types**

Replace the `case 'urlencoded'` and `case 'formdata'` blocks in `renderBodyContent()` (lines 661-667):

```javascript
case 'urlencoded':
case 'formdata':
    return '<div id="bodyKvContainer"></div>';
```

Update `case 'json'` and `case 'raw'` to use `editableBodyRaw`:

```javascript
case 'json':
    let prettyBody = editableBodyRaw;
    try { prettyBody = prettifyJson(editableBodyRaw); } catch (e) { }
    return `
        <div class="body-textarea-wrapper">
            <textarea class="body-textarea json" id="bodyTextarea"
                      placeholder='{"key": "value"}'>${escapeHtml(prettyBody)}</textarea>
        </div>
    `;

case 'raw':
    return `
        <div class="body-textarea-wrapper">
            <textarea class="body-textarea" id="bodyTextarea"
                      placeholder="Enter raw body content">${escapeHtml(editableBodyRaw)}</textarea>
        </div>
    `;
```

- [ ] **Step 2: Add `initBodyKvEditor()` function**

Add a new function after `renderBody()`:

```javascript
function initBodyKvEditor(container) {
    const kvContainer = container.querySelector('#bodyKvContainer');
    if (!kvContainer) return;

    // Destroy previous instance
    bodyEditor?.destroy();

    bodyEditor = new KeyValueEditor(kvContainer, {
        placeholder: { key: 'Key', value: 'Value' },
        showCheckbox: true,
        showBulkEdit: currentBodyType !== 'formdata', // Disable bulk edit for formdata (file fields)
        valueAsTextarea: true,
        itemTypes: currentBodyType === 'formdata' ? ['text', 'file'] : ['text'],
    });

    // Load data: from cache first, then parse from original body
    const cached = bodyTypeCache.get(currentBodyType);
    if (cached?.pairs?.length) {
        bodyEditor.setData(cached.pairs);
    } else {
        const pairs = currentBodyType === 'formdata'
            ? parseFormDataBody(editableBody)
            : parseUrlEncodedBody(editableBody);
        bodyEditor.setData(pairs);
    }
}
```

- [ ] **Step 3: Update `renderBody()` body type switching to use new cache**

Replace the body type change handler in `renderBody()` (lines 608-633):

```javascript
container.querySelectorAll('input[name="bodyType"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        // Cache current data before switching
        if (currentBodyType === 'formdata' || currentBodyType === 'urlencoded') {
            if (bodyEditor) {
                bodyTypeCache.set(currentBodyType, { pairs: bodyEditor.getData(), raw: '' });
            }
        } else if (currentBodyType === 'json' || currentBodyType === 'raw') {
            bodyTypeCache.set(currentBodyType, { pairs: [], raw: editableBodyRaw });
        }

        // Destroy body editor if switching away from KV type
        if ((currentBodyType === 'formdata' || currentBodyType === 'urlencoded') &&
            e.target.value !== 'formdata' && e.target.value !== 'urlencoded') {
            bodyEditor?.destroy();
            bodyEditor = null;
        }

        currentBodyType = e.target.value;

        // Restore raw from cache if switching to raw/json
        if (currentBodyType === 'json' || currentBodyType === 'raw') {
            const cached = bodyTypeCache.get(currentBodyType);
            if (cached?.raw) {
                editableBodyRaw = cached.raw;
            }
        }

        container.querySelectorAll('.body-type').forEach(l => l.classList.remove('active'));
        e.target.closest('.body-type').classList.add('active');

        const contentArea = container.querySelector('.body-content-area');
        if (contentArea) {
            contentArea.innerHTML = renderBodyContent();
            // Initialize KV editor if needed
            if (currentBodyType === 'formdata' || currentBodyType === 'urlencoded') {
                initBodyKvEditor(container);
            }
        }
        bindBodyEvents(container);
    });
});
```

- [ ] **Step 4: Update initial `renderBody()` to initialize KV editor**

After `bindBodyEvents(container);` at line 635, add:

```javascript
// Initialize KV editor if body type is formdata or urlencoded
if (currentBodyType === 'formdata' || currentBodyType === 'urlencoded') {
    initBodyKvEditor(container);
}
```

- [ ] **Step 5: Simplify `bindBodyEvents()` — remove KV logic**

Replace `bindBodyEvents()` (lines 789-823). Only textarea binding remains:

```javascript
function bindBodyEvents(container) {
    const textarea = container.querySelector('#bodyTextarea');
    if (textarea) {
        textarea.addEventListener('input', (e) => {
            editableBodyRaw = e.target.value;
        });
    }
}
```

- [ ] **Step 6: Delete `renderKvBodyTable()` and `updateBodyFromKv()`**

Delete `renderKvBodyTable()` (lines 674-692) and `updateBodyFromKv()` (lines 826-853). These are fully replaced by `KeyValueEditor` and `getBodyForSend()`.

- [ ] **Step 7: Commit**

```bash
git add js/ui/detailPanel.js
git commit -m "refactor: migrate body editor to KeyValueEditor with pairs-as-source-of-truth"
```

---

### Task 10: Migrate Response Headers Editor to KeyValueEditor

**Files:**
- Modify: `js/ui/detailPanel.js:1057-1113`

- [ ] **Step 1: Replace response headers inline HTML with KeyValueEditor**

Replace the entire `if (headersPane)` block in `renderEditableResponse()` (lines 1057-1113):

```javascript
if (headersPane) {
    if (!responseHeadersEditor) {
        responseHeadersEditor = new KeyValueEditor(headersPane, {
            placeholder: { key: 'Header', value: 'Value' },
            showCheckbox: true,
            showBulkEdit: true,
        });
        responseHeadersEditor.onChange(() => {
            editableResponseHeaders = responseHeadersEditor.getData();
        });
    }
    responseHeadersEditor.setData(editableResponseHeaders);
}
```

- [ ] **Step 2: Commit**

```bash
git add js/ui/detailPanel.js
git commit -m "refactor: migrate response headers editor to KeyValueEditor"
```

---

### Task 11: Reset Editor Instances on Request Switch

**Files:**
- Modify: `js/ui/detailPanel.js`

- [ ] **Step 1: Add cleanup when switching requests**

Find `showEmpty()` function (around line 265) and add editor cleanup:

```javascript
export function showEmpty() {
    detailView?.classList.add('hidden');
    emptyState?.classList.remove('hidden');
    currentRequest = null;
    lastEditedRequestId = null;

    // Destroy editor instances
    paramsEditor?.destroy(); paramsEditor = null;
    headersEditor?.destroy(); headersEditor = null;
    bodyEditor?.destroy(); bodyEditor = null;
    responseHeadersEditor?.destroy(); responseHeadersEditor = null;
}
```

- [ ] **Step 2: Add cleanup in `showRequest()` / `initEditData()`**

Find where a new request is loaded (the function that calls `initEditData`). Before re-initializing editors, destroy old instances. Add at the beginning of `initEditData()` or equivalent:

```javascript
// Reset editors when switching to a new request
paramsEditor?.destroy(); paramsEditor = null;
headersEditor?.destroy(); headersEditor = null;
bodyEditor?.destroy(); bodyEditor = null;
responseHeadersEditor?.destroy(); responseHeadersEditor = null;
bodyTypeCache.clear();
```

- [ ] **Step 3: Commit**

```bash
git add js/ui/detailPanel.js
git commit -m "fix: properly destroy editor instances on request switch"
```

---

### Task 12: Update `js/main.js` sendRequest() for New Body Format

**Files:**
- Modify: `js/main.js:743-771` (body preparation switch)
- Modify: `js/main.js:948` (pendingModifications body reference)

This is critical — `main.js` is the primary consumer of `getValues()` and directly uses `bodyPairs` which has been removed.

- [ ] **Step 1: Replace body preparation switch in `sendRequest()`**

Replace the switch statement at lines 743-771:

```javascript
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
        requestBody = values.body; // Already serialized by getBodyForSend()
        break;
    case 'formdata':
        // Body is pre-serialized multipart string from getBodyForSend()
        if (values.bodyBoundary) {
            contentType = `multipart/form-data; boundary=${values.bodyBoundary}`;
        } else {
            contentType = 'multipart/form-data';
        }
        requestBody = values.body;
        break;
    case 'raw':
        requestBody = values.body;
        break;
    default:
        // none - no body
        break;
}
```

Note: The old formdata case sent `{ type: 'formdata', pairs: values.bodyPairs }` as an object. Now `values.body` is a pre-serialized multipart string, and `values.bodyBoundary` provides the boundary for the Content-Type header.

- [ ] **Step 2: Update Content-Type header logic**

Replace lines 773-776. The old code skipped Content-Type for formdata. Now we always set it since the body is pre-serialized (not using browser FormData):

```javascript
// Set content-type header
if (contentType) {
    headersObject['Content-Type'] = contentType;
}
```

- [ ] **Step 3: Fix pendingModifications body reference**

Replace line 948:

```javascript
// Old:
body: typeof requestBody === 'string' ? requestBody : JSON.stringify(values.bodyPairs),

// New:
body: requestBody || '',
```

`requestBody` is now always a string (or undefined for no body).

- [ ] **Step 4: Verify no other `bodyPairs` references in main.js**

Search for `bodyPairs` in `js/main.js` — there should be zero remaining references.

- [ ] **Step 5: Commit**

```bash
git add js/main.js
git commit -m "fix: update sendRequest body handling for pre-serialized body format"
```

---

### Task 13: Verify Other `getValues()` Consumers

**Files:**
- Read-only check: `js/services/interceptService.js`, `js/services/requestService.js`, `background.js`

- [ ] **Step 1: Search for `bodyPairs` references across the codebase**

Search all JS files for `bodyPairs`. After Task 12, there should be zero references remaining. If any service files reference it, update them to use `values.body` (pre-serialized) and `values.bodyBoundary`.

- [ ] **Step 2: Commit if changes were needed**

```bash
git add js/services/interceptService.js js/services/requestService.js
git commit -m "fix: remove remaining bodyPairs references from services"
```

---

### Task 14: Manual Testing Checklist

- [ ] **Step 1: Test Params editor**
  - Load extension, capture a request with query params
  - Verify params display with checkboxes
  - Add a param via "Add" button → new row appears, focus on key input
  - Edit a param → URL updates in real-time
  - Toggle checkbox → param excluded from URL
  - Delete a param → row removed, URL updates
  - Bulk Edit → text mode, apply changes

- [ ] **Step 2: Test Headers editor**
  - Same flow as params
  - Verify editing headers does NOT trigger URL changes

- [ ] **Step 3: Test Body — urlencoded**
  - Capture/create a request with `application/x-www-form-urlencoded` body
  - Verify params display correctly with checkboxes
  - Click "Add" → new empty row appears
  - Edit key/value → no display glitches
  - Switch away from urlencoded and back → data preserved

- [ ] **Step 4: Test Body — form-data**
  - Capture a request with `multipart/form-data` body
  - Verify text fields display with checkboxes
  - Verify file fields show as `📎 filename (binary)` read-only labels
  - Click "Add" → new empty row appears
  - Edit text field → works smoothly
  - Bulk edit button should be hidden for form-data
  - Switch away and back → data preserved

- [ ] **Step 5: Test Body — json/raw**
  - Verify textarea editing works
  - Switch between json and raw → data preserved via cache

- [ ] **Step 6: Test Response Headers editor (intercept mode)**
  - Enable interception, catch a response
  - Verify response headers show with KeyValueEditor
  - Add/edit/delete response headers

- [ ] **Step 7: Test request sending**
  - Send a modified urlencoded request → verify body is correctly encoded
  - Send a modified form-data request → verify multipart body with correct boundary
  - Continue an intercepted request with modifications → verify it works

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "feat: complete KV editor unification — all editors use KeyValueEditor component"
```
