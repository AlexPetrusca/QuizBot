import { MarkdownTextSplitter } from "@langchain/textsplitters";
import { sha256Text, uuid } from "./crypto";
import * as fs from "fs/promises";
import { ChromaClient, Collection, Metadata, QueryResult } from "chromadb";
import { OllamaEmbeddingFunction } from "@chroma-core/ollama";

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

export async function batchAddChunks(collection: Collection, documents: Chunk[], batchSize = 2000): Promise<void> {
	for (let i = 0; i < documents.length; i += batchSize) {
		const batch = documents.slice(i, i + batchSize);
		await collection.add({
			ids: batch.map((doc) => doc.id),
			metadatas: batch as unknown[] as Metadata[],
			documents: batch.map((doc) => doc.text),
		});
	}
}

export async function getOrCreateCollection(collectionName: string): Promise<Collection> {
	const chromaClient = new ChromaClient({
		host: "localhost",
		port: 58080
	});
	const ollamaEmbed = new OllamaEmbeddingFunction({
		url: "localhost:58081",
		model: "nomic-embed-text",
	})
	const collectionId = {
		name: collectionName,
		embeddingFunction: ollamaEmbed,
		embedding_dim: 768,
	};
	return await chromaClient.getOrCreateCollection(collectionId);
}

export async function deleteCollection(collectionName: string): Promise<void> {
	const chromaClient = new ChromaClient({
		host: "localhost",
		port: 58080
	});
	await chromaClient.deleteCollection({ name: collectionName });
}

export async function recreateCollection(collectionName: string): Promise<Collection> {
	const chromaClient = new ChromaClient({
		host: "localhost",
		port: 58080
	});

	// delete
	await chromaClient.deleteCollection({ name: collectionName });

	// create
	const ollamaEmbed = new OllamaEmbeddingFunction({
		url: "localhost:58081",
		model: "nomic-embed-text",
	})
	const collectionId = {
		name: collectionName,
		embeddingFunction: ollamaEmbed,
		embedding_dim: 768,
	};
	return await chromaClient.getOrCreateCollection(collectionId);
}

export async function queryCollection(collectionName: string, queries: string[], nResults = 5): Promise<QueryResult> {
	const alpineCollection = await getOrCreateCollection(collectionName);
	return await alpineCollection.query({
		queryTexts: queries,
		nResults: nResults,
		include: ["documents", "metadatas", "distances"]
	});
}
