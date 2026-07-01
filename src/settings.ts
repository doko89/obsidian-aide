import { App, PluginSettingTab, Setting } from 'obsidian';
import type AidePlugin from './main';

export type TriggerChar = '/' | '\\';

export type SearchProvider = 'google' | 'brave' | 'custom';
export type ReasoningEffort = 'off' | 'low' | 'medium' | 'high';

export interface AideSettings {
	apiBaseUrl: string;
	apiKey: string;
	model: string;
	maxTokens: number;
	temperature: number;
	systemPrompt: string;
	triggerChar: TriggerChar;
	enableWebSearch: boolean;
	searchProvider: SearchProvider;
	googleApiKey: string;
	googleCx: string;
	braveApiKey: string;
	customSearchUrl: string;
	customSearchApiKey: string;
	maxSearchResults: number;
	maxFetchLength: number;
	maxToolRounds: number;
	svgAssetsFolder: string;
	reasoningEffort: ReasoningEffort;
}

export const DEFAULT_SETTINGS: AideSettings = {
	apiBaseUrl: 'https://api.openai.com/v1',
	apiKey: '',
	model: 'gpt-4o-mini',
	maxTokens: 65536,
	temperature: 0.7,
	systemPrompt: 'You are a helpful writing assistant. Respond with only the requested content, no extra commentary. Use the web_search and web_fetch tools when you need current information. Use the generate_svg tool when the user asks for diagrams, charts, illustrations, or any visual content — it will save an SVG file and return a markdown image link to insert in the note.',
	triggerChar: '/',
	enableWebSearch: false,
	searchProvider: 'google',
	googleApiKey: '',
	googleCx: '',
	braveApiKey: '',
	customSearchUrl: '',
	customSearchApiKey: '',
	maxSearchResults: 5,
	maxFetchLength: 8000,
	maxToolRounds: 5,
	svgAssetsFolder: 'assets',
	reasoningEffort: 'off',
};

export class AideSettingTab extends PluginSettingTab {
	plugin: AidePlugin;

