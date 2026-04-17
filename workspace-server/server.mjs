import http from 'http';
import fs from 'fs/promises';
import path from 'path';
import { marked } from 'marked';
import mime from 'mime-types';

const PORT = process.env.PORT || 3001;
const WORKSPACE = process.env.WORKSPACE || '/Users/simonwade/dev/nanoclaw/groups/telegram_main';

const renderer = new marked.Renderer();
const origCode = renderer.code.bind(renderer);
renderer.code = function(args) {
  const text = typeof args === 'string' ? args : args.text;
  const lang = typeof args === 'string' ? arguments[1] : args.lang;
  if (lang === 'mermaid') {
    return `<pre class="mermaid">${text}</pre>`;
  }
  return origCode.apply(this, arguments);
};
marked.setOptions({ gfm: true, breaks: false, renderer });

const CSS = `
body { max-width: 900px; margin: 0 auto; padding: 12px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; line-height: 1.6; color: #c9d1d9; background: #0d1117; font-size: 16px; }
a { color: #58a6ff; text-decoration: none; } a:hover { text-decoration: underline; }
.breadcrumb { margin-bottom: 10px; padding: 10px 12px; background: #161b22; border-radius: 6px; font-size: 14px; word-break: break-all; }
.breadcrumb a { margin-right: 0; }
.file-list { list-style: none; padding: 0; }
.file-list li { padding: 12px; margin: 6px 0; background: #161b22; border-radius: 6px; }
.file-list li a { display: inline; font-size: 16px; }

.markdown { background: #0d1117; }
.markdown h1, .markdown h2, .markdown h3 { border-bottom: 1px solid #21262d; padding-bottom: 8px; }
.markdown code { background: #161b22; padding: 2px 6px; border-radius: 3px; font-family: ui-monospace, monospace; font-size: 14px; word-break: break-word; }
.markdown pre { background: #161b22; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 13px; }
.markdown pre code { background: none; padding: 0; word-break: normal; }
.markdown blockquote { border-left: 4px solid #3b434b; margin: 0 0 16px 0; padding-left: 16px; color: #8b949e; }
.markdown table { border-collapse: collapse; width: 100%; overflow-x: auto; display: block; }
.markdown th, .markdown td { border: 1px solid #3b434b; padding: 8px; text-align: left; font-size: 14px; }
.markdown th { background: #161b22; }
@media (min-width: 768px) {
  body { padding: 40px 20px; }
  .breadcrumb { font-size: 15px; }
  .file-list li { padding: 8px 12px; }
  .markdown table { display: table; }
}
`;

const renderPage = (title, content) => `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title><link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🐝</text></svg>"><style>${CSS}</style>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/highlightjs-solidity/dist/solidity.min.js"></script>
<script type="module">import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';mermaid.initialize({startOnLoad:true,theme:'dark'});</script>
<script>window.addEventListener('load', () => hljs.highlightAll());</script></head>
<body>${content}</body></html>`;

const breadcrumbs = (urlPath) => {
  const parts = urlPath.split('/').filter(Boolean);
  if (parts.length === 0) {
    return '<div class="breadcrumb">🏠</div>';
  }
  let html = '<div class="breadcrumb"><a href="/">🏠</a>';
  let accumulated = '';
  parts.forEach((part, index) => {
    accumulated += '/' + part;
    const separator = index === 0 ? ' ' : ' / ';
    html += `${separator}<a href="${accumulated}">${part}</a>`;
  });
  return html + '</div>';
};

const DATE_PREFIX_RE = /^\d{4}-\d{2}-\d{2}/;

const sortEntries = (entries) => {
  // Separate: dirs first, then date-prefixed items (reverse date), then rest (alpha)
  const dirs = entries.filter(e => e.isDirectory());
  const files = entries.filter(e => !e.isDirectory());
  const dated = files.filter(e => DATE_PREFIX_RE.test(e.name));
  const undated = files.filter(e => !DATE_PREFIX_RE.test(e.name));
  
  dirs.sort((a, b) => a.name.localeCompare(b.name));
  dated.sort((a, b) => b.name.localeCompare(a.name)); // reverse date order
  undated.sort((a, b) => a.name.localeCompare(b.name));
  
  return [...dirs, ...dated, ...undated];
};

// Flatten directory entries: if a dir contains no files (only subdirs),
// replace it with its children shown as "parent/child" links. Recurse.
const flattenEntries = async (entries, diskBase, urlBase) => {
  const result = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      result.push({ name: entry.name, href: path.join(urlBase, entry.name), isDir: false });
      continue;
    }
    const entryDisk = path.join(diskBase, entry.name);
    const entryUrl = path.join(urlBase, entry.name);
    const children = (await fs.readdir(entryDisk, { withFileTypes: true })).filter(e => !e.name.startsWith('.'));
    const hasFiles = children.some(c => !c.isDirectory());
    
    if (!hasFiles && children.length > 0) {
      // No files, only subdirs — flatten: replace with children (recursively)
      const nested = await flattenEntries(children, entryDisk, entryUrl);
      for (const child of nested) {
        result.push({ ...child, name: entry.name + '/' + child.name });
      }
    } else {
      result.push({ name: entry.name, href: entryUrl, isDir: true });
    }
  }
  return result;
};

