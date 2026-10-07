import { clipboardShared, shadowedBySpace, type Instruction, type LineError, type MapContext } from './parser.ts';

/** The part of the vim engine's API this plugin calls. */
export interface VimApi {
  map(lhs: string, rhs: string, ctx?: MapContext): void;
  noremap(lhs: string, rhs: string, ctx?: MapContext): void;
  unmap(lhs: string, ctx?: MapContext): unknown;
  mapclear(ctx?: MapContext): void;
  defineEx(name: string, prefix: string, fn: (cm: unknown, params: { argString?: string }) => void): void;
  handleEx(cm: unknown, command: string): void;
  setOption(name: string, value: string | boolean): unknown;
}

export interface ApplyResult {
  applied: number;
  errors: LineError[];
  /** Mappings this run added, so a reload can take them out again without a `mapclear`. */
  mapped: { lhs: string; ctx?: MapContext }[];
  /** Whether the file asked for the unnamed register to follow the system clipboard. */
  sharedClipboard: boolean;
  /** Whether the engine's own `<Space>` (move right) was taken out so mappings that start with it can fire. */
  removedSpaceMotion: boolean;
}

/** The command typed after an `exmap`, with whatever arguments the ex command received. */
export function exCommandLine(rhs: string, argString: string | undefined): string {
  const args = (argString ?? '').trim();
  return args ? `${rhs} ${args}` : rhs;
}

const ALL_CONTEXTS: MapContext[] = ['normal', 'insert', 'visual'];

/** What the engine keeps after `mapclear`: a mode clears only itself, and a mapping for every mode becomes one per remaining mode. */
export function afterMapclear(mapped: ApplyResult['mapped'], ctx?: MapContext): ApplyResult['mapped'] {
  if (!ctx) return [];
  const out: ApplyResult['mapped'] = [];
  for (const m of mapped) {
    if (m.ctx === ctx) continue;
    if (m.ctx) out.push(m);
    else for (const c of ALL_CONTEXTS) if (c !== ctx) out.push({ lhs: m.lhs, ctx: c });
  }
  return out;
}

export function applyInstructions(instructions: Instruction[], vim: VimApi): ApplyResult {
  const result: ApplyResult = { applied: 0, errors: [], mapped: [], sharedClipboard: false, removedSpaceMotion: false };
  // The engine answers a lone <Space> before it waits for the rest of a longer mapping, so a space
  // leader needs the default key out of the way. Vimrc Support asks for `unmap <Space>`; do it here.
  if (instructions.some((i) => i.kind === 'map' && shadowedBySpace(i.lhs))) {
    vim.unmap('<Space>');
    result.removedSpaceMotion = true;
  }
  for (const instruction of instructions) {
    try {
      switch (instruction.kind) {
        case 'map':
          if (instruction.remap) vim.map(instruction.lhs, instruction.rhs, instruction.ctx);
          else vim.noremap(instruction.lhs, instruction.rhs, instruction.ctx);
          result.mapped.push({ lhs: instruction.lhs, ctx: instruction.ctx });
          break;
        case 'unmap':
          vim.unmap(instruction.lhs, instruction.ctx);
          // The engine removes the first match, which may be a built-in key: forget ours so a reload never unmaps it.
          result.mapped = result.mapped.filter((m) => !(m.lhs === instruction.lhs && (!instruction.ctx || m.ctx === instruction.ctx)));
          if (instruction.lhs === '<Space>') result.removedSpaceMotion = true;
          break;
        case 'mapclear':
          vim.mapclear(instruction.ctx);
          result.mapped = afterMapclear(result.mapped, instruction.ctx);
          break;
        case 'exmap':
          vim.defineEx(instruction.name, '', (cm, params) => vim.handleEx(cm, exCommandLine(instruction.rhs, params.argString)));
          break;
        case 'set':
          if (instruction.name === 'clipboard') {
            result.sharedClipboard = clipboardShared(instruction.value);
          } else {
            const outcome = vim.setOption(instruction.name, instruction.value);
            if (outcome instanceof Error) {
              result.errors.push({ line: instruction.line, message: outcome.message });
              continue;
            }
          }
          break;
      }
      result.applied++;
    } catch (error) {
      result.errors.push({ line: instruction.line, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return result;
}

export function describeErrors(errors: LineError[], limit = 5): string {
  const lines = errors.slice(0, limit).map((e) => `line ${e.line}: ${e.message}`);
  if (errors.length > limit) lines.push(`... and ${errors.length - limit} more`);
  return lines.join('\n');
}

export const TEMPLATE = `" Vim Config: this file is read when vim mode starts and when you run
" "Reload config file". Lines starting with a double quote are comments.

" Use space as the leader key.
let mapleader = " "

" Move by screen line, like most editors.
nnoremap j gj
nnoremap k gk

" Run an Obsidian command: first name it, then map keys to the name.
" A command id is shown when you hover a command in Settings -> Hotkeys.
exmap togglefold obcommand editor:toggle-fold
nmap <Leader>z :togglefold<CR>

" Share the unnamed register with the system clipboard.
" set clipboard=unnamed
`;
