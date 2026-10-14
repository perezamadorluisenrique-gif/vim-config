# Changelog

The release workflow uses the section named after the version being released
as the release description, so every version needs one. `npm version <x.y.z>`
renames the `Unreleased` heading below to that version.

## 0.1.1

- On Obsidian 1.3 and earlier, `noremap` lines whose right side is more than one command, such as `nnoremap <Leader>d dd`, now work. That version's vim mode silently ignored them. Mappings to an ex command, such as `nmap <Leader>c :check<CR>`, run there too.

## 0.1.0

- First release: reads a vimrc-style file from the vault and applies its `map`, `noremap`, `unmap`, `mapclear`, `exmap`, `obcommand`, `set` and `let mapleader` lines to vim mode; reloads when the file changes; reports mistakes per line.
