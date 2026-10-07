import test from 'node:test';
import assert from 'node:assert/strict';

import { afterMapclear, applyInstructions, describeErrors, exCommandLine, type VimApi } from '../src/apply.ts';
import { parseConfig } from '../src/parser.ts';

function fakeVim(options: { setOption?: (name: string) => unknown; fail?: string } = {}) {
  const calls: unknown[][] = [];
  const exs = new Map<string, (cm: unknown, params: { argString?: string }) => void>();
  const vim: VimApi = {
    map: (...a) => {
      if (a[0] === options.fail) throw new Error('boom');
      calls.push(['map', ...a]);
    },
    noremap: (...a) => void calls.push(['noremap', ...a]),
    unmap: (...a) => void calls.push(['unmap', ...a]),
    mapclear: (...a) => void calls.push(['mapclear', ...a]),
    defineEx: (name, prefix, fn) => {
      calls.push(['defineEx', name, prefix]);
      exs.set(name, fn);
    },
    handleEx: (_cm, command) => void calls.push(['handleEx', command]),
    setOption: (name) => options.setOption?.(name),
  };
  return { vim, calls, exs };
}

test('maps go to map or noremap with their context', () => {
  const { vim, calls } = fakeVim();
  const result = applyInstructions(parseConfig('nmap a b\nnnoremap c d\nmap e f').instructions, vim);
  assert.deepEqual(calls, [
    ['map', 'a', 'b', 'normal'],
    ['noremap', 'c', 'd', 'normal'],
    ['map', 'e', 'f', undefined],
  ]);
  assert.equal(result.applied, 3);
  assert.equal(result.mapped.length, 3);
});

test('mapclear forgets the mappings made before it', () => {
  const { vim } = fakeVim();
  const result = applyInstructions(parseConfig('nmap a b\nmapclear\nnmap c d').instructions, vim);
  assert.deepEqual(result.mapped, [{ lhs: 'c', ctx: 'normal' }]);
});

test('exmap defines an ex command that forwards its arguments', () => {
  const { vim, calls, exs } = fakeVim();
  applyInstructions(parseConfig('exmap fold obcommand editor:toggle-fold').instructions, vim);
  assert.deepEqual(calls[0], ['defineEx', 'fold', '']);
  exs.get('fold')?.({}, { argString: ' ' });
  assert.deepEqual(calls[1], ['handleEx', 'obcommand editor:toggle-fold']);
  assert.equal(exCommandLine('echo', ' hi '), 'echo hi');
});

test('set clipboard is reported, other options go to the engine', () => {
  const seen: string[] = [];
  const { vim } = fakeVim({ setOption: (n) => (seen.push(n), n === 'bogus' ? new Error('Unknown option: bogus') : undefined) });
  const result = applyInstructions(parseConfig('set clipboard=unnamed\nset ts=2 bogus').instructions, vim);
  assert.equal(result.sharedClipboard, true);
  assert.deepEqual(seen, ['ts', 'bogus']);
  assert.deepEqual(result.errors, [{ line: 2, message: 'Unknown option: bogus' }]);
});

test('a throwing line is reported and the rest still applies', () => {
  const { vim, calls } = fakeVim({ fail: 'bad' });
  const result = applyInstructions(parseConfig('nmap ok 1\nnmap bad 2\nnmap fine 3').instructions.map((i) => i), vim);
  assert.equal(result.applied, 2);
  assert.equal(calls.length, 2);
  assert.deepEqual(result.errors.map((e) => e.line), [2]);
});

test('describeErrors truncates', () => {
  const errors = Array.from({ length: 7 }, (_, i) => ({ line: i + 1, message: 'x' }));
  assert.equal(describeErrors(errors, 2), 'line 1: x\nline 2: x\n... and 5 more');
});

test('a space leader takes the built-in <Space> out of the way, once', () => {
  const { vim, calls } = fakeVim();
  const result = applyInstructions(parseConfig('let mapleader = " "\nnmap <Leader>a b\nnmap <Leader>c d').instructions, vim);
  assert.equal(result.removedSpaceMotion, true);
  assert.deepEqual(calls.filter((c) => c[0] === 'unmap'), [['unmap', '<Space>']]);
});

test('other leaders leave <Space> alone', () => {
  const { vim, calls } = fakeVim();
  const result = applyInstructions(parseConfig('let mapleader = ","\nnmap <Leader>a b').instructions, vim);
  assert.equal(result.removedSpaceMotion, false);
  assert.equal(calls.some((c) => c[0] === 'unmap'), false);
});

test('an explicit unmap <Space> is remembered so a reload can restore it', () => {
  const { vim } = fakeVim();
  assert.equal(applyInstructions(parseConfig('nunmap <Space>').instructions, vim).removedSpaceMotion, true);
});

test('unmap forgets the mapping so a reload cannot unmap a built-in key', () => {
  const { vim } = fakeVim();
  const result = applyInstructions(parseConfig('map j gj\nunmap j\nnmap k gk\nnunmap k').instructions, vim);
  assert.deepEqual(result.mapped, []);
});

test('a mode mapclear keeps the other modes', () => {
  const mapped = [{ lhs: 'a', ctx: 'normal' as const }, { lhs: 'b', ctx: 'insert' as const }, { lhs: 'c' }];
  assert.deepEqual(afterMapclear(mapped, 'normal'), [
    { lhs: 'b', ctx: 'insert' },
    { lhs: 'c', ctx: 'insert' },
    { lhs: 'c', ctx: 'visual' },
  ]);
  assert.deepEqual(afterMapclear(mapped), []);
});
