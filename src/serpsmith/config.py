"""Portable configuration; operator-specific values live outside application source."""
import json
import os
import re
from pathlib import Path

DEFAULTS = {
    'automation_enabled': False, 'publication_enabled': False,
    'image_max_attempts': 4, 'image_article_cap_usd': 2.0,
    'image_monthly_cap_usd': 50.0,
    'image_routes': ['openai-2.6', 'openai-2.5', 'codex-subscription'],
    'reminders_days': [30, 60, 90],
}


def home_path():
    return Path(os.environ.get('SERPSMITH_HOME', '~/SERPsmith')).expanduser().resolve()


def load_settings(home):
    path = Path(home) / 'settings.json'
    return DEFAULTS | (json.loads(path.read_text()) if path.exists() else {})


def validate_blog(blog):
    if not re.fullmatch(r'[a-z0-9][a-z0-9_-]*', blog['id']):
        raise ValueError('Invalid blog id')
    for key in ('url', 'repository', 'publisher', 'timezone', 'schedule'):
        if not blog.get(key):
            raise ValueError('Missing blog field: ' + key)
    from zoneinfo import ZoneInfo
    ZoneInfo(blog['timezone'])
    from datetime import time
    time.fromisoformat(blog['schedule']['time'])
    if any(type(d) is not int or not 0 <= d <= 6 for d in blog['schedule']['weekdays']):
        raise ValueError('Schedule weekdays must be integers 0..6')
    return blog


def validate_product(blog):
    """Require owner-supplied product facts before paid/external article work."""
    from urllib.parse import urlsplit
    product = blog.get('product')
    if not isinstance(product, dict) or any(not isinstance(product.get(k), str) or not product[k].strip()
                                            for k in ('name', 'description', 'url')):
        raise ValueError('Configure product name, description and URL before publishing')
    url = urlsplit(product['url'])
    if url.scheme != 'https' or not url.hostname or url.username or url.password:
        raise ValueError('Product URL must be a public HTTPS URL without credentials')
    features = product.get('verified_capabilities')
    if not isinstance(features, list) or not features or any(not isinstance(v, str) or not v.strip() for v in features):
        raise ValueError('Configure verified product capabilities before publishing')
    return product


def load_blog(home, blog_id):
    if not re.fullmatch(r'[a-z0-9][a-z0-9_-]*', blog_id):
        raise ValueError('Invalid blog id')
    blog = validate_blog(json.loads((Path(home) / 'blogs' / (blog_id + '.json')).read_text()))
    if blog['id'] != blog_id:
        raise ValueError('Blog filename/id mismatch')
    return blog


def list_blogs(home):
    return [load_blog(home, p.stem) for p in sorted((Path(home) / 'blogs').glob('*.json'))]


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(value, indent=2) + '\n')
    temp.chmod(0o600)
    temp.replace(path)


def initialize(home, setup_path=None):
    """Explicit one-time normalization. Does not import credentials or enable automation."""
    home = Path(home)
    if not (home / 'settings.json').exists():
        write_json(home / 'settings.json', DEFAULTS)
    if not setup_path:
        return []
    setup = json.loads(Path(setup_path).read_text())
    days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    created = []
    for key, old in setup['legacy_profiles_for_onboarding_only'].items():
        schedule = old['schedule']
        publisher = dict(old['content_adapter'])
        for field in ('image_directory', 'sitemap_file', 'llms_file', 'llms_full_file', 'article_route', 'deployment_adapter', 'editorial_guardrails', 'external_link_limits', 'internal_link_minimum', 'repository_instruction_files'):
            if field in old:
                publisher[field] = old[field]
        blog = {
            'id': key, 'url': old['public_base_url'], 'repository': old['repository'],
            'branch': old.get('branch', 'main'), 'remote': old.get('remote', 'origin'),
            'timezone': schedule.get('timezone', old.get('timezone', 'UTC')),
            'schedule': {'weekdays': [days.index(d.lower()) for d in schedule['weekdays']], 'time': schedule['local_time']},
            'enabled': False, 'publisher': publisher,
            'audience': old.get('audience', ''), 'topics': old.get('topics', []),
            'editorial_guardrails': old.get('editorial_guardrails', []),
            'image': dict(old.get('image_policy', {})) | {'theme': old.get('image_direction', {}), 'palette': []},
            'analytics': old.get('analytics', {}),
            'search': {k: old[k] for k in ('search_console_property', 'bing_site_url', 'indexnow_host', 'sitemap_url') if k in old},
        }
        target = home / 'blogs' / (key + '.json')
        if not target.exists():
            write_json(target, validate_blog(blog))
            created.append(key)
    return created


