import { marked } from 'marked';
import DOMPurify from 'dompurify';
import katex from 'katex';
import 'katex/dist/katex.min.css';

const renderer = new marked.Renderer();

// Override the code and codespan renderers to handle math blocks
const originalCodeRenderer = renderer.code;
renderer.code = function(code, language) {
  if (language === 'math') {
    return katex.renderToString(code, {
      throwOnError: false,
      displayMode: true
    });
  }
  return originalCodeRenderer.call(this, code, language);
};

const originalCodespanRenderer = renderer.codespan;
renderer.codespan = function(code) {
  // Ensure code is a string
  if (typeof code !== 'string') {
    code = String(code || '');
  }
  
  if (code.startsWith('$$') && code.endsWith('$$')) {
    const math = code.substring(2, code.length - 2);
    return katex.renderToString(math, {
      throwOnError: false,
      displayMode: true
    });
  }
  if (code.startsWith('$') && code.endsWith('$')) {
    const math = code.substring(1, code.length - 1);
    return katex.renderToString(math, {
      throwOnError: false,
      displayMode: false
    });
  }
  return originalCodespanRenderer.call(this, code);
};

marked.setOptions({ renderer });

export const renderMarkdown = (markdownText) => {
  if (!markdownText) return { __html: '' };
  const rawMarkup = marked(markdownText);
  const sanitizedMarkup = DOMPurify.sanitize(rawMarkup, {
    ADD_TAGS: ['iframe', 'span', 'annotation', 'math', 'semantics'],
    ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'class', 'style', 'encoding']
  });
  return { __html: sanitizedMarkup };
};
