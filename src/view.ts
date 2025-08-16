import { ItemView, MarkdownView, Notice, WorkspaceLeaf } from "obsidian";
import QuizBotPlugin from "main";
import { OllamaEmbeddingFunction } from "@chroma-core/ollama";
import { ChromaClient } from "chromadb";

export const QUIZ_VIEW_TYPE = "quiz-view";

export class QuizView extends ItemView {
	plugin: QuizBotPlugin;

	constructor(leaf: WorkspaceLeaf, plugin: QuizBotPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return QUIZ_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Quiz Generator";
	}

	getIcon(): string {
		return "bot";
	}

	async onOpen() {
		const container = this.containerEl.children[1];
		container.empty();

		const quizHeader = container.createEl("div", { cls: "quiz-header" });
		quizHeader.createEl("h1", { text: "QuizBot" });
		const controlsContainer = quizHeader.createEl("div", { cls: "controls-container" });

		const indexButton = controlsContainer.createEl("button", { text: "Index" });
		this.registerDomEvent(indexButton, 'click', () => {
			this.indexVault();
		});

		const regenerateButton = controlsContainer.createEl("button", { text: "Generate" });
		this.registerDomEvent(regenerateButton, 'click', () => {
			this.generateQuiz(quizContainer);
		});

		const quizContainer = container.createEl("div", { cls: "quiz-container" });
	}

	async indexVault() {
		const chromaClient = new ChromaClient({
			host: "localhost",
			port: 58080
		});
		const ollama_embed = new OllamaEmbeddingFunction({
			url: "localhost:58081",
			model: "nomic-embed-text",
		})
		const collection_id = {
			name: "alpine-vault",
			embeddingFunction: ollama_embed,
			embedding_dim: 768,
		};
		chromaClient.getOrCreateCollection(collection_id).then((collection) => {
			console.log(`Chroma collection created: ${collection.id}`);
		});
	}

	async generateQuiz(container: Element) {
		container.empty();
		container.createEl("p", { text: "Generating quiz..." });
		const quiz = await this.generateQuizJson();
		container.empty();

		for (let i = 1; i <= quiz.questions.length; i++) {
			const question = quiz.questions[i - 1];
			container.createEl("h5", { text: `${i}. ${question.text}` });

			const formQuestion = container.createEl("div", {
				cls: "form-question",
				attr: {
					id: `q${i}-question`,
				}
			});
			for (const choice in question.choices) {
				const choiceIdx = choice.charCodeAt(0) - '1'.charCodeAt(0);
				const choiceChar = String.fromCharCode('A'.charCodeAt(0) + choiceIdx);
				const choiceText = question.choices[choice];

				const formChoice = formQuestion.createEl("div", {
					cls: "form-choice",
					attr: {
						id: `q${i}${choiceIdx + 1}-choice`,
					}
				});
				formChoice.createEl("input", {
					cls: "form-radio",
					attr: {
						type: "radio",
						id: `q${i}${choiceIdx + 1}-radio`,
						name: `q${i}`,
						value: choiceIdx + 1,
					}
				});
				formChoice.createEl("label", {
					text: `${choiceChar}. ${choiceText}`,
					cls: "form-radio-label",
					attr: {
						for: `q${i}${choiceIdx + 1}-radio`
					}
				});
			}
		}

		const submitButton = container.createEl("button", {
			text: "Submit",
			cls: "submit-button",
		});
		const resultContainer = container.createEl("div", { cls: "result-container" });
		const resultScore = resultContainer.createEl("h5", { cls: "result-score" });
		const resultBreakdown = resultContainer.createEl("div", { cls: "result-breakdown" });
		this.registerDomEvent(submitButton, "click", () => {
			resultContainer.addClass("result-visible");

			let numCorrectAnswers = 0;
			const numQuestions = quiz.questions.length;
			for (let i = 1; i <= numQuestions; i++) {
				const question = quiz.questions[i - 1];

				// Report if the answer is correct or incorrect
				const answerElem = container.querySelector(`#q${i}${question.answer}-radio`);
				if ((<HTMLInputElement>answerElem).checked) {
					numCorrectAnswers++;
					resultBreakdown.createEl("p", {
						text: `Question ${i} answered correctly!`,
						cls: "correct-text"
					});
				} else {
					const answerIdx = question.answer.charCodeAt(0) - '1'.charCodeAt(0);
					const answerChar = String.fromCharCode('A'.charCodeAt(0) + answerIdx);
					resultBreakdown.createEl("p", {
						text: `Question ${i} answered incorrectly! Correct answer: ${answerChar}`,
						cls: "incorrect-text"
					});
					// Highlight the incorrect choice
					const radioElems = container.querySelectorAll(`#q${i}-question .form-radio`);
					for (let i = 0; i < radioElems.length; i++) {
						const radioElem = radioElems[i];
						if ((<HTMLInputElement>radioElem).checked) {
							radioElem?.parentElement?.addClass("incorrect-choice");
						}
					}
				}

				// Highlight the correct choice
				const correctChoiceElem = container.querySelector(`#q${i}${question.answer}-choice`);
				correctChoiceElem?.addClass("correct-choice");

				// Report final score
				const score = Math.round((numCorrectAnswers / numQuestions) * 100);
				resultScore.innerText = `Score: ${score}% - Answered ${numCorrectAnswers} out of ${numQuestions} correctly`;
			}

			// disable quiz inputs
			const radioElems = container.querySelectorAll(`.form-radio`);
			for (let i = 0; i < radioElems.length; i++) {
				const radioElem = radioElems[i];
				radioElem.setAttribute("disabled", "true");
			}
			const submitButtonElem = container.querySelector(".submit-button");
			submitButtonElem?.setAttribute("disabled", "true");
		});
	}

