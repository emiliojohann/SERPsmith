"""Article-only summary/FAQ rendering; inherit the target site's existing brand tokens.

No website code is executed. FAQPage describes visible answers; it does not promise
Google rich-result eligibility or display. This module performs no external calls.
"""
from __future__ import annotations

import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re

DEFAULT_STYLE = {'accent': 'currentColor', 'surface': 'transparent', 'border': 'currentColor',
                 'text': 'inherit', 'muted': 'inherit', 'font': 'inherit', 'radius': '1rem',
                 'question_weight': '600', 'icon': 'plus'}


def _legacy_site_style(checkout: Path, publisher: dict) -> dict:
    """Read bounded local CSS metadata, never hardcode a customer's identity/palette."""
    names = ['style.css', 'assets/styles.css', 'src/app/globals.css']
    template = publisher.get('template_file')
    if template:
        file = checkout / template
        if file.is_file() and file.resolve().is_relative_to(checkout.resolve()):
            for value in re.findall(r'href=[\"\']([^\"\']+\.css(?:\?[^\"\']*)?)[\"\']', file.read_text()[:100000]):
                if value.startswith('/') and not value.startswith('//'):
                    names.append(value.split('?')[0].lstrip('/'))
    css = []
    for name in dict.fromkeys(names):
        file = checkout / name
        if file.is_file() and not file.is_symlink() and file.resolve().is_relative_to(checkout.resolve()):
            if file.stat().st_size > 300000:
                raise ValueError('Brand stylesheet exceeds metadata bound')
            css.append(file.read_text())
    text = '\n'.join(css)
    variables = set(re.findall(r'(--[a-zA-Z][a-zA-Z0-9-]*)\s*:', text))
    def choose(preferred, suffix=None, fallback='inherit'):
        for name in preferred:
            if name in variables:
                return 'var(' + name + ')'
        if suffix:
            for name in sorted(variables, key=lambda value: (len(value), value)):
                if name.endswith(suffix):
                    return 'var(' + name + ')'
        return fallback
    accent = re.search(r'accent-color\s*:\s*var\((--[a-zA-Z][a-zA-Z0-9-]*)\)', text)
    style = {
        'accent': choose(['--primary', '--accent', '--link'], fallback=(
            'var(' + accent[1] + ')' if accent and accent[1] in variables else 'currentColor')),
        'surface': choose(['--surface', '--bg-card'], '-surface', 'transparent'),
        'border': choose(['--border'], '-border', 'currentColor'),
        'text': choose(['--text', '--text-primary', '--foreground']),
        'muted': choose(['--text-2', '--text-secondary', '--foreground']),
        'font': choose(['--font-head', '--font-display', '--font-sans']),
        'radius': choose(['--radius'], fallback=('1.5rem' if publisher.get('name', '').startswith('nextjs') else '1rem')),
        'question_weight': '500' if re.search(r'\.faq-item\s+summary\s*\{[^}]*font-weight:\s*500', text) else '600',
        'icon': 'chevron' if re.search(r'\.faq-item\s+summary\s+svg', text) else 'plus',
    }
    # Tailwind inline theme aliases need not become runtime CSS variables. Follow
    # the first font variable in the site's alias instead of assuming emission.
    if style['font'] == 'var(--font-display)':
        font = re.search(r'--font-display\s*:\s*var\((--[a-zA-Z][a-zA-Z0-9-]*)\)', text)
        if font:
            style['font'] = 'var(' + font[1] + ', inherit)'
    return style


# Component keys contain CSS declaration maps, not executable source or class
# names that depend on a site's compiler. Responsive copies retain media context.
COMPONENT_SELECTORS = {
    'author_box': '.serpsmith-tldr.serpsmith-tldr',
    'author_body': '.serpsmith-tldr.serpsmith-tldr>p',
    'author_label': '.serpsmith-tldr.serpsmith-tldr>.serpsmith-tldr-label',
    'faq_heading': '.serpsmith-faq.serpsmith-faq>h2',
    'faq_list': '.serpsmith-faq .serpsmith-faq-list',
    'faq_card': '.serpsmith-faq .serpsmith-faq-item',
    'faq_question': '.serpsmith-faq .serpsmith-faq-question',
    'faq_icon': '.serpsmith-faq .serpsmith-faq-icon',
    'faq_answer': '.serpsmith-faq .serpsmith-faq-answer',
    'faq_answer_body': '.serpsmith-faq .serpsmith-faq-answer>p',
}
_ALLOWED = set(('background background-color color border border-top border-right '
                'border-bottom border-left border-color border-width border-style '
                'border-radius padding padding-top padding-right padding-bottom padding-left '
                'font-family font-size font-weight font-style line-height letter-spacing '
                'text-align text-transform gap row-gap column-gap width height min-height '
                'margin-bottom margin-left box-shadow').split())


def _safe_css(value: str) -> bool:
    # Metadata is local but still untrusted. Never copy URLs, HTML terminators,
    # declarations, at-rules or CSS code with external effects into the article.
    return (len(value) < 1200 and not re.search(
        r'[<>;{}@\\\\]|url\s*\(|expression\s*\(|javascript:|/\*', value, re.I))


def _declarations(text: str) -> dict:
    return {k.strip().lower(): v.strip() for part in text.split(';') if ':' in part
            for k, v in [part.split(':', 1)]
            if k.strip().lower() in _ALLOWED and _safe_css(v.strip())}


