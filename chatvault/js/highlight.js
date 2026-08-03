/* A small hand-written tokenizer for code blocks.

   One scan, no library. Keywords are marked with WEIGHT, not with a hue,
   because the palette here is ink, amber and burnt earth and a rainbow of
   token colours would break it. Strings, numbers and comments each get one
   colour from that palette.

   Very long blocks skip highlighting and say so on screen. A silent skip would
   be a lie about what the tool did. */

const LIMIT = 20000;

const COMMON = {
  line: ["//"],
  block: [["/*", "*/"]],
  strings: ['"', "'", "`"],
  numbers: /^(?:0[xXbBoO][0-9a-fA-F_]+|\d[\d_]*(?:\.[\d_]+)?(?:[eE][+-]?\d+)?)/,
};

const LANGS = {
  javascript: {
    ...COMMON,
    keywords:
      "as async await break case catch class const continue debugger default delete do else export extends finally for from function get if import in instanceof let new of return set static super switch this throw try typeof var void while with yield",
    literals: "true false null undefined NaN Infinity",
  },
  typescript: {
    ...COMMON,
    keywords:
      "abstract as async await break case catch class const continue declare default delete do else enum export extends finally for from function get if implements import in infer instanceof interface keyof let namespace new of private protected public readonly return satisfies set static super switch this throw try type typeof var void while yield",
    literals: "true false null undefined never unknown any string number boolean object symbol bigint",
  },
  python: {
    line: ["#"],
    block: [['"""', '"""'], ["'''", "'''"]],
    strings: ['"', "'"],
    numbers: COMMON.numbers,
    keywords:
      "and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case",
    literals: "True False None self cls",
  },
  rust: {
    ...COMMON,
    keywords:
      "as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type unsafe use where while",
    literals: "true false None Some Ok Err",
  },
  go: {
    ...COMMON,
    keywords:
      "break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var",
    literals: "true false nil iota",
  },
  sql: {
    line: ["--"],
    block: [["/*", "*/"]],
    strings: ["'", '"'],
    numbers: COMMON.numbers,
    caseInsensitive: true,
    keywords:
      "select from where group by having order limit offset insert into values update set delete create table index unique concurrently alter add drop primary key foreign references join left right inner outer full on as and or not null distinct union all with returning explain analyze buffers include using begin commit rollback pragma vacuum",
    literals: "true false null",
  },
  bash: {
    line: ["#"],
    block: [],
    strings: ['"', "'"],
    numbers: COMMON.numbers,
    keywords: "if then else elif fi for while do done case esac function return local export source alias set unset trap",
    literals: "true false",
  },
  json: {
    line: [],
    block: [],
    strings: ['"'],
    numbers: COMMON.numbers,
    keywords: "",
    literals: "true false null",
  },
  yaml: {
    line: ["#"],
    block: [],
    strings: ['"', "'"],
    numbers: COMMON.numbers,
    keywords: "",
    literals: "true false null yes no on off",
  },
  css: {
    line: [],
    block: [["/*", "*/"]],
    strings: ['"', "'"],
    numbers: /^(?:-?\d[\d_]*(?:\.\d+)?(?:px|rem|em|%|vw|vh|dvh|ch|s|ms|fr|deg)?|#[0-9a-fA-F]{3,8})/,
    keywords: "important media supports container layer keyframes from to and not only",
    literals: "",
  },
  lua: {
    line: ["--"],
    block: [["--[[", "]]"]],
    strings: ['"', "'"],
    numbers: COMMON.numbers,
    keywords: "and break do else elseif end for function goto if in local nil not or repeat return then until while",
    literals: "true false nil",
  },
  hcl: {
    line: ["#", "//"],
    block: [["/*", "*/"]],
    strings: ['"'],
    numbers: COMMON.numbers,
    keywords: "resource variable module output provider data locals terraform for_each count depends_on type default",
    literals: "true false null",
  },
};

const ALIAS = {
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  node: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  rs: "rust",
  golang: "go",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  console: "bash",
  postgres: "sql",
  psql: "sql",
  sqlite: "sql",
  yml: "yaml",
  dockerfile: "bash",
  terraform: "hcl",
  tf: "hcl",
};

export function resolveLanguage(tag) {
  const t = String(tag || "").trim().toLowerCase();
  if (!t) return null;
  const key = ALIAS[t] || t;
  return LANGS[key] ? key : null;
}

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
export function escapeHtml(s) {
  return s.replace(/[&<>]/g, (c) => ESC[c]);
}

/**
 * @returns {{html:string, language:string, skipped:boolean}}
 */
export function highlight(code, tag) {
  const langKey = resolveLanguage(tag);
  if (code.length > LIMIT) {
    return { html: escapeHtml(code), language: langKey || "plain text", skipped: true };
  }
  if (!langKey) return { html: escapeHtml(code), language: "plain text", skipped: false };

  const lang = LANGS[langKey];
  const keywords = new Set(lang.keywords.split(" ").filter(Boolean));
  const literals = new Set((lang.literals || "").split(" ").filter(Boolean));
  const numberRe = lang.numbers;

  let out = "";
  let i = 0;
  const n = code.length;
  let plain = "";
  const flush = () => {
    if (plain) {
      out += escapeHtml(plain);
      plain = "";
    }
  };
  const span = (cls, text) => {
    flush();
    out += `<span class="tok-${cls}">${escapeHtml(text)}</span>`;
  };

  while (i < n) {
    const rest = code.slice(i, i + 4);

    let matchedBlock = null;
    for (const [open, close] of lang.block || []) {
      if (code.startsWith(open, i)) {
        matchedBlock = [open, close];
        break;
      }
    }
    if (matchedBlock) {
      const [open, close] = matchedBlock;
      const end = code.indexOf(close, i + open.length);
      const stop = end < 0 ? n : end + close.length;
      span(open.startsWith('"') || open.startsWith("'") ? "str" : "com", code.slice(i, stop));
      i = stop;
      continue;
    }

    let matchedLine = null;
    for (const marker of lang.line || []) {
      if (code.startsWith(marker, i)) {
        matchedLine = marker;
        break;
      }
    }
    if (matchedLine) {
      let end = code.indexOf("\n", i);
      if (end < 0) end = n;
      span("com", code.slice(i, end));
      i = end;
      continue;
    }

    const ch = code[i];
    if ((lang.strings || []).includes(ch)) {
      let j = i + 1;
      while (j < n) {
        if (code[j] === "\\") {
          j += 2;
          continue;
        }
        if (code[j] === ch) {
          j++;
          break;
        }
        if (code[j] === "\n" && ch !== "`") {
          break;
        }
        j++;
      }
      span("str", code.slice(i, Math.min(j, n)));
      i = Math.min(j, n);
      continue;
    }

    if (/[0-9]/.test(ch) || (ch === "#" && langKey === "css")) {
      const m = numberRe.exec(code.slice(i));
      if (m) {
        span("num", m[0]);
        i += m[0].length;
        continue;
      }
    }

    if (/[A-Za-z_$@]/.test(ch)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_$@]/.test(code[j])) j++;
      const word = code.slice(i, j);
      const probe = lang.caseInsensitive ? word.toLowerCase() : word;
      if (keywords.has(probe)) span("key", word);
      else if (literals.has(probe)) span("num", word);
      else plain += word;
      i = j;
      continue;
    }

    if (/[{}()[\].,;:=+\-*/%<>!&|?^~]/.test(ch)) {
      span("punct", ch);
      i++;
      continue;
    }

    plain += ch;
    i++;
    void rest;
  }
  flush();
  return { html: out, language: langKey, skipped: false };
}

/** Split message text into prose and fenced code segments. */
export function splitFences(text) {
  const parts = [];
  const re = /```([^\n`]*)\n?([\s\S]*?)```/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ kind: "text", text: text.slice(last, m.index) });
    const body = m[2];
    if (body.trim().length === 0) {
      parts.push({ kind: "text", text: m[0] });
    } else {
      parts.push({ kind: "code", lang: m[1].trim(), text: body.replace(/\n$/, "") });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts.length ? parts : [{ kind: "text", text }];
}
