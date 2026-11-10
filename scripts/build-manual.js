#!/usr/bin/env node
/*
 * Builds the in-app user manual: turns docs/manual/*.md into app/manual.js,
 * which defines window.LoomManual = { chapters: [{ id, file, title, html, text, sections }] }.
 *
 *   node scripts/build-manual.js          (or: npm run manual)
 *
 * No dependencies. The Markdown converter covers the subset the manual uses:
 * headings, paragraphs, bullet and numbered lists (nested by indenting), tables,
 * block quotes (used for notes), inline code and fenced code blocks, bold, italic,
 * links, images and <kbd> keys. Any other HTML in the Markdown is shown as text. Links to another chapter, written as `03-drawing.md#bends`,
 * become links inside the app. Images under app/manual/img are served from there.
 * The output only depends on the input files, so running it twice gives the same file.
 *
 * Copyright (C) 2026 LoomWright contributors. SPDX-License-Identifier: AGPL-3.0-or-later
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'docs', 'manual');
const OUT = path.join(ROOT, 'app', 'manual.js');

/* ---------------- Helpers ---------------- */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const unesc = (s) => String(s).replace(/&(amp|lt|gt|quot|#39);/g, (m, k) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" }[k]));
const stripTags = (html) => unesc(String(html).replace(/<[^>]*>/g, ''));
/* Chapter id from a file name: "03-drawing.md" -> "drawing". */
const idOf = (file) => file.replace(/\.md$/i, '').replace(/^\d+[-_]/, '');
/* Heading anchors as GitHub makes them, so the same #anchor works on GitHub and in the app. */
function slugger() {
  const seen = new Map();
  return (text) => {
    const base = String(text).toLowerCase().replace(/[^\p{L}\p{M}\p{Nd}\s_-]/gu, '').replace(/ /g, '-');
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    return n ? `${base}-${n}` : base;
  };
}

/* ---------------- Inline Markdown ---------------- */
// ctx: { chapterId, files (file name -> id), warn(msg) }
function inline(src, ctx) {
  const keep = [];
  const hold = (html) => `\u0000${keep.push(html) - 1}\u0000`;
  let s = String(src);
  // backslash escapes, then code spans, which take their content literally
  s = s.replace(/\\([\\`*_[\]()#+\-.!|>~])/g, (m, c) => hold(esc(c)));
  s = s.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (m, ticks, code) => hold(`<code>${esc(code.trim())}</code>`));
  // keys, written <kbd>Ctrl</kbd>+<kbd>S</kbd> as GitHub shows them; no other HTML is let through
  s = s.replace(/<kbd>([^<]*)<\/kbd>/g, (m, key) => hold(`<kbd>${esc(key)}</kbd>`));
  // images and links, written before escaping so their targets can be read
  s = s.replace(/!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"([^"]*)")?\s*\)/g, (m, alt, src_, title) => hold(image(alt, src_, title, ctx)));
  s = s.replace(/\[([^\]]+)\]\(\s*([^)\s]+)(?:\s+"([^"]*)")?\s*\)/g, (m, text, href, title) => hold(link(text, href, title, ctx)));
  s = esc(s);
  s = s.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>').replace(/__(?=\S)([\s\S]*?\S)__/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*(?=\S)([\s\S]*?\S)\*(?!\*)/g, '$1<em>$2</em>').replace(/(^|[^\w])_(?=\S)([\s\S]*?\S)_(?!\w)/g, '$1<em>$2</em>');
  // put held pieces back (they may nest: a link whose text holds code)
  for (let i = 0; i < 4 && s.includes('\u0000'); i++) s = s.replace(/\u0000(\d+)\u0000/g, (m, n) => keep[+n]);
  return s;
}
function image(alt, src, title, ctx) {
  let url = src;
  const m = /(?:^|\/)app\/(manual\/img\/[^?#]+)$/.exec(src);
  if (m) url = m[1];
  else if (!/^(https?:|data:)/.test(src)) ctx.warn(`image ${src} is not under app/manual/img, so the app cannot show it`);
  return `<img src="${esc(url)}" alt="${esc(alt)}"${title ? ` title="${esc(title)}"` : ''} loading="lazy">`;
}
function link(text, href, title, ctx) {
  const label = inline(text, ctx), tt = title ? ` title="${esc(title)}"` : '';
  if (/^(https?:|mailto:)/i.test(href)) return `<a href="${esc(href)}" class="lm-ext" target="_blank" rel="noopener noreferrer"${tt}>${label}</a>`;
  if (href.startsWith('#')) {
    const anchor = href.slice(1);
    return `<a href="#lm-${esc(ctx.chapterId)}--${esc(anchor)}" data-chapter="${esc(ctx.chapterId)}" data-anchor="${esc(anchor)}"${tt}>${label}</a>`;
  }
  const m = /^(?:\.\/)?([^/#]+\.md)(?:#(.*))?$/i.exec(href);
  if (m && ctx.files.has(m[1])) {
    const id = ctx.files.get(m[1]), anchor = m[2] || '';
    ctx.links.push({ id, anchor, from: ctx.chapterId });
    return `<a href="#lm-${esc(id)}${anchor ? '--' + esc(anchor) : ''}" data-chapter="${esc(id)}" data-anchor="${esc(anchor)}"${tt}>${label}</a>`;
  }
  // a link that looks like a chapter but names no chapter file: most likely a renumbered chapter
  if (m && /^\d+[-_]/.test(m[1])) ctx.warn(`link to ${m[1]}, which is not a chapter`);
  // a file in the repository but outside the manual: the app has no copy, so name it instead
  const repoPath = path.posix.normalize(path.posix.join('docs/manual', href.split('#')[0]));
  return `<span class="lm-path" title="${esc('In the LoomWright source: ' + repoPath)}">${label} <code>${esc(repoPath)}</code></span>`;
}

/* ---------------- Block Markdown ---------------- */
const RE = {
  fence: /^\s*(```|~~~)\s*([\w+-]*)\s*$/,
  heading: /^(#{1,6})\s+(.*?)\s*#*\s*$/,
  item: /^(\s*)([-*+]|\d+[.)])\s+(.*)$/,
  quote: /^\s{0,3}>\s?(.*)$/,
  rule: /^\s{0,3}([-*_])(\s*\1){2,}\s*$/,
  tableSep: /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/,
};
const isBlank = (l) => !l || !l.trim();
const indentOf = (l) => (/^\s*/.exec(l)[0] || '').length;
const startsBlock = (line, next) => RE.fence.test(line) || RE.heading.test(line) || RE.item.test(line) || RE.quote.test(line) || RE.rule.test(line) || (line.trim().startsWith('|') && next != null && RE.tableSep.test(next));

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells = []; let cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') { cur += '\\|'; i++; continue; }
    if (s[i] === '|') { cells.push(cur.trim()); cur = ''; continue; }
    cur += s[i];
  }
  cells.push(cur.trim());
  return cells;
}

/* Parse lines into a list of blocks: { t: 'h'|'p'|'ul'|'ol'|'code'|'table'|'quote'|'hr', ... } */
function parseBlocks(lines) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }
    let m;
    if ((m = RE.fence.exec(line))) {
      const fence = m[1], body = [];
      i++;
      while (i < lines.length && !(lines[i].trim().startsWith(fence))) body.push(lines[i++]);
      i++;
      out.push({ t: 'code', lang: m[2] || '', text: body.join('\n') });
      continue;
    }
    if ((m = RE.heading.exec(line))) { out.push({ t: 'h', level: m[1].length, text: m[2] }); i++; continue; }
    if (RE.rule.test(line)) { out.push({ t: 'hr' }); i++; continue; }
    if (line.trim().startsWith('|') && i + 1 < lines.length && RE.tableSep.test(lines[i + 1])) {
      const head = splitRow(line), align = splitRow(lines[i + 1]).map((c) => (/^:-+:$/.test(c) ? 'center' : /-+:$/.test(c) ? 'right' : ''));
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(splitRow(lines[i++]));
      out.push({ t: 'table', head, align, rows });
      continue;
    }
    if (RE.quote.test(line)) {
      const body = [];
      while (i < lines.length && !isBlank(lines[i]) && (RE.quote.test(lines[i]) || !startsBlock(lines[i], lines[i + 1]))) body.push(RE.quote.test(lines[i]) ? RE.quote.exec(lines[i])[1] : lines[i]), i++;
      out.push({ t: 'quote', blocks: parseBlocks(body) });
      continue;
    }
    if ((m = RE.item.exec(line))) { const r = parseList(lines, i); out.push(r.block); i = r.next; continue; }
    const para = [];
    while (i < lines.length && !isBlank(lines[i]) && !(para.length && startsBlock(lines[i], lines[i + 1]))) para.push(lines[i++].trim());
    out.push({ t: 'p', text: para.join('\n') });
  }
  return out;
}
/* A list starting at line i. Items at the same indent belong to it; deeper lines belong to the item above. */
function parseList(lines, start) {
  const first = RE.item.exec(lines[start]);
  const base = first[1].length, ordered = /\d/.test(first[2]);
  const block = { t: ordered ? 'ol' : 'ul', start: ordered ? parseInt(first[2], 10) : 1, items: [], loose: false };
  let i = start;
  while (i < lines.length) {
    const m = RE.item.exec(lines[i]);
    if (!m || m[1].length !== base || /\d/.test(m[2]) !== ordered) break;
    const contentIndent = m[1].length + m[2].length + 1;
    const body = [m[3]];
    i++;
    let sawBlank = false;
    while (i < lines.length) {
      const l = lines[i];
      if (isBlank(l)) {
        // a blank line ends the item unless the next line is indented under it
        const next = lines.slice(i + 1).find((x) => !isBlank(x));
        if (next != null && indentOf(next) >= contentIndent) { body.push(''); sawBlank = true; i++; continue; }
        break;
      }
      const im = RE.item.exec(l);
      if (im && im[1].length <= base) break;
      if (indentOf(l) >= contentIndent || im) { body.push(l.slice(Math.min(indentOf(l), contentIndent))); i++; continue; }
      if (sawBlank || startsBlock(l, lines[i + 1])) break;
      body.push(l.trim()); i++; // lazy continuation
    }
    block.items.push(parseBlocks(body));
    if (sawBlank) block.loose = true;
    // a blank line between items makes the list loose; skip it if the list goes on
    if (i < lines.length && isBlank(lines[i])) {
      const j = lines.findIndex((x, k) => k > i && !isBlank(x));
      const nm = j > 0 ? RE.item.exec(lines[j]) : null;
      if (nm && nm[1].length === base && /\d/.test(nm[2]) === ordered) { block.loose = true; i = j; }
    }
  }
  return { block, next: i };
}