def _rules(text: str, media=()):
    """Small static CSS block reader; preserve nested media, skip keyframes."""
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    pos = 0
    while pos < len(text):
        start = text.find('{', pos)
        if start < 0:
            break
        selector = text[pos:start].strip()
        # Discard preceding @import statements without fetching anything.
        selector = selector.rsplit(';', 1)[-1].strip()
        depth, end = 1, start + 1
        quote = None
        while end < len(text) and depth:
            c = text[end]
            if quote:
                if c == quote and text[end - 1] != '\\':
                    quote = None
            elif c in '\"\'':
                quote = c
            elif c == '{':
                depth += 1
            elif c == '}':
                depth -= 1
            end += 1
        if depth:
            break
        inner = text[start + 1:end - 1]
        media_match = re.fullmatch(r'@media(?:\s+(.+)|(\(.+\)))', selector)
        if media_match:
            query = (media_match[1] or media_match[2]).strip()
            if _safe_css(query):
                yield from _rules(inner, media + (query,))
        elif not selector.startswith('@'):
            yield selector, _declarations(inner), media
        pos = end


def _static_nodes(text: str) -> list:
    """Read HTML/PHP/JSX tags and literal classes only; never evaluate expressions."""
    text = re.sub(r'<\?.*?\?>', '', text, flags=re.S)
    result = []
    for match in re.finditer(r'<([a-z][\w-]*)\b([^<>]*?)>', text, re.I | re.S):
        attrs = match[2]
        cls = re.search(r'\bclass(?:Name)?\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|\{`([^`]*)`\})', attrs)
        classes = next((s for s in cls.groups() if s is not None), '') if cls else ''
        classes = re.sub(r'\$\{.*?\}', '', classes)
        result.append({'tag': match[1].lower(), 'classes': classes.split(),
                       'attrs': attrs, 'start': match.start(), 'end': match.end()})
    return result


def _utilities(classes: list, css_rules: list, aliases: dict):
    """Decode a bounded literal Tailwind subset used by existing components.

    No customer tokens are named here: color/font aliases come from @theme.
    Unknown/dynamic utilities are ignored rather than executed or guessed.
    """
    sizes = {'xs': '.75rem', 'sm': '.875rem', 'base': '1rem', 'lg': '1.125rem',
             'xl': '1.25rem', '2xl': '1.5rem', '3xl': '1.875rem', '4xl': '2.25rem'}
    weights = {'normal': '400', 'medium': '500', 'semibold': '600', 'bold': '700'}
    breakpoints = {'sm': '(min-width:40rem)', 'md': '(min-width:48rem)', 'lg': '(min-width:64rem)'}
    def length(v):
        if v.startswith('[') and v.endswith(']'):
            return v[1:-1].replace('_', ' ')
        if re.fullmatch(r'\d+(?:\.\d+)?', v):
            return str(float(v) / 4).rstrip('0').rstrip('.') + 'rem'
        return None
    for raw in classes:
        parts = raw.split(':')
        if any(p not in breakpoints for p in parts[:-1]):
            continue
        media = tuple(breakpoints[p] for p in parts[:-1])
        token = parts[-1]
        d = {}
        if token == 'border': d = {'border': '1px solid currentColor'}
        elif token.startswith('border-'):
            v = aliases.get('--color-' + token[7:])
            if v: d = {'border-color': v}
        elif token.startswith('bg-'):
            v = aliases.get('--color-' + token[3:])
            if v: d = {'background': v}
        elif token.startswith('rounded-'):
            v = length(token[8:]) or {'none': '0', 'lg': '.5rem', 'xl': '.75rem', '2xl': '1rem'}.get(token[8:])
            if v: d = {'border-radius': v}
        elif token.startswith('font-'):
            v = token[5:]
            if v in weights: d = {'font-weight': weights[v]}
            elif '--font-' + v in aliases: d = {'font-family': aliases['--font-' + v]}
        elif token.startswith('text-'):
            v = token[5:]
            if v in ('left', 'center', 'right'): d = {'text-align': v}
            elif v in sizes: d = {'font-size': sizes[v]}
            elif v.startswith('[') and (val := length(v)): d = {'font-size': val}
            elif '--color-' + v in aliases: d = {'color': aliases['--color-' + v]}
        elif token.startswith('leading-'):
            v = token[8:]
            d = {'line-height': length(v) or {'tight': '1.25', 'normal': '1.5'}.get(v, 'normal')}
        elif token.startswith('tracking-['): d = {'letter-spacing': token[10:-1]}
        elif token.startswith('min-h-'):
            if v := length(token[6:]): d = {'min-height': v}
        elif token.startswith('gap-'):
            if v := length(token[4:]): d = {'gap': v}
        else:
            m = re.fullmatch(r'(p|px|py|pt|pb|pl|pr)-(.*)', token)
            if m and (v := length(m[2])):
                props = {'p': ['padding'], 'px': ['padding-left', 'padding-right'],
                         'py': ['padding-top', 'padding-bottom'], 'pt': ['padding-top'],
                         'pb': ['padding-bottom'], 'pl': ['padding-left'], 'pr': ['padding-right']}
                d = dict.fromkeys(props[m[1]], v)
        # Project-defined utility CSS is copied by the selector reader below;
        # do not re-emit it here after responsive component rules.
        if d:
            yield d, media


