import { requestUrl } from 'obsidian';
import type AidePlugin from './main';
import type { AideSettings } from './settings';
import { webSearch, webFetch } from './web-search';

interface ChatMessage {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content: string | null;
	tool_calls?: Array<{
		id: string;
		type: 'function';
		function: {
			name: string;
			arguments: string;
		};
	}>;
	tool_call_id?: string;
}

interface ChatCompletionRequest {
	model: string;
	messages: ChatMessage[];
	max_tokens: number;
	temperature: number;
	tools?: unknown[];
	tool_choice?: string;
	stream?: boolean;
	reasoning_effort?: string;
}

interface ChatCompletionResponse {
	choices: Array<{
		message: ChatMessage;
		finish_reason: 'stop' | 'tool_calls' | 'length';
	}>;
	error?: {
		message: string;
	};
}

const SVG_TOOL = {
	type: 'function',
	function: {
		name: 'generate_svg',
		description:
			'Generate an SVG image based on a description and save it to the vault assets folder. Use this when the user wants diagrams, charts, illustrations, or any visual content.',
		parameters: {
			type: 'object',
			properties: {
				description: {
					type: 'string',
					description: 'Description of the SVG image to create',
				},
				svg_code: {
					type: 'string',
					description: 'Optional: the SVG code to save directly. If not provided, the AI will generate it from the description.',
				},
			},
			required: ['description'],
		},
	},
};

const WEB_SEARCH_TOOL = {
	type: 'function',
	function: {
		name: 'web_search',
		description:
			'Search the web for current information, news, or facts. Use this when you need up-to-date information or are unsure about recent events.',
		parameters: {
			type: 'object',
			properties: {
				query: {
					type: 'string',
					description: 'The search query',
				},
			},
			required: ['query'],
		},
	},
};

const WEB_FETCH_TOOL = {
	type: 'function',
	function: {
		name: 'web_fetch',
		description:
			'Fetch and read the content of a specific webpage. Use this when you need detailed information from a specific URL.',
		parameters: {
			type: 'object',
			properties: {
				url: {
					type: 'string',
					description: 'The URL to fetch',
				},
			},
			required: ['url'],
		},
	},
};

function getTools(settings: AideSettings): unknown[] {
	const tools: unknown[] = [SVG_TOOL];
	if (settings.enableWebSearch) {
		tools.push(WEB_SEARCH_TOOL, WEB_FETCH_TOOL);
	}
	return tools;
}

export type AIAction =
	| 'continue'
	| 'improve'
	| 'shorter'
	| 'longer'
	| 'professional'
	| 'casual'
	| 'friendly'
	| 'simplify'
	| 'summarize'
	| 'explain'
	| 'translate-en'
	| 'fix-grammar'
	| 'custom';

const ACTION_PROMPTS: Record<AIAction, string> = {
	continue: 'Continue the following text naturally, maintaining the same style and tone:',
	improve: 'Improve the following text to make it clearer, more engaging, and better written:',
	shorter: 'Rewrite the following text to be more concise while preserving the key information:',
	longer: 'Expand on the following text, adding more detail and depth:',
	professional: 'Rewrite the following text with a professional tone suitable for business or formal contexts:',
	casual: 'Rewrite the following text with a casual, conversational tone:',
	friendly: 'Rewrite the following text with a warm, friendly tone:',
	simplify: 'Simplify the following text to make it easier to understand for a general audience:',
	summarize: 'Provide a concise summary of the following text, capturing the key points:',
	explain: 'Explain the following text in clear, simple terms:',
	'translate-en': 'Translate the following text to English. Respond with only the translation:',
	'fix-grammar': 'Fix any spelling, grammar, or punctuation errors in the following text without changing its style or meaning:',
	custom: '',
};

const ACTION_LABELS: Record<AIAction, string> = {
	continue: 'Continue writing',
	improve: 'Improve writing',
	shorter: 'Make shorter',
	longer: 'Make longer',
	professional: 'Change tone: Professional',
	casual: 'Change tone: Casual',
	friendly: 'Change tone: Friendly',
	simplify: 'Simplify language',
	summarize: 'Summarize',
	explain: 'Explain this',
	'translate-en': 'Translate to English',
	'fix-grammar': 'Fix spelling & grammar',
	custom: 'Custom prompt',
};

const ACTION_CATEGORIES: Array<{ label: string; actions: AIAction[] }> = [
	{
		label: 'Edit & refine',
		actions: ['improve', 'shorter', 'longer', 'fix-grammar'],
	},
	{
		label: 'Transform',
		actions: ['professional', 'casual', 'friendly', 'simplify'],
	},
	{
		label: 'Generate',
		actions: ['continue', 'summarize', 'explain', 'translate-en'],
	},
];