SUPPORTED_PUBLISHERS = ('php-posts-data', 'nextjs-tsx-blog-registry')


def guided_blog():
    """Small local-only onboarding; no credentials requested and no live probes."""
    def ask(label, default=''):
        value = input(label + (f' [{default}]' if default else '') + ': ').strip()
        return value or default
    identifier = ask('Blog id (lowercase letters, digits, hyphens)')
    url = ask('Public HTTPS base URL')
    product_name = ask('Product or service name')
    product_description = ask('What does it do? (one factual sentence)')
    product_url = ask('Product page URL', url.rstrip('/') + '/')
    product_capabilities = [v.strip() for v in ask('Verified capabilities (comma separated)').split(',') if v.strip()]
    repository = ask('Local website repository path')
    print('Supported publishers: ' + ', '.join(SUPPORTED_PUBLISHERS))
    publisher = ask('Publisher', SUPPORTED_PUBLISHERS[0])
    if publisher not in SUPPORTED_PUBLISHERS:
        raise ValueError('Unsupported publisher')
    posts = ask('Repository-relative posts registry file')
    zone = ask('Timezone', 'UTC')
    weekdays = [int(day.strip()) for day in ask('Weekdays (Monday=0, comma separated)', '0').split(',')]
    clock = ask('Local publication time (HH:MM)', '08:00')
    target = ask('Hermes notification target (optional; configure privately later)')
    result = validate_blog({'id': identifier, 'url': url, 'repository': str(Path(repository).expanduser()),
        'branch': ask('Git branch', 'main'), 'remote': 'origin', 'timezone': zone,
        'schedule': {'weekdays': weekdays, 'time': clock}, 'enabled': False,
        'publisher': {'name': publisher, 'posts_file': posts},
        'audience': ask('Audience (optional)'), 'topics': [],
        'product': {'name': product_name, 'description': product_description,
                    'url': product_url, 'verified_capabilities': product_capabilities},
        'analytics': {}, 'search': {}, 'notifications': {'target': target}})
    validate_product(result)
    return result