def site_style(checkout: Path, publisher: dict) -> dict:
    """Copy author and homepage FAQ component metadata into article-only rules.

    Public API retains every legacy token. Component dictionaries, component_rules
    and component_provenance are additive; no website source is executed/modified.
    """
    checkout = Path(checkout)
    style = _legacy_site_style(checkout, publisher)
    spacing = publisher.get('feature_spacing', {})
    for key, default in [('tldr_margin_top_delta_px', -10), ('tldr_margin_bottom_delta_px', 10)]:
        value = spacing.get(key, default)
        if type(value) is not int or not -200 <= value <= 200:
            raise ValueError('Feature spacing must be bounded integer pixel offsets')
        style[key] = value
    sources = {}
    def read(name):
        file = checkout / name
        if (file.is_file() and not file.is_symlink()
                and file.resolve().is_relative_to(checkout.resolve())):
            if file.stat().st_size > 400000:
                raise ValueError('Component metadata exceeds size bound')
            text = file.read_text()
            sources[str(file.relative_to(checkout))] = text
            return text
        return ''
    template = publisher.get('template_file', 'blog/post.php')
    author_source = read(template)
    home_source = read('index.php')
    css_names = ['style.css', 'assets/styles.css', 'src/app/globals.css', 'blog/blog.css', 'src/app/blog/blog.module.css']
    for source in (author_source, home_source):
        for href in re.findall(r'href=[\"\'](/[^\"\']+\.css(?:\?[^\"\']*)?)[\"\']', source):
            if not href.startswith('//'): css_names.append(href.split('?')[0].lstrip('/'))
    rules = []
    for name in dict.fromkeys(css_names):
        rules.extend(_rules(read(name)))
    aliases = {}
    for text in sources.values():
        for m in re.finditer(r'(--[\w-]+)\s*:\s*([^;{}]+);', text):
            if _safe_css(m[2]): aliases[m[1]] = m[2].strip()
    # Resolve @theme font aliases to runtime font variables, not compiler aliases.
    for key in list(aliases):
        if key.startswith('--font-'):
            aliases[key] = re.sub(r'var\((--[\w-]+)\)', r'var(\1, inherit)', aliases[key])
    anodes, fnodes = _static_nodes(author_source), _static_nodes(home_source)
    role_nodes = {}
    def find(nodes, pattern, tag=None):
        return next((n for n in nodes if (not tag or n['tag'] == tag)
                     and any(re.fullmatch(pattern, c) for c in n['classes'])), None)
    role_nodes['author_box'] = find(anodes, r'author-(?:card|box)')
    role_nodes['author_body'] = find(anodes, r'author-(?:card|box)-bio')
    role_nodes['author_label'] = find(anodes, r'author-(?:card|box)-name')
    role_nodes['faq_card'] = find(fnodes, r'faq-item')
    role_nodes['faq_list'] = find(fnodes, r'faqs?-list')
    role_nodes['faq_heading'] = find(fnodes, r'faqs?-title')
    role_nodes['faq_question'] = find(fnodes, r'faq-toggle')
    role_nodes['faq_icon'] = find(fnodes, r'faq-icon')
    role_nodes['faq_answer'] = find(fnodes, r'faq-answer')
    role_nodes['faq_answer_body'] = {'tag': 'p', 'classes': []}
    native = role_nodes['faq_question'] is None and role_nodes['faq_card'] is not None
    if native:
        role_nodes['faq_question'] = {'tag': 'summary', 'classes': []}
        role_nodes['faq_icon'] = {'tag': 'svg', 'classes': []}
        style['icon'] = 'chevron'
        role_nodes['faq_heading'] = {'tag': 'h2', 'classes': []}
    else:
        style['icon'] = 'plus'
    # JSX utility-only components: locate the author by its semantic label and
    # the homepage FAQ component by filename, without importing either module.
    if not role_nodes['author_box']:
        candidates = sorted((checkout / 'src/app/blog').glob('*/page.tsx'))
        for file in candidates[:40]:
            text = read(str(file.relative_to(checkout)))
            nodes = _static_nodes(text)
            author = next((n for n in nodes if re.search(r'aria-label=[\"\']About the author[\"\']', n['attrs'], re.I)), None)
            if author:
                end = text.find('</aside>', author['end'])
                inside = [n for n in nodes if author['end'] <= n['start'] < end]
                role_nodes['author_box'] = author
                role_nodes['author_body'] = next((n for n in reversed(inside) if n['tag'] == 'p'), None)
                role_nodes['author_label'] = next((n for n in inside if 'rel="author"' in n['attrs']), None)
                break
    if not role_nodes['faq_card']:
        for file in sorted((checkout / 'src/components').glob('*[Ff]aq*.tsx'))[:20]:
            text = read(str(file.relative_to(checkout)))
            nodes = _static_nodes(text)
            card = next((n for n in nodes if n['tag'] in ('article', 'details') and 'border' in n['classes']), None)
            if not card: continue
            role_nodes.update(faq_card=card,
                              faq_question=next((n for n in nodes if n['tag'] in ('button', 'summary')), None),
                              faq_icon=next((n for n in nodes if 'aria-hidden="true"' in n['attrs']), None),
                              faq_list=next((n for n in nodes if 'grid' in n['classes']), None),
                              faq_answer={'tag': 'div', 'classes': []},
                              faq_answer_body=next((n for n in nodes if n['tag'] == 'p'), None))
            # Heading belongs to the homepage caller, not the reused accordion.
            for caller in sorted((checkout / 'src/components').glob('*.tsx'))[:150]:
                caller_text = read(str(caller.relative_to(checkout)))
                component = '<' + file.stem
                index = caller_text.find(component)
                if index < 0: continue
                before = _static_nodes(caller_text[:index])
                heading = next((n for n in reversed(before) if n['tag'] == 'h2'), None)
                if heading:
                    role_nodes['faq_heading'] = heading
                    # Preserve inherited heading alignment from its wrapper.
                    wrapper = next((n for n in reversed(before[:before.index(heading)])
                                    if 'text-center' in n['classes']), None)
                    if wrapper: heading['classes'] = wrapper['classes'] + heading['classes']
                break
            break
    if not role_nodes['author_box'] and not role_nodes['faq_card']:
        return style
    components = {key: {} for key in COMPONENT_SELECTORS}
    copied, provenance = [], {}
    def add(key, declarations, media=(), source='CSS'):
        declarations = {k: v for k, v in declarations.items() if k in _ALLOWED and _safe_css(v)}
        if not declarations: return
        if not media: components[key].update(declarations)
        copied.append({'component': key, 'declarations': declarations, 'media': list(media)})
        provenance.setdefault(key, []).append(source)
    # Homepage components outside article prose use the root's normal text size.
    for key in ('author_body', 'faq_question', 'faq_answer', 'faq_answer_body'):
        add(key, {'font-size': '1rem'}, source='browser root text size')
    # Inherited body typography must not come from article paragraph rules.
    for selector, d, media in rules:
        if selector.strip() == 'body':
            inherited = {k: v for k, v in d.items() if k in ('font-family', 'font-size', 'line-height', 'color')}
            for key in ('author_body', 'faq_question', 'faq_answer', 'faq_answer_body'): add(key, inherited, media, 'body')
    for key, node in role_nodes.items():
        if not node: continue
        classes, tag = set(node['classes']), node['tag']
        for selectors, declarations, media in rules:
            for selector in selectors.split(','):
                selector = selector.strip()
                if ':' in selector or '[' in selector: continue
                # Match simple component selectors plus their known descendants.
                tokens = selector.split()
                last = tokens[-1] if tokens else ''
                cs = set(re.findall(r'\.([\w-]+)', last))
                tag_match = re.match(r'^[a-z][\w-]*', last)
                matches = cs.issubset(classes) and (not tag_match or tag_match[0] == tag)
                if not matches: continue
                if len(tokens) > 1:
                    allowed_parents = ([['.faq-item'], ['.faq-item', 'summary']]
                                       if key == 'faq_icon' else [['.faq-item']]
                                       if key == 'faq_question' else [['.faq-answer']]
                                       if key == 'faq_answer_body' else [])
                    if tokens[:-1] not in allowed_parents: continue
                if not cs and not tag_match: continue
                # Global p rules are unrelated to the homepage answer component.
                if selector == 'p': continue
                add(key, declarations, media, selector)
        for d, media in _utilities(node['classes'], rules, aliases):
            add(key, d, media, 'literal utility classes')
    if native:
        # The homepage places H2 in a heading wrapper. Copy its inherited
        # alignment and spacing, not the marketing section's outer padding.
        wrapper = find(fnodes, r'section-heading')
        if wrapper:
            for selector, declarations, media in rules:
                if selector.strip() in ('.section-heading', '.center'):
                    add('faq_heading', {k: v for k, v in declarations.items()
                                        if k in ('text-align', 'margin-bottom')}, media,
                        'homepage heading wrapper')
        # Center is an inherited utility on the homepage heading wrapper.
        if re.search(r'class=[\"\'][^\"\']*section-heading[^\"\']*center', home_source):
            add('faq_heading', {'text-align': 'center'}, source='homepage heading wrapper')
        # Source has a direct text answer; generated p must inherit that typography.
        add('faq_answer_body', dict.fromkeys(('font-size', 'font-family', 'line-height', 'color'), 'inherit'))
    # Owner typography overrides: keep author-card decoration, but summary copy
    # inherits article text size and the FAQ title uses article H2 typography.
    add('author_body', {'font-size': 'inherit'}, source='article body text inheritance')
    for selectors, declarations, media in rules:
        for selector in selectors.split(','):
            if re.fullmatch(r'\.(?:article-body|articleBody|post-content)\s+h2', selector.strip()):
                add('faq_heading', {k: v for k, v in declarations.items()
                                    if k in ('font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing')},
                    media, 'article H2 typography')
    add('faq_heading', {'text-align': 'left'}, source='owner heading alignment')
    combined = '\n'.join(sources.values())
    motion = re.search(r'grid-template-rows\s+([\d.]+)(ms|s)\s+(cubic-bezier\([^)]*\)|ease(?:-in-out|-out|-in)?|linear)', combined)
    if not motion:
        motion = re.search(r'--trans\s*:\s*([\d.]+)(ms|s)\s+(ease(?:-in-out|-out|-in)?|linear)', combined)
    style['faq_motion_duration'] = str(min(1000, max(0, round(float(motion[1]) * (1000 if motion[2] == 's' else 1))))) + 'ms' if motion else '250ms'
    style['faq_motion_easing'] = motion[3] if motion else 'ease'
    style.update(components)
    style['component_rules'] = copied
    style['component_provenance'] = {'files': list(sources), 'roles': provenance}
    # Retain legacy fields for callers inspecting them.
    style['question_weight'] = components['faq_question'].get('font-weight', style['question_weight'])
    return style


