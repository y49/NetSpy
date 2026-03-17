// Export utilities for converting captured requests to various formats

/**
 * Generate cURL command from a plain request object.
 * @param {Object} request - Plain request from store (not RequestModel)
 * @returns {string} cURL command string
 */
export function generateCurl(request) {
    const method = request.method || 'GET';
    let curl = `curl -X ${method}`;

    // Headers
    const headers = request.headers || [];
    for (const h of headers) {
        if (h.name) {
            const escaped = String(h.value || '').replace(/'/g, "'\\''");
            curl += ` \\\n  -H '${h.name}: ${escaped}'`;
        }
    }

    // Body
    if (!['GET', 'HEAD'].includes(method) && request.postData) {
        const escaped = request.postData.replace(/'/g, "'\\''");
        curl += ` \\\n  -d '${escaped}'`;
    }

    // URL (must be last)
    curl += ` \\\n  '${request.url}'`;

    return curl;
}

/**
 * Generate HAR 1.2 archive from an array of request objects.
 * @param {Object[]} requests - Array of plain request objects from store
 * @returns {Object} HAR archive object
 */
export function generateHAR(requests) {
    return {
        log: {
            version: '1.2',
            creator: {
                name: 'NetSpy',
                version: '1.3.0'
            },
            entries: requests.map(req => ({
                startedDateTime: new Date(req.time || Date.now()).toISOString(),
                time: req.timings?.total || 0,
                request: {
                    method: req.method || 'GET',
                    url: req.url || '',
                    httpVersion: 'HTTP/1.1',
                    headers: (req.headers || []).map(h => ({ name: h.name, value: h.value })),
                    queryString: parseQueryString(req.url),
                    postData: req.postData ? {
                        mimeType: getContentTypeFromHeaders(req.headers) || 'text/plain',
                        text: req.postData
                    } : undefined,
                    headersSize: -1,
                    bodySize: req.postData ? req.postData.length : 0
                },
                response: {
                    status: req.status || 0,
                    statusText: req.statusText || '',
                    httpVersion: 'HTTP/1.1',
                    headers: (req.responseHeaders || []).map(h => ({ name: h.name, value: h.value })),
                    content: {
                        size: req.size || 0,
                        mimeType: getContentTypeFromHeaders(req.responseHeaders) || '',
                        text: req.responseBody || ''
                    },
                    headersSize: -1,
                    bodySize: req.size || 0
                },
                timings: {
                    send: req.timings?.send || 0,
                    wait: req.timings?.wait || 0,
                    receive: req.timings?.receive || 0
                }
            }))
        }
    };
}

function parseQueryString(url) {
    try {
        const u = new URL(url);
        const params = [];
        u.searchParams.forEach((value, name) => params.push({ name, value }));
        return params;
    } catch {
        return [];
    }
}

function getContentTypeFromHeaders(headers) {
    if (!headers) return null;
    const ct = headers.find(h => h.name?.toLowerCase() === 'content-type');
    return ct?.value || null;
}