/* ---------------- Rendering ---------------- */
function renderBlocks(blocks, ctx, tight) {
  return blocks.map((b) => renderBlock(b, ctx, tight)).join('\n');
}
function renderBlock(b, ctx, tight) {
  switch (b.t) {
    case 'h': {
      const plain = stripTags(inline(b.text, ctx)), html = inline(b.text, ctx);
      if (b.level === 1) {
        if (ctx.title) ctx.warn('more than one top-level heading');
        ctx.title = ctx.title || plain;
        return `<h1 id="lm-${esc(ctx.chapterId)}">${html}</h1>`;
      }
      const anchor = ctx.slug(plain);
      ctx.anchors.add(anchor);
      if (b.level <= 3) ctx.startSection({ anchor, title: plain, level: b.level });
      return `<h${b.level} id="lm-${esc(ctx.chapterId)}--${esc(anchor)}" data-anchor="${esc(anchor)}">${html}</h${b.level}>`;
    }
    case 'p': {
      const only = /^!\[[^\]]*\]\([^)]*\)$/.test(b.text.trim());
      if (only) {
        const m = /^!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"([^"]*)")?\s*\)$/.exec(b.text.trim());
        return `<figure class="lm-fig">${image(m[1], m[2], '', ctx)}${m[3] ? `<figcaption>${inline(m[3], ctx)}</figcaption>` : ''}</figure>`;
      }
      const html = inline(b.text, ctx).replace(/\n/g, ' ');
      return tight ? html : `<p>${html}</p>`;
    }
    case 'ul': case 'ol': {
      const items = b.items.map((blocks) => {
        // in a tight list the first paragraph of an item is not wrapped in <p>
        const inner = blocks.map((x, k) => renderBlock(x, ctx, !b.loose && k === 0 && x.t === 'p')).join('\n');
        return `<li>${inner}</li>`;
      }).join('\n');
      const start = b.t === 'ol' && b.start !== 1 ? ` start="${b.start}"` : '';
      return `<${b.t}${start}>\n${items}\n</${b.t}>`;
    }
    case 'code':
      return `<pre class="lm-code"${b.lang ? ` data-lang="${esc(b.lang)}"` : ''}><code>${esc(b.text)}</code></pre>`;
    case 'table': {
      const al = (i) => (b.align[i] ? ` style="text-align:${b.align[i]}"` : '');
      const head = `<thead><tr>${b.head.map((c, i) => `<th${al(i)}>${inline(c, ctx)}</th>`).join('')}</tr></thead>`;
      const rows = b.rows.map((r) => `<tr>${b.head.map((_, i) => `<td${al(i)}>${inline(r[i] || '', ctx)}</td>`).join('')}</tr>`).join('\n');
      return `<div class="lm-table"><table>${head}<tbody>\n${rows}\n</tbody></table></div>`;
    }
    case 'quote':
      return `<blockquote class="lm-note">${renderBlocks(b.blocks, ctx, false)}</blockquote>`;
    case 'hr':
      return '<hr>';
    default:
      return '';
  }
}