	constructor(app: App, plugin: AidePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

	

		new Setting(containerEl)
			.setName('API base URL')
			.setDesc('OpenAI-compatible API endpoint (e.g., https://api.openai.com/v1)')
			.addText((text) =>
				text
					.setPlaceholder('https://api.openai.com/v1')
					.setValue(this.plugin.settings.apiBaseUrl)
					.onChange(async (value) => {
						this.plugin.settings.apiBaseUrl = value;
						await this.plugin.saveSettings();
					}),
			);

		const apiKeySetting = new Setting(containerEl)
			.setName('API key')
			.setDesc('Your API key for the AI provider');

		apiKeySetting.addText((text) => {
			text.inputEl.setAttr('type', 'password');
			text
				.setPlaceholder('sk-...')
				.setValue(this.plugin.settings.apiKey)
				.onChange(async (value) => {
					this.plugin.settings.apiKey = value;
					await this.plugin.saveSettings();
				});
		});

		new Setting(containerEl)
			.setName('Model')
			.setDesc('Model identifier (e.g., gpt-4o-mini, gpt-4o, claude-3-opus, etc.)')
			.addText((text) =>
				text
					.setPlaceholder('gpt-4o-mini')
					.setValue(this.plugin.settings.model)
					.onChange(async (value) => {
						this.plugin.settings.model = value;
						await this.plugin.saveSettings();
					}),
			);

		const maxTokensSetting = new Setting(containerEl)
			.setName('Max tokens')
			.setDesc('Maximum number of tokens in the response')
			.addSlider((slider) =>
				slider
					.setLimits(512, 131072, 1024)
					.setValue(this.plugin.settings.maxTokens)
					.onChange(async (value) => {
						this.plugin.settings.maxTokens = value;
						await this.plugin.saveSettings();
						maxTokensValue.setText(String(value));
					}),
			);
		const maxTokensValue = maxTokensSetting.controlEl.createSpan({ cls: 'aide-slider-value' });
		maxTokensValue.setText(String(this.plugin.settings.maxTokens));

		const tempSetting = new Setting(containerEl)
			.setName('Temperature')
			.setDesc('Controls randomness (0 = deterministic, 2 = very random)')
			.addSlider((slider) =>
				slider
					.setLimits(0, 20, 1)
					.setValue(Math.round(this.plugin.settings.temperature * 10))
					.onChange(async (value) => {
						this.plugin.settings.temperature = value / 10;
						await this.plugin.saveSettings();
						tempValue.setText((value / 10).toFixed(1));
					}),
			);
		const tempValue = tempSetting.controlEl.createSpan({ cls: 'aide-slider-value' });
		tempValue.setText(this.plugin.settings.temperature.toFixed(1));

		new Setting(containerEl)
			.setName('Reasoning effort')
			.setDesc('OpenAI o-series only. Controls how long the model thinks before answering. Set to "off" for non-o models.')
			.addDropdown((dropdown) => {
				dropdown
					.addOption('off', 'Off')
					.addOption('low', 'Low')
					.addOption('medium', 'Medium')
					.addOption('high', 'High')
					.setValue(this.plugin.settings.reasoningEffort);
				dropdown.onChange(async (value: string) => {
					this.plugin.settings.reasoningEffort = value as ReasoningEffort;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Trigger character')
			.setDesc('Character that triggers the AI assistant popup')
			.addDropdown((dropdown) => {
				dropdown
					.addOption('/', '/ (slash)')
					.addOption('\\', '\\ (backslash)')
					.setValue(this.plugin.settings.triggerChar);
				dropdown.onChange(async (value: string) => {
					const trigger = value as TriggerChar;
					this.plugin.settings.triggerChar = trigger;
					this.plugin.triggerChar = trigger;
					await this.plugin.saveSettings();
				});
			});

		const sysPromptSetting = new Setting(containerEl)
			.setName('Custom system prompt')
			.setDesc('System prompt sent to the AI before each request');

		sysPromptSetting.addTextArea((text) => {
			text.inputEl.addClass('ai-assistant-textarea');
			text
				.setPlaceholder('You are a helpful writing assistant...')
				.setValue(this.plugin.settings.systemPrompt)
				.onChange(async (value) => {
					this.plugin.settings.systemPrompt = value;
					await this.plugin.saveSettings();
				});
		});

		new Setting(containerEl).setName('Web search').setHeading();

		new Setting(containerEl)
			.setName('Enable web search')
			.setDesc('Allow the AI to search the web for current information using tool calls')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableWebSearch)
					.onChange(async (value) => {
						this.plugin.settings.enableWebSearch = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Search provider')
			.setDesc('Web search API provider')
			.addDropdown((dropdown) => {
				dropdown
					.addOption('google', 'Google Custom Search')
					.addOption('brave', 'Brave Search')
					.addOption('custom', 'Custom API')
					.setValue(this.plugin.settings.searchProvider);
				dropdown.onChange(async (value: string) => {
					this.plugin.settings.searchProvider = value as SearchProvider;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName('Google API key')
			.setDesc('Google Custom Search API key')
			.addText((text) => {
				text.inputEl.setAttr('type', 'password');
				text
					.setPlaceholder('AIza...')
					.setValue(this.plugin.settings.googleApiKey)
					.onChange(async (value) => {
						this.plugin.settings.googleApiKey = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('Google search engine ID')
			.setDesc('Google Custom Search Engine ID (cx)')
			.addText((text) =>
				text
					.setPlaceholder('your-cx-id')
					.setValue(this.plugin.settings.googleCx)
					.onChange(async (value) => {
						this.plugin.settings.googleCx = value;
						await this.plugin.saveSettings();
					}),
			);

		const braveKeySetting = new Setting(containerEl)
			.setName('Brave Search API key')
			.setDesc('Get one at https://api.search.brave.com/app/dashboard');

		braveKeySetting.addText((text) => {
			text.inputEl.setAttr('type', 'password');
			text
				.setPlaceholder('BSA...')
				.setValue(this.plugin.settings.braveApiKey)
				.onChange(async (value) => {
					this.plugin.settings.braveApiKey = value;
					await this.plugin.saveSettings();
				});
		});

		new Setting(containerEl)
			.setName('Custom search URL')
			.setDesc('Custom search API endpoint. Use {query} as placeholder for the search term.')
			.addText((text) =>
				text
					.setPlaceholder('https://your-api.com/search?q={query}')
					.setValue(this.plugin.settings.customSearchUrl)
					.onChange(async (value) => {
						this.plugin.settings.customSearchUrl = value;
						await this.plugin.saveSettings();
					}),
			);

		const customSearchKeySetting = new Setting(containerEl)
			.setName('Custom search API key')
			.setDesc('API key for the custom search endpoint (if required)');

		customSearchKeySetting.addText((text) => {
			text.inputEl.setAttr('type', 'password');
			text
				.setPlaceholder('Optional')
				.setValue(this.plugin.settings.customSearchApiKey)
				.onChange(async (value) => {
					this.plugin.settings.customSearchApiKey = value;
					await this.plugin.saveSettings();
				});
		});

		new Setting(containerEl).setName('SVG generation').setHeading();

		new Setting(containerEl)
			.setName('Assets folder')
			.setDesc('Folder (relative to vault root) where generated SVG files are saved, e.g. assets')
			.addText((text) =>
				text
					.setPlaceholder('assets')
					.setValue(this.plugin.settings.svgAssetsFolder)
					.onChange(async (value) => {
						this.plugin.settings.svgAssetsFolder = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName('Limits').setHeading();

		const maxSearchSetting = new Setting(containerEl)
			.setName('Max search results')
			.setDesc('Number of search results returned per query')
			.addSlider((slider) =>
				slider
					.setLimits(1, 20, 1)
					.setValue(this.plugin.settings.maxSearchResults)
					.onChange(async (value) => {
						this.plugin.settings.maxSearchResults = value;
						await this.plugin.saveSettings();
						maxSearchValue.setText(String(value));
					}),
			);
		const maxSearchValue = maxSearchSetting.controlEl.createSpan({ cls: 'aide-slider-value' });
		maxSearchValue.setText(String(this.plugin.settings.maxSearchResults));

		const maxFetchSetting = new Setting(containerEl)
			.setName('Max fetch length')
			.setDesc('Maximum characters to fetch from a webpage')
			.addSlider((slider) =>
				slider
					.setLimits(1000, 50000, 1000)
					.setValue(this.plugin.settings.maxFetchLength)
					.onChange(async (value) => {
						this.plugin.settings.maxFetchLength = value;
						await this.plugin.saveSettings();
						maxFetchValue.setText(String(value));
					}),
			);
		const maxFetchValue = maxFetchSetting.controlEl.createSpan({ cls: 'aide-slider-value' });
		maxFetchValue.setText(String(this.plugin.settings.maxFetchLength));

		const maxRoundsSetting = new Setting(containerEl)
			.setName('Max tool rounds')
			.setDesc('Maximum rounds of tool calls (search/fetch) per request')
			.addSlider((slider) =>
				slider
					.setLimits(1, 15, 1)
					.setValue(this.plugin.settings.maxToolRounds)
					.onChange(async (value) => {
						this.plugin.settings.maxToolRounds = value;
						await this.plugin.saveSettings();
						maxRoundsValue.setText(String(value));
					}),
			);
		const maxRoundsValue = maxRoundsSetting.controlEl.createSpan({ cls: 'aide-slider-value' });
		maxRoundsValue.setText(String(this.plugin.settings.maxToolRounds));
	}
}
