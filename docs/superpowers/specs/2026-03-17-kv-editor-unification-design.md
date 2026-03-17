# KV Editor Unification & Body Editor Fix

## Problem

NetSpy's parameter editing has several critical bugs and inconsistencies:

1. **Body "Add" button broken for form-data**: `bindBodyEvents()` always calls `parseUrlEncodedBody()` regardless of body type, wiping form-data entries when clicking Add.
2. **Form-data round-trip data loss**: Body editing re-parses raw string on every render with new random boundaries, causing display issues.
3. **Inconsistent editor implementations**: Params/Headers use inline HTML (`createKVRow` + `bindKVEvents`), Body uses a different inline approach (`renderKvBodyTable`), while a high-quality `KeyValueEditor` component exists but is unused in detailPanel.
4. **`editableBodyPairs` stored but never used for rendering**: `renderBodyContent()` always re-parses from `editableBody` string.

## Solution

Unify all KV editors (Params, Headers, Body) to use the existing `KeyValueEditor` component, enhance it with body-specific capabilities, and fix the data flow.

## Design

### 1. KeyValueEditor Component Enhancements

**New options:**
- `valueAsTextarea: false` — render value as `<textarea>` instead of `<input>` (for long form values)
- `itemTypes: ['text']` — supported item types; `['text', 'file']` enables file field display

**File field support:**
- Item schema: `{ name, value, type: 'file', fileName, fileSize, enabled }`
- File fields render value column as read-only label: `📎 filename.jpg (24 KB)`
- File fields can be deleted but not edited
- Delete button works normally (removes from pairs)

**onChange callback** returns full items array with all fields (type, enabled, etc.).

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

**Serialization only in `getBodyForSend()`:**
- `formdata` → `buildMultipartBody(pairs)` with boundary
- `urlencoded` → `encodeURIComponent` key=value pairs joined by `&`
- `raw`/`json` → `editableBodyRaw` as-is

### 3. Params & Headers Migration

Replace inline HTML rendering with KeyValueEditor instances:
- `paramsEditor = new KeyValueEditor(container, { placeholder: { key: 'Parameter', value: 'Value' }, showCheckbox: true, showBulkEdit: true })`
- `headersEditor = new KeyValueEditor(container, { placeholder: { key: 'Header', value: 'Value' }, showCheckbox: true, showBulkEdit: true })`
- `paramsEditor.onChange(() => updateUrlFromParams())` for URL sync
- `updateUrlFromParams()` reads from `paramsEditor.getEnabledData()`
- `updateParamsFromUrl()` calls `paramsEditor.setData()`

**Code to delete:**
- `createKVRow()` (~20 lines)
- `bindKVEvents()` (~40 lines)
- `addParam()` / `addHeader()` (handled by KeyValueEditor)
- Inline HTML in `renderParams()` / `renderHeaders()`

### 4. Body Editor Migration

**formdata / urlencoded types:**
- `renderBodyContent()` returns `<div id="bodyKvContainer"></div>`
- After innerHTML set, initialize `bodyEditor = new KeyValueEditor(...)` with parsed pairs
- `itemTypes: ['text', 'file']` for formdata, `['text']` for urlencoded

**raw / json types:**
- Keep existing textarea approach, bind to `editableBodyRaw`

**Body type switching:**
- Cache pairs via `bodyEditor.getData()` before switching
- Restore from cache on switch back
- If no cache, parse from original `editableBody` string

**Code to delete:**
- `renderKvBodyTable()` function
- `bindBodyEvents()` KV-related logic (textarea listener retained)
- `updateBodyFromKv()` function

### 5. parseFormDataBody Enhancement

Extract file metadata from `Content-Disposition`:
```
Content-Disposition: form-data; name="avatar"; filename="photo.jpg"
```
- Detect `filename` parameter → mark as `type: 'file'`
- Store `fileName` and approximate `fileSize` from raw value length
- Text fields remain `type: 'text'`

## Files Changed

| File | Change | Description |
|------|--------|-------------|
| `js/ui/components/KeyValueEditor.js` | Enhanced | `valueAsTextarea`, file field support |
| `js/ui/detailPanel.js` | Refactored | All editors use KeyValueEditor, new data flow |
| `styles/kv-editor.css` | Minor | File field label styles |

## Files NOT Changed

- `background.js` — interception logic unchanged
- `js/services/*` — service layer unchanged
- `js/core/requestModel.js` — models unchanged
- `panel.html` — HTML structure unchanged
- `js/ui/views/RequestBuilderView.js` — already uses KeyValueEditor

## Estimated Impact

- Delete ~180 lines of duplicate code
- Add ~60 lines for KeyValueEditor enhancements
- Net reduction ~120 lines
