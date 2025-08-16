import path from "path";
import { WorkspaceLeaf, Plugin, FileSystemAdapter, Notice } from 'obsidian';
import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import { QUIZ_VIEW_TYPE, QuizView } from "src/view";
import { DEFAULT_QUIZBOT_SETTINGS, QuizBotSettings, QuizSettingTab } from "src/settings";
import { patchFetch } from "src/util/fetch";

export default class QuizBotPlugin extends Plugin {
	settings: QuizBotSettings;
	chroma: ChildProcessWithoutNullStreams;
	ollama: ChildProcessWithoutNullStreams;

	async onload() {
		await patchFetch();
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

		this.startChroma(); // testing - todo: remove me
		this.startOllama(); // testing - todo: remove me
	}

	onunload() {
		this.app.workspace.detachLeavesOfType(QUIZ_VIEW_TYPE);
		if (this.chroma) {
			this.chroma.kill();
		}
		if (this.ollama) {
			this.ollama.kill();
		}
	}

	startOllama() {
		this.ollama = spawn(this.settings.ollamaPath, ["serve"], {
			env: {
				...process.env, // inherit current environment
				OLLAMA_HOST: "localhost:58081",
			}
		});
		this.ollama.stdout.on("data", (data) => {
			console.log(`Ollama: ${data}`);
		});
		this.ollama.stderr.on("data", (data) => {
			console.log(`Ollama: ${data}`);
		});
		this.ollama.on("close", (code) => {
			if (code === null || code === 0) {
				console.log(`Shutting down Ollama...`);
			} else {
				console.error(`Ollama exited with code ${code}`);
				new Notice(`Ollama failed to start. Please check the console for more details.`);
			}
		});
	}

	startChroma() {
		const fsAdapter = <FileSystemAdapter>this.app.vault.adapter;
		const dataPath = path.join(fsAdapter.getBasePath(), ".chroma");
		this.chroma = spawn(this.settings.chromaPath, ["run", "--path", dataPath, "--port", "58080"], {
			env: {
				...process.env, // inherit current environment
				PATH: process.env.PATH + `:${path.dirname(this.settings.nodePath)}`,
				CHROMA_SERVER_CORS_ALLOW_ORIGINS: '["*"]',
				CHROMA_SERVER_CORS_ALLOW_METHODS: 'GET,POST,OPTIONS'
			}
		});
		this.chroma.stdout.on("data", (data) => {
			console.log(`Chroma: ${data}`);
		});
		this.chroma.stderr.on("data", (data) => {
			console.error(`Chroma error: ${data}`);
		});
		this.chroma.on("close", (code) => {
			if (code === null || code === 0) {
				console.log(`Shutting down Chroma...`);
			} else {
				console.error(`Chroma exited with code ${code}`);
				new Notice(`Chroma failed to start. Please check the console for more details.`);
			}
		});
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_QUIZBOT_SETTINGS, await this.loadData());
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
