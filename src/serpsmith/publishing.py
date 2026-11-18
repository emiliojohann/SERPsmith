"""Scoped Git publishers. No project code, PHP, hooks or build scripts are executed.

The caller owns execution authorization and durable pipeline checkpoints. This module
also writes a private target/commit intent before push. Unknown pushes reconcile only;
no automatic rebase, force push, or duplicate article creation.
"""
from __future__ import annotations

import hashlib
import html
from html.parser import HTMLParser
import io
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import urllib.request
from urllib.parse import urljoin, urlparse, urlsplit, unquote, unquote_plus, parse_qs, urlencode
from collections.abc import Mapping
import xml.etree.ElementTree as ET
from datetime import date
from collections import Counter

from .research import _same_site, _url_key, validate_article


class PublicationError(RuntimeError):
    def __init__(self, message, *, dispatched=None):
        super().__init__(message)
        self.dispatched = dispatched


def _git(root, *args):
    result = subprocess.run(['git', '-c', 'core.hooksPath=/dev/null', '-c',
                             'commit.gpgsign=false', '-c', 'user.name=SERPsmith',
                             '-c', 'user.email=publisher@localhost', '-C', str(root), *args],
                            capture_output=True, text=True, timeout=120,
                            env={**os.environ, 'GIT_TERMINAL_PROMPT': '0'})
    if result.returncode:
        # Git stderr can contain credential-bearing URLs. Do not return it.
        raise PublicationError('Git operation failed: ' + args[0])
    return result.stdout.strip()


