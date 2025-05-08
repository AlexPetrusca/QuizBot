import {ItemView, MarkdownView, Notice, WorkspaceLeaf} from "obsidian";

export const QUIZ_VIEW_TYPE = "quiz-view";

export class QuizView extends ItemView {
	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
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
		const regenerateButton = quizHeader.createEl("button", { text: "Regenerate" });

		const quizContainer = container.createEl("div", { cls: "quiz-container" });
		this.generateQuiz(quizContainer);
		this.registerDomEvent(regenerateButton, 'click', () => {
			this.generateQuiz(quizContainer);
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
				console.log("Selected text:", content);
			}
		}
		if (!content) {
			const activeFile = this.app.workspace.getActiveFile();
			if (activeFile) {
				content = await this.app.vault.read(activeFile);
				console.log("File text:", content);
			}
		}

		if (!content) {
			new Notice("QuizBot: Error - No active file selection.");
			return;
		}

		const prompt = `
			${content}
			
			Create a 10-question multiple choice quiz based on the following content. Format the output as JSON:
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
		const response = await fetch("http://localhost:11434/api/generate", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model: "qwen3:30b-a3b",
				prompt: prompt,
				stream: false,
			}),
		});
		const result = await response.json();

		// parse json generation out of the response
		const start = result.response.indexOf("{");
		const end = result.response.lastIndexOf("}");
		return JSON.parse(result.response.substring(start, end + 1));
	}

	async onClose() {
		// Cleanup if needed
	}
}