def _safe_json(value) -> str:
    return (json.dumps(value, ensure_ascii=True, separators=(',', ':'))
            .replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026'))


def faq_schema(article: dict, canonical: str) -> dict:
    return {'@context': 'https://schema.org', '@type': 'FAQPage', '@id': canonical + '#faq',
            'mainEntity': [{'@type': 'Question', 'name': q['question'],
                            'acceptedAnswer': {'@type': 'Answer', 'text': q['answer']}}
                           for q in article['faq']]}


def _base_css(style: dict) -> str:
    # Legacy keys remain supported when no component metadata is available.
    return '''
.serpsmith-tldr{box-sizing:border-box;max-width:100%;margin:TOP_OFFSETpx 0 calc(2rem + BOTTOM_OFFSETpx);padding:clamp(1.25rem,4vw,2rem);border:1px solid BORDER;border-radius:RADIUS;background:SURFACE;color:TEXT;overflow-wrap:anywhere}
.serpsmith-tldr-label{display:block;margin-bottom:.65rem;font-family:FONT;font-size:.8rem;font-weight:700;letter-spacing:.08em;color:ACCENT}
.serpsmith-tldr p{margin:0!important;line-height:1.7;color:TEXT}
.serpsmith-faq{margin:2.5rem 0;max-width:100%;color:TEXT}
.serpsmith-faq>h2{font-family:FONT;text-align:left}
.serpsmith-faq-list{display:grid;gap:.75rem}
.serpsmith-faq-item{box-sizing:border-box;max-width:100%;overflow:hidden;border:1px solid BORDER;border-radius:RADIUS;background:SURFACE}
.serpsmith-faq-item>summary{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1.25rem 1.5rem;cursor:pointer;list-style:none;font-family:FONT;font-weight:WEIGHT;color:TEXT;overflow-wrap:anywhere}
.serpsmith-faq-item>summary::-webkit-details-marker{display:none}
.serpsmith-faq-item>summary:focus-visible{outline:2px solid ACCENT;outline-offset:-4px;border-radius:RADIUS}
.serpsmith-faq-icon{flex:none;color:ACCENT;font-size:1.4em;transition:transform .2s ease}
.serpsmith-faq-item[open]>.serpsmith-faq-question .serpsmith-faq-icon{transform:rotate(ROTATE)}
.serpsmith-faq-answer{padding:1rem 1.5rem 1.25rem;border-top:1px solid BORDER;color:MUTED;overflow-wrap:anywhere}
.serpsmith-faq-answer>p{margin:0!important;line-height:1.7}
@media(prefers-reduced-motion:reduce){.serpsmith-faq-icon{transition:none}}
'''.replace('TOP_OFFSET', str(style.get('tldr_margin_top_delta_px', -10))).replace('BOTTOM_OFFSET', str(style.get('tldr_margin_bottom_delta_px', 10))).replace('ROTATE', '180deg' if style['icon'] == 'chevron' else '45deg').replace('WEIGHT', style['question_weight']).replace('BORDER', style['border']).replace('ACCENT', style['accent']).replace('RADIUS', style['radius']).replace('SURFACE', style['surface']).replace('MUTED', style['muted']).replace('TEXT', style['text']).replace('FONT', style['font'])


def _summary_margins(declarations: dict, bottom_delta=10) -> dict:
    """Owner meant OUTSIDE spacing; preserve original padding and shift margins only."""
    d = dict(declarations)
    if 'margin-bottom' in d:
        d['margin-bottom'] = 'calc(' + d['margin-bottom'] + ' + ' + str(bottom_delta) + 'px)'
    return d


def _css(style: dict) -> str:
    merged = dict(DEFAULT_STYLE)
    merged.update({k: v for k, v in style.items() if k not in DEFAULT_STYLE
                   or isinstance(v, str) and _safe_css(v)})
    base = _base_css(merged)
    if not any(style.get(k) for k in COMPONENT_SELECTORS):
        return base
    # Clear generic decorative/typography defaults before source declarations.
    # All selectors are article-only and more specific than article prose rules.
    resets = {
        'author_box': {'padding': '0', 'border': '0', 'border-radius': '0', 'background': 'transparent'},
        'author_body': {'font-family': 'inherit', 'font-size': 'inherit', 'line-height': 'normal', 'color': 'inherit'},
        'author_label': {'letter-spacing': 'normal', 'text-transform': 'none', 'color': 'inherit'},
        'faq_heading': {'padding': '0', 'border': '0', 'text-align': 'left'},
        'faq_card': {'padding': '0', 'border': '0', 'border-radius': '0', 'background': 'transparent'},
        'faq_question': {'padding': '0', 'gap': '0', 'font-family': 'inherit', 'font-size': 'inherit',
                         'font-weight': 'inherit', 'line-height': 'inherit', 'text-align': 'left'},
        'faq_icon': {'color': 'inherit', 'font-family': 'inherit', 'font-size': 'inherit'},
        'faq_answer': {'padding': '0', 'border': '0', 'color': 'inherit'},
        'faq_answer_body': {'padding': '0', 'font-family': 'inherit', 'font-size': 'inherit',
                            'line-height': 'inherit', 'color': 'inherit'},
    }
    result = base
    def emit(component, declarations, media=()):
        selector = COMPONENT_SELECTORS.get(component)
        if not selector: return ''
        declarations = {k: v for k, v in declarations.items()
                        if k in _ALLOWED and isinstance(v, str) and _safe_css(v)}
        if not declarations: return ''
        rule = selector + '{' + ';'.join(k + ':' + v for k, v in declarations.items()) + '}'
        for query in reversed(media):
            if not isinstance(query, str) or not _safe_css(query): return ''
            rule = '@media ' + query + '{' + rule + '}'
        return rule
    for key, d in resets.items(): result += emit(key, d)
    for rule in style.get('component_rules', []):
        d = rule.get('declarations', {})
        if rule.get('component') == 'author_box': d = _summary_margins(d, style.get('tldr_margin_bottom_delta_px', 10))
        result += emit(rule.get('component'), d, rule.get('media', []))
    # Explicit maps can override extracted base values. Do not append a duplicate
    # base after media rules: it would erase the source's responsive cascade.
    if not style.get('component_rules'):
        for key in COMPONENT_SELECTORS:
            d = style.get(key, {})
            result += emit(key, _summary_margins(d, style.get('tldr_margin_bottom_delta_px', 10)) if key == 'author_box' else d)
    result += '\n.serpsmith-faq .serpsmith-faq-question>span:first-child{flex:1;text-align:left}'
    result += '\n.serpsmith-faq .serpsmith-faq-icon{display:flex;align-items:center;justify-content:center;flex-shrink:0}'
    result += '\n.serpsmith-faq .serpsmith-faq-answer>p{margin:0!important}'
    duration = style.get('faq_motion_duration', '250ms')
    easing = style.get('faq_motion_easing', 'ease')
    if not re.fullmatch(r'\d{1,4}ms', duration) or not _safe_css(easing):
        raise ValueError('Invalid FAQ motion metadata')
    result += '\n.serpsmith-faq{--serpsmith-faq-duration:' + duration + ';--serpsmith-faq-easing:' + easing + '}'
    result += '\n.serpsmith-faq-item[data-faq-expanded="false"]>.serpsmith-faq-question .serpsmith-faq-icon{transform:none}'
    return result


def create_stylesheet(checkout: Path, publisher: dict, style: dict) -> dict:
    """Write/reuse content-addressed same-origin CSS without relaxing a site's CSP."""
    import hashlib
    from .publishing import _safe
    payload = _css(style).encode('utf-8')
    digest = hashlib.sha256(payload).hexdigest()
    public = publisher.get('public_directory', 'public' if publisher.get('name', '').startswith('nextjs') else '')
    href = '/assets/serpsmith/article-features-' + digest[:16] + '.css'
    relative = str(Path(public) / href.lstrip('/'))
    target = _safe(checkout, relative)
    created = not target.exists()
    if created:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(payload)
    elif target.read_bytes() != payload:
        raise ValueError('Existing feature stylesheet has unexpected bytes')
    return {'path': relative, 'href': href, 'sha256': digest, 'created': created}


PHP_FAQ_RUNTIME_HOOK = r'''<!-- SERPSMITH:FAQ-RUNTIME -->
<?php if (preg_match('~<span hidden data-serpsmith-faq-runtime="(/assets/serpsmith/faq-motion-[0-9a-f]{16}\.js)"~', $post['content'], $serpsmithFaqRuntime)): ?>
<script data-serpsmith-faq-controller="true" src="<?php echo htmlspecialchars($serpsmithFaqRuntime[1], ENT_QUOTES, 'UTF-8'); ?>"<?php if (isset($cspNonce)): ?> nonce="<?php echo htmlspecialchars($cspNonce, ENT_QUOTES, 'UTF-8'); ?>"<?php endif; ?> async></script>
<?php endif; ?>'''


def create_faq_runtime(checkout: Path, publisher: dict) -> dict:
    """Stage the same-origin progressive controller, without executing website JS."""
    import hashlib
    from .publishing import _safe
    payload = Path(__file__).with_name('faq_motion.js').read_bytes()
    digest = hashlib.sha256(payload).hexdigest()
    href = '/assets/serpsmith/faq-motion-' + digest[:16] + '.js'
    public = publisher.get('public_directory', 'public' if publisher.get('name', '').startswith('nextjs') else '')
    relative = str(Path(public) / href.lstrip('/'))
    target = _safe(checkout, relative)
    created = not target.exists()
    if created:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(payload)
    elif target.read_bytes() != payload:
        raise ValueError('Existing FAQ runtime has unexpected bytes')
    return {'path': relative, 'href': href, 'sha256': digest, 'created': created}


def feature_markup(article: dict, canonical: str, style: dict, *, jsx=False, stylesheet_href=None, runtime_href=None) -> tuple[str, str, str]:
    """Return summary+scoped styles, five visible native accordions, matching JSON-LD."""
    from .research import validate_article_features
    validate_article_features(article, required=True)
    esc = lambda s: html.escape(s, quote=True).replace('{', '&#123;').replace('}', '&#125;')
    attr = 'className' if jsx else 'class'
    css = _css(style)
    if stylesheet_href is not None:
        if not re.fullmatch(r'/assets/serpsmith/article-features-[0-9a-f]{16}\.css', stylesheet_href):
            raise ValueError('Feature stylesheet must be a content-addressed same-origin asset')
        styles = '<link rel="stylesheet" href="' + stylesheet_href + ('" />' if jsx else '">')
    else:
        # Offline/legacy rendering only. Production preparation always emits an asset.
        styles = ('<style dangerouslySetInnerHTML={{__html:' + _safe_json(css) + '}} />' if jsx
                  else '<style>' + css + '</style>')
    if runtime_href is not None:
        if not re.fullmatch(r'/assets/serpsmith/faq-motion-[0-9a-f]{16}\.js', runtime_href):
            raise ValueError('FAQ runtime must be a hashed same-origin asset')
        styles += ('<script data-serpsmith-faq-controller="true" async src="' + runtime_href + '"></script>'
                   if jsx else '<span hidden data-serpsmith-faq-runtime="' + runtime_href + '"></span>')
    summary = (styles + f'<aside {attr}="serpsmith-tldr" data-serpsmith-tldr="true" aria-label="TL;DR">'
               f'<span {attr}="serpsmith-tldr-label">TL;DR</span>'
               '<p>' + esc(article['tldr']) + '</p></aside>')
    icon = ('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            + ('strokeWidth="2"' if jsx else 'stroke-width="2"')
            + '><path d="m6 9 6 6 6-6" /></svg>') if style['icon'] == 'chevron' else '+'
    faq = (f'<section {attr}="serpsmith-faq" data-serpsmith-faq="true" aria-labelledby="serpsmith-faq-title">'
           '<h2 id="serpsmith-faq-title">Frequently Asked Questions</h2>'
           f'<div {attr}="serpsmith-faq-list">')
    for index, item in enumerate(article['faq'], 1):
        faq += (f'<details {attr}="serpsmith-faq-item" name="serpsmith-article-faq" data-faq-item="{index}">'
                f'<summary {attr}="serpsmith-faq-question"><span>{esc(item["question"])}</span>'
                f'<span {attr}="serpsmith-faq-icon" aria-hidden="true">{icon}</span></summary>'
                f'<div {attr}="serpsmith-faq-answer"><p>{esc(item["answer"])}</p></div></details>')
    faq += '</div></section>'
    data = _safe_json(faq_schema(article, canonical))
    schema = ('<script type="application/ld+json" dangerouslySetInnerHTML={{__html:' + _safe_json(data) + '}} />'
              if jsx else '<script type="application/ld+json">' + data + '</script>')
    return summary, faq, schema


class FeaturePage(HTMLParser):
    """Observe rendered HTML, not draft presence or raw JSON text search."""
    def __init__(self):
        super().__init__()
        self.stack = []
        self.events = []
        self.summary = []
        self.questions = []
        self.answers = []
        self.schemas = []
        self.current_question = []
        self.current_answer = []
        self.back_text = []
        self.summary_count = self.faq_count = 0
        self.detail_count = 0
        self.detail_groups = []
        self.script = None
        self.script_parts = []
        self.body_lead = []

    def handle_starttag(self, tag, attrs):
        a = {key: value or '' for key, value in attrs}
        kind = None
        if tag == 'a' and re.fullmatch(r'/blog/?', a.get('href', '')):
            self.back_text = []
            kind = 'back'
        if a.get('data-serpsmith-tldr') == 'true':
            self.summary_count += 1
            self.events.append('summary')
            kind = 'summary'
        if a.get('data-serpsmith-body') == 'true':
            self.events.append('body')
        if a.get('data-serpsmith-faq') == 'true':
            self.faq_count += 1
            self.events.append('faq')
            kind = 'faq'
        in_faq = any(entry[1] == 'faq' for entry in self.stack)
        if in_faq and tag == 'details' and 'serpsmith-faq-item' in a.get('class', '').split():
            self.detail_count += 1
            self.detail_groups.append(a.get('name', ''))
        if in_faq and tag == 'summary' and 'serpsmith-faq-question' in a.get('class', '').split():
            self.current_question = []
            self.questions.append(self.current_question)
            kind = 'question'
        if in_faq and 'serpsmith-faq-answer' in a.get('class', '').split():
            self.current_answer = []
            self.answers.append(self.current_answer)
            kind = 'answer'
        if tag == 'script' and a.get('type') == 'application/ld+json':
            self.script = True
            self.script_parts = []
        if tag not in ('img', 'meta', 'link', 'br', 'hr', 'input', 'source', 'path'):
            self.stack.append((tag, kind, a.get('aria-hidden') == 'true'))

    def handle_endtag(self, tag):
        if tag == 'script' and self.script:
            try:
                self.schemas.append(json.loads(''.join(self.script_parts)))
            except ValueError:
                self.schemas.append(None)
            self.script = None
        # HTMLParser handles SVG path's '/>' with a matching end callback.
        if self.stack and self.stack[-1][0] == tag:
            if self.stack[-1][1] == 'back' and 'back to blog' in ''.join(self.back_text).casefold():
                self.events.append('back')
            self.stack.pop()

    def handle_data(self, data):
        text = data
        if self.script:
            self.script_parts.append(text)
        if any(hidden for _, _, hidden in self.stack):
            return
        kinds = {kind for _, kind, _ in self.stack}
        if 'back' in kinds:
            self.back_text.append(text)
        if 'summary' in kinds:
            self.summary.append(text)
        if 'question' in kinds:
            self.current_question.append(text)
        if 'answer' in kinds:
            self.current_answer.append(text)


class _FeatureOrder(HTMLParser):
    """Track real visible heading/section boundaries, not words in source text."""
    VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
            'link', 'meta', 'param', 'source', 'track', 'wbr', 'path'}

    def __init__(self):
        super().__init__()
        self.stack, self.headings, self.content, self.faqs, self.bodies = [], [], [], [], []
        self.position = 0

    def handle_starttag(self, tag, attrs):
        self.position += 1
        attrs = dict(attrs)
        parent = self.stack[-1] if self.stack else {}
        node = {'tag': tag, 'start': self.position, 'end': None, 'text': [],
                'hidden': parent.get('hidden', False) or tag in ('script', 'style', 'template')
                          or 'hidden' in attrs or attrs.get('aria-hidden') == 'true',
                'body': parent.get('body', False) or attrs.get('data-serpsmith-body') == 'true',
                'faq': parent.get('faq', False) or attrs.get('data-serpsmith-faq') == 'true'}
        if not node['hidden']:
            if attrs.get('data-serpsmith-body') == 'true': self.bodies.append(node)
            if attrs.get('data-serpsmith-faq') == 'true': self.faqs.append(node)
            if re.fullmatch(r'h[1-6]', tag): self.headings.append(node)
            if node['body'] and tag in ('img', 'video', 'audio', 'iframe', 'hr', 'table', 'details', 'pre', 'object', 'svg'):
                self.content.append((self.position, 'element', node['faq']))
        if tag not in self.VOID: self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.VOID: self.handle_endtag(tag)

    def handle_endtag(self, tag):
        self.position += 1
        # Recover from ordinary optional closing tags and SVG, rather than
        # leaving an unrelated element stuck on top of the observer's stack.
        index = next((i for i in range(len(self.stack) - 1, -1, -1)
                      if self.stack[i]['tag'] == tag), None)
        if index is not None:
            for node in self.stack[index:]: node['end'] = self.position
            del self.stack[index:]

    def handle_data(self, data):
        self.position += 1
        if not self.stack or self.stack[-1]['hidden']: return
        for node in self.stack:
            if re.fullmatch(r'h[1-6]', node['tag']): node['text'].append(data)
        if self.stack[-1]['body'] and data.strip():
            self.content.append((self.position, data, self.stack[-1]['faq']))


