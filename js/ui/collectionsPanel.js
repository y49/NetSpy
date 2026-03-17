// Collections sidebar panel

import { store } from '../core/store.js';
import { saveCollections, loadCollections } from '../services/storageService.js';
import * as detailPanel from './detailPanel.js';

let sidebar = null;
let listContainer = null;
let resizer = null;
let expandedCollections = new Set();

export function init() {
    sidebar = document.getElementById('collectionsSidebar');
    listContainer = document.getElementById('collectionsList');
    resizer = document.getElementById('collectionsResizer');

    // Toggle button
    const toggle = document.getElementById('collectionsToggle');
    if (toggle) {
        toggle.addEventListener('click', () => {
            const willShow = sidebar.hidden;
            sidebar.hidden = !willShow;
            if (resizer) resizer.style.display = willShow ? '' : 'none';
            toggle.classList.toggle('active', willShow);
        });
    }

    // Hide resizer initially (sidebar starts hidden)
    if (resizer) resizer.style.display = 'none';

    // Setup resizer drag
    setupResizer();

    // Add collection
    document.getElementById('addCollectionBtn')?.addEventListener('click', () => {
        const name = prompt('Collection name:', 'New Collection');
        if (!name?.trim()) return;
        store.addCollection(name.trim());
        persistCollections();
        render();
    });

    // Import
    const importBtn = document.getElementById('importCollectionBtn');
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    importBtn?.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleImport);

    // Export
    document.getElementById('exportCollectionBtn')?.addEventListener('click', handleExport);

    // Subscribe to state changes for render
    store.subscribe(() => render());

    // Load persisted collections
    loadPersistedCollections();
}

async function loadPersistedCollections() {
    const collections = await loadCollections();
    if (collections.length > 0) {
        store.setCollections(collections);
    }
}

function persistCollections() {
    saveCollections(store.state.collections);
}

export function render() {
    if (!listContainer) return;

    const collections = store.state.collections;
    if (collections.length === 0) {
        listContainer.innerHTML = '<div class="collections-empty">No collections yet.<br>Save a request to get started.</div>';
        return;
    }

    listContainer.innerHTML = collections.map(col => {
        const isOpen = expandedCollections.has(col.id);
        return `
            <div class="collection-group" data-collection-id="${col.id}">
                <div class="collection-group-header" data-toggle="${col.id}">
                    <span class="arrow ${isOpen ? 'open' : ''}">&#9654;</span>
                    <span class="collection-group-name">${escapeHtml(col.name)}</span>
                    <span class="count">${col.requests.length}</span>
                    <div class="collection-group-actions">
                        <button class="collection-action-btn" data-rename="${col.id}" title="Rename">&#9998;</button>
                        <button class="collection-action-btn" data-delete-col="${col.id}" title="Delete">&times;</button>
                    </div>
                </div>
                ${isOpen ? renderCollectionRequests(col) : ''}
            </div>
        `;
    }).join('');

    bindEvents();
}

function renderCollectionRequests(col) {
    if (col.requests.length === 0) {
        return '<div class="collection-requests"><div class="collections-empty" style="padding:8px">Empty</div></div>';
    }

    return `<div class="collection-requests">
        ${col.requests.map(req => `
            <div class="collection-request-item" data-col-id="${col.id}" data-saved-id="${req.savedId}">
                <span class="collection-request-method ${(req.method || 'GET').toLowerCase()}">${req.method || 'GET'}</span>
                <span class="collection-request-name" title="${escapeHtml(req.url)}">${getRequestName(req)}</span>
                <button class="collection-request-delete" data-rm-col="${col.id}" data-rm-id="${req.savedId}">&times;</button>
            </div>
        `).join('')}
    </div>`;
}

function bindEvents() {
    // Toggle expand/collapse
    listContainer.querySelectorAll('[data-toggle]').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target.closest('.collection-group-actions')) return;
            const id = el.dataset.toggle;
            if (expandedCollections.has(id)) expandedCollections.delete(id);
            else expandedCollections.add(id);
            render();
        });
    });

    // Delete collection
    listContainer.querySelectorAll('[data-delete-col]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!confirm('Delete this collection?')) return;
            store.deleteCollection(el.dataset.deleteCol);
            persistCollections();
        });
    });

    // Rename collection
    listContainer.querySelectorAll('[data-rename]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const col = store.state.collections.find(c => c.id === el.dataset.rename);
            if (!col) return;
            const name = prompt('Rename collection:', col.name);
            if (!name?.trim()) return;
            store.renameCollection(col.id, name.trim());
            persistCollections();
        });
    });

    // Load request into detail panel
    listContainer.querySelectorAll('.collection-request-item').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target.closest('.collection-request-delete')) return;
            const colId = el.dataset.colId;
            const savedId = el.dataset.savedId;
            const col = store.state.collections.find(c => c.id === colId);
            const req = col?.requests.find(r => r.savedId === savedId);
            if (req) detailPanel.showRequest(req);
        });
    });

    // Remove request from collection
    listContainer.querySelectorAll('.collection-request-delete').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            store.removeRequestFromCollection(el.dataset.rmCol, el.dataset.rmId);
            persistCollections();
        });
    });
}

/**
 * Save current request to a collection (called from detail panel)
 */
export function saveCurrentRequest(request) {
    const collections = store.state.collections;

    if (collections.length === 0) {
        const name = prompt('Create a collection:', 'My Collection');
        if (!name?.trim()) return;
        store.addCollection(name.trim());
    }

    let col;
    if (collections.length === 1) {
        col = collections[0];
    } else {
        const names = collections.map((c, i) => `${i + 1}. ${c.name}`).join('\n');
        const choice = prompt(`Select collection:\n${names}`, '1');
        if (!choice) return;
        col = collections[parseInt(choice) - 1];
    }

    if (!col) return;

    store.addRequestToCollection(col.id, request);
    persistCollections();

    // Open sidebar to show saved request
    if (sidebar?.hidden) {
        sidebar.hidden = false;
        document.getElementById('collectionsToggle')?.classList.add('active');
    }
    expandedCollections.add(col.id);
    render();
}

async function handleImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
        const text = await file.text();
        const data = JSON.parse(text);
        const imported = Array.isArray(data) ? data : [data];

        for (const col of imported) {
            if (!col.name || !Array.isArray(col.requests)) continue;
            const newCol = store.addCollection(col.name);
            for (const req of col.requests) {
                store.addRequestToCollection(newCol.id, req);
            }
        }

        persistCollections();
        render();
    } catch (err) {
        console.error('Import failed:', err);
        alert('Failed to import: Invalid JSON format');
    }

    e.target.value = '';
}

function handleExport() {
    const collections = store.state.collections;
    if (collections.length === 0) return;

    const blob = new Blob([JSON.stringify(collections, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `netspy-collections-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function getRequestName(req) {
    try {
        const u = new URL(req.url);
        return u.pathname.split('/').pop() || u.pathname || req.url;
    } catch {
        return req.url;
    }
}

function setupResizer() {
    if (!resizer || !sidebar) return;

    let startX = 0;
    let startWidth = 0;

    resizer.addEventListener('mousedown', (e) => {
        startX = e.clientX;
        startWidth = sidebar.offsetWidth;
        resizer.classList.add('active');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const onMove = (e) => {
            const delta = e.clientX - startX;
            const newWidth = Math.max(160, Math.min(400, startWidth + delta));
            sidebar.style.width = newWidth + 'px';
        };

        const onUp = () => {
            resizer.classList.remove('active');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
