import { App, Notice, Plugin, PluginSettingTab, Setting, TFile, type SettingDefinitionItem } from 'obsidian';

import { applyInstructions, describeErrors, TEMPLATE, type VimApi } from './src/apply.ts';
import { parseConfig, type MapContext } from './src/parser.ts';

interface VimConfigSettings {
  path: string;
}

/** The file name Vimrc Support reads, so an existing file works as it is. It is a name in the vault root, not the config folder. */
const VIMRC_NAME = ['', 'obsidian', 'vimrc'].join('.');

const DEFAULT_SETTINGS: VimConfigSettings = { path: VIMRC_NAME };

/** The register controller of the vim engine: only what the clipboard sharing touches. */
interface RegisterController {
  pushText: (this: RegisterController, register: string | undefined, operator: string, text: string, linewise?: boolean, blockwise?: boolean) => void;
  getRegister(name?: string): { toString(): string; setText(text: string, linewise?: boolean, blockwise?: boolean): void };
}

interface VimEngine extends VimApi {
  getRegisterController(): RegisterController;
  /** Adds a built-in command back; used to give <Space> its meaning again after a reload. */
  _mapCommand?: (command: Record<string, unknown>) => void;
}

/** The engine's own definition of <Space>, as it ships it. */
const SPACE_MOTION = { keys: '<Space>', type: 'motion', motion: 'moveByCharacters', motionArgs: { forward: true } };

interface CommandsInternals {
  commands: { executeCommandById(id: string): boolean; findCommand(id: string): unknown };
}

function getVim(): VimEngine | null {
  const adapter = (window as unknown as { CodeMirrorAdapter?: { Vim?: VimEngine } }).CodeMirrorAdapter;
  return adapter?.Vim ?? null;
}

export default class VimConfigPlugin extends Plugin {
  settings: VimConfigSettings = { ...DEFAULT_SETTINGS };
  /** What the last load did, for the settings page. */
  status = 'Not loaded yet.';

  private mapped: { lhs: string; ctx?: MapContext }[] = [];
  private pending = false;
  private lastMtime = 0;
  private obcommandDefined = false;
  private restoreClipboard: (() => void) | null = null;
  private removedSpaceMotion = false;

  async onload() {
    const data = (await this.loadData()) as Partial<VimConfigSettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...data };
    this.addSettingTab(new VimConfigSettingTab(this.app, this));

    this.addCommand({
      id: 'reload',
      name: 'Reload config file',
      icon: 'refresh-cw',
      callback: () => void this.loadConfig(true),
    });
    this.addCommand({
      id: 'open',
      name: 'Open config file',
      icon: 'file-cog',
      callback: () => void this.openConfig(),
    });