def _verify_feature_order(body, article, sources_label, require_sources):
    page = _FeatureOrder()
    page.feed(body)
    norm = lambda s: ' '.join(s.split()).casefold()
    if len(page.bodies) != 1 or page.bodies[0]['end'] is None:
        raise ValueError('Live features require one complete article body container')
    if len(page.faqs) != 1 or not page.faqs[0]['body'] or page.faqs[0]['end'] is None:
        raise ValueError('Live FAQ must be a complete section inside article content')
    faq = page.faqs[0]
    headings = [h for h in page.headings if h['body'] and not h['faq']]
    sources = [h for h in headings if h['tag'] == 'h2' and norm(''.join(h['text'])) == norm(sources_label)]
    if len(sources) > 1 or require_sources and not sources:
        raise ValueError('Live FAQ requires one real Sources H2 in article content')
    if sources:
        source = sources[0]
        if source['start'] <= faq['end']:
            raise ValueError('Live FAQ must precede Sources after the final product section')
        stop = source['start']
    else:
        stop = page.bodies[0]['end']
    if any(faq['end'] < pos < stop for pos, _, _ in page.content):
        raise ValueError('Live FAQ must be immediately before Sources (or terminal when Sources are disabled)')
    if any(faq['end'] < h['start'] < stop for h in headings):
        raise ValueError('Live FAQ cannot precede an intervening section')
    before = [h for h in headings if h['tag'] == 'h2' and h['start'] < faq['start']]
    # Product policy is validated upstream. Here independently prove that its
    # final rendered H2 and content actually precede the FAQ, when draft metadata
    # names that heading. Inline Markdown formatting is removed for comparison.
    markdown = article.get('body_markdown', '')
    expected = re.split(r'^##\s+' + re.escape(sources_label) + r'\s*$', markdown,
                        maxsplit=1, flags=re.M | re.I)[0]
    last = re.findall(r'^##\s+(.+?)\s*#*\s*$', expected, re.M)
    if last:
        title = re.sub(r'\[([^\]]+)\]\([^)]*\)', r'\1', last[-1])
        title = re.sub(r'[*_`]', '', title)
        if not before or norm(''.join(before[-1]['text'])) != norm(html.unescape(title)):
            raise ValueError('Live final product heading must precede the FAQ')
    if before and not any(before[-1]['end'] < pos < faq['start'] and not is_faq
                          for pos, _, is_faq in page.content):
        raise ValueError('Live final product section must contain content before the FAQ')


