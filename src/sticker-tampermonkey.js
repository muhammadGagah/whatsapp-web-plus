import { validateRequest } from './sticker-request.js';

export function requestTampermonkeySticker(request, signal) {
  return new Promise((resolve, reject) => {
    let handle, timer, settled = false;
    const exceedsLimit = response => {
      const text = typeof response.responseText === 'string' ? response.responseText
        : typeof response.response === 'string' ? response.response : '';
      return response.loaded > 65536 || response.total > 65536 || text.length > 65536 ||
        new TextEncoder().encode(text).byteLength > 65536;
    };
    const finish = (result, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      request.key = '';
      if (error) {
        try { handle?.abort(); } catch {}
        reject(new Error(error));
      } else resolve(result);
    };
    const abort = () => finish(null, 'stickerTimeout');
    try {
      signal.throwIfAborted();
      if (typeof GM_xmlhttpRequest !== 'function') {
        finish(null, 'stickerTransportMissing');
        return;
      }
      const url = validateRequest(request);
      signal.addEventListener('abort', abort, { once: true });
      // Tampermonkey's fetch mode does not honor timeout on every browser.
      timer = setTimeout(abort, Math.max(1, request.expiresAt - Date.now()));
      handle = GM_xmlhttpRequest({
        method: 'POST', url: url.href, anonymous: true, redirect: 'error',
        responseType: 'text', fetch: true,
        headers: { 'Content-Type': 'application/json', ...(request.provider === 'gemini'
          ? { 'x-goog-api-key': request.key } : { Authorization: `Bearer ${request.key}` }) },
        data: JSON.stringify(request.body),
        onprogress: response => {
          if (settled) return;
          try {
            if (exceedsLimit(response)) finish(null, 'stickerResponseError');
          } catch { finish(null, 'stickerNetworkError'); }
        },
        onload: response => {
          if (settled) return;
          try {
            if (exceedsLimit(response)) { finish(null, 'stickerResponseError'); return; }
            const text = typeof response.responseText === 'string' ? response.responseText
              : typeof response.response === 'string' ? response.response : '';
            let body = null;
            try { body = JSON.parse(text); } catch {}
            finish({ status: response.status, body });
          } catch { finish(null, 'stickerNetworkError'); }
        },
        onerror: () => finish(null, 'stickerNetworkError'),
        ontimeout: abort,
        onabort: abort
      });
      request.key = '';
      if (settled) { try { handle?.abort(); } catch {} }
    } catch { finish(null, signal.aborted ? 'stickerTimeout' : 'stickerNetworkError'); }
  });
}