export function getActionLabel(action: AIAction): string {
	return ACTION_LABELS[action];
}

export function getActionPrompt(action: AIAction, customPrompt?: string): string {
	if (action === 'custom' && customPrompt) return customPrompt;
	return ACTION_PROMPTS[action];
}

export function getActionCategories() {
	return ACTION_CATEGORIES;
}

export type ProgressCallback = (status: string) => void;
export type TokenCallback = (text: string) => void;

export async function executeAction(
	plugin: AidePlugin,
	action: AIAction,
	selectedText: string,
	customPrompt?: string,
	onProgress?: ProgressCallback,
	onToken?: TokenCallback,
): Promise<string> {
	const instruction = getActionPrompt(action, customPrompt);
	const userPrompt = `${instruction}\n\n${selectedText}`;

	const result = await chatCompletionWithTools(
		plugin,
		plugin.settings.systemPrompt,
		userPrompt,
		onProgress,
		onToken,
	);

	return result.trim();
}

async function chatCompletionWithTools(
	plugin: AidePlugin,
	systemPrompt: string,
	userPrompt: string,
	onProgress?: ProgressCallback,
	onToken?: TokenCallback,
): Promise<string> {
	const { apiBaseUrl, apiKey, model, maxTokens, temperature, maxToolRounds, reasoningEffort } = plugin.settings;
	const url = `${apiBaseUrl.replace(/\/+$/, '')}/chat/completions`;

	const messages: ChatMessage[] = [
		{ role: 'system', content: systemPrompt },
		{ role: 'user', content: userPrompt },
	];

	const MAX_ROUNDS = maxToolRounds;

	for (let round = 0; round < MAX_ROUNDS; round++) {
		if (round > 0) {
			onProgress?.('Processing additional context...');
		} else {
			onProgress?.('AI is thinking...');
		}

		const body: ChatCompletionRequest = {
			model,
			messages,
			max_tokens: maxTokens,
			temperature,
			tools: getTools(plugin.settings),
			tool_choice: 'auto',
		};
		if (reasoningEffort !== 'off') {
			body.reasoning_effort = reasoningEffort;
		}

		const response = await requestUrl({
			url,
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(body),
			throw: false,
		});

		if (response.status !== 200) {
			const data = response.json as ChatCompletionResponse;
			throw new Error(data.error?.message || `API error: ${response.status}`);
		}

		const data = response.json as ChatCompletionResponse;
		const choice = data.choices?.[0];
		if (!choice) throw new Error('Empty response from API');

		const msg = choice.message;

		if (choice.finish_reason === 'tool_calls' && msg.tool_calls) {
			messages.push(msg);

			for (const toolCall of msg.tool_calls) {
				onProgress?.(`Tool: ${toolCall.function.name}...`);
				const result = await executeToolCall(toolCall, plugin, onProgress);
				messages.push({
					role: 'tool',
					tool_call_id: toolCall.id,
					content: result,
				});
			}

			continue;
		}

		if (msg.content) {
			if (onToken) {
				onProgress?.('Generating response...');
				const streamed = await streamResponse(url, apiKey, body, onToken);
				return streamed;
			}
			return msg.content.trim();
		}

		throw new Error('Empty response from API');
	}

	throw new Error('AI did not produce a final response after multiple rounds');
}

