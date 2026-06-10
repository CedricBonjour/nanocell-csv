import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { marked } from 'marked';

// Resolve paths relative to the project root (where package.json lives),
// regardless of where this script is invoked from.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DIST = path.resolve(ROOT, 'dist');

// HTML template
const template = (title, content) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} - Nanocell CSV</title>
  <link rel="stylesheet" type="text/css" href="/theme.css">
  <style>
    body { padding: 2em; max-width: 800px; margin: 0 auto; font-family: sans-serif; line-height: 1.6; }
    pre { background: #f4f4f4; padding: 1em; overflow-x: auto; }
    code { background: #f4f4f4; padding: 0.2em 0.4em; }
    @media (prefers-color-scheme: dark) {
      body { background: #1a1a1a; color: #f4f4f4; }
      pre, code { background: #2a2a2a; }
      a { color: #4da6ff; }
    }
  </style>
</head>
<body>
  <nav style="margin-bottom: 2em;">
    <a href="/">&larr; Back to Home</a>
  </nav>
  ${content}
</body>
</html>
`;

function generateFile(inputFile, outputFile, title) {
  if (!fs.existsSync(inputFile)) return;
  const markdown = fs.readFileSync(inputFile, 'utf-8');
  const html = marked.parse(markdown);
  const finalHtml = template(title, html);

  // Ensure directory exists
  const dir = path.dirname(outputFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(outputFile, finalHtml);
  console.log(`Generated ${outputFile}`);
}

// Ensure dist/ exists (may not exist yet during prebuild)
if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });

// 1. Generate dist/terms_of_use_and_license.html
const termsHtml = `
  <h1>Terms of Use and License</h1>
  ${marked.parse(fs.existsSync(path.join(ROOT, 'TERMS_OF_USE.md')) ? fs.readFileSync(path.join(ROOT, 'TERMS_OF_USE.md'), 'utf-8') : '')}
  <hr style="margin: 2em 0;" />
  ${marked.parse(fs.existsSync(path.join(ROOT, 'LICENSE.md')) ? fs.readFileSync(path.join(ROOT, 'LICENSE.md'), 'utf-8') : '')}
`;
const termsOut = path.join(DIST, 'terms_of_use_and_license.html');
fs.writeFileSync(termsOut, template('Terms of Use & License', termsHtml));
console.log(`Generated ${termsOut}`);

// 2. Generate articles
const articleSrc = path.join(ROOT, 'article');
if (fs.existsSync(articleSrc)) {
  const articles = fs.readdirSync(articleSrc).filter(f => f.endsWith('.md'));
  for (const file of articles) {
    const name = file.replace('.md', '');
    generateFile(
      path.join(articleSrc, file),
      path.join(DIST, 'article', `${name}.html`),
      name
    );
  }
}
