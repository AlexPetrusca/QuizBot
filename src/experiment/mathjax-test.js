import { marked } from 'marked';
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { CHTML } from 'mathjax-full/js/output/chtml.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';

// 1. Create a MathJax adaptor and register the HTML handler
const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

// 2. Create MathJax input and output processors
const tex = new TeX({ packages: ['base', 'ams'] });
const chtml = new CHTML({});

// 3. Create MathJax document
const document = mathjax.document('', { InputJax: tex, OutputJax: chtml });

// Example Markdown with inline and block LaTeX
const markdown = `
# My Markdown Document

This is some **bold text** and some inline math: $E = mc^2$.

Here is a block equation:

$$
\\int_0^1 x^2 \\, dx
$$

Here is a quote block equation:

> $$
> \\int_0^1 x^2 \\, dx
> $$

Normal text continues here.
`;

// 4. Convert Markdown to HTML
let html = marked.parse(markdown);

// 5. Replace LaTeX with MathJax-rendered HTML
// Inline math: $...$
// Block math: $$...$$
html = html.replace(/\$\$([\s\S]+?)\$\$/g, (_, texString) => {
	return adaptor.outerHTML(document.convert(texString, { display: true }));
});

html = html.replace(/\$([^\$]+)\$/g, (_, texString) => {
	return adaptor.outerHTML(document.convert(texString, { display: false }));
});

console.log(html);
