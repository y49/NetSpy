# KV Editor Unification & Body Editor Fix

## Problem

NetSpy's parameter editing has several critical bugs and inconsistencies:

1. **Body "Add" button broken for form-data**: `bindBodyEvents()` always calls `parseUrlEncodedBody()` regardless of body type, wiping form-data entries when clicking Add.
2. **Form-data round-trip data loss**: Body editing re-parses raw string on every render with new random boundaries, causing display issues.
3. **Inconsistent editor implementations**: Params/Headers use inline HTML (`createKVRow` + `bindKVEvents`), Body uses a different inline approach (`renderKvBodyTable`), while a high-quality `KeyValueEditor` component exists but is unused in detailPanel.
4. **`editableBodyPairs` stored but never used for rendering**: `renderBodyContent()` always re-parses from `editableBody` string.
5. **Latent bug in `bindKVEvents`**: calls `updateUrlFromParams()` for ALL KV editors including headers — editing a header value triggers unnecessary URL reconstruction.

## Solution

Unify all KV editors (Params, Headers, Body, Response Headers) to use the existing `KeyValueEditor` component, enhance it with body-specific capabilities, and fix the data flow.

## Design

### 1. KeyValueEditor Component Enhancements

**New options:**
- `valueAsTextarea: false` — render value as `<textarea>` instead of `<input>` (for long form values). Textarea uses `rows="1"` with CSS auto-resize via `field-sizing: content` or a JS-based auto-expand on input.
- `itemTypes: ['text']` — supported item types; `['text', 'file']` enables file field display