/* One chapter: html, plain text for search, and where each section starts in that text. */
function chapter(file, md, files, warnings) {
  const id = idOf(file);
  const lines = md.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
  const sections = [{ anchor: '', title: '', level: 1, parts: [] }];
  const ctx = {
    chapterId: id, files, title: '', slug: slugger(), anchors: new Set(), links: [],
    warn: (msg) => warnings.push(`${file}: ${msg}`),
    startSection: (s) => sections.push({ ...s, parts: [] }),
  };
  const blocks = parseBlocks(lines);
  const html = blocks.map((b) => {
    const h = renderBlock(b, ctx, false);
    const sec = sections[sections.length - 1];
    sec.parts.push(b.t === 'code' ? b.text : stripTags(h.replace(/<\/(p|li|h\d|tr|th|td|figcaption|pre|blockquote)>/g, ' $&').replace(/<br>/g, ' ')));
    return h;
  }).join('\n');
  if (!ctx.title) ctx.warn('no top-level heading (# Title)');
  sections[0].title = ctx.title;
  let text = '';
  const outSections = sections.map((s) => {
    const body = s.parts.join('\n').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim();
    if (text) text += '\n\n';
    const start = text.length;
    text += body;
    return { anchor: s.anchor, title: s.title, level: s.level, start };
  });
  return { chapter: { id, file, title: ctx.title, html, text, sections: outSections }, anchors: ctx.anchors, links: ctx.links };
}