def verify_features(body: str, article: dict, canonical: str, *, sources_label='Sources', require_sources=True) -> None:
    from .research import validate_article_features
    if not validate_article_features(article, required=False):
        return
    page = FeaturePage()
    page.feed(body)
    norm = lambda s: ' '.join(s.split())
    if page.summary_count != 1 or norm(''.join(page.summary)) != norm('TL;DR' + article['tldr']):
        raise ValueError('Live branded TL;DR is missing or differs')
    from .category_navigation import compact_breadcrumb
    navigation_ok = ('back' in page.events and page.events.index('back') < page.events.index('summary')) or compact_breadcrumb(body) is not None
    if (not navigation_ok or 'body' not in page.events or page.events.index('summary') > page.events.index('body')):
        raise ValueError('Live TL;DR must follow Back to Blog or compact breadcrumbs and precede article content')
    if page.faq_count != 1 or page.detail_count != 5 or len(page.questions) != 5 or len(page.answers) != 5:
        raise ValueError('Live FAQ must show exactly five questions and answers')
    if page.detail_groups != ['serpsmith-article-faq'] * 5:
        raise ValueError('Live FAQ must use one exclusive native details group')
    if [norm(''.join(q)) for q in page.questions] != [norm(q['question']) for q in article['faq']]:
        raise ValueError('Live FAQ questions differ')
    if [norm(''.join(a)) for a in page.answers] != [norm(q['answer']) for q in article['faq']]:
        raise ValueError('Live FAQ answers differ')
    def nodes(value):
        if isinstance(value, list):
            for item in value:
                yield from nodes(item)
        elif isinstance(value, dict):
            yield value
            yield from nodes(value.get('@graph', []))
    matching = [v for data in page.schemas for v in nodes(data)
                if v.get('@type') == 'FAQPage' and v.get('@id') == canonical + '#faq']
    if matching != [faq_schema(article, canonical)]:
        raise ValueError('Live FAQPage schema must exactly match visible questions and answers')
    _verify_feature_order(body, article, sources_label, require_sources)