**Item schema extension — `setData()` and `getData()` must preserve extra fields:**
```javascript
// setData() must preserve type, fileName, fileSize
setData(items) {
    this.items = (items || []).map(item => ({
        name: item.name || item.key || '',
        value: item.value || '',
        enabled: item.enabled !== false,
        description: item.description || '',
        type: item.type || 'text',        // NEW: 'text' or 'file'
        fileName: item.fileName || '',     // NEW: original filename
        fileSize: item.fileSize || 0,      // NEW: approximate size
    }));
    this.renderItems();
}

// getData() must return all fields
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

**File field rendering in `_createRow()`:**
- If `item.type === 'file'`: value column renders as read-only label `📎 filename.jpg (24 KB)` instead of input
- Key input is also read-only for file fields
- Delete button works normally (removes from pairs)

**Bulk edit and file fields:**
- When `itemTypes` includes `'file'`, disable bulk edit button (set `showBulkEdit: false` internally) — bulk edit would lose file metadata with no way to recover it.

**onChange callback** returns full items array via `getData()` with all fields.

### 2. Data Flow Refactoring

**Before (broken):**
```
raw string → parse → display → edit → rebuild raw string (new boundary) → re-parse → display
```

**After:**
```
raw string → parse once into pairs → KeyValueEditor operates on pairs → serialize only on send
```

**State changes in detailPanel.js:**
- Remove: `editableBodyPairs` (unused), `editableBody` for KV types
- Add: `bodyEditor` (KeyValueEditor instance), `editableBodyRaw` (for raw/json only)
- `bodyTypeCache` stores `{ pairs, raw }` — pairs from `editor.getData()`, not raw string

**New function `getBodyForSend()` — called by existing `getValues()` to serialize body:**
```javascript
function getBodyForSend() {
    switch (currentBodyType) {
        case 'formdata': {
            const pairs = bodyEditor.getData().filter(p => p.enabled);
            return buildMultipartBody(pairs);
            // Also returns boundary for Content-Type header update
        }
        case 'urlencoded': {
            const pairs = bodyEditor.getEnabledData();
            return pairs.map(p => `${encodeURIComponent(p.name)}=${encodeURIComponent(p.value)}`).join('&');
        }
        case 'json':
        case 'raw':
            return editableBodyRaw;
        default:
            return '';
    }
}
```

**New function `buildMultipartBody(pairs)` — builds multipart/form-data string:**
```javascript
function buildMultipartBody(pairs) {
    const boundary = '----NetSpyFormBoundary' + Math.random().toString(36).substr(2);
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

**Body type switching cache flow:**
```
User clicks different body type
  → if current is KV type: cache pairs = bodyEditor.getData()
  → if current is raw/json: cache raw = editableBodyRaw
  → switch currentBodyType
  → if new type has cache: restore from cache (setData for KV, set textarea for raw)
  → if no cache: parse from original editableBody string (first-time switch)
```

### 3. Params & Headers Migration

Replace inline HTML rendering with KeyValueEditor instances:
- `paramsEditor = new KeyValueEditor(container, { placeholder: { key: 'Parameter', value: 'Value' }, showCheckbox: true, showBulkEdit: true })`
- `headersEditor = new KeyValueEditor(container, { placeholder: { key: 'Header', value: 'Value' }, showCheckbox: true, showBulkEdit: true })`
- `paramsEditor.onChange(() => updateUrlFromParams())` for URL sync
- `headersEditor.onChange(() => {})` — NO URL sync (fixes latent bug in old `bindKVEvents`)
- `updateUrlFromParams()` reads from `paramsEditor.getEnabledData()`
- `updateParamsFromUrl()` calls `paramsEditor.setData()`

**Code to delete:**
- `createKVRow()` (~20 lines)
- `bindKVEvents()` (~40 lines)
- `addParam()` / `addHeader()` (handled by KeyValueEditor internally)
- Inline HTML in `renderParams()` / `renderHeaders()`

### 4. Body Editor Migration

**formdata / urlencoded types:**
- `renderBodyContent()` returns `<div id="bodyKvContainer"></div>`
- After innerHTML set, initialize `bodyEditor = new KeyValueEditor(...)` with parsed pairs
- `itemTypes: ['text', 'file']` for formdata, `['text']` for urlencoded

**raw / json types:**
- Keep existing textarea approach, bind to `editableBodyRaw`
- Call `bodyEditor?.destroy()` when switching away from KV type to avoid DOM/listener leaks

**Editor lifecycle:**
- Before creating a new `bodyEditor`, call `bodyEditor?.destroy()` on the previous instance
- `destroy()` already exists on KeyValueEditor — clears innerHTML and callbacks

**Body type switching:**
- Cache pairs via `bodyEditor.getData()` before switching
- Restore from cache on switch back
- If no cache, parse from original `editableBody` string

**Code to delete:**
- `renderKvBodyTable()` function
- `bindBodyEvents()` KV-related logic (textarea listener retained)
- `updateBodyFromKv()` function
- `editableBodyPairs` variable

### 5. Response Headers Editor Migration

`renderEditableResponse()` contains its own inline KV editor for response headers (~50 lines). Migrate to `KeyValueEditor` for consistency:
- `responseHeadersEditor = new KeyValueEditor(container, { placeholder: { key: 'Header', value: 'Value' }, showCheckbox: false, showBulkEdit: true })`
- Delete inline response header KV HTML and event bindings

### 6. parseFormDataBody Enhancement

Extract file metadata from `Content-Disposition`:
```
Content-Disposition: form-data; name="avatar"; filename="photo.jpg"
```
- Detect `filename` parameter → mark as `type: 'file'`
- Store `fileName` from the parsed filename
- `fileSize`: show as `File (binary)` — raw value length is unreliable for binary uploads
- Text fields remain `type: 'text'`

### 7. CSS Cleanup

After migration, the following classes in `styles/kv-editor.css` become dead CSS (only used by deleted inline HTML):
- `.kv-header`, `.kv-title`, `.kv-add-btn`, `.body-add-btn`

These should be removed. The `KeyValueEditor` component's styles (`.kv-add`, `.kv-remove`, `.kv-table`, etc.) remain in use.

New CSS to add for file field labels:
```css
.kv-file-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    background: var(--bg-tertiary);
    border-radius: 4px;
    font-size: 12px;
    color: var(--text-secondary);
    font-family: var(--font-mono);
}
```

## Files Changed

| File | Change | Description |
|------|--------|-------------|
| `js/ui/components/KeyValueEditor.js` | Enhanced | `valueAsTextarea`, file field support, schema extension |
| `js/ui/detailPanel.js` | Refactored | All editors use KeyValueEditor, new data flow, new `getBodyForSend()` and `buildMultipartBody()` |
| `styles/kv-editor.css` | Modified | Remove dead classes, add file field label styles |

## Files NOT Changed

- `background.js` — interception logic unchanged
- `js/services/*` — service layer unchanged
- `js/core/requestModel.js` — models unchanged
- `panel.html` — HTML structure unchanged
- `js/ui/views/RequestBuilderView.js` — already uses KeyValueEditor

## Estimated Impact

- Delete ~230 lines of duplicate code (including response headers inline editor)
- Add ~120 lines for KeyValueEditor enhancements + new functions
- Net reduction ~110 lines

## Known Limitations

- File fields in form-data display filename but cannot be replaced with a new file (Chrome Debugger API limitation for binary body)
- File field size shown as "binary" — raw postData length is unreliable for actual file size