def _atomic(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.tmp')
    with tmp.open('w') as f:
        os.chmod(tmp, 0o600)
        json.dump(data, f, sort_keys=True)
        f.flush()
        os.fsync(f.fileno())
    tmp.replace(path)


def _safe(root, relative):
    p = root / relative
    if Path(relative).is_absolute() or not p.resolve().is_relative_to(root.resolve()):
        raise PublicationError('Unsafe publisher path')
    if any(x.is_symlink() for x in [p, *p.parents] if x == root or root in x.parents):
        raise PublicationError('Symlinks are not publication targets')
    return p


def _article_markdown(blog, article):
    markdown = article['body_markdown']
    cfg = blog.get('publisher', {})
    label = cfg.get('sources_header_label', 'Sources')
    if cfg.get('show_sources', True) and not re.search(r'^##\s+' + re.escape(label) + r'\s*$', markdown, re.M | re.I):
        sources = []
        for source in article.get('sources', []):
            title = ' '.join(str(source.get('title') or urlparse(source['url']).netloc).split())[:200]
            title = title.replace('[', '').replace(']', '')
            sources.append(f"- [{title}]({source['url']})")
        if sources:
            markdown += '\n\n## ' + label + '\n\n' + '\n'.join(sources)
    return markdown


def _inline(text, base, jsx=False):
    """Small intentionally bounded Markdown dialect; raw HTML is always escaped."""
    def esc(s):
        s = html.escape(s, quote=True)
        return s.replace('{', '&#123;').replace('}', '&#125;') if jsx else s
    pieces, cursor = [], 0
    pattern = r'\[([^\]\n]+)\]\(([^\s)]+)\)(?:\{[^{}\n]*\})?|`([^`\n]+)`|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*'
    for m in re.finditer(pattern, text):
        pieces.append(esc(text[cursor:m.start()]))
        if m[1] is not None:
            target = m[2]
            u = urlparse(target)
            if (u.scheme not in ('', 'https', 'http') or target.startswith('//')
                    or u.username is not None or u.password is not None):
                raise PublicationError('Unsafe article link')
            external = bool(u.netloc and not _same_site(target, base))
            attrs = ' target="_blank" rel="noopener noreferrer nofollow"' if external else ''
            pieces.append(f'<a href="{esc(target)}"{attrs}>{esc(m[1])}</a>')
        else:
            tag, value = ('code', m[3]) if m[3] is not None else (('strong', m[4]) if m[4] is not None else ('em', m[5]))
            pieces.append(f'<{tag}>{esc(value)}</{tag}>')
        cursor = m.end()
    return ''.join(pieces) + esc(text[cursor:])


def render_markdown(markdown, base, jsx=False, *, require_lead=True):
    lines = markdown.strip().splitlines()
    if not lines or (require_lead and re.match(r'^(#|>|[-*] |\d+\. |```|\s*<)', lines[0])):
        raise PublicationError('Article must open with a lead paragraph')
    out, para, listing, fence, code = [], [], None, False, []
    def flush():
        if para:
            out.append('<p>' + _inline(' '.join(para), base, jsx) + '</p>')
            para.clear()
    for line in lines + ['']:
        if line.startswith('```'):
            flush()
            if fence:
                out.append('<pre><code>' + html.escape('\n'.join(code)).replace('{', '&#123;').replace('}', '&#125;') + '</code></pre>')
                code = []
            fence = not fence
            continue
        if fence:
            code.append(line)
            continue
        if re.match(r'^\s*\|', line) or re.match(r'^\s*[-*]\s+\[[ xX]\]', line) or re.match(r'^\s{2,}\S', line):
            raise PublicationError('Unsupported Markdown table, task list or nested block')
        li = re.match(r'^(?:([-*]) |(\d+)\. )(.*)', line)
        kind = ('ol' if li and li[2] else 'ul') if li else None
        if listing and kind != listing:
            out.append(f'</{listing}>')
            listing = None
        if li:
            flush()
            if not listing:
                listing = kind
                out.append(f'<{listing}>')
            out.append('<li>' + _inline(li[3], base, jsx) + '</li>')
        elif not line.strip():
            flush()
        elif line.startswith('#'):
            flush()
            m = re.match(r'^(#{2,3})\s+(.+)$', line)
            if not m:
                raise PublicationError('Only H2/H3 body headings are supported')
            out.append(f'<h{len(m[1])}>' + _inline(m[2], base, jsx) + f'</h{len(m[1])}>')
        elif line.startswith('> '):
            flush()
            out.append('<blockquote><p>' + _inline(line[2:], base, jsx) + '</p></blockquote>')
        else:
            para.append(line)
    if fence:
        raise PublicationError('Unclosed code fence')
    return '\n'.join(out)


def _php(value):
    if isinstance(value, bool):
        return 'true' if value else 'false'
    if isinstance(value, int):
        return str(value)
    if isinstance(value, list):
        return '[' + ', '.join(_php(x) for x in value) + ']'
    return "'" + str(value).replace('\\', '\\\\').replace("'", "\\'") + "'"


def _render_article(blog, article, *, jsx=False, style=None, stylesheet_href=None, runtime_href=None):
    """Author-styled summary before prose; homepage-styled FAQ immediately before Sources."""
    from .research import validate_article_features
    from .article_features import feature_markup, DEFAULT_STYLE
    complete = render_markdown(_article_markdown(blog, article), blog['url'], jsx)
    if not validate_article_features(article, required=False):
        return complete  # Historical accepted articles remain readable/verifiable.
    style = style or DEFAULT_STYLE
    route = blog.get('publisher', {}).get('article_route', '/blog/<slug>').replace('<slug>', article['slug'])
    canonical = blog['url'].rstrip('/') + route
    summary, faq, schema = feature_markup(article, canonical, style, jsx=jsx, stylesheet_href=stylesheet_href, runtime_href=runtime_href)
    markdown = _article_markdown(blog, article)
    label = blog.get('publisher', {}).get('sources_header_label', 'Sources')
    bibliography = re.search(r'^##\s+' + re.escape(label) + r'\s*$', markdown, re.M | re.I)
    split = bibliography.start() if bibliography else len(markdown)
    prefix = render_markdown(markdown[:split], blog['url'], jsx)
    suffix = markdown[split:]
    tail = render_markdown(suffix, blog['url'], jsx, require_lead=False) if suffix.strip() else ''
    return summary + '\n<div data-serpsmith-body="true">\n' + prefix + '\n' + faq + '\n' + tail + '\n</div>\n' + schema


def _prepare(checkout, blog, article, image):
    from .category_navigation import validate_category, validate_taxonomy_source
    validate_category(blog, article)
    validate_taxonomy_source(checkout, blog)
    # Legacy product-less fixtures can still render; production product policy is
    # explicit and cannot be waived by a stale validation flag on an old draft.
    if 'product' in blog:
        try:
            from .research import validate_article_features
            validate_article_features(article, required=True)
            validate_article(blog, article, internal=article.get('internal_links', []))
        except (ValueError, RuntimeError) as exc:
            raise PublicationError('Article failed pre-publication editorial structure: ' + str(exc)) from exc
    cfg = blog['publisher']
    name = cfg['name']
    if name not in ('php-posts-data', 'nextjs-tsx-blog-registry'):
        raise PublicationError('Unsupported publisher: ' + name)
    slug = article['slug']
    if not re.fullmatch('[a-z0-9]+(?:-[a-z0-9]+)*', slug):
        raise PublicationError('Invalid article slug')
    base = blog['url'].rstrip('/')
    route = cfg.get('article_route', '/blog/<slug>').replace('<slug>', slug)
    if not route.startswith('/') or urlparse(route).netloc:
        raise PublicationError('Invalid article route')
    url = base + route
    posts = _safe(checkout, cfg['posts_file'])
    text = posts.read_text()
    if re.search(r"['\"]slug['\"]\s*=>\s*['\"]" + re.escape(slug) + r"['\"]|\bslug\s*:\s*['\"]" + re.escape(slug) + r"['\"]", text):
        raise PublicationError('Slug already exists; reconcile instead')
    image_dir = cfg.get('image_directory', 'public/assets/blog' if name.startswith('nextjs') else 'images/blog')
    public_dir = cfg.get('public_directory', 'public' if name.startswith('nextjs') else '')
    assets = []
    from PIL import Image
    for key in ('path', 'social_path'):
        source = Path(image[key])
        with Image.open(source) as im:
            im.load()
            expected_size = ((image.get('social_width', image['width']), image.get('social_height', image['height']))
                             if key == 'social_path' else (image['width'], image['height']))
            if im.size != expected_size:
                raise PublicationError('Image dimensions do not match receipt')
            expected_format = 'JPEG' if key == 'social_path' else 'WEBP'
            if im.format != expected_format:
                raise PublicationError('Expected WebP hero and JPEG social derivative')
        relative = str(Path(image_dir) / (slug + ('.webp' if key == 'path' else '.jpg')))
        dest = _safe(checkout, relative)
        if dest.exists():
            raise PublicationError('Asset already exists')
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, dest)
        webpath = '/' + str(Path(relative).relative_to(public_dir)) if public_dir else '/' + relative
        assets.append((relative, webpath, hashlib.sha256(dest.read_bytes()).hexdigest()))
    day = date.fromisoformat(article['published_at'][:10])
    display = day.strftime('%B %d, %Y').replace(' 0', ' ')
    public_copy = '\n'.join(str(article.get(k, '')) for k in ('title', 'description', 'body_markdown', 'tldr', 'faq'))
    if re.search(r'/Users/|/home/|BEGIN (?:RSA |EC )?PRIVATE KEY|\bsk-[A-Za-z0-9_-]{20,}|\bAIza[A-Za-z0-9_-]{20,}', public_copy):
        raise PublicationError('Private path or credential-shaped content in article')
    from .article_features import site_style, create_stylesheet, create_faq_runtime
    from .research import validate_article_features
    style = site_style(checkout, cfg)
    stylesheet = create_stylesheet(checkout, cfg, style) if validate_article_features(article, required=False) else None
    runtime = create_faq_runtime(checkout, cfg) if stylesheet else None
    body = _render_article(blog, article, jsx=name.startswith('nextjs'), style=style,
                           stylesheet_href=stylesheet['href'] if stylesheet else None,
                           runtime_href=runtime['href'] if runtime else None)
    reading = str(max(1, len(article['body_markdown'].split()) // 220)) + ' min read'
    changed = [cfg['posts_file'], assets[0][0], assets[1][0]]
    if stylesheet and stylesheet['created']:
        changed.append(stylesheet['path'])
    if runtime and runtime['created']:
        changed.append(runtime['path'])
    if name == 'php-posts-data':
        match = re.search(r'\$posts\s*=\s*\[', text)
        if not match:
            raise PublicationError('Unsupported PHP posts declaration')
        # Preserve current website's literal authorship/presentation metadata; never execute PHP.
        tail = text[match.end():]
        defaults = {}
        for field in ('author', 'author_initials', 'author_image', 'author_role', 'author_link_url', 'author_link_label', 'author_link_icon', 'author_bio', 'gradient', 'theme'):
            m = re.search(r"'" + field + r"'\s*=>\s*('(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\")", tail)
            if m:
                defaults[field] = m[1]
        if 'author' not in defaults or 'author_role' not in defaults:
            raise PublicationError('Literal site author metadata missing')
        fields = dict(slug=slug, title=article['title'], excerpt=article['description'], date_iso=day.isoformat(), modified_iso=day.isoformat(), date_display=display, image=assets[0][1], image_alt=image['alt'], og_image=base + assets[1][1], og_image_type='image/jpeg', og_image_width=image.get('social_width', image['width']), og_image_height=image.get('social_height', image['height']), category=article.get('category', cfg.get('category', 'Guides')), tags=article.get('tags', []), read_time=reading, content=body, featured=False)
        entry = '\n  [\n' + ''.join('    ' + _php(k) + ' => ' + v + ',\n' for k, v in defaults.items()) + ''.join('    ' + _php(k) + ' => ' + _php(v) + ',\n' for k, v in fields.items()) + '  ],'
        text = text[:match.end()] + entry + text[match.end():]
    else:
        import_marker, post_marker = '// SERPSMITH:IMPORTS:END', '// SERPSMITH:POSTS:START'
        if text.count(import_marker) != 1 or text.count(post_marker) != 1:
            raise PublicationError('Registry markers missing or ambiguous')
        author = cfg.get('author_key', 'blogAuthor')
        if not re.fullmatch('[A-Za-z_$][A-Za-z0-9_$]*', author) or not re.search(r'export const ' + re.escape(author) + r'\b', text):
            raise PublicationError('Unknown registry author')
        symbol = 'Serpsmith' + ''.join(s.capitalize() for s in slug.split('-')) + 'Article'
        article_file = str(Path(cfg.get('articles_directory', 'src/content/blog')) / (slug + '.tsx'))
        target = _safe(checkout, article_file)
        if target.exists():
            raise PublicationError('Article component already exists')
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text('export default function Article() { return (<>\n' + body + '\n</>); }\n')
        changed.append(article_file)
        data = dict(slug=slug, title=article['title'], excerpt=article['description'], publishedAt=day.isoformat(), modifiedAt=day.isoformat(), displayDate=display, category=article.get('category', 'Guides'), tags=article.get('tags', []), readTime=reading, heroImage=assets[0][1], socialImage=assets[1][1], imageAlt=image['alt'])
        js = json.dumps(data, ensure_ascii=True)[:-1] + ', author: ' + author + ', Content: ' + symbol + '},'
        text = text.replace(import_marker, f'const {symbol} = () => import("@/content/blog/{slug}");\n' + import_marker)
        text = text.replace(post_marker, post_marker + '\n  ' + js)
    posts.write_text(text)
    sitemap = cfg.get('sitemap_file', 'sitemap.xml' if name == 'php-posts-data' else None)
    if sitemap and sitemap.endswith('.xml'):
        path = _safe(checkout, sitemap)
        xml = path.read_text()
        tree = ET.fromstring(xml)
        if tree.tag not in ('urlset', '{http://www.sitemaps.org/schemas/sitemap/0.9}urlset') or xml.count('</urlset>') != 1:
            raise PublicationError('Unsupported sitemap')
        if any(el.text == url for el in tree.iter()):
            raise PublicationError('Sitemap URL already exists')
        path.write_text(xml.replace('</urlset>', f'  <url><loc>{html.escape(url)}</loc><lastmod>{day.isoformat()}</lastmod></url>\n</urlset>'))
        changed.append(sitemap)
    discovery = cfg.get('llms_full_file', 'llms-full.txt' if name == 'php-posts-data' else None)
    if discovery:
        path = _safe(checkout, discovery)
        if not path.is_file():
            raise PublicationError('Configured discovery file missing')
        with path.open('a') as f:
            f.write('\n- ' + article['title'].replace('\n', ' ') + ': ' + url + '\n')
        changed.append(discovery)
    result: dict = dict(url=url, title=article['title'], published_at=article['published_at'], image_url=base + assets[0][1], social_image_url=base + assets[1][1], image_sha256=assets[0][2], social_sha256=assets[1][2], files=changed, slug=slug)
    if stylesheet:
        result['feature_stylesheet'] = {'url': base + stylesheet['href'], 'sha256': stylesheet['sha256']}
    if runtime:
        result['faq_runtime'] = {'url': base + runtime['href'], 'sha256': runtime['sha256']}
    return result


def _intent_path(workdir, job_id):
    return Path(workdir) / ('publication-' + hashlib.sha256(str(job_id).encode()).hexdigest()[:24] + '.json')


def preflight(blog: dict) -> dict:
    """Check the real read-only Git target before research/image spending."""
    if blog.get('publisher', {}).get('name') not in ('php-posts-data', 'nextjs-tsx-blog-registry'):
        raise PublicationError('Unsupported publisher format', dispatched=False)
    repository = Path(blog['repository'])
    posts_file = blog['publisher'].get('posts_file')
    if not posts_file or not _safe(repository, posts_file).is_file():
        raise PublicationError('Configured article registry is missing', dispatched=False)
    template = blog['publisher'].get('template_file')
    if blog['publisher']['name'] == 'php-posts-data' and template:
        if 'SERPSMITH:FAQ-RUNTIME' not in _safe(repository, template).read_text():
            raise PublicationError('FAQ motion requires the nonce-aware template hook before publication', dispatched=False)
    remote, branch = blog.get('remote', 'origin'), blog.get('branch', 'main')
    if not re.fullmatch('[A-Za-z0-9_.-]+', remote) or branch.startswith('-') or not re.fullmatch('[A-Za-z0-9_./-]+', branch):
        raise PublicationError('Unsafe Git target', dispatched=False)
    url = _git(repository, 'remote', 'get-url', '--push', remote)
    parsed = urlparse(url)
    if parsed.password or (parsed.scheme in ('http', 'https') and parsed.username):
        raise PublicationError('Credential-bearing remote URLs are prohibited', dispatched=False)
    _git(repository, 'ls-remote', '--exit-code', url, 'refs/heads/' + branch)
    return {'ok': True, 'remote_read_access': True, 'push_permission': 'not tested'}


def publish(blog: dict, article: dict, image: dict, workdir: Path, job_id: str) -> dict:
    try:
        return _publish(blog, article, image, workdir, job_id)
    except PublicationError as exc:
        # The durable intent is written before any push; absence proves no write dispatch.
        exc.dispatched = _intent_path(Path(workdir), job_id).exists()
        raise


def _publish(blog: dict, article: dict, image: dict, workdir: Path, job_id: str) -> dict:
    if blog.get('publisher', {}).get('name') not in ('php-posts-data', 'nextjs-tsx-blog-registry'):
        raise PublicationError('Unsupported publisher format')
    workdir = Path(workdir)
    workdir.mkdir(parents=True, exist_ok=True)
    intent = _intent_path(workdir, job_id)
    if intent.exists():
        found = reconcile(blog, {'id': job_id}, workdir)
        if found:
            return found
        raise PublicationError('Existing publication intent is unresolved; no replay')
    repository = Path(blog['repository'])
    remote, branch = blog.get('remote', 'origin'), blog.get('branch', 'main')
    if not re.fullmatch('[A-Za-z0-9_.-]+', remote) or branch.startswith('-') or not re.fullmatch('[A-Za-z0-9_./-]+', branch):
        raise PublicationError('Unsafe Git target')
    remote_url = _git(repository, 'remote', 'get-url', '--push', remote)
    parsed = urlparse(remote_url)
    if parsed.password or (parsed.scheme in ('http', 'https') and parsed.username):
        raise PublicationError('Credential-bearing remote URLs are prohibited')
    checkout = workdir / ('checkout-' + hashlib.sha256(str(job_id).encode()).hexdigest()[:24])
    if checkout.is_symlink():
        raise PublicationError('Checkout cannot be a symlink')
    if checkout.exists():
        # No intent exists here, so a prior local-only failure can be rebuilt safely.
        shutil.rmtree(checkout)
    # Clone the deployment remote, not the possibly dirty owner's website worktree.
    _git(workdir, 'clone', '--no-local', '--single-branch', '--branch', branch, '--', remote_url, str(checkout))
    receipt = _prepare(checkout, blog, article, image)
    changed = set(_git(checkout, 'ls-files', '--modified', '--others', '--exclude-standard').splitlines())
    if changed != set(receipt['files']):
        raise PublicationError('Checkout contains changes outside exact article scope')
    _git(checkout, 'add', '--', *receipt['files'])
    _git(checkout, 'commit', '-m', 'Publish article: ' + article['slug'], '-m', 'SERPsmith-Job: ' + str(job_id))
    receipt.update(commit=_git(checkout, 'rev-parse', 'HEAD'), status='push_unknown')
    _atomic(intent, receipt)
    # Never automatically retry an uncertain push.
    _git(checkout, 'push', 'origin', 'HEAD:refs/heads/' + branch)
    reconciled = reconcile(blog, {'id': job_id}, workdir)
    if not reconciled:
        raise PublicationError('Push not confirmed on target; preserve checkout and intent')
    return reconciled


def reconcile(blog: dict, job: dict, workdir: Path) -> dict | None:
    path = _intent_path(workdir, job['id'])
    if not path.exists():
        return None
    receipt = json.loads(path.read_text())
    checkout = Path(workdir) / ('checkout-' + hashlib.sha256(str(job['id']).encode()).hexdigest()[:24])
    if not checkout.is_dir():
        raise PublicationError('Missing reconciliation checkout; retain intent for operator recovery')
    branch = blog.get('branch', 'main')
    _git(checkout, 'fetch', 'origin', 'refs/heads/' + branch)
    # A newer deployed commit is fine only if it still contains our exact scoped bytes.
    _git(checkout, 'merge-base', '--is-ancestor', receipt['commit'], 'FETCH_HEAD')
    if _git(checkout, 'diff', receipt['commit'], 'FETCH_HEAD', '--', *receipt['files']):
        raise PublicationError('Published target files changed; live reconciliation required')
    receipt['status'] = 'pushed'
    _atomic(path, receipt)
    return receipt


class _Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.canonical, self.images, self.social, self.text = [], [], [], []
        self.stylesheets = []
        self.faq_scripts = []
        self.article_depth = 0
        self.depth = 0
        self.article_text = []
        self.body_tags = []
        self.links, self.article_links = [], []
        self.noindex = False
        self.noncontent_depth = 0
        self.faq_decoration_depth = 0
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        self.depth += 1 if tag not in ('img', 'meta', 'link', 'br', 'hr', 'input', 'source') else 0
        if tag in ('script', 'style'):
            self.noncontent_depth += 1
        # A decorative plus and a text-free SVG chevron are equivalent controls,
        # not differences in article copy. Keep real arithmetic/text untouched.
        if (a.get('aria-hidden') == 'true'
                and 'serpsmith-faq-icon' in (a.get('class') or '').split()):
            self.faq_decoration_depth = self.depth
        if tag == 'article' or 'post-content' in a.get('class', '').split():
            self.article_depth = self.depth
        elif self.article_depth and tag in ('p', 'h1', 'h2', 'h3', 'ul', 'ol', 'pre', 'blockquote'):
            self.body_tags.append(tag)
        if tag == 'a':
            self.links.append(a)
            if self.article_depth:
                self.article_links.append(a)
        if tag == 'link' and 'canonical' in a.get('rel', '').split():
            self.canonical.append(a.get('href'))
        if tag == 'link' and 'stylesheet' in (a.get('rel') or '').split():
            self.stylesheets.append(a.get('href') or '')
        if tag == 'script' and a.get('data-serpsmith-faq-controller') == 'true':
            self.faq_scripts.append(a)
        if tag == 'img':
            self.images.append(a.get('src', ''))
        if tag == 'meta' and a.get('property') == 'og:image':
            self.social.append(a.get('content', ''))
        if tag == 'meta' and a.get('name', '').lower() in ('robots', 'googlebot') and 'noindex' in a.get('content', '').lower():
            self.noindex = True
    def handle_endtag(self, tag):
        if self.depth == self.faq_decoration_depth:
            self.faq_decoration_depth = 0
        if tag in ('script', 'style'):
            self.noncontent_depth = max(0, self.noncontent_depth - 1)
        if self.depth == self.article_depth:
            self.article_depth = 0
        self.depth = max(0, self.depth - 1)
    def handle_data(self, text):
        if self.noncontent_depth or self.faq_decoration_depth:
            return
        self.text.append(text)
        if self.article_depth:
            self.article_text.append(text)


def _rendered_attribution_href(href: str, base: str, query: str) -> str:
    """Mirror append-only renderer rules without reserializing destination bytes."""
    if not re.match(r'\Ahttps?://', href, re.I) or re.search(r'\s', href) or '\\' in href:
        return href
    try:
        target = urlsplit(href)
        hostname = (target.hostname or '').lower().rstrip('.')
        home = (urlsplit(base).hostname or '').lower().rstrip('.')
        if (not hostname or target.username is not None or target.password is not None
                or hostname == home or hostname.endswith('.' + home)):
            return href
    except ValueError:
        return href
    if any(unquote_plus(pair.split('=', 1)[0]).lower().startswith('utm_')
           for pair in target.query.split('&')):
        return href
    destination, marker, fragment = href.partition('#')
    separator = '' if destination.endswith(('?', '&')) else ('&' if '?' in destination else '?')
    return destination + separator + query + marker + fragment


def _verify_article_links(page: _Page, expected: _Page, base: str,
                          rendered_link_attribution: Mapping | None = None) -> None:
    """Check destinations/rel; optional private attribution permits only exact appends.

    The opt-in mapping requires exactly three nonblank string UTM values. Compare
    exact resolved hrefs and multiplicities in this mode; never remove parameters
    from actual links. Unconfigured callers retain their existing URL comparison.
    """
    query = None
    if rendered_link_attribution is not None:
        keys = ('utm_source', 'utm_medium', 'utm_campaign')
        if (not isinstance(rendered_link_attribution, Mapping)
                or set(rendered_link_attribution) != set(keys)
                or any(not isinstance(rendered_link_attribution[k], str)
                       or not rendered_link_attribution[k].strip() for k in keys)):
            raise PublicationError('Invalid publisher.rendered_link_attribution mapping')
        query = urlencode([(key, rendered_link_attribution[key]) for key in keys])
    def exact_target(href):
        # urljoin normalizes dot segments, scheme spelling and embedded controls.
        # Absolute hrefs must retain their original bytes in append-only mode.
        return href if re.match(r'\Ahttps?://', href, re.I) else urljoin(base, href)
    actual = Counter()
    for anchor in page.article_links:
        target = urljoin(base, anchor.get('href') or '')
        parsed = urlparse(target)
        if parsed.scheme not in ('http', 'https') or parsed.username is not None or parsed.password is not None:
            raise PublicationError('Unsafe public article link')
        actual[exact_target(anchor.get('href') or '') if query is not None else _url_key(target)] += 1
        if not _same_site(target, base):
            rel = set((anchor.get('rel') or '').lower().split())
            if not {'nofollow', 'noopener', 'noreferrer'} <= rel:
                raise PublicationError('Public external article/Sources link lacks required rel attributes')
    if query is None:
        wanted = Counter(_url_key(urljoin(base, anchor['href'])) for anchor in expected.links)
        mismatch = bool(wanted - actual)
    else:
        wanted = Counter(exact_target(_rendered_attribution_href(anchor['href'], base, query))
                         for anchor in expected.links)
        mismatch = wanted != actual
    if mismatch:
        raise PublicationError('Public article link destinations differ from rendered draft')


def _fetch(url, limit=12_000_000):
    if urlparse(url).scheme != 'https':
        raise PublicationError('Live checks require HTTPS')
    request = urllib.request.Request(url, headers={'User-Agent': 'SERPsmith/1.0 verification', 'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(request, timeout=30) as response:
        if response.status != 200 or urlparse(response.url).scheme != 'https':
            raise PublicationError('Public target did not return HTTPS 200')
        body = response.read(limit + 1)
        if len(body) > limit:
            raise PublicationError('Public response exceeds verification bound')
        return body, response.headers, response.url


def verify(blog: dict, receipt: dict, article: dict, image: dict) -> dict:
    """Allow bounded deployment propagation; retry reads, never publication or images."""
    import time
    from urllib.error import HTTPError, URLError
    deadline = time.monotonic() + min(180, max(0, float(blog.get('publisher', {}).get('verification_wait_seconds', 180))))
    delays = (5, 10, 15, 20, 30, 40)
    for attempt in range(len(delays) + 1):
        try:
            return _verify_once(blog, receipt, article, image)
        except HTTPError as exc:
            if exc.code not in (404, 429, 500, 502, 503, 504):
                raise
        except (URLError, PublicationError):
            pass
        if attempt == len(delays) or time.monotonic() >= deadline:
            break
        time.sleep(min(delays[attempt], max(0, deadline - time.monotonic())))
    raise PublicationError('Live verification not confirmed within bounded deployment wait')


def _verify_feature_stylesheet(page: _Page, headers, receipt: dict, base: str) -> None:
    """CSS presence is insufficient: check bytes, MIME, same origin, and CSP allowance."""
    asset = receipt.get('feature_stylesheet')
    if not isinstance(asset, dict) or not asset.get('url') or not asset.get('sha256'):
        raise PublicationError('Feature stylesheet receipt missing')
    target = urlparse(asset['url'])
    origin = urlparse(base)
    if (target.scheme, target.netloc) != (origin.scheme, origin.netloc):
        raise PublicationError('Feature stylesheet must be same-origin')
    if not re.fullmatch(r'/assets/serpsmith/article-features-[0-9a-f]{16}\.css', target.path):
        raise PublicationError('Feature stylesheet path is not content-addressed')
    if asset['url'] not in [urljoin(receipt['url'], href) for href in page.stylesheets]:
        raise PublicationError('Public feature stylesheet link missing')
    values = headers.get_all('Content-Security-Policy') if hasattr(headers, 'get_all') else None
    policies = values or [headers.get('Content-Security-Policy', '')]
    for value in policies:
        for policy in value.split(','):
            directives = {}
            for directive in policy.split(';'):
                parts = directive.split()
                if parts:
                    directives.setdefault(parts[0].lower(), parts[1:])
            sources = next((directives[name] for name in ('style-src-elem', 'style-src', 'default-src')
                            if name in directives), None)
            allowed = {"'self'", '*', origin.scheme + ':', origin.scheme + '://' + origin.netloc, asset['url']}
            if sources is not None and not allowed.intersection(sources):
                raise PublicationError('Public CSP blocks the feature stylesheet; do not weaken site security')
    data, css_headers, final = _fetch(asset['url'])
    if final != asset['url'] or not css_headers.get('Content-Type', '').lower().startswith('text/css'):
        raise PublicationError('Feature stylesheet did not return same-origin CSS')
    if hashlib.sha256(data).hexdigest() != asset['sha256']:
        raise PublicationError('Public feature stylesheet bytes differ')


def _verify_faq_runtime(page: _Page, headers, receipt: dict, base: str) -> None:
    asset = receipt.get('faq_runtime')
    if not isinstance(asset, dict) or not asset.get('url') or not asset.get('sha256'):
        raise PublicationError('FAQ motion runtime receipt missing')
    target, origin = urlparse(asset['url']), urlparse(base)
    if ((target.scheme, target.netloc) != (origin.scheme, origin.netloc)
            or not re.fullmatch(r'/assets/serpsmith/faq-motion-[a-f0-9]{16}\.js', target.path)):
        raise PublicationError('FAQ runtime must be a hashed same-origin asset')
    matches = [a for a in page.faq_scripts if urljoin(receipt['url'], a.get('src', '')) == asset['url']]
    if len(matches) != 1:
        raise PublicationError('Live FAQ runtime script missing or duplicated')
    nonce = matches[0].get('nonce')
    policies = (headers.get_all('Content-Security-Policy') if hasattr(headers, 'get_all') else None) or [headers.get('Content-Security-Policy', '')]
    for value in policies:
        for policy in value.split(','):
            directives = {}
            for directive in policy.split(';'):
                parts = directive.split()
                if parts: directives.setdefault(parts[0].lower(), parts[1:])
            sources = next((directives[n] for n in ('script-src-elem','script-src','default-src') if n in directives), None)
            if sources is None: continue
            nonce_allowed = bool(nonce and "'nonce-" + nonce + "'" in sources)
            has_nonce_or_hash = any(s.startswith(("'nonce-", "'sha256-", "'sha384-", "'sha512-")) for s in sources)
            allowed = {"'self'", '*', origin.scheme + ':', origin.scheme + '://' + origin.netloc, asset['url']}
            if not nonce_allowed and ("'strict-dynamic'" in sources and has_nonce_or_hash or not allowed.intersection(sources)):
                raise PublicationError('CSP blocks FAQ runtime; preserve security and supply template nonce')
    data, h, final = _fetch(asset['url'])
    if final != asset['url'] or 'javascript' not in h.get('Content-Type', '').lower() or hashlib.sha256(data).hexdigest() != asset['sha256']:
        raise PublicationError('FAQ runtime bytes or JavaScript MIME differ')


def _verify_once(blog: dict, receipt: dict, article: dict, image: dict) -> dict:
    body, headers, final = _fetch(receipt['url'])
    page = _Page()
    page.feed(body.decode('utf-8'))
    normalize = lambda x: ' '.join(html.unescape(x).split())
    lead = re.split(r'\n\s*\n', article['body_markdown'].strip())[0]
    lead_html = render_markdown(lead, blog['url'])
    plain = _Page()
    plain.feed(lead_html)
    lead_text = normalize(' '.join(plain.text))
    if final.rstrip('/') != receipt['url'].rstrip('/') or page.canonical != [receipt['url']]:
        raise PublicationError('Public redirect/canonical mismatch')
    if page.noindex or 'noindex' in headers.get('X-Robots-Tag', '').lower():
        raise PublicationError('Public article is marked noindex')
    if normalize(article['title']) not in normalize(' '.join(page.text)) or lead_text not in normalize(' '.join(page.article_text)):
        raise PublicationError('Public title/article lead not confirmed in article container')
    expected = _Page()
    expected.feed(_render_article(blog, article))
    from .article_features import verify_features
    try:
        verify_features(body.decode('utf-8'), article, receipt['url'],
                        sources_label=blog.get('publisher', {}).get('sources_header_label', 'Sources'),
                        require_sources=blog.get('publisher', {}).get('show_sources', True))
        from .category_navigation import verify_category_navigation
        verify_category_navigation(body.decode('utf-8'), blog, article)
    except (ValueError, RuntimeError) as exc:
        raise PublicationError(str(exc)) from exc
    from .research import validate_article_features
    if validate_article_features(article, required=False):
        _verify_feature_stylesheet(page, headers, receipt, blog['url'])
        _verify_faq_runtime(page, headers, receipt, blog['url'])
    attribution = blog.get('publisher', {}).get('rendered_link_attribution')
    link_page = page
    if attribution is not None:
        # PHP templates also contain unrelated author/related-post article cards.
        # Compare exact anchor multiplicities only inside the primary article body.
        containers = re.findall(
            r'<article\b[^>]*\bclass=["\'][^"\']*\barticle-body\b[^"\']*["\'][^>]*>.*?</article>',
            body.decode('utf-8'), re.S)
        if len(containers) != 1:
            raise PublicationError('Public article link container missing or ambiguous')
        link_page = _Page()
        link_page.feed(containers[0])
    _verify_article_links(link_page, expected, blog['url'], attribution)
    if normalize(' '.join(expected.text)) not in normalize(' '.join(page.article_text)):
        raise PublicationError('Public full article content differs from expected draft')
    if not page.body_tags or page.body_tags[0] != 'p':
        raise PublicationError('Public article body does not start with a paragraph')
    def original(src):
        u = urlparse(urljoin(receipt['url'], src))
        return urljoin(receipt['url'], parse_qs(u.query).get('url', [src])[0]) if u.path == '/_next/image' else urljoin(receipt['url'], src)
    if receipt['image_url'] not in [original(x) for x in page.images] or receipt['social_image_url'] not in [urljoin(receipt['url'], x) for x in page.social]:
        raise PublicationError('Public hero/social image references missing')
    from PIL import Image
    for key, digest in [('image_url', 'image_sha256'), ('social_image_url', 'social_sha256')]:
        data, h, _ = _fetch(receipt[key])
        if not h.get('Content-Type', '').startswith('image/'):
            raise PublicationError('Public asset is not an image')
        if hashlib.sha256(data).hexdigest() != receipt[digest]:
            raise PublicationError('Public image bytes differ from published artifact')
        with Image.open(io.BytesIO(data)) as im:
            im.load()
            expected_size = ((image.get('social_width', image['width']), image.get('social_height', image['height']))
                             if key == 'social_image_url' else (image['width'], image['height']))
            if im.size != expected_size:
                raise PublicationError('Public image dimensions differ')
    cfg = blog['publisher']
    sitemap_url = blog.get('search', {}).get('sitemap_url', blog['url'].rstrip('/') + '/sitemap.xml')
    sitemap, _, _ = _fetch(sitemap_url)
    tree = ET.fromstring(sitemap)
    if receipt['url'] not in [el.text for el in tree.iter() if el.tag.endswith('loc')]:
        raise PublicationError('Article not present in public sitemap')
    if cfg.get('llms_full_file') or cfg['name'] == 'php-posts-data':
        discovery, _, _ = _fetch(blog['url'].rstrip('/') + '/llms-full.txt')
        if receipt['url'] not in discovery.decode('utf-8'):
            raise PublicationError('Public discovery reference missing')
    return {**receipt, 'verified': True, 'status': 'verified', 'checks': ['canonical', 'article-lead', 'article-links-and-external-rel', 'hero', 'social', 'image-bytes', 'sitemap', 'discovery']}
