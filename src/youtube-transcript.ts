import { requestUrl } from 'obsidian';

function extractVideoId(url: string): string | null {
	const patterns = [
		/(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtube\.com\/v\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
		/^([a-zA-Z0-9_-]{11})$/,
	];
	for (const pattern of patterns) {
		const match = url.match(pattern);
		if (match?.[1]) return match[1];
	}
	return null;
}

interface TranscriptSegment {
	text: string;
	duration: number;
	offset: number;
}

export async function fetchYoutubeTranscript(url: string): Promise<string> {
	const videoId = extractVideoId(url);
	if (!videoId) {
		throw new Error('Invalid YouTube URL');
	}

	const response = await requestUrl({
		url: `https://youtubetranscript.com/?v=${videoId}`,
		method: 'GET',
		throw: false,
	});

	if (response.status !== 200) {
		throw new Error(`Transcript not available (HTTP ${response.status})`);
	}

	const data = JSON.parse(response.text) as TranscriptSegment[];
	if (!Array.isArray(data) || data.length === 0) {
		throw new Error('No transcript found for this video');
	}

	const lines = data.map((seg) => {
		const minutes = Math.floor(seg.offset / 60);
		const seconds = Math.floor(seg.offset % 60);
		const timestamp = `${minutes}:${seconds.toString().padStart(2, '0')}`;
		return `[${timestamp}] ${seg.text}`;
	});

	return lines.join('\n');
}
