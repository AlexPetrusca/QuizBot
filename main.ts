import { App, WorkspaceLeaf, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { QUIZ_VIEW_TYPE, QuizView } from "./view";

// Remember to rename these classes and interfaces!

interface QuizBotSettings {
	ollamaModel: string;
}

const DEFAULT_SETTINGS: QuizBotSettings = {
	ollamaModel: 'gpt-oss:latest'
}

export default class QuizBotPlugin extends Plugin {
	settings: QuizBotSettings;

	async onload() {
		await this.loadSettings()

		// Register a view to render the quiz
		this.registerView(
			QUIZ_VIEW_TYPE,
			(leaf: WorkspaceLeaf) => new QuizView(leaf, this)
		);

		// Create icon in the left ribbon
		this.addRibbonIcon('bot', 'Open QuizBot Panel', (evt: MouseEvent) => {
			this.activateView();
		});

		// Add a simple command that can be triggered anywhere
		this.addCommand({
			id: 'open-quizbot-panel',
			name: 'Open QuizBot Panel',
			callback: () => {
				this.activateView();
			}
		});

		// Add a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new QuizSettingTab(this.app, this));
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(QUIZ_VIEW_TYPE);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async activateView() {
		const leaves = this.app.workspace.getLeavesOfType(QUIZ_VIEW_TYPE);
		if (leaves.length === 0) {
			await this.app.workspace.getRightLeaf(false)?.setViewState({
				type: QUIZ_VIEW_TYPE,
				active: true,
			});
		}

		this.app.workspace.revealLeaf(
			this.app.workspace.getLeavesOfType(QUIZ_VIEW_TYPE)[0]
		);
	}
}

class QuizSettingTab extends PluginSettingTab {
	plugin: QuizBotPlugin;

	constructor(app: App, plugin: QuizBotPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Ollama Model')
			.setDesc('The full qualified name of the Ollama model to use.')
			.addText(text => text
				.setPlaceholder(DEFAULT_SETTINGS.ollamaModel)
				.setValue(this.plugin.settings.ollamaModel)
				.onChange(async (value) => {
					this.plugin.settings.ollamaModel = value;
					await this.plugin.saveSettings();
				}));
	}
}
