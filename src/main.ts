import { Plugin, Editor, MarkdownView, MarkdownFileInfo } from 'obsidian';
import {
	AideSettings,
	DEFAULT_SETTINGS,
	AideSettingTab,
	type TriggerChar,
} from './settings';
import { AidePopup, createAIExtension } from './popup';

export default class AidePlugin extends Plugin {
	settings!: AideSettings;
	triggerChar: TriggerChar = '/';
	private popup: AidePopup | null = null;

	async onload() {
		await this.loadSettings();

		this.registerEditorExtension(createAIExtension(this));

		this.addCommand({
			id: 'show-aide',
			name: 'Show Aide',
			editorCallback: (editor: Editor, _ctx: MarkdownView | MarkdownFileInfo) => {
				this.showPopup(editor);
			},
		});

		this.addSettingTab(new AideSettingTab(this.app, this));
	}

	onunload() {
		this.popup?.close();
	}

	showPopup(editor: Editor) {
		if (this.popup) {
			this.popup.close();
		}
		this.popup = new AidePopup(this, editor);
		this.popup.open();
	}

	async loadSettings() {
		const data = (await this.loadData()) as Partial<AideSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});
		this.triggerChar = this.settings.triggerChar;
	}

	async saveSettings() {
		await this.saveData(this.settings);
		this.triggerChar = this.settings.triggerChar;
	}
}
