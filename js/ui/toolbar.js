// ==========================================
// NetSpy - Toolbar (Simplified)
// ==========================================

import { store } from '../core/store.js';
import { debounce } from '../utils.js';
import * as requestList from './requestList.js';
import { generateHAR } from '../utils/exportUtils.js';
import { saveInterceptRules, loadInterceptRules, deleteInterceptRule } from '../services/storageService.js';

// DOM Elements
let recordBtn = null;
let clearBtn = null;
let refreshBtn = null;
let searchInput = null;
let interceptToggle = null;
let interceptMode = null;
let interceptPattern = null;
let requestCount = null;

// ==========================================
// Initialization
// ==========================================

export function init() {
    recordBtn = document.getElementById('recordBtn');
    clearBtn = document.getElementById('clearBtn');
    refreshBtn = document.getElementById('refreshBtn');
    searchInput = document.getElementById('searchInput');
    interceptToggle = document.getElementById('interceptToggle');
    interceptMode = document.getElementById('interceptMode');
    interceptPattern = document.getElementById('interceptPattern');
    requestCount = document.getElementById('requestCount');

    setupEventListeners();
}

function setupEventListeners() {
    // Recording controls
    recordBtn?.addEventListener('click', handleRecord);
    clearBtn?.addEventListener('click', handleClear);
    refreshBtn?.addEventListener('click', handleRefresh);

    // Export HAR
    document.getElementById('exportHarBtn')?.addEventListener('click', handleExportHAR);

    // Intercept rules save/load
    const saveRuleBtn = document.getElementById('saveRuleBtn');
    const rulesDropdownBtn = document.getElementById('rulesDropdownBtn');
    const rulesDropdown = document.getElementById('rulesDropdown');

    saveRuleBtn?.addEventListener('click', async () => {
        const pattern = interceptPattern?.value?.trim();
        if (!pattern) return;

        const mode = interceptMode?.value || 'request';
        const pollingSelect = document.getElementById('pollingStrategy');
        const pollingStrategy = pollingSelect?.value || 'keep_latest';

        const rules = await loadInterceptRules();
        if (rules.some(r => r.pattern === pattern && r.mode === mode)) return;

        rules.push({ pattern, mode, pollingStrategy, createdAt: Date.now() });
        await saveInterceptRules(rules);

        saveRuleBtn.classList.add('success');
        setTimeout(() => saveRuleBtn.classList.remove('success'), 1500);
    });

    rulesDropdownBtn?.addEventListener('click', () => {
        rulesDropdown.hidden = !rulesDropdown.hidden;
        if (!rulesDropdown.hidden) {
            // Position dropdown using fixed positioning to escape overflow clipping
            const rect = rulesDropdownBtn.getBoundingClientRect();
            rulesDropdown.style.top = (rect.bottom + 4) + 'px';
            rulesDropdown.style.right = (window.innerWidth - rect.right) + 'px';
            refreshRulesDropdown();
        }
    });

    document.addEventListener('click', (e) => {
        if (rulesDropdown && !rulesDropdownBtn?.contains(e.target) && !rulesDropdown.contains(e.target)) {
            rulesDropdown.hidden = true;
        }
    });

    // Search with debounce
    searchInput?.addEventListener('input', debounce((e) => {
        store.setFilter('search', e.target.value);
        requestList.render();
    }, 200));

    // Protocol filters
    document.querySelectorAll('.protocol-filters .filter-chip').forEach(chip => {
        chip.addEventListener('click', () => handleFilterClick(chip, 'protocol'));
    });

    // Type filters
    document.querySelectorAll('.type-filters .filter-chip').forEach(chip => {
        chip.addEventListener('click', () => handleFilterClick(chip, 'type'));
    });

    // Status filters
    document.querySelectorAll('.status-filters .filter-chip').forEach(chip => {
        chip.addEventListener('click', () => handleFilterClick(chip, 'status'));
    });

    // Checkboxes
    document.getElementById('preserveLog')?.addEventListener('change', () => {
        store.togglePreserveLog();
    });

    document.getElementById('groupByDomain')?.addEventListener('change', () => {
        store.toggleGroupByDomain();
        requestList.render();
    });

    // Intercept toggle
    interceptToggle?.addEventListener('change', handleInterceptToggle);

    // Intercept mode/pattern change - reapply rules if enabled
    interceptMode?.addEventListener('change', handleInterceptModeChange);
    interceptPattern?.addEventListener('change', handleInterceptModeChange);

    // Polling strategy change
    document.getElementById('pollingStrategy')?.addEventListener('change', handlePollingStrategyChange);
}