	async generateQuizJson() {
		let content = "";
		if (!content) {
			const mostRecentLeaf = this.app.workspace.getMostRecentLeaf();
			if (mostRecentLeaf && mostRecentLeaf.view instanceof MarkdownView) {
				content = (<MarkdownView>mostRecentLeaf.view).editor.getSelection();
			}
		}
		if (!content) {
			const activeFile = this.app.workspace.getActiveFile();
			if (activeFile) {
				content = await this.app.vault.read(activeFile);
			}
		}

		if (!content) {
			new Notice("QuizBot: Error - No active file selection.");
			return;
		}

		content = content.replace(/!\[\[\S+\]\]/g, "![image]") // replace image links with a placeholder
			.replace(/\[\[[^\[\]]+\|([^\[\]]+)\]\]/g, (match, capture) => capture) // replace aliased internal links with the text inside the pipe
			.replace(/\[\[([^\[\]]+)\]\]/g, (match, capture) => capture) // replace unaliased internal links with the text inside the brackets
			.replace(/\[([^\[\]]+)\]\(\S+\)/g, (match, capture) => capture) // replace external links with the text inside the brackets
			.replace(/%%[^%]+%%/g, ''); // remove comments
		console.log(content);

		const prompt = this.getPrompt(content);
		const response = await fetch("http://localhost:58081/api/generate", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: this.plugin.settings.ollamaModel,
				prompt: prompt,
				stream: false,
			}),
		});
		const result = await response.json();

		// parse json generation out of the response
		let text = result.response;
		if (text.includes("<think>")) {
			text = text.substring(text.match("</think>").index + 8)
		}
		const start = text.indexOf("{");
		const end = text.lastIndexOf("}");
		const jsonText = text.substring(start, end + 1);
		console.log(text);
		console.log(jsonText);
		return JSON.parse(jsonText);
	}

	private getPrompt(content: string) {
		return `
			${content}
			
			Create a 10-question multiple choice quiz based on the preceding content. Format the output as JSON:
			{
				"questions": [
					{
						"text": "{question text}",
						"choices": {
							"1": "{choice 1 text}",
							"2": "{choice 2 text}",
							"3": "{choice 3 text}",
							"4": "{choice 4 text}"
						},
						"answer": "{correct choice number (1-4)}"
					},
					...		
				]
			}
		`;
	}

	async onClose() {
		// Cleanup if needed
	}
}
