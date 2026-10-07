import test from 'node:test';
import assert from 'node:assert/strict';

import { clipboardShared, joinContinuations, parseConfig, shadowedBySpace } from '../src/parser.ts';

test('ignores comments and blank lines', () => {
  const { instructions, errors } = parseConfig('" a comment\n\n   " indented comment\n');
  assert.deepEqual(instructions, []);
  assert.deepEqual(errors, []);
});

test('map family sets context and remap', () => {
  const { instructions } = parseConfig('map a b\nnmap c d\nnnoremap e f\nimap g h\nvnoremap i j\nxmap k l\nnoremap m n');
  assert.deepEqual(
    instructions.map((i) => (i.kind === 'map' ? [i.ctx, i.lhs, i.rhs, i.remap] : null)),
    [
      [undefined, 'a', 'b', true],
      ['normal', 'c', 'd', true],
      ['normal', 'e', 'f', false],
      ['insert', 'g', 'h', true],
      ['visual', 'i', 'j', false],
      ['visual', 'k', 'l', true],
      [undefined, 'm', 'n', false],
    ],
  );
});

test('right side keeps its inner spaces', () => {
  const { instructions } = parseConfig('nmap <C-x> :obcommand editor:toggle-bold<CR>');
  assert.equal(instructions[0]?.kind === 'map' && instructions[0].rhs, ':obcommand editor:toggle-bold<CR>');
});

test('abbreviated and banged commands', () => {
  const { instructions, errors } = parseConfig('nn j gj\nino jk <Esc>\nmap! a b');
  assert.deepEqual(errors, []);
  assert.equal(instructions.length, 3);
  assert.equal(instructions[0]?.kind === 'map' && instructions[0].remap, false);
  assert.equal(instructions[1]?.kind === 'map' && instructions[1].ctx, 'insert');
});

test('map arguments like <silent> are dropped', () => {
  const { instructions } = parseConfig('nnoremap <silent> <nowait> j gj');
  assert.equal(instructions[0]?.kind === 'map' && instructions[0].lhs, 'j');
});

test('mapleader expands in later lines only', () => {
  const { instructions } = parseConfig('nmap <Leader>a x\nlet mapleader = " "\nnmap <leader>b y\nlet g:mapleader=","\nnmap <Leader>c z');
  const lhs = instructions.map((i) => (i.kind === 'map' ? i.lhs : ''));
  assert.deepEqual(lhs, ['\\a', '<Space>b', ',c']);
});

test('unmap and mapclear', () => {
  const { instructions } = parseConfig('nunmap j\nunmap k\nmapclear\nimapclear');
  assert.deepEqual(
    instructions.map((i) => i.kind + ':' + ('ctx' in i ? i.ctx : '')),
    ['unmap:normal', 'unmap:undefined', 'mapclear:undefined', 'mapclear:insert'],
  );
});

test('exmap strips the leading colon', () => {
  const { instructions } = parseConfig('exmap fold obcommand editor:toggle-fold\nexmap w2 :w');
  assert.deepEqual(instructions.map((i) => i.kind === 'exmap' && [i.name, i.rhs]), [
    ['fold', 'obcommand editor:toggle-fold'],
    ['w2', 'w'],
  ]);
});

test('set handles flags, negation and values', () => {
  const { instructions } = parseConfig('set clipboard=unnamed\nset nowrap relativenumber ts=4');
  assert.deepEqual(
    instructions.map((i) => (i.kind === 'set' ? [i.name, i.value] : null)),
    [['clipboard', 'unnamed'], ['wrap', false], ['relativenumber', true], ['ts', '4']],
  );
});

test('errors are per line and do not stop the file', () => {
  const { instructions, errors } = parseConfig('nmap a\nfrobnicate x\nomap a b\nnmap ok yes\nlet foo = 1\nexmap lonely');
  assert.equal(instructions.length, 1);
  assert.deepEqual(errors.map((e) => e.line), [1, 2, 3, 5, 6]);
  assert.match(errors[1]?.message ?? '', /unknown command "frobnicate"/);
  assert.match(errors[2]?.message ?? '', /not supported/);
});

test('continuation lines join and keep the first line number', () => {
  assert.deepEqual(joinContinuations('nmap a\n  \\ b\nnmap c d'), [
    { text: 'nmap a b', line: 1 },
    { text: 'nmap c d', line: 3 },
  ]);
});

test('CRLF files parse', () => {
  assert.equal(parseConfig('nmap a b\r\nnmap c d\r\n').instructions.length, 2);
});

test('clipboardShared', () => {
  assert.equal(clipboardShared('unnamed'), true);
  assert.equal(clipboardShared('unnamedplus,autoselect'), true);
  assert.equal(clipboardShared(''), false);
  assert.equal(clipboardShared(true), false);
});

test('<space> is spelled <Space>, in both sides', () => {
  const { instructions } = parseConfig('nmap <space>w <C-w>x<SPACE>');
  assert.deepEqual(instructions[0]?.kind === 'map' && [instructions[0].lhs, instructions[0].rhs], ['<Space>w', '<C-w>x<Space>']);
});

test('shadowedBySpace', () => {
  assert.equal(shadowedBySpace('<Space>d'), true);
  assert.equal(shadowedBySpace('<Space>'), false);
  assert.equal(shadowedBySpace('d<Space>'), false);
});
