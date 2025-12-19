// ==========================================
// NetSpy State Management (Compatibility Layer)
// 兼容旧代码的状态管理导出
// ==========================================

// Re-export everything from the new store
export {
    store,
    state,
    subscribe,
    notify,
    setRequests,
    addRequest,
    updateRequest,
    clearRequests,
    selectRequest,
    setEditMode,
    setInterception,
    setPausedRequest,
    removePausedRequest,
    setFilter,
    toggleGroupByDomain,
    togglePreserveLog,
    toggleRecording,
    storeOriginal,
    storeModified,
    toggleOriginalView,
    resetEditState
} from './core/store.js';

// Re-export EDIT_MODES for compatibility
export { EDIT_MODES } from './core/constants.js';
