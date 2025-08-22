import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html";
import { TeX } from "mathjax-full/js/input/tex";
import { mathjax } from "mathjax-full/js/mathjax";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages";
import { AssistiveMmlHandler } from "mathjax-full/js/a11y/assistive-mml";
import { SVG } from "mathjax-full/js/output/svg";
import { marked } from "marked";
import he from "he";

export function escapeLatexSpecialCharacters(text: string) {
	const specialChars = /[\\`*_{}[\]()#+-.!|~]/g;
	return text.replace(/\${1,2}([^$]*?)\${1,2}/g, (match, latexContent) => {
		const escapedContent = latexContent.replace(specialChars, (char: string) => `\\${char}`);
		return match.startsWith('$$') ? `$$${escapedContent}$$` : `$${escapedContent}$`;
	});
}

function decodeLatexHTMLEntities(text: string) {
	return text.replace(/\${1,2}([^$]*?)\${1,2}/g, (match, latexContent) => {
		const decodedContent = he.decode(latexContent);
		return match.startsWith('$$') ? `$$${decodedContent}$$` : `$${decodedContent}$`;
	});
}

export async function latexMarkdownToHTML(text: string): Promise<string> {
	const adaptor = liteAdaptor();
	AssistiveMmlHandler(RegisterHTMLHandler(adaptor));

	const tex = new TeX({ packages: AllPackages });
	const svg = new SVG();
	const htmlDoc = mathjax.document("", { InputJax: tex, OutputJax: svg, assistiveMml: true });

	function renderMath(latex: string, display = false) {
		const node = htmlDoc.convert(latex, { display: display });
		const htmlRender = adaptor.outerHTML(node);
		if (display) {
			return `<span class="math-block">${htmlRender}<\span>`;
		} else {
			return `<span class="math-inline">${htmlRender}<\span>`;
		}
	}

	text = text
		.replace(/\\\(([^$]*?)\\\)/g, (_, expr) => `\$${expr}\$`)
		.replace(/\\\[([^$]*?)\\\]/g, (_, expr) => `\$\$${expr}\$\$`);
	// console.log("SUBSTITUTED", text);

	text = escapeLatexSpecialCharacters(text);
	// console.log("ESCAPED", text);

	text = await marked.parse(text);
	// console.log("PARSED", text);

	text = decodeLatexHTMLEntities(text)
	// console.log("DECODED", text);

	text = text
		.replace(/\$\$([^$]+)\$\$/g, (_, expr) => renderMath(expr, true))
		.replace(/\$([^$]+)\$/g, (_, expr) => renderMath(expr, false))
	// console.log("JAXED", text);

	return text;
}
