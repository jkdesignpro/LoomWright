/*
 * Platform layer: the same editor runs in the Tauri desktop app, in a normal
 * browser, or embedded in a sandboxed preview. This file hides the differences
 * for opening, saving and exporting files.
 *
 * Copyright (C) 2026 LoomWright contributors. SPDX-License-Identifier: GPL-3.0-or-later
 */
(function () {
  'use strict';
  const T = window.__TAURI__;
  const invoke = T && T.core && T.core.invoke;
  const EMBEDDED = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();

  function toB64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }

  function pickFile(accept) {
    return new Promise((resolve) => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = accept; inp.style.display = 'none';
      inp.addEventListener('change', () => {
        const f = inp.files && inp.files[0];
        inp.remove();
        if (!f) return resolve(null);
        const rd = new FileReader();
        rd.onload = () => resolve({ name: f.name, path: null, text: String(rd.result) });
        rd.onerror = () => resolve(null);
        rd.readAsText(f);
      });
      document.body.appendChild(inp);
      inp.click();
    });
  }

  function browserDownload(name, data, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  const Platform = {
    kind: invoke ? 'desktop' : EMBEDDED ? 'preview' : 'browser',
    canWatch: !!invoke,
    canPrint: !EMBEDDED || !!invoke,

    async openDiagram() {
      if (invoke) return invoke('open_diagram');
      return pickFile('.loom,.json,application/json');
    },
    async openText(accept) {
      if (invoke) return invoke('open_text', { filterName: 'LoomWright library', extensions: ['json'] });
      return pickFile(accept || '.json,application/json');
    },
    async initialFile() { if (!invoke) return null; try { return await invoke('initial_file'); } catch (e) { return null; } },
    async readFile(path) { return invoke('read_text', { path }); },
    async mtime(path) { return invoke('file_mtime', { path }); },

    /* Save a diagram. Returns {path,name} or null when cancelled. */
    async saveDiagram(text, path, suggested) {
      if (invoke) return invoke('save_diagram', { path: path || null, contents: text, suggested });
      return Platform.exportFile(suggested, text, 'application/json');
    },

    /* Export any file. data: string or Uint8Array. */
    async exportFile(name, data, mime) {
      if (invoke) {
        const ext = name.split('.').pop();
        const b64 = typeof data === 'string' ? toB64(new TextEncoder().encode(data)) : toB64(data);
        return invoke('export_file', { suggested: name, extension: ext, dataB64: b64 });
      }
      if (EMBEDDED) { Platform.onBlockedDownload(name, data, mime); return { name, path: null, shown: true }; }
      if (window.showSaveFilePicker) {
        try {
          const ext = '.' + name.split('.').pop();
          const h = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: ext.toUpperCase().slice(1) + ' file', accept: { [mime]: [ext] } }] });
          const ws = await h.createWritable(); await ws.write(data); await ws.close();
          return { name: h.name, path: null };
        } catch (e) { if (e && e.name === 'AbortError') return null; }
      }
      browserDownload(name, data, mime);
      return { name, path: null };
    },

    /* User library (custom components + palette) */
    async loadUserLibrary() {
      if (invoke) { try { const t = await invoke('load_user_library'); return t ? JSON.parse(t) : null; } catch (e) { return null; } }
      try { const t = localStorage.getItem('loomwright.library.v1'); return t ? JSON.parse(t) : null; } catch (e) { return null; }
    },
    async saveUserLibrary(obj) {
      const t = JSON.stringify(obj, null, 2);
      if (invoke) { try { await invoke('save_user_library', { contents: t }); } catch (e) { console.warn(e); } }
      try { localStorage.setItem('loomwright.library.v1', t); } catch (e) { /* storage unavailable */ }
    },

    async setTitle(title) {
      document.title = title;
      if (T && T.window && T.window.getCurrentWindow) { try { await T.window.getCurrentWindow().setTitle(title); } catch (e) { /* ignore */ } }
    },

    // Replaced by the editor: shows a copy/save dialog when a sandbox blocks downloads.
    onBlockedDownload() {},
  };
  window.Platform = Platform;
})();