// ==========================================
// Handlers
// ==========================================

function handleRecord() {
    store.toggleRecording();
    updateRecordButton();
}

function handleClear() {
    store.clearRequests();
    if (window.NetSpy?.clear) {
        window.NetSpy.clear();
    }
}

function handleRefresh() {
    // Drop all paused requests before refresh
    dropAllPausedRequests();
    chrome.devtools.inspectedWindow.reload();
}

function handleExportHAR() {
    const requests = store.state.requests;
    if (requests.length === 0) return;

    const har = generateHAR(requests);
    const blob = new Blob([JSON.stringify(har, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `netspy-${new Date().toISOString().slice(0, 10)}.har`;
    a.click();
    URL.revokeObjectURL(url);
}

async function refreshRulesDropdown() {
    const list = document.getElementById('rulesDropdownList');
    if (!list) return;

    const rules = await loadInterceptRules();

    if (rules.length === 0) {
        list.innerHTML = '<div class="rules-empty">No saved rules</div>';
        return;
    }

    list.innerHTML = rules.map((rule, i) => `
        <div class="rule-item" data-index="${i}">
            <div class="rule-item-info">
                <div class="rule-item-name">${escapeHtmlToolbar(rule.pattern)}</div>
                <div class="rule-item-detail">${rule.mode} &middot; ${rule.pollingStrategy.replace('_', ' ')}</div>
            </div>
            <button class="rule-item-delete" data-delete="${i}" title="Delete rule">&times;</button>
        </div>
    `).join('');

    // Click to apply rule
    list.querySelectorAll('.rule-item-info').forEach(el => {
        el.addEventListener('click', () => {
            const idx = el.closest('.rule-item').dataset.index;
            const rule = rules[idx];
            if (interceptPattern) interceptPattern.value = rule.pattern;
            if (interceptMode) interceptMode.value = rule.mode;
            const pollingSelect = document.getElementById('pollingStrategy');
            if (pollingSelect) pollingSelect.value = rule.pollingStrategy;
            document.getElementById('rulesDropdown').hidden = true;
        });
    });

    // Click to delete rule
    list.querySelectorAll('.rule-item-delete').forEach(el => {
        el.addEventListener('click', async (e) => {
            e.stopPropagation();
            await deleteInterceptRule(parseInt(el.dataset.delete));
            refreshRulesDropdown();
        });
    });
}

function escapeHtmlToolbar(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// Drop all paused requests
async function dropAllPausedRequests() {
    const pausedRequests = store.state.pausedRequests;
    if (!pausedRequests || pausedRequests.size === 0) return;

    const tabId = chrome.devtools.inspectedWindow.tabId;

    const promises = Array.from(pausedRequests.keys()).map(requestId =>
        chrome.runtime.sendMessage({
            type: 'DROP_REQUEST',
            tabId: tabId,
            requestId: requestId
        }).catch(e => console.error('Failed to drop request:', e))
    );

    await Promise.all(promises);
    pausedRequests.clear();

    // Update UI
    const panel = document.getElementById('interceptPanel');
    if (panel) panel.classList.add('hidden');
}

// Continue all paused requests
async function continueAllPausedRequests() {
    const pausedRequests = store.state.pausedRequests;
    if (!pausedRequests || pausedRequests.size === 0) return;

    const tabId = chrome.devtools.inspectedWindow.tabId;

    const promises = Array.from(pausedRequests.entries()).map(([requestId, data]) =>
        chrome.runtime.sendMessage({
            type: 'CONTINUE_REQUEST',
            tabId: tabId,
            requestId: requestId,
            modifications: data
        }).catch(e => console.error('Failed to continue request:', e))
    );

    await Promise.all(promises);
    pausedRequests.clear();

    // Update UI
    const panel = document.getElementById('interceptPanel');
    if (panel) panel.classList.add('hidden');
}

function handleFilterClick(chip, filterType) {
    const filterValue = chip.dataset.filter;
    const group = chip.parentElement;
    const wasActive = chip.classList.contains('active');

    if (wasActive && filterValue !== 'all') {
        group.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        group.querySelector('[data-filter="all"]')?.classList.add('active');
        store.setFilter(filterType, 'all');
    } else {
        group.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        store.setFilter(filterType, filterValue);
    }

    requestList.render();
}

async function handleInterceptToggle() {
    const enabled = interceptToggle.checked;
    const mode = interceptMode?.value || 'request';
    const pattern = interceptPattern?.value || '*';
    const tabId = chrome.devtools.inspectedWindow.tabId;

    // If disabling, continue all paused requests first
    if (!enabled) {
        await continueAllPausedRequests();
    }

    try {
        let result;

        if (enabled) {
            // Enable interception
            result = await chrome.runtime.sendMessage({
                type: 'ENABLE_INTERCEPTION',
                tabId: tabId,
                patterns: [pattern],
                mode: mode
            });
        } else {
            // Disable interception AND detach debugger (removes browser warning)
            result = await chrome.runtime.sendMessage({
                type: 'DETACH_DEBUGGER',
                tabId: tabId
            });
        }

        if (!result?.success) {
            console.error('Failed to toggle intercept:', result?.error);
            interceptToggle.checked = !enabled;
        }
    } catch (e) {
        console.error('Intercept toggle error:', e);
        interceptToggle.checked = !enabled;
    }

    updateInterceptUI();
}

// Handle intercept mode/pattern change - reapply if enabled
async function handleInterceptModeChange() {
    // Only reapply if intercept is currently enabled
    if (!interceptToggle?.checked) return;

    const mode = interceptMode?.value || 'request';
    const pattern = interceptPattern?.value || '*';
    const tabId = chrome.devtools.inspectedWindow.tabId;

    console.log('Reapplying intercept rules with mode:', mode, 'pattern:', pattern);

    try {
        // Save paused requests for continuing after mode switch
        const pausedRequests = store.state.pausedRequests;
        const requestsToContinue = pausedRequests ? Array.from(pausedRequests.keys()) : [];

        // Clear UI immediately
        if (pausedRequests) pausedRequests.clear();
        const panel = document.getElementById('interceptPanel');
        if (panel) panel.classList.add('hidden');
        const countEl = document.getElementById('pausedCount');
        if (countEl) countEl.textContent = '0';

        // STEP 1: Switch to new mode FIRST
        // Note: We use Fetch.enable directly which replaces the pattern
        // Any paused requests will be released automatically by Chrome
        const result = await chrome.runtime.sendMessage({
            type: 'ENABLE_INTERCEPTION',
            tabId: tabId,
            patterns: [pattern],
            mode: mode
        });

        if (result?.success) {
            console.log('Intercept mode switched to:', mode);

            // STEP 2: Continue saved requests AFTER mode switch
            // Now they will proceed and their responses will be captured by new Response rules
            if (requestsToContinue.length > 0) {
                console.log(`Continuing ${requestsToContinue.length} requests after mode switch...`);

                // Small delay to ensure mode is fully applied
                await new Promise(resolve => setTimeout(resolve, 50));

                for (const requestId of requestsToContinue) {
                    try {
                        await chrome.runtime.sendMessage({
                            type: 'CONTINUE_REQUEST',
                            tabId: tabId,
                            requestId: requestId,
                            modifications: {}
                        });
                    } catch (e) {
                        // Request may have already been released by mode switch, ignore
                        console.log('Request already released:', requestId);
                    }
                }
            }
        } else {
            console.error('Failed to switch intercept mode:', result?.error);
        }
    } catch (e) {
        console.error('Intercept mode change error:', e);
    }
}

// Handle polling strategy change
async function handlePollingStrategyChange(e) {
    const strategy = e.target.value;

    try {
        const result = await chrome.runtime.sendMessage({
            type: 'SET_POLLING_STRATEGY',
            strategy: strategy
        });

        if (result?.success) {
            console.log('Polling strategy changed to:', strategy);
        } else {
            console.error('Failed to set polling strategy:', result?.error);
        }
    } catch (err) {
        console.error('Polling strategy change error:', err);
    }
}

// ==========================================
// UI Updates
// ==========================================

function updateRecordButton() {
    if (recordBtn) {
        const isRecording = store.state.isRecording;
        recordBtn.classList.toggle('active', isRecording);
        recordBtn.title = isRecording ? 'Stop Recording' : 'Start Recording';
    }
}

function updateInterceptUI() {
    const label = document.querySelector('.intercept-label');
    if (label) {
        label.style.color = interceptToggle?.checked ? 'var(--warning)' : '';
    }
}

function updateRequestCount() {
    if (requestCount) {
        requestCount.textContent = store.state.requests.length;
    }
}

// ==========================================
// Public API
// ==========================================

export function update() {
    updateRecordButton();
    updateInterceptUI();
    updateRequestCount();
}
