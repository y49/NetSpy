// ==========================================
// NetSpy - Request List (Simplified)
// ==========================================

import { store } from '../core/store.js';
import { formatBytes, formatTime, formatTimestamp, getFilename, getDomain, escapeHtml } from '../utils.js';

// DOM Elements
let tableBody = null;

// ==========================================
// Initialization
// ==========================================

export function init() {
    tableBody = document.getElementById('requestList');

    if (!tableBody) {
        console.error('RequestList: #requestList not found');
        return;
    }
}

// ==========================================
// Rendering
// ==========================================

export function render() {
    if (!tableBody) return;

    const filtered = getFilteredRequests();

    if (store.state.isGroupedByDomain) {
        renderGrouped(filtered);
    } else {
        renderFlat(filtered);
    }

    updateRequestCount(filtered.length);
}

function getFilteredRequests() {
    return store.state.requests.filter(req => {
        // Protocol filter
        const protocolFilter = store.state.filters?.protocol || 'all';
        if (protocolFilter !== 'all') {
            const protocol = req.url?.startsWith('https') ? 'https' :
                req.url?.startsWith('ws') ? 'ws' : 'http';
            if (protocol !== protocolFilter) return false;
        }

        // Type filter
        const typeFilter = store.state.filters?.type || 'all';
        if (typeFilter !== 'all') {
            const type = (req.resourceType || req.type || '').toLowerCase();
            const url = (req.url || '').toLowerCase();

            // Type mapping: filter value -> matching resource types
            const typeMatches = {
                'api': () => type === 'xhr' || type === 'fetch' || req.isApi,
                'json': () => type === 'xhr' || type === 'fetch' || url.endsWith('.json'),
                'xml': () => url.endsWith('.xml') || type === 'xhr',
                'html': () => type === 'document' || type === 'doc' || url.endsWith('.html') || url.endsWith('.htm'),
                'js': () => type === 'script' || type === 'js' || url.endsWith('.js'),
                'css': () => type === 'stylesheet' || type === 'css' || url.endsWith('.css'),
                'image': () => type === 'img' || type === 'image' || /\.(png|jpg|jpeg|gif|webp|svg|ico|bmp)(\?|$)/i.test(url),
                'img': () => type === 'img' || type === 'image' || /\.(png|jpg|jpeg|gif|webp|svg|ico|bmp)(\?|$)/i.test(url),
                'font': () => type === 'font' || /\.(woff|woff2|ttf|otf|eot)$/i.test(url),
            };

            const matcher = typeMatches[typeFilter];
            if (matcher) {
                if (!matcher()) return false;
            } else if (!type.includes(typeFilter)) {
                return false;
            }
        }

        // Status filter
        const statusFilter = store.state.filters?.status || 'all';
        if (statusFilter !== 'all') {
            const status = String(req.status || '');
            if (!status.startsWith(statusFilter.charAt(0))) return false;
        }

        // Search filter
        const search = store.state.filters?.search || '';
        if (search) {
            const query = search.toLowerCase();
            const url = (req.url || '').toLowerCase();
            const method = (req.method || '').toLowerCase();
            if (!url.includes(query) && !method.includes(query)) return false;
        }

        return true;
    });
}

function renderFlat(requests) {
    tableBody.innerHTML = '';

    requests.forEach((req, index) => {
        const row = createRequestRow(req, index + 1);
        tableBody.appendChild(row);
    });
}

function renderGrouped(requests) {
    tableBody.innerHTML = '';

    const groups = new Map();
    requests.forEach(req => {
        const domain = getDomain(req.url);
        if (!groups.has(domain)) groups.set(domain, []);
        groups.get(domain).push(req);
    });

    let index = 1;
    groups.forEach((reqs, domain) => {
        // Group header
        const header = document.createElement('tr');
        header.className = 'group-header';
        header.innerHTML = `
            <td colspan="8" class="group-header-cell">
                <span class="group-toggle">▼</span>
                <span class="group-name">${escapeHtml(domain)}</span>
                <span class="group-count">(${reqs.length})</span>
            </td>
        `;
        header.onclick = () => toggleGroup(domain);
        tableBody.appendChild(header);

        reqs.forEach(req => {
            const row = createRequestRow(req, index++);
            row.dataset.group = domain;
            tableBody.appendChild(row);
        });
    });
}

