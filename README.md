# Vim Config

Loads a vimrc-style file from your vault so your key mappings and editor commands are ready when vim mode starts.

Obsidian's vim mode has no startup file. With Vim Config you keep your mappings in one file, and they are applied when Obsidian starts and again whenever you save the file. A file written for Vimrc Support works as it is.

## Getting started

1. Turn on vim mode in **Settings → Editor → Vim key bindings**.
2. Run **Open config file**. If the file does not exist yet, it is created with a few examples.
3. Edit it, save it, and the mappings apply. **Reload config file** does it by hand.

The default file is `.obsidian.vimrc` in the root of your vault. A name starting with a dot is hidden from Obsidian's file list, so edit it in another editor, or set **Config file** in the settings to something like `vimrc.md` and edit it inside Obsidian.

## What the file understands

```vim
" Lines starting with a double quote are comments.
let mapleader = " "

nnoremap j gj                 " normal mode, no remapping
inoremap jk <Esc>             " insert mode
vmap <Leader>y "+y            " visual mode, with a leader key
map H ^                       " every mode
nunmap <Space>                " take a key's meaning away
nmapclear                     " drop every normal mode mapping

exmap togglefold obcommand editor:toggle-fold
nmap <Leader>z :togglefold<CR>

set clipboard=unnamed
```

