import { MarkdownTextSplitter, RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { sha256Text, uuid } from "./crypto";
import * as fs from "fs/promises";
import { Collection, Metadata } from "chromadb";

interface Chunk {
	id: string;
	uri: string;
	idx: number;
	text: string;
	hash: string;
	fileHash: string;
}

export async function getChunksFromFiles(paths: string[], chunkSize=800, overlap=100): Promise<Chunk[]> {
	// const splitter = new RecursiveCharacterTextSplitter({
	const splitter = new MarkdownTextSplitter({
		chunkSize: chunkSize,
		chunkOverlap: overlap,
	});
	const results = await Promise.all(
		paths.map(async (file) => {
			const content = await fs.readFile(file, "utf-8");
			const contentHash = sha256Text(content);
			const chunks = await splitter.splitText(content);
			return chunks.map((text, idx) => ({
				id: uuid(),
				uri: file,
				idx: idx,
				text: text,
				hash: sha256Text(text),
				fileHash: contentHash,
			}));
		})
	);

	return results.flat();
}

export async function batchAddChunks(collection: Collection, documents: Chunk[], batchSize = 2000) {
	for (let i = 0; i < documents.length; i += batchSize) {
		const batch = documents.slice(i, i + batchSize);
		await collection.add({
			ids: batch.map((doc) => doc.id),
			metadatas: batch as unknown[] as Metadata[],
			documents: batch.map((doc) => doc.text),
		});
	}
}