function createRequestRow(req, index) {
    const row = document.createElement('tr');
    row.className = 'request-row';
    row.dataset.id = req.id;

    if (store.state.selectedRequestId === req.id) {
        row.classList.add('selected');
    }

    const statusClass = getStatusClass(req.status);
    const method = req.method || 'GET';

    row.innerHTML = `
        <td class="col-id">${index}</td>
        <td class="col-icon">${getIcon(req)}</td>
        <td class="col-method method-${method.toLowerCase()}">${method}</td>
        <td class="col-url truncate" title="${escapeHtml(req.url)}">${escapeHtml(getFilename(req.url))}</td>
        <td class="col-status"><span class="status-badge ${statusClass}">${req.status || '—'}</span></td>
        <td class="col-type">${getTypeLabel(req.resourceType || req.type)}</td>
        <td class="col-size">${formatBytes(req.size)}</td>
        <td class="col-time">${formatTimestamp(req.time)}</td>
    `;

    row.onclick = () => handleRowClick(req.id);

    return row;
}

// ==========================================
// Helpers
// ==========================================

function getStatusClass(status) {
    if (!status) return 'status-pending';
    const s = String(status);
    if (s.startsWith('2')) return 'status-2xx';
    if (s.startsWith('3')) return 'status-3xx';
    if (s.startsWith('4')) return 'status-4xx';
    if (s.startsWith('5')) return 'status-5xx';
    return 'status-pending';
}

function getIcon(req) {
    const type = (req.resourceType || req.type || '').toLowerCase();
    if (type.includes('xhr') || type.includes('fetch') || req.isApi) return '🔗';
    if (type.includes('script')) return '📜';
    if (type.includes('style')) return '🎨';
    if (type.includes('image')) return '🖼️';
    if (type.includes('font')) return '🔤';
    if (type.includes('document')) return '📄';
    return '○';
}

function getTypeLabel(type) {
    if (!type) return '—';
    const t = type.toLowerCase();
    if (t.includes('xhr')) return 'xhr';
    if (t.includes('fetch')) return 'fetch';
    if (t.includes('script')) return 'js';
    if (t.includes('stylesheet')) return 'css';
    if (t.includes('image')) return 'img';
    if (t.includes('document')) return 'doc';
    return t.slice(0, 6);
}

function handleRowClick(id) {
    store.selectRequest(id);

    tableBody.querySelectorAll('tr.selected').forEach(tr => {
        tr.classList.remove('selected');
    });

    const selectedRow = tableBody.querySelector(`tr[data-id="${id}"]`);
    if (selectedRow) {
        selectedRow.classList.add('selected');
    }
}

function toggleGroup(domain) {
    const rows = tableBody.querySelectorAll(`tr[data-group="${domain}"]`);
    const header = Array.from(tableBody.querySelectorAll('.group-header'))
        .find(h => h.querySelector('.group-name')?.textContent === domain);

    if (header) {
        const toggle = header.querySelector('.group-toggle');
        const isCollapsed = toggle.textContent === '▶';
        toggle.textContent = isCollapsed ? '▼' : '▶';

        rows.forEach(row => {
            row.style.display = isCollapsed ? '' : 'none';
        });
    }
}

function updateRequestCount(count) {
    const counter = document.getElementById('requestCount');
    if (counter) counter.textContent = count;
}

// ==========================================
// Public API
// ==========================================

export function clearSelection() {
    tableBody?.querySelectorAll('tr.selected').forEach(tr => {
        tr.classList.remove('selected');
    });
}

export function scrollToRequest(id) {
    const row = tableBody?.querySelector(`tr[data-id="${id}"]`);
    if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}
