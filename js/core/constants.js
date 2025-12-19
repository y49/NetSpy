// ==========================================
// NetSpy - Constants
// ==========================================

export const EDIT_MODES = {
    NORMAL: 'normal',
    INTERCEPT_REQUEST: 'intercept-request',
    INTERCEPT_RESPONSE: 'intercept-response',
    MOCK: 'mock'
};

export const HTTP_METHODS = {
    GET: { color: '#22c55e' },
    POST: { color: '#3b82f6' },
    PUT: { color: '#f59e0b' },
    PATCH: { color: '#8b5cf6' },
    DELETE: { color: '#ef4444' },
    HEAD: { color: '#64748b' },
    OPTIONS: { color: '#06b6d4' }
};

export const STATUS_CATEGORIES = {
    '2xx': { color: '#22c55e', label: 'Success' },
    '3xx': { color: '#3b82f6', label: 'Redirect' },
    '4xx': { color: '#f59e0b', label: 'Client Error' },
    '5xx': { color: '#ef4444', label: 'Server Error' }
};

export const BODY_TYPES = {
    NONE: 'none',
    RAW: 'raw',
    FORM_DATA: 'formdata',
    URL_ENCODED: 'urlencoded',
    GRAPHQL: 'graphql'
};

export const REQUEST_SOURCE = {
    CAPTURE: 'capture',
    MANUAL: 'manual',
    INTERCEPT: 'intercept',
    COLLECTION: 'collection'
};
