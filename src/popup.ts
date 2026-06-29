import { EditorView } from '@codemirror/view';
import { type App, Editor, MarkdownView } from 'obsidian';
import type AidePlugin from './main';
import {
	type AIAction,
	type ProgressCallback,
	type TokenCallback,
	executeAction,
	getActionCategories,
	getActionLabel,
} from './ai-service';

interface EditorWithCM extends Editor {
	cm?: EditorView;
}

function getApp(): App | null {
	return (window as unknown as Record<string, unknown>).app as App | null;
}

function getEditorView(editor: Editor): EditorView | null {
	const ed = editor as EditorWithCM;
	return ed.cm ?? null;
}

export function createAIExtension(plugin: AidePlugin) {
	return EditorView.domEventHandlers({
		keydown: (e: KeyboardEvent, view: EditorView) => {
			if (e.key !== plugin.triggerChar) return false;
			if (e.ctrlKey || e.metaKey || e.altKey) return false;

			const pos = view.state.selection.main.head;
			const line = view.state.doc.lineAt(pos);
			const beforeCursor = line.text.slice(0, pos - line.from);

			if (beforeCursor.trim().length === 0 || beforeCursor.endsWith(' ')) {
				e.preventDefault();
				const app = getApp();
				if (!app) return true;

				const markdownView = app.workspace.getActiveViewOfType(MarkdownView);
				if (!markdownView) return true;

				const editor = markdownView.editor;
				const cm = getEditorView(editor);
				if (cm && cm === view) {
					plugin.showPopup(editor);
				}
				return true;
			}
			return false;
		},
	});
}

export class AidePopup {
	private plugin: AidePlugin;
	private editor: Editor;
	private containerEl: HTMLElement;
	private isOpen = false;
	private clickOutsideHandler: ((e: MouseEvent) => void) | null = null;
	private inputEl: HTMLTextAreaElement | null = null;
	private statusEl: HTMLElement | null = null;
	private streamContentEl: HTMLElement | null = null;
	private actionsEl: HTMLElement | null = null;
	private moreArrowEl: HTMLElement | null = null;
	private cancelled = false;
	private isActionsOpen = false;

	constructor(plugin: AidePlugin, editor: Editor) {
		this.plugin = plugin;
		this.editor = editor;
		this.containerEl = createDiv({ cls: 'aide-popup' });
		this.clickOutsideHandler = this.handleClickOutside.bind(this);
	}

	open() {
		if (this.isOpen) return;
		this.isOpen = true;
		this.cancelled = false;

		this.render();
		this.position();
		activeDocument.body.appendChild(this.containerEl);

		if (this.clickOutsideHandler) {
			activeDocument.addEventListener('click', this.clickOutsideHandler, true);
		}

		this.focus();
	}

	close() {
		if (!this.isOpen) return;
		this.isOpen = false;

		if (this.clickOutsideHandler) {
			activeDocument.removeEventListener('click', this.clickOutsideHandler, true);
		}

		this.containerEl.detach();
		this.editor.focus();
	}

	private handleClickOutside(e: MouseEvent) {
		if (!this.containerEl.contains(e.target as Node)) {
			this.close();
		}
	}

	private toggleActions() {
		this.isActionsOpen = !this.isActionsOpen;
		if (this.actionsEl) {
			this.actionsEl.classList.toggle('is-open', this.isActionsOpen);
		}
		if (this.moreArrowEl) {
			this.moreArrowEl.classList.toggle('is-open', this.isActionsOpen);
		}
	}