- `map`, `noremap` and their `n`, `i`, `v` and `x` forms; `unmap` and `mapclear` in the same forms. `<silent>`, `<nowait>` and similar arguments are accepted and ignored.
- `let mapleader = "…"`, then `<Leader>` in later lines.
- `exmap <name> <command>` defines your own `:name` command. `obcommand <id>` runs an Obsidian command by its id (shown in **Settings → Hotkeys**), so a mapping can do anything the command palette can.
- `set clipboard=unnamed` (or `unnamedplus`) makes yanks and deletes go to the system clipboard, and pastes use it. The clipboard is read when the window gains focus or after a copy, so text copied in another app is there when you come back to Obsidian.
- Other `set` options are passed to the vim engine, which reports the ones it does not know.
- A line that starts with `\` continues the line before.

Mistakes are reported per line in a notice and in the settings, and the rest of the file still applies.

A space leader works without the extra `unmap <Space>` older setups needed: Vim Config takes the built-in "move right" key out of the way and puts it back when you reload without a space mapping.

## Not included

JavaScript from the config (`jscommand`, `jsfile`), surround mappings, `source`, and mappings for operator-pending and command-line mode. Obsidian's vim engine has no such modes.

## Commands

| Command | What it does |
|---|---|
| Reload config file | Reads the file again and replaces the mappings of the last load, leaving the ones other plugins added. |
| Open config file | Opens the file when it is a note; creates it with examples if it is missing. |

## Installation

In Obsidian, open **Settings → Community plugins → Browse** and search for "Vim Config".

## More plugins by Siulved54

| Plugin | What it does | Source |
| --- | --- | --- |
| [Shared Blocks](https://obsidian.md/plugins?id=shared-blocks) | Write a block of text once and reuse it in any note. Edit the source and every reference re-renders live. | [shared-blocks](https://github.com/perezamadorluisenrique-gif/shared-blocks) |
| [Text Case and Cleanup](https://obsidian.md/plugins?id=text-format) | Change case, make camelCase or slugs, sort lines and remove duplicates, and repair text pasted out of a PDF, without touching code or URLs. | [text-format](https://github.com/perezamadorluisenrique-gif/text-format) |
| [Typography as You Type](https://obsidian.md/plugins?id=typography-as-you-type) | Curly quotes, dashes and ellipses as you type, kept out of code and maths, with Backspace to take one back. | [smart-typography-plugin](https://github.com/perezamadorluisenrique-gif/smart-typography-plugin) |
| [Section Numbering](https://obsidian.md/plugins?id=section-numbering) | Number headings as an outline (1, 1.1, 1.2) and keep every link to them working when they renumber. | [section-numbering](https://github.com/perezamadorluisenrique-gif/section-numbering) |
| [Spreadsheet to Table](https://obsidian.md/plugins?id=spreadsheet-to-table) | Paste cells from Excel or Google Sheets as a Markdown table with a real header, insert CSV files, and copy tables back out. | [spreadsheet-to-table](https://github.com/perezamadorluisenrique-gif/spreadsheet-to-table) |
| [Hybrid Line Numbers](https://obsidian.md/plugins?id=hybrid-line-numbers) | Relative and hybrid line numbers for Vim-style jumps, where a folded section counts as one line. | [hybrid-line-numbers](https://github.com/perezamadorluisenrique-gif/hybrid-line-numbers) |
| [List Item Callouts](https://obsidian.md/plugins?id=list-item-callouts) | Colour a single list item as a callout by starting it with a character such as `&`, `!` or `?`. | [list-item-callouts](https://github.com/perezamadorluisenrique-gif/list-item-callouts) |
| [Folder Counts](https://obsidian.md/plugins?id=folder-counts) | See how many notes or files each folder holds, right in the file explorer, with a vault total and folder exclusions. | [folder-counts](https://github.com/perezamadorluisenrique-gif/folder-counts) |
| [Note Reading Time](https://obsidian.md/plugins?id=note-reading-time) | Reading time of the current note or your selection in the status bar, optionally saved to a property. | [note-reading-time](https://github.com/perezamadorluisenrique-gif/note-reading-time) |
| [Task Rollover](https://obsidian.md/plugins?id=task-rollover) | Roll unfinished tasks from your last daily note into today's when it is created, with a real undo. | [task-rollover](https://github.com/perezamadorluisenrique-gif/task-rollover) |
| [Zoom Into Section](https://obsidian.md/plugins?id=zoom-into-section) | Zoom into a heading or list item to see only it and its contents, with a breadcrumb bar to climb back out. | [zoom-into-section](https://github.com/perezamadorluisenrique-gif/zoom-into-section) |
| [Link Title on Paste](https://obsidian.md/plugins?id=link-title-on-paste) | Paste a web address and get a Markdown link with the page's title, fetched in the background and undone in one step. | [link-title-on-paste](https://github.com/perezamadorluisenrique-gif/link-title-on-paste) |
| [Update Radar](https://obsidian.md/plugins?id=update-radar) | Checks your installed community plugins for updates in the background, shows what changed, and flags the ones that look abandoned. | [community-update-checker](https://github.com/perezamadorluisenrique-gif/community-update-checker) |
| [Dataview to Bases](https://obsidian.md/plugins?id=dataview-to-bases) | Convert Dataview queries into Bases blocks, and see which queries in your vault can be converted. | [dataview-to-bases](https://github.com/perezamadorluisenrique-gif/dataview-to-bases) |
| [Line Editing Commands](https://obsidian.md/plugins?id=line-editing-commands) | Duplicate, join, sort and reverse lines, insert blank lines and jump to a line number, with multi-cursor support. | [line-editing-commands](https://github.com/perezamadorluisenrique-gif/line-editing-commands) |
| [Note Mover Rules](https://obsidian.md/plugins?id=note-mover-rules) | Move notes into folders by ordered rules on tags, properties, titles and paths, with a preview before any bulk move. | [note-mover-rules](https://github.com/perezamadorluisenrique-gif/note-mover-rules) |
| [Tab History](https://obsidian.md/plugins?id=tab-history) | Keeps each tab's back and forward history across restarts, and adds commands to move, maximize and close tabs. | [tab-history](https://github.com/perezamadorluisenrique-gif/tab-history) |
| [URL Cards](https://obsidian.md/plugins?id=url-cards) | Shows web addresses as cards with title, description and image, and reads existing cardlink blocks. | [url-cards](https://github.com/perezamadorluisenrique-gif/url-cards) |

All of them are in the community directory: Settings -> Community plugins ->
Browse, then search for the name.
