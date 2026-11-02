import { resolve, join } from 'path';
import {
  readFileSync,
  writeFileSync,
  copyFileSync,
  existsSync,
  readdirSync,
  mkdirSync
} from 'fs';
import { marked } from 'marked';

const p = (f) => resolve(__dirname, f);
const siteOrigin = 'https://nanocell-csv.com';

const escapeHtml = (str = '') =>
  String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const stripHtml = (html = '') =>
  String(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

const toAbsoluteUrl = (url = '', fallback = '') => {
  if (!url) return fallback;
  if (/^https?:\/\//i.test(url)) return url;
  return `${siteOrigin}${url.startsWith('/') ? '' : '/'}${url}`;
};

export function formatMetaTitle(title = '', suffix = 'NanoCell CSV', maxLen = 69) {
  const clean = String(title).trim();
  const hasBrand = /nanocell/i.test(clean);
  const withSuffix = hasBrand ? clean : `${clean} — ${suffix}`;
  if (withSuffix.length <= maxLen) return withSuffix;
  if (clean.length <= maxLen) return clean;
  const sliced = clean.slice(0, maxLen - 1);
  const lastSpace = sliced.lastIndexOf(' ');
  return `${(lastSpace > 20 ? sliced.slice(0, lastSpace) : sliced).trimEnd()}…`;
}

export function renderTermsHtml({ appMetaImage = '' } = {}) {
  const pageTpl = readFileSync(p('templates/terms.html'), 'utf-8');
  const md = (f) => marked.parse(readFileSync(p(f), 'utf-8'));
  const title = 'Terms of Use & License';
  const metaTitle = formatMetaTitle(title);
  const description = 'Terms of Use and Creative Commons Attribution-NonCommercial-NoDerivs 3.0 Unported License for NanoCell CSV Editor.';
  const canonicalUrl = `${siteOrigin}/terms_of_use_and_license.html`;

  return pageTpl
    .replace(/\{\{META_TITLE\}\}/g, escapeHtml(metaTitle))
    .replace(/\{\{TITLE\}\}/g, escapeHtml(title))
    .replace(/\{\{DESCRIPTION\}\}/g, escapeHtml(description))
    .replace(/\{\{CANONICAL_URL\}\}/g, canonicalUrl)
    .replace(/\{\{OG_IMAGE\}\}/g, escapeHtml(appMetaImage))
    .replace(/\{\{TERMS_BODY\}\}/g, md('TERMS_OF_USE.md'))
    .replace(/\{\{LICENSE_BODY\}\}/g, md('LICENSE.md'));
}

export function parseArticleData(mdFilePath, slug, { appDescription = '', appMetaImage = '' } = {}) {
  const rawMd = readFileSync(mdFilePath, 'utf-8');
  const titleMatch = rawMd.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : slug.replace(/-/g, ' ');

  const bodyImgMatch = rawMd.match(/!\[[^\]]*\]\(((?:https?:\/\/[^)\s]+|\/[^)\s]+)\.(?:webp|png|jpe?g|gif))\)/i);
  const ogImage = bodyImgMatch ? toAbsoluteUrl(bodyImgMatch[1].trim(), appMetaImage) : appMetaImage;

  const cleanedMd = rawMd
    .replace(/^#\s+.+$/m, '')
    .trim()
    .replace(/(!\[[^\]]*\]\()https?:\/\/(www\.)?nanocell-csv\.com\//gi, '$1/');

  const htmlBody = marked.parse(cleanedMd, { breaks: true });
  const description =
    Array.from(htmlBody.matchAll(/<p>([\s\S]*?)<\/p>/gi), (m) => stripHtml(m[1])).find(Boolean) ||
    appDescription;

  return {
    slug,
    title,
    ogImage,
    description,
    htmlBody
  };
}

export function getAllArticles(defaults = {}) {
  const articlesDir = p('articles');
  if (!existsSync(articlesDir)) return [];
  return readdirSync(articlesDir)
    .filter((f) => f.toLowerCase().endsWith('.md'))
    .sort()
    .map((file) => parseArticleData(join(articlesDir, file), file.replace(/\.md$/i, ''), defaults));
}

const FEATURED_ARTICLE_ORDER = [
  'edit-csv-without-losing-leading-zeros',
  'clean-csv-for-sql-database-import',
  'open-large-csv-files',
  'fix-csv-encoding-and-delimiters',
  'why-excel-corrupts-csv-files',
  'free-offline-csv-editor-and-validator'
];

function sortByFeaturedOrder(articles = []) {
  return [...articles].sort((a, b) => {
    const idxA = FEATURED_ARTICLE_ORDER.indexOf(a.slug);
    const idxB = FEATURED_ARTICLE_ORDER.indexOf(b.slug);
    const rankA = idxA === -1 ? Number.MAX_SAFE_INTEGER : idxA;
    const rankB = idxB === -1 ? Number.MAX_SAFE_INTEGER : idxB;
    return rankA - rankB || a.slug.localeCompare(b.slug);
  });
}

export function renderArticleCards(articles = []) {
  const cardTpl = readFileSync(p('templates/article-card.html'), 'utf-8');
  return articles
    .map((a) => {
      const cardImg = (a.ogImage || '/nanocell_meta_image_banner.webp').replace(
        /^https?:\/\/(www\.)?nanocell-csv\.com\//i,
        '/'
      );
      return cardTpl
        .replace(/\{\{SLUG\}\}/g, escapeHtml(a.slug))
        .replace(/\{\{OG_IMAGE\}\}/g, escapeHtml(cardImg))
        .replace(/\{\{TITLE\}\}/g, escapeHtml(a.title))
        .replace(/\{\{DESCRIPTION\}\}/g, escapeHtml(a.description));
    })
    .join('\n');
}

export function renderAllArticlesGrid(defaults = {}) {
  const ranked = sortByFeaturedOrder(
    getAllArticles(defaults).filter((a) => a.slug !== 'pwa-showcase')
  );
  return renderArticleCards(ranked);
}

export function renderArticleHtml(article, allArticles = []) {
  const pageTpl = readFileSync(p('templates/article.html'), 'utf-8');
  const related = sortByFeaturedOrder(
    allArticles.filter((a) => a.slug !== article.slug && a.slug !== 'pwa-showcase')
  ).slice(0, 3);
  const moreArticlesHtml = renderArticleCards(related);

  const metaTitle = formatMetaTitle(article.title);
  return pageTpl
    .replace(/\{\{META_TITLE\}\}/g, escapeHtml(metaTitle))
    .replace(/\{\{TITLE\}\}/g, escapeHtml(article.title))
    .replace(/\{\{DESCRIPTION\}\}/g, escapeHtml(article.description))
    .replace(/\{\{CANONICAL_URL\}\}/g, `${siteOrigin}/article/${article.slug}.html`)
    .replace(/\{\{OG_IMAGE\}\}/g, escapeHtml(article.ogImage))
    .replace(/\{\{BODY\}\}/g, article.htmlBody)
    .replace(/\{\{MORE_ARTICLES\}\}/g, moreArticlesHtml);
}

export function syncSitemapWithArticles(sitemapPath, articles) {
  if (!existsSync(sitemapPath)) return;
  let xml = readFileSync(sitemapPath, 'utf-8');
  const today = new Date().toISOString().slice(0, 10);
  for (const article of articles) {
    const loc = `https://nanocell-csv.com/article/${article.slug}.html`;
    if (!xml.includes(loc)) {
      const entry = `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`;
      xml = xml.replace('</urlset>', `${entry}\n</urlset>`);
    }
  }
  writeFileSync(sitemapPath, xml, 'utf-8');
}

export function serveWebpageDev(url, res, defaults = {}) {
  if (url === '/terms_of_use_and_license.html' || url === '/terms_of_use_and_license') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(renderTermsHtml(defaults));
    return true;
  }

  const articleMatch = url.match(/^\/article\/([a-zA-Z0-9_-]+)(?:\.html)?$/);
  if (!articleMatch) return false;

  const slug = articleMatch[1];
  const mdPath = p(`articles/${slug}.md`);
  if (!existsSync(mdPath)) return false;

  const allArticles = getAllArticles(defaults);
  const current = allArticles.find((a) => a.slug === slug) || parseArticleData(mdPath, slug, defaults);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(renderArticleHtml(current, allArticles));
  return true;
}

export function buildWebpages(defaults = {}) {
  copyFileSync(p('dist/web/index.html'), p('dist/index.html'));
  writeFileSync(p('dist/terms_of_use_and_license.html'), renderTermsHtml(defaults), 'utf-8');
  copyFileSync(p('web/article-theme.css'), p('dist/web/article-theme.css'));

  const allArticles = getAllArticles(defaults);
  if (allArticles.length === 0) return;

  const outArticleDir = p('dist/article');
  mkdirSync(outArticleDir, { recursive: true });
  for (const article of allArticles) {
    writeFileSync(join(outArticleDir, `${article.slug}.html`), renderArticleHtml(article, allArticles), 'utf-8');
  }
  syncSitemapWithArticles(p('dist/sitemap.xml'), allArticles);
}