async function streamResponse(
	url: string,
	apiKey: string,
	body: ChatCompletionRequest,
	onToken: TokenCallback,
): Promise<string> {
	const headers: Record<string, string> = {
		'Authorization': `Bearer ${apiKey}`,
		'Content-Type': 'application/json',
	};

	const fetchBody = { ...body, stream: true };

	const response = await fetch(url, {
		method: 'POST',
		headers,
		body: JSON.stringify(fetchBody),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Stream error: HTTP ${response.status} - ${text}`);
	}

	const reader = response.body?.getReader();
	if (!reader) throw new Error('Stream not available');

	const decoder = new TextDecoder();
	let buffer = '';
	let fullText = '';

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() ?? '';

			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed.startsWith('data: ')) continue;

				const payload = trimmed.slice(6).trim();
				if (payload === '[DONE]') continue;
				if (!payload) continue;

				try {
					const parsed = JSON.parse(payload) as {
						choices?: Array<{
							delta: { content?: string };
							finish_reason?: string;
						}>;
					};
					const delta = parsed.choices?.[0]?.delta?.content;
					if (delta) {
						onToken(delta);
						fullText += delta;
					}
				} catch {
					// skip malformed chunk
				}
			}
		}
	} finally {
		reader.releaseLock();
	}

	return fullText;
}

async function chatCompletionSimple(
	plugin: AidePlugin,
	system: string,
	user: string,
): Promise<string> {
	const { apiBaseUrl, apiKey, model, maxTokens, temperature, reasoningEffort } = plugin.settings;
	const url = `${apiBaseUrl.replace(/\/+$/, '')}/chat/completions`;

	const requestBody: Record<string, unknown> = {
		model,
		messages: [
			{ role: 'system', content: system },
			{ role: 'user', content: user },
		],
		max_tokens: maxTokens,
		temperature,
	};
	if (reasoningEffort !== 'off') {
		requestBody.reasoning_effort = reasoningEffort;
	}

	const response = await requestUrl({
		url,
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${apiKey}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(requestBody),
		throw: false,
	});

	if (response.status !== 200) {
		const data = response.json as { error?: { message: string } };
		throw new Error(data.error?.message || `API error: ${response.status}`);
	}

	const data = response.json as ChatCompletionResponse;
	return data.choices?.[0]?.message?.content?.trim() ?? '';
}

async function generateSvgCode(
	plugin: AidePlugin,
	description: string,
): Promise<string> {
	const system = 'You are an SVG expert. Generate only valid, clean SVG code based on the description. Use responsive viewBox, semantic elements, proper styling, and no markdown formatting or code fences. Output raw SVG only, no explanations.';
	const raw = await chatCompletionSimple(plugin, system, description);

	let svg = raw.trim();
	if (svg.startsWith('```svg')) {
		svg = svg.replace(/^```svg\n?/, '').replace(/\n?```$/, '').trim();
	} else if (svg.startsWith('```')) {
		svg = svg.replace(/^```\n?/, '').replace(/\n?```$/, '').trim();
	}
	if (!svg.startsWith('<svg')) {
		svg = svg.replace(/^[^<]*/, '').replace(/[^>]*$/, '');
	}
	return svg;
}

async function saveSvgFile(
	plugin: AidePlugin,
	svgContent: string,
	description: string,
): Promise<string> {
	const folder = plugin.settings.svgAssetsFolder || 'assets';
	const slug = description
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 50);
	const safeSlug = slug || 'svg-image';
	const timestamp = Date.now();
	const filename = `${safeSlug}-${timestamp}.svg`;
	const vaultPath = `${folder}/${filename}`;
	const vault = plugin.app.vault;
	const adapter = vault.adapter;

	const folderExists = await adapter.exists(folder);
	if (!folderExists) {
		await adapter.mkdir(folder);
	}

	await adapter.write(vaultPath, svgContent);

	return `![](${folder}/${filename})`;
}

async function executeToolCall(
	toolCall: NonNullable<ChatMessage['tool_calls']>[number],
	plugin: AidePlugin,
	onProgress?: ProgressCallback,
): Promise<string> {
	const { name, arguments: rawArgs } = toolCall.function;

	let args: Record<string, string>;
	try {
		args = JSON.parse(rawArgs) as Record<string, string>;
	} catch {
		return `Error: invalid tool arguments: ${rawArgs}`;
	}

	if (name === 'web_search') {
		const query = args.query ?? '';
		onProgress?.(`Searching web for "${query.slice(0, 60)}"...`);
		try {
			const result = await webSearch(query, plugin.settings);
			onProgress?.('Search complete, processing results...');
			return result;
		} catch (err) {
			return `Web search error: ${err instanceof Error ? err.message : 'Unknown error'}`;
		}
	}

	if (name === 'web_fetch') {
		const url = args.url ?? '';
		onProgress?.(`Fetching content from URL...`);
		try {
			const result = await webFetch(url, plugin.settings);
			onProgress?.('Content fetched, analyzing...');
			return result;
		} catch (err) {
			return `Web fetch error: ${err instanceof Error ? err.message : 'Unknown error'}`;
		}
	}

	if (name === 'generate_svg') {
		const description = args.description ?? '';
		onProgress?.(`Generating SVG: ${description.slice(0, 60)}...`);
		try {
			let svg = args.svg_code ?? '';
			if (!svg) {
				onProgress?.('Creating SVG code...');
				svg = await generateSvgCode(plugin, description);
			}
			if (!svg.startsWith('<svg')) {
				return `Error: generated content is not valid SVG`;
			}
			onProgress?.('Saving SVG file...');
			const markdown = await saveSvgFile(plugin, svg, description);
			onProgress?.('SVG generated and saved');
			return `SVG image has been generated and saved. Insert this markdown in your note:\n${markdown}`;
		} catch (err) {
			return `SVG generation error: ${err instanceof Error ? err.message : 'Unknown error'}`;
		}
	}

	return `Unknown tool: ${name}`;
}