const dirListing = async (diskPath, urlPath) => {
  const entries = (await fs.readdir(diskPath, { withFileTypes: true })).filter(e => !e.name.startsWith('.'));
  const flattened = await flattenEntries(entries, diskPath, urlPath);
  
  // Sort: dirs first, then date-prefixed (reverse), then rest (alpha)
  const dirs = flattened.filter(e => e.isDir);
  const files = flattened.filter(e => !e.isDir);
  const dated = files.filter(e => DATE_PREFIX_RE.test(e.name));
  const undated = files.filter(e => !DATE_PREFIX_RE.test(e.name));
  dirs.sort((a, b) => a.name.localeCompare(b.name));
  dated.sort((a, b) => b.name.localeCompare(a.name));
  undated.sort((a, b) => a.name.localeCompare(b.name));
  const sorted = [...dirs, ...dated, ...undated];
  
  let html = breadcrumbs(urlPath) + '<ul class="file-list">';
  for (const entry of sorted) {
    const cls = entry.isDir ? 'dir' : 'file';
    const icon = entry.isDir ? '📁' : '📄';
    html += `<li class="${cls}">${icon} <a href="${entry.href}">${entry.name}</a></li>`;
  }
  html += '</ul>';

  // If directory contains a README.md, render it below the listing
  const readmePath = path.join(diskPath, 'README.md');
  try {
    let readme = await fs.readFile(readmePath, 'utf-8');
    readme = readme.replace(/^---\n[\s\S]*?\n---\n/, '');
    html += `<hr style="border:none;border-top:1px solid #21262d;margin:24px 0"><div class="markdown">${marked(readme)}</div>`;
  } catch {}

  return renderPage('Directory: ' + urlPath, html);
};

const server = http.createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(req.url);
    const diskPath = path.join(WORKSPACE, urlPath);
    
    // Security: prevent path traversal and dotfile access
    const segments = urlPath.split('/').filter(Boolean);
    if (segments.some(s => s.startsWith('.'))) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    if (!diskPath.startsWith(WORKSPACE)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    const stats = await fs.stat(diskPath);
    
    if (stats.isDirectory()) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(await dirListing(diskPath, urlPath));
    } else if (diskPath.endsWith('.jsx') || diskPath.endsWith('.tsx')) {
      const jsx = await fs.readFile(diskPath, 'utf-8');
      // Extract component name: last export default or first function/const component
      const defaultExportMatch = jsx.match(/export\s+default\s+(?:function\s+)?(\w+)/);
      const fnMatch = jsx.match(/(?:function|const)\s+([A-Z]\w+)/);
      const componentName = defaultExportMatch?.[1] || fnMatch?.[1] || 'App';
      
      const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${path.basename(diskPath)}</title>
<script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin></script>
<script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin></script>
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<style>* { box-sizing: border-box; margin: 0; padding: 0; } body { background: #0d0f14; }</style>
</head><body>
<div id="root"></div>
<script type="text/babel">
const { useState, useEffect, useRef, useCallback, useMemo, useReducer, useContext, createContext, Fragment } = React;

${jsx.replace(/import\s*\{[^}]*\}\s*from\s*['"]react['"];?\s*/g, '').replace(/export\s+default\s+/g, '')}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(${componentName}));
</script>
</body></html>`;
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    } else if (diskPath.endsWith('.md')) {
      let markdown = await fs.readFile(diskPath, 'utf-8');
      // Parse YAML front matter into a metadata table inside the breadcrumb box
      let metaTable = '';
      const fmMatch = markdown.match(/^---\n([\s\S]*?)\n---\n/);
      if (fmMatch) {
        markdown = markdown.slice(fmMatch[0].length);
        const lines = fmMatch[1].split('\n').filter(l => l.includes(':'));
        if (lines.length) {
          metaTable = '<table style="margin-top:8px;font-size:12px;color:#8b949e;width:auto;border:none">';
          for (const line of lines) {
            const idx = line.indexOf(':');
            const key = line.slice(0, idx).trim();
            let val = line.slice(idx + 1).trim();
            val = val.replace(/^\[(.+)\]$/, '$1').replace(/^"(.*)"$/, '$1');
            metaTable += `<tr><td style="padding:1px 12px 1px 0;color:#58a6ff;white-space:nowrap;border:none">${key}</td><td style="padding:1px 0;border:none">${val}</td></tr>`;
          }
          metaTable += '</table>';
        }
      }
      const html = marked(markdown);
      const bc = breadcrumbs(urlPath);
      const content = bc.replace('</div>', metaTable + '</div>') + `<div class="markdown">${html}</div>`;
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(renderPage(path.basename(diskPath), content));
    } else {
      const content = await fs.readFile(diskPath);
      const mimeType = mime.lookup(diskPath) || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mimeType });
      res.end(content);
    }
  } catch (err) {
    res.writeHead(404).end('Not Found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`📂 Workspace server running at http://0.0.0.0:${PORT}`);
  console.log(`📁 Serving: ${WORKSPACE}`);
});
