// ==========================================
// NetSpy - Store (Simplified)
// ==========================================

// Application State
export const state = {
    // Requests
    requests: [],
    selectedRequestId: null,

    // Filters
    filters: {
        protocol: 'all',
        type: 'all',
        status: 'all',
        search: ''
    },

    // Settings
    isRecording: true,
    preserveLog: false,
    isGroupedByDomain: false,

    // Intercept
    pausedRequests: new Map(),

    // Pending modifications (for syncing intercepted request params)
    // Key: url pattern, Value: { url, method, headers, body, timestamp }
    pendingModifications: new Map()
};

// Subscribers
const subscribers = [];

// Subscribe to state changes
export function subscribe(callback) {
    subscribers.push(callback);
    return () => {
        const index = subscribers.indexOf(callback);
        if (index > -1) subscribers.splice(index, 1);
    };
}

// Notify subscribers
function notify() {
    subscribers.forEach(cb => cb(state));
}

// ==========================================
// Actions
// ==========================================

export function addRequest(request) {
    state.requests.push(request);
    notify();
}

export function updateRequest(id, updates) {
    const index = state.requests.findIndex(r => r.id === id);
    if (index !== -1) {
        state.requests[index] = { ...state.requests[index], ...updates };
        notify();
    }
}

export function clearRequests() {
    state.requests = [];
    state.selectedRequestId = null;
    notify();
}

export function selectRequest(id) {
    state.selectedRequestId = id;
    notify();
}

export function setFilter(filterType, value) {
    state.filters[filterType] = value;
    notify();
}

export function toggleRecording() {
    state.isRecording = !state.isRecording;
    notify();
}

export function togglePreserveLog() {
    state.preserveLog = !state.preserveLog;
    notify();
}

export function toggleGroupByDomain() {
    state.isGroupedByDomain = !state.isGroupedByDomain;
    notify();
}

// ==========================================
// Store Export
// ==========================================

export const store = {
    state,
    subscribe,
    addRequest,
    updateRequest,
    clearRequests,
    selectRequest,
    setFilter,
    toggleRecording,
    togglePreserveLog,
    toggleGroupByDomain
};

export default store;
