// js/utils/encoding.js
// Encoding utilities for service worker context
// Usage: importScripts('js/utils/encoding.js'); then self.EncodingUtils.utf8ToBase64(str)

(function() {
    'use strict';

    const EncodingUtils = {
        /**
         * Encode a UTF-8 string to base64
         * Replaces deprecated: btoa(unescape(encodeURIComponent(str)))
         */
        utf8ToBase64(str) {
            const encoder = new TextEncoder();
            const bytes = encoder.encode(str);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            return btoa(binary);
        },

        /**
         * Decode a base64 string to UTF-8
         * Replaces deprecated: decodeURIComponent(escape(atob(b64)))
         */
        base64ToUtf8(b64) {
            const binary = atob(b64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            const decoder = new TextDecoder();
            return decoder.decode(bytes);
        },

        /**
         * Convert raw binary string to base64 (no UTF-8 conversion)
         * For binary data that's already in string form
         */
        binaryToBase64(binaryStr) {
            return btoa(binaryStr);
        },

        /**
         * Check if a content-type represents binary data
         */
        isBinaryContent(contentType) {
            if (!contentType) return false;
            const ct = contentType.toLowerCase();
            return /^(image|video|audio|font)\//i.test(ct) ||
                ct.includes('octet-stream') ||
                ct.includes('pdf') ||
                ct.includes('wasm') ||
                ct.includes('protobuf') ||
                ct.includes('msgpack') ||
                ct.includes('grpc');
        }
    };

    self.EncodingUtils = EncodingUtils;
})();
