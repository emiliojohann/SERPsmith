#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const operation = process.argv[2];
const fail = (code, cls, detail) => {
  process.stderr.write(JSON.stringify({adapter:"markdown_content",result:"failed",retryable:false,class:cls,detail}) + "\n");
  process.exit(code);
};
let req;
try { req = JSON.parse(fs.readFileSync(0, "utf8")); } catch { fail(64, "invalid_json", "JSON request required on stdin"); }
if (!["prepare","validate"].includes(operation)) fail(64, "usage", "operation must be prepare or validate");
const { profile, article } = req;
if (!profile || !article) fail(64, "missing_request", "profile and article required");
const repo = path.resolve(profile.repository || "");
const postsDir = profile.content_adapter?.posts_directory;
if (!fs.existsSync(repo) || !postsDir) fail(64, "invalid_profile", "repository and posts_directory required");
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug || "")) fail(64, "invalid_slug", "lowercase hyphenated slug required");
const safe = rel => {
  const resolved = path.resolve(repo, rel);
  if (!resolved.startsWith(repo + path.sep)) fail(64, "path_escape", rel);
  return resolved;
};
const articleRel = path.posix.join(postsDir.replaceAll("\\","/"), `${article.slug}.md`);
const articlePath = safe(articleRel);
const route = profile.article_route.replace("<slug>", article.slug);
const canonical = new URL(route, profile.public_base_url).toString();
const quote = value => JSON.stringify(String(value));
for (const key of ["title","description","date","body_markdown"]) if (!article[key]) fail(64, "missing_article_field", key);
if (/^#\s/m.test(article.body_markdown)) fail(64, "body_h1_forbidden", "template owns H1");
if (!/^##\s/m.test(article.body_markdown)) fail(64, "body_h2_missing", "body must contain H2");
const frontmatter = ["---",`title: ${quote(article.title)}`,`description: ${quote(article.description)}`,`date: ${quote(article.date)}`,`slug: ${quote(article.slug)}`,`canonical: ${quote(canonical)}`,article.image ? `image: ${quote(article.image)}` : null,article.og_image ? `og_image: ${quote(article.og_image)}` : null,"---",""].filter(v => v !== null).join("\n");
if (operation === "prepare") {
  if (fs.existsSync(articlePath)) fail(64, "duplicate_article", articleRel);
  if (!fs.existsSync(path.dirname(articlePath))) fail(64, "posts_directory_missing", postsDir);
  fs.writeFileSync(articlePath, frontmatter + article.body_markdown.trim() + "\n", {flag:"wx"});
  const changed = [articleRel];
  if (profile.sitemap_file) {
    const sitemapPath = safe(profile.sitemap_file);
    const xml = fs.readFileSync(sitemapPath, "utf8");
    if (xml.includes(`<loc>${canonical}</loc>`)) fail(64, "duplicate_sitemap_url", canonical);
    if (!xml.includes("</urlset>")) fail(64, "unsupported_sitemap", "expected </urlset>");
    const entry = `  <url>\n    <loc>${canonical}</loc>\n    <lastmod>${article.date}</lastmod>\n  </url>\n`;
    fs.writeFileSync(sitemapPath, xml.replace("</urlset>", entry + "</urlset>"));
    changed.push(profile.sitemap_file);
  }
  process.stdout.write(JSON.stringify({adapter:"markdown_content",result:"prepared",retryable:false,slug:article.slug,canonical,changed}) + "\n");
  process.exit(0);
}
if (!fs.existsSync(articlePath)) fail(64, "article_missing", articleRel);
const actual = fs.readFileSync(articlePath, "utf8");
if (!actual.startsWith("---\n") || !actual.includes(`slug: ${quote(article.slug)}`) || !actual.includes(`canonical: ${quote(canonical)}`)) fail(64, "article_validation", articleRel);
if (profile.sitemap_file && !fs.readFileSync(safe(profile.sitemap_file), "utf8").includes(`<loc>${canonical}</loc>`)) fail(64, "sitemap_validation", canonical);
process.stdout.write(JSON.stringify({adapter:"markdown_content",result:"verified",retryable:false,slug:article.slug,canonical}) + "\n");