	private render() {
		this.containerEl.empty();
		this.containerEl.removeClass('aide-loading');
		this.containerEl.removeClass('aide-error');

		const header = this.containerEl.createDiv({ cls: 'aide-popup-header' });
		header.setText('Aide');

		const inputRow = this.containerEl.createDiv({ cls: 'aide-input-row' });
		this.inputEl = inputRow.createEl('textarea', {
			cls: 'aide-main-input',
			attr: {
				placeholder: 'Ask AI anything...',
				'aria-label': 'Ask AI anything',
				rows: '1',
			},
		});

		const autoResize = () => {
			if (!this.inputEl) return;
			this.inputEl.classList.add('aide-auto-resize');
			this.inputEl.style.height = `${this.inputEl.scrollHeight}px`;
		};
		this.inputEl.addEventListener('input', autoResize);

		const sendBtn = inputRow.createEl('button', {
			cls: 'aide-send-btn',
			attr: { 'aria-label': 'Send' },
		});
		const ns = 'http://www.w3.org/2000/svg';
		const sendSvg = activeDocument.createElementNS(ns, 'svg');
		sendSvg.setAttribute('width', '14');
		sendSvg.setAttribute('height', '14');
		sendSvg.setAttribute('viewBox', '0 0 24 24');
		sendSvg.setAttribute('fill', 'none');
		sendSvg.setAttribute('stroke', 'currentColor');
		sendSvg.setAttribute('stroke-width', '2');
		sendSvg.setAttribute('stroke-linecap', 'round');
		sendSvg.setAttribute('stroke-linejoin', 'round');
		const p1 = activeDocument.createElementNS(ns, 'path');
		p1.setAttribute('d', 'M22 2L11 13');
		sendSvg.appendChild(p1);
		const p2 = activeDocument.createElementNS(ns, 'path');
		p2.setAttribute('d', 'M22 2l-7 20-4-9-9-4 20-7z');
		sendSvg.appendChild(p2);
		sendBtn.appendChild(sendSvg);

		const executeCustom = () => {
			if (!this.inputEl) return;
			const prompt = this.inputEl.value.trim();
			if (prompt) {
				void this.execute('custom', prompt);
			}
		};

		this.inputEl.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' && !e.shiftKey) {
				e.preventDefault();
				executeCustom();
			}
			if (e.key === 'Escape') {
				this.close();
			}
		});
		sendBtn.addEventListener('click', executeCustom);

		this.statusEl = this.containerEl.createDiv({ cls: 'aide-status-panel' });
		this.statusEl.hidden = true;

		this.streamContentEl = this.containerEl.createDiv({ cls: 'aide-stream' });
		this.streamContentEl.hidden = true;

		const moreBtn = this.containerEl.createEl('button', {
			cls: 'aide-more-btn',
			attr: { 'aria-label': 'More actions' },
		});
		this.moreArrowEl = moreBtn.createSpan({ cls: 'aide-more-arrow', text: '▸' });
		moreBtn.createSpan({ text: ' More' });
		moreBtn.addEventListener('click', () => this.toggleActions());
		moreBtn.addEventListener('keydown', (e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				this.toggleActions();
			}
		});

		this.actionsEl = this.containerEl.createDiv({ cls: 'aide-actions' });
		const categories = getActionCategories();

		for (const category of categories) {
			const group = this.actionsEl.createDiv({ cls: 'aide-category' });
			group.createDiv({ cls: 'aide-category-label', text: category.label });

			for (const action of category.actions) {
				const btn = group.createEl('button', {
					cls: 'aide-action-btn',
					attr: {
						'aria-label': getActionLabel(action),
						'data-action': action,
					},
				});
				btn.setText(getActionLabel(action));
				btn.addEventListener('click', () => {
					void this.execute(action);
				});
				btn.addEventListener('keydown', (e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						void this.execute(action);
					}
				});
			}
		}

		this.containerEl.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				this.close();
			}
		});
	}

	private position() {
		const cursor = this.editor.getCursor('head');
		let pos: { left: number; top: number } | null = null;

		try {
			const cm = getEditorView(this.editor);
			if (cm?.coordsAtPos) {
				const offset = this.editor.posToOffset(cursor);
				const coords = cm.coordsAtPos(offset);
				if (coords) {
					pos = { left: coords.left, top: coords.bottom ?? coords.top };
				}
			}
		} catch {
			pos = null;
		}

		if (!pos) {
			this.containerEl.addClass('aide-centered');
			return;
		}

		this.containerEl.addClass('aide-positioned');
		this.containerEl.style.left = `${Math.min(pos.left, window.innerWidth - 400)}px`;
		this.containerEl.style.top = `${Math.min(pos.top + 24, window.innerHeight - 400)}px`;
	}

	private focus() {
		window.setTimeout(() => {
			if (this.inputEl) {
				this.inputEl.focus();
			}
		}, 50);
	}

	private showStatus() {
		if (!this.statusEl) return;
		this.statusEl.hidden = false;
		this.statusEl.empty();
		this.statusEl.removeClass('aide-status-panel-done');

		const statusContent = this.statusEl.createDiv({ cls: 'aide-status-content' });
		statusContent.createDiv({ cls: 'aide-status-spinner' });
		const textEl = statusContent.createDiv({ cls: 'aide-status-text' });
		textEl.setText('AI is thinking...');

		const cancelBtn = this.statusEl.createEl('button', {
			cls: 'aide-cancel-btn',
			attr: { 'aria-label': 'Cancel' },
		});
		cancelBtn.setText('Cancel');
		cancelBtn.addEventListener('click', () => {
			this.cancelled = true;
			this.close();
		});

		return textEl;
	}

	private updateStatus(text: string) {
		if (!this.statusEl || this.statusEl.hidden) return;
		const textEl = this.statusEl.querySelector('.aide-status-text');
		if (textEl) {
			textEl.setText(text);
		}
	}

	private showStreamPanel() {
		if (this.streamContentEl) {
			this.streamContentEl.hidden = false;
			this.streamContentEl.empty();

			this.streamContentEl.createDiv({ cls: 'aide-stream-header', text: 'Generating...' });
			this.streamContentEl.createDiv({ cls: 'aide-stream-content' });
		}
	}

	private appendToken(text: string) {
		if (!this.streamContentEl) return;
		if (this.streamContentEl.hidden) {
			this.showStreamPanel();
		}
		if (this.statusEl) {
			this.statusEl.hidden = true;
		}
		const content = this.streamContentEl.querySelector('.aide-stream-content');
		if (content) {
			const el = content as HTMLElement;
			el.setText(el.textContent + text);
			el.scrollTop = el.scrollHeight;
		}
	}

	private async execute(action: AIAction, customPrompt?: string) {
		this.showStatus();
		this.containerEl.addClass('aide-loading');

		const onProgress: ProgressCallback = (status: string) => {
			this.updateStatus(status);
		};

		const onToken: TokenCallback = (text: string) => {
			this.appendToken(text);
		};

		try {
			const selectedText = this.getContextText();
			const result = await executeAction(
				this.plugin,
				action,
				selectedText,
				customPrompt,
				onProgress,
				onToken,
			);

			if (this.cancelled) return;

			this.replaceText(result, selectedText);
			this.close();
		} catch (err) {
			if (this.cancelled) return;
			this.showError(err instanceof Error ? err.message : 'Unknown error');
		}
	}

	private getContextText(): string {
		const selection = this.editor.getSelection();
		if (selection) return selection;

		const cursor = this.editor.getCursor();
		const line = this.editor.getLine(cursor.line);
		return line;
	}

	private replaceText(result: string, originalText: string) {
		const selection = this.editor.getSelection();
		if (selection) {
			this.editor.replaceSelection(result);
			return;
		}

		const cursor = this.editor.getCursor();
		const line = this.editor.getLine(cursor.line);

		if (line === originalText || line.trim() === originalText.trim()) {
			this.editor.setLine(cursor.line, result);
		} else {
			this.editor.replaceRange(result, { line: cursor.line, ch: 0 }, {
				line: cursor.line,
				ch: line.length,
			});
		}
	}

	private showError(message: string) {
		this.containerEl.empty();
		this.containerEl.removeClass('aide-loading');
		this.containerEl.addClass('aide-error');

		const icon = this.containerEl.createDiv({ cls: 'aide-error-icon' });
		icon.setText('!');

		const msg = this.containerEl.createDiv({ cls: 'aide-error-msg' });
		msg.setText(message);

		const closeBtn = this.containerEl.createEl('button', {
			cls: 'aide-error-close',
			attr: { 'aria-label': 'Dismiss error' },
		});
		closeBtn.setText('Back');
		closeBtn.addEventListener('click', () => this.close());

		window.setTimeout(() => this.close(), 8000);
	}
}
