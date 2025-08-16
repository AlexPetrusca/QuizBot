import { App, PluginSettingTab, Setting } from "obsidian";
import QuizBotPlugin from "main";

export interface QuizBotSettings {
	ollamaModel: string;
	chromaPath: string;
	nodePath: string;
	ollamaPath: string;
	structuredOutput: boolean;
}

export const DEFAULT_QUIZBOT_SETTINGS: QuizBotSettings = {
	ollamaModel: 'gpt-oss:latest',
	chromaPath: '/opt/homebrew/bin/chroma',
	nodePath: '/opt/homebrew/bin/node',
	ollamaPath: '/opt/homebrew/bin/ollama',
	structuredOutput: true,
}

export class QuizSettingTab extends PluginSettingTab {
	plugin: QuizBotPlugin;

	constructor(app: App, plugin: QuizBotPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Ollama Model')
			.setDesc('Full qualified name of the Ollama model to use.')
			.addText(text => text
				.setPlaceholder(DEFAULT_QUIZBOT_SETTINGS.ollamaModel)
				.setValue(this.plugin.settings.ollamaModel)
				.onChange(async (value) => {
					this.plugin.settings.ollamaModel = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('ChromaDB Path')
			.setDesc('Path to your ChromaDB executable: run `which chroma`.')
			.addText(text => text
				.setPlaceholder(DEFAULT_QUIZBOT_SETTINGS.chromaPath)
				.setValue(this.plugin.settings.chromaPath)
				.onChange(async (value) => {
					this.plugin.settings.chromaPath = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Node.js Path')
			.setDesc('Path to your Node.js interpreter: run `which node`.')
			.addText(text => text
				.setPlaceholder(DEFAULT_QUIZBOT_SETTINGS.nodePath)
				.setValue(this.plugin.settings.nodePath)
				.onChange(async (value) => {
					this.plugin.settings.nodePath = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Ollama Path')
			.setDesc('Path to your Ollama executable: run `which ollama`.')
			.addText(text => text
				.setPlaceholder(DEFAULT_QUIZBOT_SETTINGS.ollamaPath)
				.setValue(this.plugin.settings.ollamaPath)
				.onChange(async (value) => {
					this.plugin.settings.ollamaPath = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Structured Output')
			.setDesc('Enforce structured output using JSON Schema.')
			.addToggle(toggle =>
				toggle
					.setValue(this.plugin.settings.structuredOutput)
					.onChange(async (value) => {
						this.plugin.settings.structuredOutput = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
