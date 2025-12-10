import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import QuizBotPlugin from "main";
import { Ollama } from "ollama";
import { OllamaChatRequest, OllamaGenerateRequest } from "src/util/types";
import { getEditorContent, getEditorSelection, getMarkdownFiles, getVaultPath } from "./util/obsidian";
import {
	batchAddChunks,
	recreateCollection,
	deleteCollection,
	getChunksFromFiles,
	getOrCreateCollection
} from "./util/chroma";
import { latexMarkdownToHTML } from "./util/markdown";

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

		const mainContainer = container.createEl("div", {cls: "main-container"});
		const topContainer = mainContainer.createEl("div", {cls: "top-container"});
		const middleContainer = mainContainer.createEl("div", {cls: "middle-container"});
		const bottomContainer = mainContainer.createEl("div", {cls: "bottom-container"});

		const quizHeader = topContainer.createEl("div", { cls: "quiz-header" });
		const outputBody = middleContainer.createEl("div", { cls: "output-body" });
		const promptInput = bottomContainer.createEl("textarea", { cls: "prompt-input" });
		this.registerDomEvent(promptInput, 'keydown', async (e) => {
			if (!e.shiftKey && e.key === "Enter") {
				e.preventDefault();
				await this.generateRagResponse(promptInput.value, outputBody);
			}
		});

		quizHeader.createEl("h1", { text: "QuizBot" });
		const controlsContainer = quizHeader.createEl("div", { cls: "controls-container" });

		const indexButton = controlsContainer.createEl("button", { text: "Index" });
		this.registerDomEvent(indexButton, 'click', () => {
			this.indexVault();
		});

		const regenerateButton = controlsContainer.createEl("button", { text: "Generate Quiz" });
		this.registerDomEvent(regenerateButton, 'click', () => {
			this.generateQuiz(outputBody);
		});
	}

	async generateRagResponse(prompt: string, container: HTMLElement) {
		container.empty();
		container.createEl("p", { text: "Thinking..." });

		const alpineCollection = await getOrCreateCollection("alpine-vault");
		const queryResults = await alpineCollection.query({
			queryTexts: [prompt],
			nResults: 5,
			include: ["documents", "metadatas", "distances"]
		});
		console.log(queryResults);

		const uris = new Set<string>();
		for (const metadata of queryResults.metadatas[0]) {
			uris.add(<string>(metadata?.uri));
		}
		console.log(uris);

		const ollama = new Ollama({ host: "localhost:58081" })
		const request: OllamaGenerateRequest = {
			model: this.plugin.settings.ollamaModel,
			prompt: this.getJsonSchemaPromptRouter(prompt),
			format: this.getJsonSchemaRouter(),
			stream: false,
		};
		const response = await ollama.generate(request)
		const route = response.response.replace(/"/g, "").trim(); // remove quotes
		console.log("ROUTE: ", route);

		const rags = queryResults.documents[0].join("\n");
		if (route === "quiz") {
			container.empty();
			container.createEl("p", { text: "Generating quiz..." });
			await this.generateQuiz(container, rags);
		} else if (route === "generate") {
			container.empty();
			container.createEl("p", { text: "Generating response..." });
			const rawResponse = await this.generateLLMResponse(prompt, rags);
			container.innerHTML = await latexMarkdownToHTML(rawResponse);
		}
	}

	async generateLLMResponse(prompt: string, rags: string): Promise<string> {
		const ollama = new Ollama({ host: "localhost:58081" })
		const request: OllamaGenerateRequest = {
			model: this.plugin.settings.ollamaModel,
			prompt: this.getPromptGenerate(prompt, rags),
			stream: false,
		};
		const chatResponse = await ollama.generate(request);
		console.log(chatResponse);
		return chatResponse.response;
	}

	async indexVault() {
		const alpineCollection = await recreateCollection("alpine-vault");

		const files = await getMarkdownFiles(getVaultPath());
		const documents = await getChunksFromFiles(files);
		console.log(documents);
		await batchAddChunks(alpineCollection, documents, 400);
	}

	async generateQuiz(container: Element, content?: string) {
		container.empty();
		container.createEl("p", { text: "Generating quiz..." });
		const quiz = await this.generateQuizJson(content);
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

	private async generateQuizJson(content?: string) {
		if (!content) {
			const pageContent = await this.getSanitizedContent();
			if (pageContent !== null) {
				content = pageContent;
			} else {
				return;
			}
		}

		const ollama = new Ollama({ host: "localhost:58081" })
		const request: OllamaGenerateRequest = {
			model: this.plugin.settings.ollamaModel,
			prompt: this.getStandalonePromptMain(content),
			format: "json",
			stream: false,
		};
		if (this.plugin.settings.structuredOutput) {
			request.prompt = this.getJsonSchemaPromptMain(content);
			request.format = this.getJsonSchemaMain();
		}
		const response = await ollama.generate(request)

		const text = response.response;
		const start = text.indexOf("{");
		const end = text.lastIndexOf("}");
		const jsonText = text.substring(start, end + 1);
		console.log(text);
		console.log(jsonText);
		return JSON.parse(jsonText);
	}

	private async getSanitizedContent(): Promise<string | null> {
		let content = await getEditorSelection() || await getEditorContent();
		if (!content) {
			new Notice("QuizBot: Error - No active file selection.");
			return null;
		}

		content = content.replace(/!\[\[\S+\]\]/g, "![image]") // replace image links with a placeholder
			.replace(/\[\[[^\[\]]+\|([^\[\]]+)\]\]/g, (match, capture) => capture) // replace aliased internal links with the text inside the pipe
			.replace(/\[\[([^\[\]]+)\]\]/g, (match, capture) => capture) // replace unaliased internal links with the text inside the brackets
			.replace(/\[([^\[\]]+)\]\(\S+\)/g, (match, capture) => capture) // replace external links with the text inside the brackets
			.replace(/%%[^%]+%%/g, ''); // remove comments
		console.log(content);

		return content;
	}

	private getPromptGenerate(content: string, rags: string) {
		return `
			${content}
			
			Additional Information:
			${rags}
			
			You can use your own knowledge in addition to the additional information to respond.
			Only use additional information that relates directly to the provided prompt in your response.
			If the information is nonsensical, ignore it.
			Don't mention the fact that you are using additional information in your response.
			As far as the user is concerned, you have never seen the additional information. 			
		`;
	}

	private getJsonSchemaRouter() {
		return {
			"type": "string",
			"enum": ["generate", "quiz"]
		}
	}

	private getJsonSchemaPromptRouter(content: string) {
		return `
			${content}
			
			For the preceding prompt, determine whether to output "generate" or "quiz".
				- Output "quiz" if the prompt is asking to generate a multiple choice quiz.
				- Output "generate" if the prompt is not asking to generate a quiz.
			
			Do not include any explanations or additional text.
		`;
	}

	private getJsonSchemaMain() {
		return {
			"type": "object",
			"properties": {
				"questions": {
					"type": "array",
					"items": {
						"type": "object",
						"properties": {
							"text": { "type": "string" },
							"choices": {
								"type": "object",
								"properties": {
									"1": { "type": "string" },
									"2": { "type": "string" },
									"3": { "type": "string" },
									"4": { "type": "string" }
								},
								"required": ["1", "2", "3", "4"]
							},
							"answer": {
								"type": "string",
								"enum": ["1", "2", "3", "4"]
							}
						},
						"required": ["text", "choices", "answer"]
					},
					"minItems": 10,
					"maxItems": 10
				}
			},
			"required": ["questions"]
		}
	}

	private getJsonSchemaPromptMain(content: string) {
		return `
			${content}
			
			Create a multiple choice quiz based on the preceding content.
			Each question should have one correct answer and three distractors.
			Make sure the questions are clear and concise, and that the choices are plausible.
			Do not include any explanations or additional text.
			
			You can use your own knowledge in addition to the additional information.
			Don't mention the fact that you are using additional information in your response.
			As far as the user is concerned, you have never seen the additional information. 
		`;
	}

	private getStandalonePromptMain(content: string) {
		return `
			${content}
			
			Create a 10-question multiple choice quiz based on the preceding content.
			Make sure there are exactly 10 questions, each with 4 choices.
			Each question should have one correct answer and three distractors.
			Make sure the questions are clear and concise, and that the choices are plausible.
			Do not include any explanations or additional text.
			Format the output as JSON:
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
