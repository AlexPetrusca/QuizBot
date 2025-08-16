import { Readable } from 'stream';
import nodeFetch from "node-fetch";

// hack to get around CORS (this took so long to figure out...)
export async function patchFetch() {
	globalThis.fetch = async function(url: any, options: any) {
		if (url instanceof Request) {
			let nodeReadableBody = null;
			if (url.body != null) {
				// Convert ReadableStream to Node.js Readable stream
				nodeReadableBody = Readable.from(url.body as any);
			}
			return await nodeFetch(url.url, {
				method: url.method,
				headers: url.headers as any,
				body: nodeReadableBody
			});
		} else {
			return nodeFetch(url, options);
		}
	} as any;
}
