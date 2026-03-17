// Chrome storage wrapper for persisting intercept rules and collections

const STORAGE_KEYS = {
    INTERCEPT_RULES: 'netspy_intercept_rules',
    COLLECTIONS: 'netspy_collections',
};

/**
 * Save intercept rules to chrome.storage.local
 * @param {Object[]} rules - Array of { name, pattern, mode, pollingStrategy }
 */
export async function saveInterceptRules(rules) {
    return chrome.storage.local.set({ [STORAGE_KEYS.INTERCEPT_RULES]: rules });
}

/**
 * Load intercept rules from chrome.storage.local
 * @returns {Promise<Object[]>} Array of saved rules
 */
export async function loadInterceptRules() {
    const result = await chrome.storage.local.get(STORAGE_KEYS.INTERCEPT_RULES);
    return result[STORAGE_KEYS.INTERCEPT_RULES] || [];
}

/**
 * Delete a single intercept rule by index
 */
export async function deleteInterceptRule(index) {
    const rules = await loadInterceptRules();
    rules.splice(index, 1);
    return saveInterceptRules(rules);
}

/**
 * Save collections to chrome.storage.local
 * @param {Object[]} collections - Array of collection objects
 */
export async function saveCollections(collections) {
    return chrome.storage.local.set({ [STORAGE_KEYS.COLLECTIONS]: collections });
}

/**
 * Load collections from chrome.storage.local
 * @returns {Promise<Object[]>} Array of collections
 */
export async function loadCollections() {
    const result = await chrome.storage.local.get(STORAGE_KEYS.COLLECTIONS);
    return result[STORAGE_KEYS.COLLECTIONS] || [];
}
