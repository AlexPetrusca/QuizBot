import { GenerateRequest } from "ollama";

export type OllamaGenerateRequest = GenerateRequest & ({ stream?: false } | { stream: true });
