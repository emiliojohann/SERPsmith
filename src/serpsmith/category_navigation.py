"""Opt-in primary taxonomy and compact navigation, independent of customer identity."""
import json
import re
from html.parser import HTMLParser
from urllib.parse import urljoin
from pathlib import Path


def taxonomy(blog):
    value = blog.get('publisher', {}).get('category_navigation')
    if value is None:
        return None
    if not isinstance(value, dict):
        raise ValueError('Category navigation must be an object')
    categories = value.get('categories')
    route = value.get('route')
    if (not isinstance(categories, dict) or len(categories) != 5
            or any(not isinstance(k, str) or not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', k)
                   or not isinstance(v, str) or not v.strip() for k, v in categories.items())
            or len(set(categories.values())) != 5
            or not isinstance(route, str) or not re.fullmatch(r'/[a-z0-9/-]+/<slug>/', route)):
        raise ValueError('Category navigation requires five unique labels and a canonical route')
    if value.get('taxonomy_format', 'php') not in ('php', 'json'):
        raise ValueError('Taxonomy format must be php or json')
    return value


def validate_category(blog, article):
    config = taxonomy(blog)
    if config and article.get('category') not in config['categories'].values():
        raise ValueError('Choose exactly one configured primary category; no fallback is allowed')


def _unique_json_object(pairs):
    observed = {}
    for key, value in pairs:
        if key in observed:
            raise ValueError('Duplicate key in JSON taxonomy source')
        observed[key] = value
    return observed


def validate_taxonomy_source(checkout, blog):
    """Compare declarative PHP/JSON literals; never execute website source.

    taxonomy_format defaults to php; json requires a plain five-slug/label object.
    """
    config = taxonomy(blog)
    if config is None or not config.get('taxonomy_file'): return
    if not isinstance(config['taxonomy_file'], str):
        raise ValueError('Taxonomy source must be a checkout-relative file path')
    root = Path(checkout).resolve()
    path = (root / config['taxonomy_file']).resolve()
    if not path.is_relative_to(root):
        raise ValueError('Taxonomy source must remain inside the publishing checkout')
    source = path.read_text(encoding='utf-8')
    if config.get('taxonomy_format', 'php') == 'json':
        observed = json.loads(source, object_pairs_hook=_unique_json_object)
        if (not isinstance(observed, dict) or len(observed) != 5
                or any(not isinstance(v, str) for v in observed.values())):
            raise ValueError('JSON taxonomy source must be a five-slug/label object')
    else:
        pairs = re.findall(r"'([a-z0-9-]+)'\s*=>\s*'((?:[^'\\]|\\.)*)'", source)
        observed = {k: v.replace("\\'", "'").replace('\\\\', '\\') for k, v in pairs}
        if len(pairs) != 5:
            raise ValueError('Observed site taxonomy and private category configuration differ')
    if observed != config['categories']:
        raise ValueError('Observed site taxonomy and private category configuration differ')


class Breadcrumbs(HTMLParser):
    def __init__(self):
        super().__init__()
        self.stack = []
        self.navs = []
        self.current = None
        self.anchor = None
        self.position = 0
        self.summary_position = None
        self.schemas = []
        self.script = None

    def handle_starttag(self, tag, attrs):
        self.position += 1
        a = dict(attrs)
        hidden = (bool(self.stack and self.stack[-1][1]) or 'hidden' in a
                  or a.get('aria-hidden') == 'true' or tag in ('template', 'style'))
        if a.get('data-serpsmith-tldr') == 'true' and self.summary_position is None:
            self.summary_position = self.position
        if tag == 'nav' and a.get('data-serpsmith-breadcrumb') == 'true':
            self.current = {'links': [], 'hidden': hidden, 'end': None}
            self.navs.append(self.current)
        if self.current and tag == 'a':
            self.anchor = {'href': a.get('href'), 'text': '', 'hidden': hidden}
            self.current['links'].append(self.anchor)
        if tag == 'script' and a.get('type') == 'application/ld+json':
            self.script = ''
        if tag not in ('meta', 'link', 'img', 'br', 'hr', 'input', 'source', 'path', 'wbr'):
            self.stack.append((tag, hidden))

    def handle_endtag(self, tag):
        self.position += 1
        if tag == 'a': self.anchor = None
        if tag == 'nav' and self.current:
            self.current['end'] = self.position
            self.current = None
        if tag == 'script' and self.script is not None:
            try: self.schemas.append(json.loads(self.script))
            except ValueError: pass
            self.script = None
        if self.stack and self.stack[-1][0] == tag: self.stack.pop()

    def handle_data(self, data):
        if self.script is not None: self.script += data
        if self.anchor: self.anchor['text'] += data


def compact_breadcrumb(body):
    page = Breadcrumbs()
    page.feed(body)
    if len(page.navs) != 1:
        return None
    nav = page.navs[0]
    links = nav['links']
    if (nav['hidden'] or not nav['end'] or page.summary_position is None
            or nav['end'] >= page.summary_position or len(links) != 3
            or any(a['hidden'] for a in links)
            or [(a['href'], a['text'].strip()) for a in links[:2]] != [('/', 'Home'), ('/blog/', 'Blog')]
            or not re.fullmatch(r'/blog/category/[a-z0-9]+(?:-[a-z0-9]+)*/', links[2]['href'] or '')
            or not links[2]['text'].strip()):
        return None
    return page


def schema_nodes(values):
    """Visit only JSON-LD document arrays and @graph containers, with bounds.

    Do not descend into arbitrary properties (for example related article data).
    Keep duplicate nodes so the verifier can reject ambiguous schemas.
    """
    pending = [(values, 0)]
    visited = 0
    while pending:
        value, depth = pending.pop()
        visited += 1
        if depth > 32 or visited > 10000:
            raise ValueError('JSON-LD graph exceeds verification bounds')
        if isinstance(value, list):
            pending.extend((item, depth + 1) for item in reversed(value))
        elif isinstance(value, dict):
            yield value
            if '@graph' in value:
                pending.append((value['@graph'], depth + 1))


def verify_category_navigation(body, blog, article):
    config = taxonomy(blog)
    if config is None: return
    validate_category(blog, article)
    page = compact_breadcrumb(body)
    slug = next(k for k, v in config['categories'].items() if v == article['category'])
    path = config['route'].replace('<slug>', slug)
    if page is None or page.navs[0]['links'][2]['href'] != path or page.navs[0]['links'][2]['text'].strip() != article['category']:
        raise ValueError('Live compact breadcrumb category differs from the approved primary category')
    expected = [{'@type': 'ListItem', 'position': i, 'name': label, 'item': urljoin(blog['url'], href)}
                for i, (href, label) in enumerate([('/', 'Home'), ('/blog/', 'Blog'), (path, article['category'])], 1)]
    schemas = list(schema_nodes(page.schemas))
    crumbs = [s for s in schemas if s.get('@type') == 'BreadcrumbList']
    posts = [s for s in schemas if s.get('@type') == 'BlogPosting']
    if len(crumbs) != 1 or crumbs[0].get('itemListElement') != expected:
        raise ValueError('Live breadcrumb schema differs from visible category navigation')
    if len(posts) != 1 or posts[0].get('articleSection') != article['category']:
        raise ValueError('Live BlogPosting.articleSection differs from the primary category')
