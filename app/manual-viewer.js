/*
 * User manual viewer: a full-window reader for window.LoomManual (app/manual.js,
 * built from docs/manual by scripts/build-manual.js). Contents on the left,
 * full-text search, the chapter on the right, links between chapters, back and
 * forward, and printing of one chapter.
 *
 *   LoomManualViewer.open()                      the last chapter read, or the first
 *   LoomManualViewer.open('wires-and-colours')   a chapter, by id
 *   LoomManualViewer.open('drawing', 'bends')    a heading inside a chapter
 *   LoomManualViewer.search('fuse')              open with a search
 *   LoomManualViewer.close()
 *
 * Copyright (C) 2026 LoomWright contributors. SPDX-License-Identifier: GPL-3.0-or-later
 */
(function () {
  'use strict';
  const tr = (s) => (window.LoomI18n ? window.LoomI18n.t(s) : s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // fold case and accents so "Écran" finds "ecran"
  const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const ICON = {
    back: '<path d="M10 3 5 8l5 5"/>',
    fwd: '<path d="m6 3 5 5-5 5"/>',
    print: '<path d="M4.5 6V2.5h7V6M4.5 11.5h-2v-5h11v5h-2"/><path d="M4.5 9.5h7v4h-7z"/>',
    close: '<path d="m4 4 8 8M12 4l-8 8"/>',
    search: '<circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3.5 3.5"/>',
  };
  const icon = (k) => `<svg class="i" viewBox="0 0 16 16" aria-hidden="true">${ICON[k]}</svg>`;

  let root = null, els = {};
  let current = null; // { id, anchor }
  let past = [], ahead = [];
  let lastFocus = null, query = '', terms = [], results = [], spyTimer = 0;

  const chapters = () => (window.LoomManual && window.LoomManual.chapters) || [];
  const chapterById = (id) => chapters().find((c) => c.id === id);
  const canPrint = () => !window.Platform || window.Platform.canPrint !== false;
  const isDesktop = () => !!(window.Platform && window.Platform.kind === 'desktop');

  /* ---------------- Building the window ---------------- */
  function build() {
    root = document.createElement('div');
    root.id = 'manual';
    root.className = 'lm';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', tr('User manual'));
    root.innerHTML = `
      <div class="lm-head">
        <button class="iconbtn" id="lm-back" title="${esc(tr('Back'))} (Alt+Left)" aria-label="${esc(tr('Back'))}">${icon('back')}</button>
        <button class="iconbtn" id="lm-fwd" title="${esc(tr('Forward'))} (Alt+Right)" aria-label="${esc(tr('Forward'))}">${icon('fwd')}</button>
        <h2>${esc(tr('User manual'))}</h2>
        <label class="lm-search">${icon('search')}<input type="search" id="lm-q" autocomplete="off" spellcheck="false" placeholder="${esc(tr('Search the manual'))}" aria-label="${esc(tr('Search the manual'))}" aria-controls="lm-nav"></label>
        <span class="grow"></span>
        <button class="btn" id="lm-print" title="${esc(tr('Print this chapter, or save it as a PDF'))} (Ctrl+P)">${icon('print')}<span>${esc(tr('Print chapter'))}</span></button>
        <button class="iconbtn" id="lm-close" title="${esc(tr('Close'))} (Esc)" aria-label="${esc(tr('Close the manual'))}">${icon('close')}</button>
      </div>
      <div class="lm-main">
        <nav class="lm-nav" id="lm-nav" aria-label="${esc(tr('Contents'))}"></nav>
        <div class="lm-doc" id="lm-doc" tabindex="-1"><article class="lm-article" id="lm-article"></article></div>
      </div>
      <div class="lm-note-bar" id="lm-msg" role="status" hidden></div>`;
    document.body.appendChild(root);
    els = {
      back: root.querySelector('#lm-back'), fwd: root.querySelector('#lm-fwd'), q: root.querySelector('#lm-q'),
      print: root.querySelector('#lm-print'), close: root.querySelector('#lm-close'), nav: root.querySelector('#lm-nav'),
      doc: root.querySelector('#lm-doc'), article: root.querySelector('#lm-article'), msg: root.querySelector('#lm-msg'),
    };
    els.back.onclick = () => go(-1);
    els.fwd.onclick = () => go(1);
    els.close.onclick = close;
    els.print.onclick = printChapter;
    els.q.addEventListener('input', () => runSearch(els.q.value));
    els.doc.addEventListener('scroll', () => { clearTimeout(spyTimer); spyTimer = setTimeout(spy, 80); }, { passive: true });
    root.addEventListener('click', onClick);
    if (!canPrint()) { els.print.disabled = true; els.print.title = tr('Printing is not available in this preview.'); }
  }

  /* ---------------- Contents and search results ---------------- */
  function renderContents() {
    const list = chapters();
    if (!list.length) { els.nav.innerHTML = `<p class="lm-empty">${esc(tr('The manual could not be loaded.'))}</p>`; return; }
    els.nav.innerHTML = `<ol class="lm-toc">${list.map((c, i) => {
      const on = current && current.id === c.id;
      const subs = on ? c.sections.filter((s) => s.level === 2) : [];
      return `<li${on ? ' class="on"' : ''}><a href="#lm-${esc(c.id)}" data-chapter="${esc(c.id)}" data-anchor=""${on ? ' aria-current="page"' : ''}><span class="lm-n">${i + 1}</span>${esc(c.title)}</a>${subs.length ? `<ol class="lm-subs">${subs.map((s) => `<li><a href="#lm-${esc(c.id)}--${esc(s.anchor)}" data-chapter="${esc(c.id)}" data-anchor="${esc(s.anchor)}">${esc(s.title)}</a></li>`).join('')}</ol>` : ''}</li>`;
    }).join('')}</ol>`;
    spy();
  }

  /* Search words, folded. A plural also finds the singular: "fuses" finds "fuse", "switches" finds "switch". */
  function termsOf(q) {
    return fold(q).split(/\s+/).filter(Boolean).map((w) => (/(ch|sh|x|z|ss)es$/.test(w) ? w.slice(0, -2) : w.length > 3 && /[^s]s$/.test(w) ? w.slice(0, -1) : w));
  }
  const isLetter = (ch) => ch !== undefined && /\p{L}/u.test(ch);
  const isDigit = (ch) => ch !== undefined && ch >= '0' && ch <= '9';
  /* Where a search word starts a word in folded text, as [start, end of that word] pairs.
     "fuse" finds "fuses" but not "refuse"; "13" finds "W13" but not "213". */
  function hitsOf(low, w, max) {
    const out = [], first = w[0];
    let k = low.indexOf(w);
    while (k >= 0 && (!max || out.length < max)) {
      const before = low[k - 1];
      if (isLetter(first) ? !isLetter(before) : isDigit(first) ? !isDigit(before) : true) {
        let e = k + w.length;
        while (e < low.length && (isLetter(low[e]) || isDigit(low[e]))) e++;
        out.push([k, e]);
        k = low.indexOf(w, e);
      } else k = low.indexOf(w, k + 1);
    }
    return out;
  }
  function hitsAll(low) {
    const hits = [];
    terms.forEach((w) => hits.push(...hitsOf(low, w)));
    return hits.sort((x, y) => x[0] - y[0] || y[1] - x[1]);
  }

  /* Every section whose text holds all the search words, best first. */
  function find(q) {
    const words = termsOf(q);
    if (!words.length) return [];
    const out = [];
    chapters().forEach((c, ci) => {
      const text = fold(c.text);
      c.sections.forEach((s, si) => {
        const end = si + 1 < c.sections.length ? c.sections[si + 1].start : text.length;
        const body = text.slice(s.start, end), title = fold(s.title || c.title);
        const found = words.map((w) => hitsOf(body, w, 20));
        if (!words.every((w, i) => found[i].length || hitsOf(title, w, 1).length)) return;
        let score = 0;
        words.forEach((w, i) => {
          if (hitsOf(title, w, 1).length) score += 12;
          if (hitsOf(fold(c.title), w, 1).length) score += 4;
          score += found[i].length;
          // the word itself counts more than a longer word that starts with it
          if (found[i].some(([a, b]) => b - a === w.length)) score += 2;
        });
        out.push({ c, s, ci, si, score, start: s.start, end });
      });
    });
    return out.sort((a, b) => b.score - a.score || a.ci - b.ci || a.si - b.si).slice(0, 60);
  }
  function snippet(r) {
    const raw = r.c.text.slice(r.start, r.end), low = fold(raw);
    // skip the heading line itself, so the snippet shows some body text
    const nl = raw.indexOf('\n');
    const from = nl > 0 && r.s.anchor ? nl : 0;
    const first = hitsAll(low).find(([a]) => a >= from);
    const at = first ? first[0] : nl > 0 ? nl + 1 : 0;
    let a = Math.max(0, at - 70), b = Math.min(raw.length, at + 150);
    if (a > 0) { const sp = raw.indexOf(' ', a); if (sp > 0 && sp < at) a = sp + 1; }
    if (b < raw.length) { const sp = raw.lastIndexOf(' ', b); if (sp > at) b = sp; }
    return (a > 0 ? '… ' : '') + mark(raw.slice(a, b).replace(/\s+/g, ' ')) + (b < raw.length ? ' …' : '');
  }
  /* Escape text and wrap the search words in <mark>. */
  function mark(text) {
    if (!terms.length) return esc(text);
    const low = fold(text);
    // folding can change the length of unusual characters; only mark where it did not
    if (low.length !== text.length) return esc(text);
    const hits = hitsAll(low);
    let out = '', at = 0;
    hits.forEach(([a, b]) => { if (a < at) return; out += esc(text.slice(at, a)) + '<mark>' + esc(text.slice(a, b)) + '</mark>'; at = b; });
    return out + esc(text.slice(at));
  }
  function runSearch(q) {
    query = q.trim();
    terms = termsOf(query);
    highlight();
    if (!terms.length) { results = []; renderContents(); return; }
    results = find(query);
    const count = results.length;
    els.nav.innerHTML = `<div class="lm-res-head"><span>${count ? esc(count === 1 ? tr('1 place found') : `${count >= 60 ? '60+' : count} ${tr('places found')}`) : esc(tr('Nothing found'))}</span><button class="btn sm" data-lm="clear">${esc(tr('Clear'))}</button></div>` +
      (count ? `<ul class="lm-results">${results.map((r, i) => `<li><a href="#lm-${esc(r.c.id)}${r.s.anchor ? '--' + esc(r.s.anchor) : ''}" data-chapter="${esc(r.c.id)}" data-anchor="${esc(r.s.anchor)}" data-hit="1" data-i="${i}"><span class="lm-where">${esc(r.c.title)}${r.s.anchor ? ` <span class="muted">›</span> ${mark(r.s.title)}` : ''}</span><span class="lm-snip">${snippet(r)}</span></a></li>`).join('')}</ul>`
        : `<p class="lm-empty">${esc(tr('Try fewer words, or a different word for the same thing.'))}</p>`);
  }

  /* Wrap the search words in the open chapter in <mark class="lm-hit">. */
  function highlight() {
    els.article.querySelectorAll('mark.lm-hit').forEach((m) => { const p = m.parentNode; p.replaceChild(document.createTextNode(m.textContent), m); p.normalize(); });
    if (!terms.length) return;
    const walk = document.createTreeWalker(els.article, window.NodeFilter.SHOW_TEXT, null);
    const nodes = [];
    for (let n = walk.nextNode(); n; n = walk.nextNode()) nodes.push(n);
    nodes.forEach((node) => {
      const text = node.nodeValue, low = fold(text);
      // folding can change the length of unusual characters; only mark where it did not
      if (low.length !== text.length) return;
      const hits = hitsAll(low);
      if (!hits.length) return;
      const frag = document.createDocumentFragment();
      let at = 0;
      hits.forEach(([a, b]) => {
        if (a < at) return;
        frag.appendChild(document.createTextNode(text.slice(at, a)));
        const m = document.createElement('mark'); m.className = 'lm-hit'; m.textContent = text.slice(a, b);
        frag.appendChild(m); at = b;
      });
      frag.appendChild(document.createTextNode(text.slice(at)));
      node.parentNode.replaceChild(frag, node);
    });
  }

  /* ---------------- Showing a chapter ---------------- */
  function show(id, anchor, opts) {
    const o = opts || {};
    const c = chapterById(id) || chapters()[0];
    if (!c) { els.article.innerHTML = `<p class="lm-empty">${esc(tr('The manual could not be loaded.'))}</p>`; return; }
    const same = current && current.id === c.id;
    if (o.record !== false && current) {
      past.push({ id: current.id, top: els.doc.scrollTop });
      if (past.length > 100) past.shift();
      ahead = [];
    }
    current = { id: c.id };
    if (!same) {
      const list = chapters(), i = list.indexOf(c), prev = list[i - 1], next = list[i + 1];
      els.article.innerHTML = c.html + `<nav class="lm-pager" aria-label="${esc(tr('Chapters'))}">${prev ? `<a href="#lm-${esc(prev.id)}" data-chapter="${esc(prev.id)}" data-anchor="" class="prev"><span class="muted">${esc(tr('Previous'))}</span>${esc(prev.title)}</a>` : '<span></span>'}${next ? `<a href="#lm-${esc(next.id)}" data-chapter="${esc(next.id)}" data-anchor="" class="next"><span class="muted">${esc(tr('Next'))}</span>${esc(next.title)}</a>` : '<span></span>'}</nav>`;
      highlight();
    }
    if (!terms.length) renderContents();
    else els.nav.querySelectorAll('a[data-chapter]').forEach((a) => a.classList.toggle('on', a.dataset.chapter === c.id && (a.dataset.anchor || '') === (anchor || '')));
    els.back.disabled = !past.length;
    els.fwd.disabled = !ahead.length;
    try { sessionStorage.setItem('loomwright.manual', c.id); } catch { /* storage unavailable */ }
    if (o.top != null) { els.doc.scrollTop = o.top; spy(); return; }
    const target = anchor ? els.article.querySelector(`[id="lm-${CSS.escape(c.id)}--${CSS.escape(anchor)}"]`) : null;
    if (target) {
      els.doc.scrollTop = Math.max(0, yOf(target) - 12);
      target.classList.remove('lm-flash'); void target.offsetWidth; target.classList.add('lm-flash');
      if (o.hit) {
        // go to the first highlighted word in this section
        const next = nextHeading(target);
        const hit = [...els.article.querySelectorAll('mark.lm-hit')].find((m) => target.compareDocumentPosition(m) & window.Node.DOCUMENT_POSITION_FOLLOWING && (!next || m.compareDocumentPosition(next) & window.Node.DOCUMENT_POSITION_FOLLOWING));
        if (hit && yOf(hit) - yOf(target) > els.doc.clientHeight * 0.6) els.doc.scrollTop = Math.max(0, yOf(hit) - els.doc.clientHeight / 3);
      }
    } else if (!same || !anchor) els.doc.scrollTop = 0;
    spy();
  }
  /* How far down the reading pane an element sits, whatever is scrolled. */
  const yOf = (el) => el.getBoundingClientRect().top - els.doc.getBoundingClientRect().top + els.doc.scrollTop;
  function nextHeading(h) {
    const level = +h.tagName.slice(1);
    let n = h.nextElementSibling;
    while (n && !(/^H[1-6]$/.test(n.tagName) && +n.tagName.slice(1) <= level)) n = n.nextElementSibling;
    return n;
  }
  /* History: -1 back, 1 forward. */
  function go(step) {
    const from = step < 0 ? past : ahead, to = step < 0 ? ahead : past;
    const where = from.pop();
    if (!where || !current) return;
    to.push({ id: current.id, top: els.doc.scrollTop });
    show(where.id, '', { record: false, top: where.top });
  }
  /* Mark the contents entry for the section being read. */
  function spy() {
    if (!current || terms.length) return;
    const heads = [...els.article.querySelectorAll('h2[data-anchor]')];
    let on = '';
    const y = els.doc.scrollTop + 40;
    heads.forEach((h) => { if (yOf(h) <= y) on = h.dataset.anchor; });
    els.nav.querySelectorAll('.lm-subs a').forEach((a) => a.classList.toggle('on', a.dataset.anchor === on));
  }

  /* ---------------- Events ---------------- */
  function onClick(e) {
    const btn = e.target.closest('[data-lm]');
    if (btn && btn.dataset.lm === 'clear') { els.q.value = ''; runSearch(''); els.q.focus(); return; }
    const a = e.target.closest('a');
    if (a && a.dataset.chapter != null) {
      e.preventDefault();
      show(a.dataset.chapter, a.dataset.anchor || '', { hit: !!a.dataset.hit });
      if (!a.closest('.lm-nav')) els.doc.focus({ preventScroll: true });
      return;
    }
    if (a && a.classList.contains('lm-ext') && isDesktop()) {
      // the desktop app has no web browser of its own: copy the address instead
      e.preventDefault();
      const url = a.href;
      const done = (ok) => note(ok ? `${tr('Link copied. Paste it into your web browser:')} ${url}` : `${tr('Open this address in your web browser:')} ${url}`);
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => done(true), () => done(false)); else done(false);
      return;
    }
    const img = e.target.closest('.lm-fig img');
    if (img) img.classList.toggle('lm-zoom');
  }
  function note(text) {
    els.msg.textContent = text;
    els.msg.hidden = false;
    clearTimeout(note.t); note.t = setTimeout(() => { els.msg.hidden = true; }, 7000);
  }
  /* All keys are handled here, before the editor sees them, while the manual is open. */
  function onKey(e) {
    if (!root || root.hidden) return;
    const mod = e.ctrlKey || e.metaKey, k = e.key;
    const inSearch = e.target === els.q;
    // saving still works from inside the manual
    if (mod && !e.altKey && k.toLowerCase() === 's') return;
    e.stopPropagation();
    if (k === 'Escape') {
      e.preventDefault();
      if (inSearch && els.q.value) { els.q.value = ''; runSearch(''); } else close();
      return;
    }
    if (k === 'F1') { e.preventDefault(); return; }
    if ((mod && k.toLowerCase() === 'f') || (mod && k.toLowerCase() === 'k') || (k === '/' && !isTyping(e.target))) { e.preventDefault(); els.q.focus(); els.q.select(); return; }
    if (mod && k.toLowerCase() === 'p') { e.preventDefault(); printChapter(); return; }
    if (mod && k.toLowerCase() === 'a' && !isTyping(e.target)) {
      // select the chapter's text, not the whole window
      e.preventDefault();
      const range = document.createRange(), sel = window.getSelection();
      range.selectNodeContents(els.article);
      sel.removeAllRanges(); sel.addRange(range);
      return;
    }
    if (e.altKey && k === 'ArrowLeft') { e.preventDefault(); go(-1); return; }
    if (e.altKey && k === 'ArrowRight') { e.preventDefault(); go(1); return; }
    if (k === 'Tab') { trapTab(e); return; }
    if (inSearch && k === 'Enter') {
      e.preventDefault();
      const first = els.nav.querySelector('.lm-results a');
      if (first) first.click();
      return;
    }
    // arrows move through the contents or the search results
    if ((k === 'ArrowDown' || k === 'ArrowUp') && (inSearch || els.nav.contains(e.target))) {
      const links = [...els.nav.querySelectorAll('a[data-chapter]')];
      if (!links.length) return;
      e.preventDefault();
      const i = links.indexOf(e.target);
      if (k === 'ArrowDown') links[Math.min(links.length - 1, i + 1)].focus();
      else if (i <= 0) els.q.focus();
      else links[i - 1].focus();
      return;
    }
    // let the reading pane scroll with the keyboard even when the focus is elsewhere
    if (!isTyping(e.target) && !els.doc.contains(e.target) && ['PageDown', 'PageUp', 'Home', 'End', ' '].includes(k) && !els.nav.contains(e.target)) {
      e.preventDefault();
      const h = els.doc.clientHeight * 0.9;
      if (k === 'PageDown' || k === ' ') els.doc.scrollTop += h;
      else if (k === 'PageUp') els.doc.scrollTop -= h;
      else if (k === 'Home') els.doc.scrollTop = 0;
      else els.doc.scrollTop = els.doc.scrollHeight;
    }
  }
  const isTyping = (el) => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
  /* Keep Tab inside the manual while it is open. */
  function trapTab(e) {
    const list = [...root.querySelectorAll('button:not([disabled]), input, a[href], [tabindex="-1"]#lm-doc')].filter((x) => x.offsetParent !== null || x === els.doc);
    if (!list.length) return;
    const first = list[0], last = list[list.length - 1];
    if (e.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
  }

  /* ---------------- Printing ---------------- */
  function printChapter() {
    if (!canPrint() || !current) return;
    const c = chapterById(current.id);
    if (!c) return;
    let area = document.getElementById('print-area');
    if (!area) { area = document.createElement('div'); area.id = 'print-area'; area.className = 'print-area'; document.body.appendChild(area); }
    area.innerHTML = `<div class="lm-print"><p class="lm-print-src">${esc(tr('LoomWright user manual'))}</p>${c.html}</div>`;
    const clear = () => { window.removeEventListener('afterprint', clear); if (area.querySelector('.lm-print')) area.innerHTML = ''; };
    window.addEventListener('afterprint', clear);
    requestAnimationFrame(() => window.print());
  }

  /* ---------------- Opening and closing ---------------- */
  function open(chapterId, anchor) {
    if (!root) build();
    const wasOpen = !root.hidden;
    if (!wasOpen) {
      lastFocus = document.activeElement;
      root.hidden = false;
      window.addEventListener('keydown', onKey, true);
      document.querySelectorAll('.menu.open').forEach((m) => m.classList.remove('open'));
    }
    let id = chapterId && chapterById(chapterId) ? chapterId : null;
    if (!id && !chapterId) { try { id = sessionStorage.getItem('loomwright.manual'); } catch { id = null; } }
    if (!id || !chapterById(id)) id = chapters()[0] && chapters()[0].id;
    if (!wasOpen && terms.length) { els.q.value = ''; runSearch(''); }
    show(id, anchor || '', { record: wasOpen });
    if (!wasOpen) {
      past = []; ahead = [];
      els.back.disabled = true; els.fwd.disabled = true;
      (anchor || chapterId ? els.doc : els.q).focus({ preventScroll: true });
    }
  }
  function close() {
    if (!root || root.hidden) return;
    root.hidden = true;
    window.removeEventListener('keydown', onKey, true);
    if (lastFocus && document.contains(lastFocus) && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    lastFocus = null;
  }
  function search(q) {
    open();
    els.q.value = q || '';
    runSearch(els.q.value);
    els.q.focus();
  }

  window.LoomManualViewer = {
    open, close, search,
    isOpen: () => !!root && !root.hidden,
    /* The chapters, for a Help menu or context help: [{ id, title, sections: [{ anchor, title }] }]. */
    chapters: () => chapters().map((c) => ({ id: c.id, title: c.title, sections: c.sections.filter((s) => s.anchor).map((s) => ({ anchor: s.anchor, title: s.title })) })),
  };
})();
