import { FileSystemAdapter, MarkdownView } from "obsidian";
import * as fs from "fs/promises";
import path from "path";

export function getVaultPath() {
	const adapter = this.app.vault.adapter as FileSystemAdapter;
	return adapter.getBasePath();
}

export async function getMarkdownFiles(dir: string): Promise<string[]> {
	const entries = await fs.readdir(dir, { withFileTypes: true });
	const files = await Promise.all(
		entries.map(async (entry) => {
			const fullPath = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				if (entry.name.startsWith(".") || entry.name.startsWith("_")) {
					return []; // Skip directories
				}
				return getMarkdownFiles(fullPath);
			} else if (entry.isFile() && entry.name.endsWith(".md")) {
				return [fullPath];
			}
			return [];
		})
	);
	return files.flat();
}

export async function getEditorSelection(): Promise<string | null> {
	const mostRecentLeaf = this.app.workspace.getMostRecentLeaf();
	if (mostRecentLeaf && mostRecentLeaf.view instanceof MarkdownView) {
		const view = mostRecentLeaf.view as MarkdownView;
		return view.editor.getSelection();
	}
	return null;
}

export async function getEditorContent(): Promise<string | null> {
	const activeFile = this.app.workspace.getActiveFile();
	if (activeFile) {
		return await this.app.vault.read(activeFile);
	}
	return null;
}