def offline_doctor(home):
    """Inspect local installation/config only; presence is not connection verification."""
    import importlib
    import shutil
    import subprocess
    from urllib.parse import urlsplit
    checks = {}
    def check(name, ok, detail=''):
        checks[name] = {'ok': bool(ok), 'detail': detail}
    for name in ('research', 'images', 'publishing', 'search_services', 'notify'):
        try:
            module = importlib.import_module('.' + name, __package__)
            required = {'research': ('research', 'draft'), 'images': ('generate',),
                        'publishing': ('publish', 'verify', 'reconcile'),
                        'search_services': ('submit', 'insights'), 'notify': ('deliver',)}[name]
            check('adapter.' + name, all(callable(getattr(module, fn, None)) for fn in required))
        except Exception:
            check('adapter.' + name, False, 'Import failed; adapter/dependencies unavailable')
    for module in ('PIL', 'google.oauth2.service_account', 'google.auth.transport.requests'):
        try:
            importlib.import_module(module)
            check('dependency.' + module, True)
        except Exception:
            check('dependency.' + module, False, 'Not importable')
    for executable in ('git', 'hermes'):
        check('executable.' + executable, shutil.which(executable) is not None)
    settings = load_settings(home)
    check('settings.automation_enabled', type(settings['automation_enabled']) is bool)
    google = Path(home) / 'private/google-service-account.json'
    try:
        account = json.loads(google.read_text())
        check('credentials.google', all(account.get(k) for k in ('client_email', 'private_key', 'token_uri')), 'Local fields only; authorization untested')
    except (OSError, ValueError, AttributeError):
        check('credentials.google', False, 'Missing/unreadable credential JSON')
    try:
        path = Path(home) / 'private/search-credentials.json'
        credentials = json.loads(path.read_text()) if path.exists() else {}
        check('credentials.search_json', isinstance(credentials, dict), 'Local presence only')
        if not isinstance(credentials, dict):
            credentials = {}
    except (OSError, ValueError):
        credentials = {}
        check('credentials.search_json', False, 'Unreadable credential JSON')
    # Metadata-only Keychain lookup: never request -w/-g or expose command output.
    def key_present(ref):
        if not isinstance(ref, dict) or not ref.get('service') or not ref.get('account') or not shutil.which('security'):
            return False
        try:
            result = subprocess.run(['security', 'find-generic-password', '-s', ref['service'], '-a', ref['account']],
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=5)
            return result.returncode == 0
        except (OSError, subprocess.TimeoutExpired):
            return False
    check('credentials.image_keychain', key_present({'service': 'serpsmith-openai-images', 'account': 'serpsmith'}), 'Metadata presence only; key access/connection untested')
    def configured_secret(cfg, key):
        return bool(cfg.get(key)) or key_present(cfg.get(key + '_keychain'))
    check('credentials.bing', configured_secret(credentials, 'bing_api_key'), 'Presence only')
    blogs = []
    for path in sorted((Path(home) / 'blogs').glob('*.json')):
        prefix = 'blog.' + path.stem + '.'
        try:
            blog = load_blog(home, path.stem)
            blogs.append(blog['id'])
            check(prefix + 'config', True)
            try:
                validate_product(blog)
                check(prefix + 'product', True, 'Owner-supplied factual product context present')
            except ValueError as exc:
                check(prefix + 'product', False, str(exc))
            check(prefix + 'url', urlsplit(blog['url']).scheme == 'https' and bool(urlsplit(blog['url']).hostname))
            cfg = blog['publisher']
            check(prefix + 'publisher', cfg.get('name') in SUPPORTED_PUBLISHERS, 'Supported formats: ' + ', '.join(SUPPORTED_PUBLISHERS))
            repo = Path(blog['repository']).expanduser()
            check(prefix + 'repository', repo.is_dir() and (repo / '.git').exists(), 'Local Git checkout required')
            for name in ('posts_file', 'image_directory', 'sitemap_file', 'llms_file', 'llms_full_file'):
                value = cfg.get(name)
                if value or name == 'posts_file':
                    relative = Path(value or '')
                    safe = bool(value) and not relative.is_absolute() and (repo / relative).resolve().is_relative_to(repo.resolve())
                    exists = (repo / relative).is_file() if name == 'posts_file' else (repo / relative).exists()
                    check(prefix + 'path.' + name, safe and exists, 'Safe repository-relative path must exist')
            notifications = blog.get('notifications', blog.get('notification', {}))
            check(prefix + 'notifications.target', bool(notifications.get('target')), 'Local target present only; delivery untested')
            command = notifications.get('hermes_command', 'hermes')
            check(prefix + 'notifications.command', shutil.which(command) is not None)
            search = blog.get('search', {})
            check(prefix + 'search.google_property', bool(search.get('search_console_property', search.get('property'))), 'Authorization untested')
            site = credentials.get('sites', {}).get(blog['id'], {})
            check(prefix + 'credentials.indexnow', configured_secret(site, 'indexnow_key') or configured_secret(credentials, 'indexnow_key'), 'Presence only; hosted key untested')
        except Exception:
            check(prefix + 'config', False, 'Invalid/unreadable local configuration')
    check('blogs.present', bool(blogs))
    return {'ok': all(c['ok'] for c in checks.values()), 'checks': checks,
            'blogs': blogs, 'external_connections': 'untested (offline checks only)',
            'automation_enabled': settings['automation_enabled']}
