import { ChromaClient } from "chromadb";
import { OllamaEmbeddingFunction } from "@chroma-core/ollama";


const client = new ChromaClient({
	host: "localhost",
	port: 58080,
});

const ollama_embed = new OllamaEmbeddingFunction({
	url: "localhost:58081",
	model: "nomic-embed-text",
})

let collection_id = {
	name: "my_collection",
	embeddingFunction: ollama_embed,
	embedding_dim: 768,
};
let collection = await client.getOrCreateCollection(collection_id);

await collection.add({
	ids: ["id1", "id2", "id3"],
	documents: [
		"This is a document about pineapple",
		"This is a document about oranges",
		"This is a document about winter",
	]
});

const results = await collection.query({
	queryTexts: ["This is a query document about hawaii"],
	nResults: 3,
});

console.log();
console.log(results);
