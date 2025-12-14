import { ItemView, Notice, TFile, WorkspaceLeaf } from "obsidian";
import QuizBotPlugin from "main";
import { Ollama } from "ollama";
import { OllamaGenerateRequest } from "src/util/types";
import { getEditorContent, getEditorSelection, getMarkdownFiles, getSelectedFilesContent, getVaultPath } from "./util/obsidian";
import { batchAddChunks, recreateCollection, getChunksFromFiles, queryCollection } from "./util/chroma";
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

		const mainContainer = container.createEl("div", { cls: "main-container" });
		const topContainer = mainContainer.createEl("div", { cls: "top-container" });
		const middleContainer = mainContainer.createEl("div", { cls: "middle-container" });
		const bottomContainer = mainContainer.createEl("div", { cls: "bottom-container" });

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

		// diversify the original prompt
		const queries = await this.generateDiversifyQueryResponse(prompt);
		queries.push(prompt);

		// lookup queries (including original prompt) in vector db
		const queryResults = await queryCollection("alpine-vault", queries);
		console.log("CHROMA_DOCUMENTS: ", queryResults);

		// aggregate and rerank query results (Reciprocal Rank Fusion)
		const scoreMap = new Map<string, number>();
		const k = 60;
		for (const documents of queryResults.documents) {
			for (let i = 0; i < documents.length; i++) {
				const document = documents[i];
				if (document === null) continue;

				const score = scoreMap.get(document) || 0;
				scoreMap.set(document, score + 1 / (i + k));
			}
		}

		const ragDocuments = Array.from(scoreMap.keys())
			.sort((a, b) => (scoreMap.get(b) as number) - (scoreMap.get(a) as number))
			.map(doc => `${doc} (Score: ${(100 * (scoreMap.get(doc) || 0)).toFixed(3)})`);
		console.log("RERANKED_DOCUMENTS", ragDocuments);
		const ragContent = ragDocuments.join("\n");

		// route request to either generate text or quiz response
		const route = await this.generateRouterResponse(prompt);

		if (route === "quiz") {
			container.empty();
			container.createEl("p", { text: "Generating quiz..." });

			await this.generateQuiz(container, ragContent);
		} else if (route === "generate") {
			container.empty();
			container.createEl("p", { text: "Generating response..." });

			const rawResponse = await this.generateLLMResponse(prompt, ragContent);
			container.innerHTML = await latexMarkdownToHTML(rawResponse);
		}
	}

	async generateRouterResponse(prompt: string): Promise<string> {
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
		return route;
	}

	async generateDiversifyQueryResponse(prompt: string): Promise<string[]> {
		const ollama = new Ollama({ host: "localhost:58081" })
		const request: OllamaGenerateRequest = {
			model: this.plugin.settings.ollamaModel,
			prompt: this.getJsonSchemaPromptDiversifier(prompt),
			format: this.getJsonSchemaDiversifier(),
			stream: false,
		};
		const chatResponse = await ollama.generate(request);
		const diversifiedQueries = JSON.parse(chatResponse.response);
		console.log("DIVERSIFY: ", diversifiedQueries);
		return diversifiedQueries;
	}

	async generateLLMResponse(prompt: string, rags: string): Promise<string> {
		const ollama = new Ollama({ host: "localhost:58081" })
		const request: OllamaGenerateRequest = {
			model: this.plugin.settings.ollamaModel,
			prompt: this.getPromptGenerate(prompt, rags),
			stream: false,
		};
		const chatResponse = await ollama.generate(request);
		console.log("GENERATE: ", chatResponse.response);
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
		if (!content) {
			content = await this.fetchQuizContentFromEditor();
		}

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

	private async fetchQuizContentFromEditor(): Promise<string> {
		let content = null;

		// try navbar file selections
		const selectedFileContents = await getSelectedFilesContent();
		if (selectedFileContents !== null) {
			content = this.sanitizeContent(selectedFileContents.join("\n\n\n\n\n"));
			console.log("Using Navbar File Selections...\n\n", content);
		} else {
			// try editor content
			const editorContent = await getEditorSelection() || await getEditorContent();
			if (editorContent !== null) {
				content = this.sanitizeContent(editorContent);
				console.log("Using Editor Content...\n\n ", content);
			} else {
				// give up & error out
				new Notice("QuizBot: Error - No active selected file/s.");
				throw new Error("QuizBot: Error - No active selected file/s.");
			}
		}

		return content;
	}

	private async generateQuizJson(content: string) {
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

	private sanitizeContent(content: string): string {
		return content.replace(/!\[\[\S+\]\]/g, "![image]") // replace image links with a placeholder
			.replace(/\[\[[^\[\]]+\|([^\[\]]+)\]\]/g, (match, capture) => capture) // replace aliased internal links with the text inside the pipe
			.replace(/\[\[([^\[\]]+)\]\]/g, (match, capture) => capture) // replace unaliased internal links with the text inside the brackets
			.replace(/\[([^\[\]]+)\]\(\S+\)/g, (match, capture) => capture) // replace external links with the text inside the brackets
			.replace(/%%[^%]+%%/g, ''); // remove comments
	}

	private getPromptGenerate(content: string, rags: string) {
		return `
			Prompt:
			${content}
			
			Additional Information:
			${rags}
			
			You are a helpful assistant that answers prompts based on its preexisting knowledge and additional information passed to it. 
			
			You can use your own knowledge in addition to the additional information to respond.
			Only use additional information that relates directly to the provided prompt in your response.
			If the information is nonsensical, ignore it.
			If the information is not relevant to the prompt, ignore it.
			Don't mention the fact that you are using additional information in your response.
			As far as the user is concerned, you have never seen the additional information. 			
		`;
	}

	private getJsonSchemaRouter() {
		return {
			"type": "string",
			"enum": ["generate", "quiz"]
		};
	}

	private getJsonSchemaPromptRouter(content: string) {
		return `
			Prompt:
			${content}
			
			For the preceding prompt, determine whether to output "generate" or "quiz".
				- Output "quiz" if the prompt is asking to generate a multiple choice quiz.
				- Output "generate" if the prompt is not asking to generate a quiz.
			
			Do not include any explanations or additional text.
		`;
	}

	private getJsonSchemaDiversifier() {
		return {
			"type": "array",
			"items": {
				"type": "string"
			},
			"minItems": 5,
			"maxItems": 5
		}
	}

	private getJsonSchemaPromptDiversifier(content: string) {
		return `
			Prompt:
			${content}
		
			You are a helpful assistant that generates multiple search queries based on a single input query.
			For the preceding prompt, generate 5 search queries that are related to it.
			
			Ensure that your queries will map roughly to the same retrievals from a RAG system.
			If the original prompt is personal, ensure that your queries are also personal.
			Do not include any explanations or additional text.
		`;
	}

	private getJsonSchemaMain() {
		const questionCount = this.plugin.settings.questionCount;
		const choiceCount = this.plugin.settings.choiceCount;

		const choicesPropertiesSchema: Record<string, { type: string }> = {};
		const choicesEnumSchema = [];
		for (let i = 1; i <= choiceCount; i++) {
			choicesPropertiesSchema[`${i}`] = { "type": "string" };
			choicesEnumSchema.push(`${i}`)
		}

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
								"properties": choicesPropertiesSchema,
								"required": choicesEnumSchema
							},
							"answer": {
								"type": "string",
								"enum": choicesEnumSchema
							}
						},
						"required": ["text", "choices", "answer"]
					},
					"minItems": questionCount,
					"maxItems": questionCount
				}
			},
			"required": ["questions"]
		};
	}

	private getJsonSchemaPromptMain(content: string) {
		return `
			Prompt:
			${content}
			
			Create a multiple choice quiz based on the preceding content.
			Each question should have one correct answer and the rest should be distractors.
			Make sure the questions are clear and concise, and that the choices are plausible.
			Do not include any explanations or additional text.
			
			You can use your own knowledge in addition to the additional information.
			Don't mention the fact that you are using additional information in your response.
			As far as the user is concerned, you have never seen the additional information. 
		`;
	}

	private getStandalonePromptMain(content: string) {
		return `
			Prompt:
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