    this.app.workspace.onLayoutReady(() => {
      void this.loadConfig(false);
      this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.retryPending()));
      this.registerEvent(
        this.app.vault.on('modify', (file) => {
          if (file.path === this.settings.path) void this.loadConfig(false);
        }),
      );
      this.registerDomEvent(window, 'focus', () => {
        void this.reloadIfChanged();
        this.pullClipboard();
      });
      this.registerDomEvent(activeDocument, 'copy', () => window.setTimeout(() => this.pullClipboard(), 0));
      this.registerDomEvent(activeDocument, 'cut', () => window.setTimeout(() => this.pullClipboard(), 0));
    });
  }

  onunload() {
    this.unmapAll();
    this.setClipboardShared(false);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  private retryPending() {
    if (this.pending) void this.loadConfig(false);
  }

  private async reloadIfChanged() {
    const stat = await this.app.vault.adapter.stat(this.settings.path);
    if (stat && stat.mtime !== this.lastMtime) await this.loadConfig(false);
  }

  /** Reads the file and gives its mappings to the vim engine, replacing the ones from the last load. */
  async loadConfig(announce: boolean) {
    const path = this.settings.path.trim();
    const adapter = this.app.vault.adapter;
    if (!path || !(await adapter.exists(path))) {
      this.unmapAll();
      this.setClipboardShared(false);
      this.pending = false;
      this.status = path ? `No file at "${path}".` : 'No file set.';
      if (announce) new Notice(`Vim config: ${this.status}`);
      return;
    }
    const vim = getVim();
    if (!vim) {
      // The engine appears with the first editor; try again when the active tab changes.
      this.pending = true;
      this.status = 'Waiting for vim mode to start.';
      if (announce) new Notice('Vim config: vim mode is not running yet. Turn it on in the editor settings, then reload.');
      return;
    }
    this.pending = false;

    const text = await adapter.read(path);
    this.lastMtime = (await adapter.stat(path))?.mtime ?? 0;
    this.defineObcommand(vim);
    this.unmapAll();

    const parsed = parseConfig(text);
    const result = applyInstructions(parsed.instructions, vim);
    this.mapped = result.mapped;
    this.removedSpaceMotion = result.removedSpaceMotion;
    this.setClipboardShared(result.sharedClipboard);

    const errors = [...parsed.errors, ...result.errors].sort((a, b) => a.line - b.line);
    this.status =
      errors.length === 0
        ? `Loaded ${result.applied} ${result.applied === 1 ? 'line' : 'lines'} from "${path}".`
        : `Loaded ${result.applied} lines from "${path}"; ${errors.length} could not be used. ${describeErrors(errors, 20).replace(/\n/g, '; ')}`;
    if (errors.length > 0) new Notice(`Vim config: ${errors.length} problem${errors.length === 1 ? '' : 's'} in ${path}\n${describeErrors(errors)}`, 10000);
    else if (announce) new Notice(`Vim config: ${this.status}`);
  }

  /** Takes out the mappings the last load added, leaving the ones other plugins or Obsidian added. */
  private unmapAll() {
    const vim = getVim();
    if (vim) {
      for (const { lhs, ctx } of this.mapped) vim.unmap(lhs, ctx);
      if (this.removedSpaceMotion) vim._mapCommand?.(SPACE_MOTION);
    }
    this.removedSpaceMotion = false;
    this.mapped = [];
  }

  /** `:obcommand <id>` runs an Obsidian command from the vim prompt or from a mapping. */
  private defineObcommand(vim: VimEngine) {
    if (this.obcommandDefined) return;
    this.obcommandDefined = true;
    const commands = (this.app as unknown as CommandsInternals).commands;
    vim.defineEx('obcommand', '', (_cm, params) => {
      const id = (params.argString ?? '').trim();
      if (!id) new Notice('Vim config: obcommand needs a command ID, for example :obcommand editor:toggle-bold');
      else if (!commands.findCommand(id)) new Notice(`Vim config: no command "${id}"`);
      else commands.executeCommandById(id);
    });
  }

  /** Makes yanks and deletes land on the system clipboard, and keeps the unnamed register in step with it. */
  private setClipboardShared(on: boolean) {
    this.restoreClipboard?.();
    this.restoreClipboard = null;
    const vim = getVim();
    if (!on || !vim) return;
    const controller = vim.getRegisterController();
    const original: RegisterController['pushText'] = controller.pushText;
    controller.pushText = function (this: RegisterController, register, operator, text, linewise, blockwise) {
      original.call(this, register, operator, text, linewise, blockwise);
      if (!register && text) void navigator.clipboard.writeText(text).catch(() => undefined);
    };
    const wrapper = controller.pushText;
    this.restoreClipboard = () => {
      // Leave it alone if another plugin wrapped ours since.
      if (controller.pushText === wrapper) controller.pushText = original;
    };
    this.pullClipboard();
  }

  private pullClipboard() {
    const vim = getVim();
    if (!this.restoreClipboard || !vim) return;
    void navigator.clipboard
      .readText()
      .then((text) => {
        const register = vim.getRegisterController().getRegister();
        if (text && text !== register.toString()) register.setText(text, text.endsWith('\n'));
      })
      .catch(() => undefined);
  }

  /** Opens the config in the editor when it is a note; a dotfile is hidden from the vault, so it can only be created. */
  async openConfig() {
    const path = this.settings.path.trim();
    const adapter = this.app.vault.adapter;
    if (path && !(await adapter.exists(path))) {
      await adapter.write(path, TEMPLATE);
      new Notice(`Vim config: created "${path}" with a few examples.`);
      await this.loadConfig(false);
    }
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) await this.app.workspace.getLeaf(false).openFile(file);
    else new Notice(`Vim config: "${path}" is a hidden file, so Obsidian cannot open it. Edit it in another editor, or name it vimrc.md to edit it here.`, 8000);
  }
}

const TEXT = {
  path: {
    name: 'Config file',
    desc: 'Path of the file in your vault, read when vim mode starts and whenever the file changes. A name ending in .md can be edited here; the default also works with a Vimrc Support file.',
  },
  actions: { name: 'Config file actions', desc: 'Reload the file, or create it with a few examples if it does not exist yet.' },
  status: { name: 'Last load', desc: '' },
};

class VimConfigSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private plugin: VimConfigPlugin,
  ) {
    super(app, plugin);
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      { ...TEXT.path, control: { type: 'text', key: 'path', defaultValue: DEFAULT_SETTINGS.path, placeholder: DEFAULT_SETTINGS.path } },
      { ...TEXT.actions, searchable: false, render: (setting: Setting) => this.actionButtons(setting) },
      { ...TEXT.status, searchable: false, render: (setting: Setting) => this.statusLine(setting) },
    ];
  }

  getControlValue(key: string): unknown {
    return (this.plugin.settings as unknown as Record<string, unknown>)[key];
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    Object.assign(this.plugin.settings, { [key]: value });
    await this.plugin.saveSettings();
    await this.plugin.loadConfig(false);
  }

  private actionButtons(setting: Setting) {
    setting
      .addButton((b) => b.setButtonText('Reload').onClick(() => void this.plugin.loadConfig(true)))
      .addButton((b) => b.setButtonText('Create or open').onClick(() => void this.plugin.openConfig()));
  }

  private statusLine(setting: Setting) {
    setting.setDesc(this.plugin.status);
  }

  /** The pre-1.13 rendering, from the same text. Obsidian skips it once `getSettingDefinitions()` returns anything. */
  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl)
      .setName(TEXT.path.name)
      .setDesc(TEXT.path.desc)
      .addText((t) => t.setPlaceholder(DEFAULT_SETTINGS.path).setValue(this.plugin.settings.path).onChange((v) => this.setControlValue('path', v)));
    this.actionButtons(new Setting(containerEl).setName(TEXT.actions.name).setDesc(TEXT.actions.desc));
    this.statusLine(new Setting(containerEl).setName(TEXT.status.name));
  }
}
