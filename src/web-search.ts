import { requestUrl } from 'obsidian';
import type { AideSettings } from './settings';

interface WebResult {
	title: string;
	url: string;
	snippet: string;
}

export async function webSearch(query: string, settings: AideSettings): Promise<string> {
	if (!settings.enableWebSearch) {
		return 'Web search is not enabled. Configure it in settings.';
	}

	let results: WebResult[];

	if (settings.searchProvider === 'google') {
		results = await googleSearch(query, settings);
	} else if (settings.searchProvider === 'brave') {
		results = await braveSearch(query, settings);
	} else {
		results = await customSearch(query, settings);
	}

	if (results.length === 0) {
		return 'No search results found.';
	}

	return results
		.map((r, i) => `[${i + 1}] ${r.title}\n    URL: ${r.url}\n    ${r.snippet}`)
		.join('\n\n');
}

export async function webFetch(url: string, settings: AideSettings): Promise<string> {
	try {
		const response = await requestUrl({
			url,
			method: 'GET',
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
			},
			throw: false,
		});

		if (response.status !== 200) {
			return `Error fetching URL: HTTP ${response.status}`;
		}

		const text = response.text;
		const stripped = stripHtml(text);
		return stripped.slice(0, settings.maxFetchLength);
	} catch (err) {
		return `Error fetching URL: ${err instanceof Error ? err.message : 'Unknown error'}`;
	}
}

async function googleSearch(query: string, settings: AideSettings): Promise<WebResult[]> {
	const url = 'https://www.googleapis.com/customsearch/v1';
	const params = new URLSearchParams({
		key: settings.googleApiKey,
		cx: settings.googleCx,
		q: query,
		num: String(settings.maxSearchResults),
	});

	const response = await requestUrl({
		url: `${url}?${params.toString()}`,
		method: 'GET',
		throw: false,
	});

	if (response.status !== 200) {
		const err = response.json as { error?: { message?: string } };
		throw new Error(`Google search API error: ${err.error?.message ?? response.status}`);
	}

	const data = response.json as {
		items?: Array<{
			title: string;
			link: string;
			snippet: string;
		}>;
	};

	return (data.items ?? []).map((item) => ({
		title: item.title,
		url: item.link,
		snippet: item.snippet,
	}));
}

async function braveSearch(query: string, settings: AideSettings): Promise<WebResult[]> {
	const url = 'https://api.search.brave.com/res/v1/web/search';
	const params = new URLSearchParams({ q: query, count: String(settings.maxSearchResults) });

	const response = await requestUrl({
		url: `${url}?${params.toString()}`,
		method: 'GET',
		headers: {
			'X-Subscription-Token': settings.braveApiKey,
			'Accept': 'application/json',
		},
		throw: false,
	});

	if (response.status !== 200) {
		throw new Error(`Brave Search API error: HTTP ${response.status}`);
	}

	const data = response.json as {
		web?: {
			results?: Array<{
				title: string;
				url: string;
				description: string;
			}>;
		};
	};

	return (data.web?.results ?? []).slice(0, settings.maxSearchResults).map((r) => ({
		title: r.title,
		url: r.url,
		snippet: r.description,
	}));
}

async function customSearch(query: string, settings: AideSettings): Promise<WebResult[]> {
	const url = settings.customSearchUrl.replace('{query}', encodeURIComponent(query));

	const headers: Record<string, string> = {
		'User-Agent': 'Mozilla/5.0 (compatible; AIAssistant/1.0)',
	};

	if (settings.customSearchApiKey) {
		headers['Authorization'] = `Bearer ${settings.customSearchApiKey}`;
	}

	const response = await requestUrl({
		url,
		method: 'GET',
		headers,
		throw: false,
	});

	if (response.status !== 200) {
		throw new Error(`Custom search API returned HTTP ${response.status}`);
	}

	const raw = response.json as Record<string, unknown>;
	const items = raw.items ?? raw.results ?? [];

	if (!Array.isArray(items)) {
		return [];
	}

	const maxResults = settings.maxSearchResults;
	return items.slice(0, maxResults).map((item: Record<string, unknown>) => {
		const titleRaw = item.title ?? item.name;
		const urlRaw = item.url ?? item.link ?? item.html_url;
		const snippetRaw = item.snippet ?? item.description ?? item.summary;
		return {
			title: typeof titleRaw === 'string' ? titleRaw : '',
			url: typeof urlRaw === 'string' ? urlRaw : '',
			snippet: typeof snippetRaw === 'string' ? snippetRaw : '',
		};
	});
}

function stripHtml(html: string): string {
	return html
		.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
		.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
		.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
		.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
		.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#x27;/g, "'")
		.replace(/&#x2F;/g, '/')
		.replace(/\s+/g, ' ')
		.trim();
}
