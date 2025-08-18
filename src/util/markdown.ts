import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html";
import { TeX } from "mathjax-full/js/input/tex";
import { CHTML } from "mathjax-full/js/output/chtml";
import { mathjax } from "mathjax-full/js/mathjax";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages";
import { AssistiveMmlHandler } from "mathjax-full/js/a11y/assistive-mml";
import { marked } from "marked";
import { SVG } from "mathjax-full/js/output/svg";

export async function latexMarkdownToHTML(text: string): Promise<string> {
	const adaptor = liteAdaptor();
	AssistiveMmlHandler(RegisterHTMLHandler(adaptor));

	const tex = new TeX({ packages: AllPackages });
	const svg = new SVG();
	const htmlDoc = mathjax.document("", { InputJax: tex, OutputJax: svg, assistiveMml: true });

	function renderMath(latex: string, display = false) {
		const node = htmlDoc.convert(latex, { display: display });
		return adaptor.outerHTML(node);
	}
	console.log(text)

	const preprocessedMd = text
		.replace(/\\\((.*?)\\\)/g, (_, expr) => `\$${expr}\$`)
		.replace(/\\\[([^$]*?)\\\]/g, (_, expr) => `\$\$${expr}\$\$`);
	console.log(preprocessedMd);

	const jaxedMd = preprocessedMd
		.replace(/\$\$([^$]+)\$\$/g, (_, expr) => renderMath(expr, true))
		.replace(/\$([^$]+)\$/g, (_, expr) => renderMath(expr, false))

	const html = await marked.parse(jaxedMd);
	console.log(html);
	return html;
}
