import { ChatRequest, GenerateRequest } from "ollama";

export type OllamaGenerateRequest = GenerateRequest & ({ stream?: false } | { stream: true });
export type OllamaChatRequest = ChatRequest & ({ stream?: false } | { stream: true });