/* ---------------- Build ---------------- */
function build() {
  const names = fs.readdirSync(SRC).filter((f) => /^\d+[-_].+\.md$/i.test(f)).sort();
  if (!names.length) throw new Error(`No chapters found in ${SRC}`);
  const files = new Map(names.map((f) => [f, idOf(f)]));
  const ids = [...files.values()];
  const dup = ids.find((x, i) => ids.indexOf(x) !== i);
  if (dup) throw new Error(`Two chapters have the id "${dup}"`);
  const warnings = [], built = names.map((f) => chapter(f, fs.readFileSync(path.join(SRC, f), 'utf8'), files, warnings));
  // every link to another chapter must land on a heading that exists
  built.forEach((b) => b.links.forEach((l) => {
    const target = built.find((x) => x.chapter.id === l.id);
    if (l.anchor && !target.anchors.has(l.anchor)) warnings.push(`${b.chapter.file}: link to ${l.id}#${l.anchor}, which has no such heading`);
  }));
  built.forEach((b) => {
    const re = /<img src="(manual\/img\/[^"]+)"/g;
    let m;
    while ((m = re.exec(b.chapter.html))) if (!fs.existsSync(path.join(ROOT, 'app', m[1]))) warnings.push(`${b.chapter.file}: missing image app/${m[1]}`);
  });
  const data = { chapters: built.map((b) => b.chapter) };
  // one chapter per line, so a change to one chapter shows as a change to one line
  const safe = (s) => s.replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029').replace(/<\/script/gi, '<\\/script');
  const js = '/* LoomWright user manual, generated by scripts/build-manual.js from docs/manual/*.md.\n' +
    '   Do not edit this file by hand: edit the Markdown and run `npm run manual`.\n' +
    '   Copyright (C) 2026 LoomWright contributors. SPDX-License-Identifier: AGPL-3.0-or-later */\n' +
    'window.LoomManual = { chapters: [\n' + data.chapters.map((c) => safe(JSON.stringify(c))).join(',\n') + '\n] };\n';
  fs.writeFileSync(OUT, js);
  warnings.forEach((w) => console.warn('warning: ' + w));
  console.log(`Wrote ${path.relative(ROOT, OUT)}: ${data.chapters.length} chapters, ${(js.length / 1024).toFixed(0)} KB.`);
  return warnings.length;
}

if (require.main === module) {
  try { process.exitCode = build() ? 1 : 0; } catch (e) { console.error(e.message); process.exitCode = 1; }
}
module.exports = { build, inline, parseBlocks, renderBlocks, idOf };
