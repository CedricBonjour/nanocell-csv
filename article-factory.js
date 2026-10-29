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

const toLocalAssetPath = (url = '') =>
  url.replace(/^https?:\/\/(www\.)?nanocell-csv\.com\//i, '/');

const toAbsoluteUrl = (url = '', fallback = '') => {
  if (!url) return fallback;
  if (/^https?:\/\//i.test(url)) return url;
  return `${siteOrigin}${url.startsWith('/') ? '' : '/'}${url}`;
};

export function parseArticleData(mdFilePath, slug, { appDescription = '', appMetaImage = '' } = {}) {
  const rawMd = readFileSync(mdFilePath, 'utf-8');
  const titleMatch = rawMd.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : slug.replace(/-/g, ' ');

  const commentImgMatch = rawMd.match(/<!--\s*((?:https?:\/\/[^\s>]+|\/[^\s>]+)\.(?:webp|png|jpe?g|gif))\s*-->/i);
  const bannerImgUrl = commentImgMatch ? commentImgMatch[1].trim() : null;

  const bodyImgMatch = rawMd.match(/!\[[^\]]*\]\(((?:https?:\/\/[^)\s]+|\/[^)\s]+)\.(?:webp|png|jpe?g|gif))\)/i);
  const ogImgRaw = bannerImgUrl || (bodyImgMatch ? bodyImgMatch[1].trim() : null);
  const ogImage = ogImgRaw ? toAbsoluteUrl(ogImgRaw, appMetaImage) : appMetaImage;

  const cleanedMd = rawMd
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^#\s+.+$/m, '')
    .trim()
    .replace(/(!\[[^\]]*\]\()https?:\/\/(www\.)?nanocell-csv\.com\//gi, '$1/');

  const htmlBody = marked.parse(cleanedMd, { breaks: true });
  const firstPMatch = htmlBody.match(/<p>([\s\S]*?)<\/p>/i);
  const description = firstPMatch ? stripHtml(firstPMatch[1]) : appDescription;

  return {
    slug,
    title,
    bannerSrc: bannerImgUrl ? toLocalAssetPath(bannerImgUrl) : null,
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
  'how-to-open-a-csv-file',
  'fix-csv-encoding-and-delimiters',
  'about-csv-files',
  'lets-fix-csv-files'
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
    .map((a) =>
      cardTpl
        .replace(/\{\{SLUG\}\}/g, escapeHtml(a.slug))
        .replace(/\{\{TITLE\}\}/g, escapeHtml(a.title))
        .replace(/\{\{DESCRIPTION\}\}/g, escapeHtml(a.description))
    )
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

  const bannerHtml = article.bannerSrc
    ? `<img id="banner" src="${escapeHtml(article.bannerSrc)}" alt="${escapeHtml(article.title)}" loading="eager" />`
    : '';

  return pageTpl
    .replace(/\{\{TITLE\}\}/g, escapeHtml(article.title))
    .replace(/\{\{DESCRIPTION\}\}/g, escapeHtml(article.description))
    .replace(/\{\{CANONICAL_URL\}\}/g, `${siteOrigin}/article/${article.slug}.html`)
    .replace(/\{\{OG_IMAGE\}\}/g, escapeHtml(article.ogImage))
    .replace(/\{\{BANNER\}\}/g, bannerHtml)
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

export function serveArticleDev(url, res, defaults = {}) {
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

export function buildArticles(defaults = {}) {
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
