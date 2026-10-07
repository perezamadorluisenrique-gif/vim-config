// Pure logic: no `obsidian` import, so tests/ can run it under plain Node.

/** The contexts the vim engine understands. `undefined` means all of them. */
export type MapContext = 'normal' | 'insert' | 'visual';

export type Instruction =
  | { kind: 'map'; line: number; ctx?: MapContext; lhs: string; rhs: string; remap: boolean }
  | { kind: 'unmap'; line: number; ctx?: MapContext; lhs: string }
  | { kind: 'mapclear'; line: number; ctx?: MapContext }
  | { kind: 'exmap'; line: number; name: string; rhs: string }
  | { kind: 'set'; line: number; name: string; value: string | boolean }
  | { kind: 'ex'; line: number; command: string };

export interface LineError {
  line: number;
  message: string;
}

export interface ParseResult {
  instructions: Instruction[];
  errors: LineError[];
}

const PREFIX_CTX: Record<string, MapContext | undefined> = {
  '': undefined,
  n: 'normal',
  i: 'insert',
  v: 'visual',
  x: 'visual',
};

const MAP_RE = /^([nivx]?)(nore)?map$/;
const NOREMAP_RE = /^([nivx]?)noremap$/;
const UNMAP_RE = /^([nivx]?)unmap$/;
const MAPCLEAR_RE = /^([nivx]?)mapclear$/;
const MAP_ALIASES: Record<string, string> = {
  nn: 'nnoremap',
  ino: 'inoremap',
  vn: 'vnoremap',
  xn: 'xnoremap',
  no: 'noremap',
  nm: 'nmap',
  im: 'imap',
  vm: 'vmap',
  xm: 'xmap',
  nun: 'nunmap',
  iu: 'iunmap',
  vu: 'vunmap',
  xu: 'xunmap',
};
/** Mapping commands for modes the engine does not have. */
const UNSUPPORTED_MAP_RE = /^[ocl](nore)?map$|^[ocl]unmap$|^[ocl]mapclear$|^[ocl]n(oremap)?$/;

/** Joins vim's continuation lines (a line starting with `\`) onto the line before. */
export function joinContinuations(text: string): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const continuation = /^\s*\\/.exec(raw);
    const last = out[out.length - 1];
    if (continuation && last) last.text += raw.slice(continuation[0].length);
    else out.push({ text: raw, line: index + 1 });
  });
  return out;
}

/** What vim's `<Leader>` expands to inside a mapping. */
export function leaderKeys(leader: string): string {
  if (leader === ' ') return '<Space>';
  if (leader === '<') return '<lt>';
  return leader;
}

/** Expands `<Leader>` and spells `<Space>` the way the engine reports a typed space. */
export function expandLeader(keys: string, leader: string): string {
  return keys.replace(/<leader>/gi, () => leaderKeys(leader)).replace(/<space>/gi, '<Space>');
}

/** True when a mapping starts with `<Space>` and goes on: the engine's own move-right key would answer first. */
export function shadowedBySpace(lhs: string): boolean {
  return lhs.length > '<Space>'.length && lhs.startsWith('<Space>');
}

function unquote(value: string): string {
  const quoted = /^(["'])(.*)\1$/.exec(value);
  return quoted ? (quoted[2] ?? '') : value;
}

/** Splits `lhs rhs` at the first run of whitespace; the right side keeps its inner spaces. */
function splitArgs(rest: string): [string, string] {
  const match = /^(\S+)\s*(.*)$/.exec(rest);
  return match ? [match[1] ?? '', (match[2] ?? '').trim()] : ['', ''];
}

/** Drops the `<silent>`, `<nowait>`, `<buffer>`, `<expr>` and `<unique>` arguments vim accepts and we ignore. */
function stripMapArguments(rest: string): string {
  let out = rest.replace(/^\s+/, '');
  for (;;) {
    const match = /^<(silent|nowait|buffer|script|unique)>\s*/i.exec(out);
    if (!match) return out;
    out = out.slice(match[0].length);
  }
}

export function parseConfig(text: string): ParseResult {
  const instructions: Instruction[] = [];
  const errors: LineError[] = [];
  let leader = '\\';

  for (const { text: raw, line } of joinContinuations(text)) {
    const source = raw.trim();
    if (source === '' || source.startsWith('"')) continue;
    const match = /^(\S+)\s*(.*)$/.exec(source);
    if (!match) continue;
    const word = (match[1] ?? '').replace(/!$/, '');
    const rest = match[2] ?? '';
    const command = MAP_ALIASES[word] ?? word;

    let m: RegExpExecArray | null;
    if ((m = NOREMAP_RE.exec(command)) || (m = MAP_RE.exec(command))) {
      const remap = !NOREMAP_RE.test(command) && !command.includes('nore');
      const [lhs, rhs] = splitArgs(stripMapArguments(rest));
      if (!lhs || !rhs) {
        errors.push({ line, message: `${command} needs a key and what it does: ${command} <keys> <action>` });
        continue;
      }
      instructions.push({
        kind: 'map',
        line,
        ctx: PREFIX_CTX[m[1] ?? ''],
        lhs: expandLeader(lhs, leader),
        rhs: expandLeader(rhs, leader),
        remap,
      });
    } else if ((m = UNMAP_RE.exec(command))) {
      const [lhs] = splitArgs(stripMapArguments(rest));
      if (!lhs) errors.push({ line, message: `${command} needs the keys to unmap` });
      else instructions.push({ kind: 'unmap', line, ctx: PREFIX_CTX[m[1] ?? ''], lhs: expandLeader(lhs, leader) });
    } else if ((m = MAPCLEAR_RE.exec(command))) {
      instructions.push({ kind: 'mapclear', line, ctx: PREFIX_CTX[m[1] ?? ''] });
    } else if (UNSUPPORTED_MAP_RE.test(command)) {
      errors.push({ line, message: `${command} is not supported: vim mode in Obsidian has no such mode` });
    } else if (command === 'exmap') {
      const [name, rhs] = splitArgs(rest);
      if (!name || !rhs) errors.push({ line, message: 'exmap needs a name and a command: exmap <name> <command>' });
      else instructions.push({ kind: 'exmap', line, name, rhs: rhs.replace(/^:/, '') });
    } else if (command === 'obcommand') {
      instructions.push({ kind: 'ex', line, command: source });
    } else if (command === 'set' || command === 'se') {
      if (!rest) errors.push({ line, message: 'set needs an option' });
      for (const option of rest.split(/\s+/).filter(Boolean)) {
        const eq = option.indexOf('=');
        if (eq > 0) instructions.push({ kind: 'set', line, name: option.slice(0, eq), value: option.slice(eq + 1) });
        else if (option.startsWith('no') && option.length > 2) instructions.push({ kind: 'set', line, name: option.slice(2), value: false });
        else instructions.push({ kind: 'set', line, name: option, value: true });
      }
    } else if (command === 'let') {
      const assignment = /^(?:g:)?(mapleader|maplocalleader)\s*=\s*(.+)$/.exec(rest);
      if (!assignment) errors.push({ line, message: 'only "let mapleader = <key>" is supported' });
      else if (assignment[1] === 'mapleader') leader = unquote((assignment[2] ?? '').trim());
    } else {
      errors.push({ line, message: `unknown command "${word}"` });
    }
  }
  return { instructions, errors };
}

/** True when `set clipboard=` names the unnamed register (`unnamed` or `unnamedplus`). */
export function clipboardShared(value: string | boolean): boolean {
  return typeof value === 'string' && value.split(',').some((v) => v === 'unnamed' || v === 'unnamedplus');
}
