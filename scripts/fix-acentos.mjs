// Script para corrigir acentos em strings literais e texto JSX
// Abordagem: usa Babel parser para identificar RANGES de strings e JSX text,
// e modifica apenas esses ranges no texto fonte original (preserva formatacao 100%).

import { parse } from '@babel/parser';
import traverseModule from '@babel/traverse';
import * as t from '@babel/types';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { REPLACEMENTS, PROTECTED_VALUES } from './fix-acentos-rules.mjs';

const traverse = traverseModule.default || traverseModule;
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, '..', 'src');

const sortedReps = [...REPLACEMENTS]
  .filter(([f, tt]) => f !== tt)
  .sort((a, b) => b[0].length - a[0].length);

const repRegexes = sortedReps.map(([from, to]) => {
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [new RegExp('(^|[^A-Za-zÀ-ÿ0-9_])' + escaped + '(?=[^A-Za-zÀ-ÿ0-9_]|$)', 'g'), to];
});

function applyReplacements(s) {
  let out = s;
  for (const [re, to] of repRegexes) {
    out = out.replace(re, (m, p1) => p1 + to);
  }
  return out;
}

function isProtectedString(content) {
  if (PROTECTED_VALUES.has(content)) return true;
  if (/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/i.test(content)) return true;
  if (/^[a-z][a-z0-9]*(-[a-z0-9]+)+$/i.test(content)) return true;
  if (/^(https?:\/\/|mailto:|tel:|\/|\.\/|\.\.\/|#|~\/|data:)/.test(content)) return true;
  if ((content.match(/\//g) || []).length >= 2) return true;
  if (/:.*-/.test(content) && !/\s/.test(content.trim())) return true;
  if (!/\s/.test(content) && /[:[\]]/.test(content)) return true;
  const tokens = content.split(/\s+/);
  if (tokens.length >= 2) {
    const cssTokens = tokens.filter(tok => /^[a-z0-9]+(-[a-z0-9.[\]/%!]+)+$|^[a-z]+:[a-z0-9-]+$|^[!-]?[a-z][a-z0-9-:[\].\/%!]*$/i.test(tok) && /[-:]/.test(tok));
    if (cssTokens.length / tokens.length > 0.6) return true;
  }
  return false;
}

const JSX_ATTRS_SKIP = new Set([
  'className', 'class', 'id', 'htmlFor', 'name', 'type', 'src', 'href', 'to',
  'rel', 'role', 'target', 'autoComplete', 'inputMode', 'form', 'key',
  'data-testid', 'data-test', 'lang', 'dir', 'method', 'action', 'encType',
  'as', 'tag', 'layoutId', 'dataKey',
]);

const SKIP_CALL_PROPS = new Set([
  'getItem', 'setItem', 'removeItem',
  'from', 'rpc', 'eq', 'neq', 'lt', 'gt', 'lte', 'gte', 'in', 'is', 'like', 'ilike',
  'order', 'select', 'update', 'insert', 'upsert', 'returns',
  'getElementById', 'querySelector', 'querySelectorAll',
  'matchMedia', 'createObjectURL',
  'addEventListener', 'removeEventListener',
  'createElement', 'createElementNS',
  'setAttribute', 'getAttribute', 'removeAttribute',
]);

function processFile(filepath) {
  const code = fs.readFileSync(filepath, 'utf8');
  if (!code.trim()) return { changed: false, count: 0 };

  let ast;
  try {
    ast = parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'classProperties', 'objectRestSpread', 'optionalChaining', 'nullishCoalescingOperator', 'dynamicImport'],
      ranges: true,
      tokens: false,
    });
  } catch (e) {
    return { changed: false, count: 0, error: e.message };
  }

  const edits = [];
  let count = 0;

  function isSkipped(p) {
    const parent = p.parent;
    if (t.isImportDeclaration(parent) && parent.source === p.node) return true;
    if ((t.isExportNamedDeclaration(parent) || t.isExportAllDeclaration(parent)) && parent.source === p.node) return true;
    if (t.isObjectProperty(parent) && parent.key === p.node && !parent.computed) return true;
    if (t.isObjectMethod(parent) && parent.key === p.node && !parent.computed) return true;
    if (t.isMemberExpression(parent) && parent.property === p.node && !parent.computed) return true;
    if (t.isJSXAttribute(parent) && parent.name === p.node) return true;
    if (t.isJSXAttribute(parent) && parent.value === p.node) {
      const attrName = parent.name?.name;
      if (JSX_ATTRS_SKIP.has(attrName)) return true;
    }
    if (t.isJSXExpressionContainer(parent)) {
      const grand = p.parentPath?.parent;
      if (t.isJSXAttribute(grand)) {
        const attrName = grand.name?.name;
        if (JSX_ATTRS_SKIP.has(attrName)) return true;
      }
    }
    if (t.isCallExpression(parent)) {
      const callee = parent.callee;
      if (t.isMemberExpression(callee) && t.isIdentifier(callee.property)) {
        if (SKIP_CALL_PROPS.has(callee.property.name)) return true;
      }
      if (t.isIdentifier(callee) && callee.name === 'require') return true;
    }
    if (parent?.type?.startsWith('TS')) return true;
    return false;
  }

  traverse(ast, {
    StringLiteral(p) {
      if (isSkipped(p)) return;
      const node = p.node;
      const original = node.value;
      if (isProtectedString(original)) return;
      // Pega raw do source (preserva escapes existentes)
      const start = node.start;
      const end = node.end;
      const rawSrc = code.slice(start, end);
      const quote = rawSrc[0];
      if (quote !== "'" && quote !== '"') return;
      const innerRaw = rawSrc.slice(1, -1);
      const innerReplaced = applyReplacements(innerRaw);
      if (innerReplaced === innerRaw) return;
      edits.push([start, end, quote + innerReplaced + quote]);
      count++;
    },

    JSXText(p) {
      const node = p.node;
      const original = node.value;
      const replaced = applyReplacements(original);
      if (replaced === original) return;
      const start = node.start;
      const end = node.end;
      const rawSrc = code.slice(start, end);
      const newRaw = applyReplacements(rawSrc);
      if (newRaw !== rawSrc) {
        edits.push([start, end, newRaw]);
        count++;
      }
    },

    TemplateLiteral(p) {
      if (isSkipped(p)) return;
      for (const quasi of p.node.quasis) {
        const s = quasi.start;
        const e = quasi.end;
        const rawSrc = code.slice(s, e);
        if (isProtectedString(rawSrc.trim())) continue;
        const newRaw = applyReplacements(rawSrc);
        if (newRaw !== rawSrc) {
          edits.push([s, e, newRaw]);
          count++;
        }
      }
    },
  });

  if (edits.length === 0) return { changed: false, count: 0 };

  // Aplica edits em ordem reversa para preservar offsets
  edits.sort((a, b) => b[0] - a[0]);
  let out = code;
  for (const [s, e, repl] of edits) {
    out = out.slice(0, s) + repl + out.slice(e);
  }

  fs.writeFileSync(filepath, out, 'utf8');
  return { changed: true, count };
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (/\.(js|jsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

const argTarget = process.argv[2];
let files;
if (argTarget) {
  files = [path.resolve(argTarget)];
} else {
  files = walk(SRC);
}

const stats = [];
let totalChanges = 0;
let filesChanged = 0;
let parseErrors = 0;

for (const f of files) {
  try {
    const r = processFile(f);
    if (r.error) {
      console.warn(`[parse error] ${path.relative(SRC, f)}: ${r.error}`);
      parseErrors++;
    }
    if (r.changed) {
      filesChanged++;
      totalChanges += r.count;
      stats.push({ file: path.relative(SRC, f), count: r.count });
    }
  } catch (e) {
    console.warn(`[ERROR] ${path.relative(SRC, f)}: ${e.message}`);
  }
}

stats.sort((a, b) => b.count - a.count);
console.log(`\n=== Resumo ===`);
console.log(`Arquivos alterados: ${filesChanged}`);
console.log(`Total de substituicoes: ${totalChanges}`);
if (parseErrors > 0) console.log(`Erros de parse: ${parseErrors}`);
console.log('\nTop 15 arquivos:');
for (const s of stats.slice(0, 15)) {
  console.log(`  ${s.count.toString().padStart(4)}  ${s.file}`);
}
