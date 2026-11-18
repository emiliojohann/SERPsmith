"""Native HTTPS search/analytics integrations; no import-time calls.

Private search-credentials.json may hold bing_api_key/indexnow_key or *_keychain
{service,account} references. Google uses private/google-service-account.json.
Search results and follow-ups contain only URLs, statuses and HTTP metadata.
"""
from __future__ import annotations
import json
import os
from pathlib import Path
import subprocess
import urllib.error
import urllib.request
from urllib.parse import quote, urlencode, urlparse
from datetime import date, timedelta


def _home():
    return Path(os.environ.get('SERPSMITH_HOME', '~/SERPsmith')).expanduser()


def _credentials():
    path = _home() / 'private/search-credentials.json'
    return json.loads(path.read_text()) if path.exists() else {}


def _secret(credentials, name):
    ref = credentials.get(name + '_keychain')
    if ref:
        p = subprocess.run(['security', 'find-generic-password', '-s', ref['service'], '-a', ref['account'], '-w'], capture_output=True, text=True, timeout=20)
        if p.returncode:
            raise RuntimeError('Credential unavailable')
        return p.stdout.strip()
    return credentials.get(name)


def _google_token(scope):
    # Supported Google authentication library performs service-account JWT exchange.
    # Imported only on explicit invocation; key content is never returned or logged.
    from google.oauth2 import service_account
    from google.auth.transport.requests import Request
    creds = service_account.Credentials.from_service_account_file(
        str(_home() / 'private/google-service-account.json'), scopes=[scope])
    creds.refresh(Request())
    return creds.token


def _request(url, method='POST', data=None, token=None):
    headers = {'User-Agent': 'SERPsmith/1.0', 'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    payload = json.dumps(data).encode() if data is not None else (b'' if method in ('POST', 'PUT') else None)
    request = urllib.request.Request(url, data=payload, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read(2_000_000)
            return response.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        # Provider bodies/request URLs can echo keys. Deliberately omit them.
        return exc.code, {}


def submit(blog: dict, receipt: dict, *, services=None) -> dict:
    services = tuple(('google', 'bing', 'indexnow') if services is None else services)
    if any(s not in ('google', 'bing', 'indexnow') for s in services):
        raise ValueError('Unsupported search service')
    cfg = blog.get('search', {})
    url = receipt['url']
    if urlparse(url).scheme != 'https' or urlparse(url).netloc != urlparse(blog['url']).netloc:
        raise ValueError('Submission URL must belong to the configured HTTPS site')
    results = {'url': url, 'indexed': None, 'followups': []}
    credentials = _credentials()
    for service in dict.fromkeys(services):
        try:
            if service == 'google':
                prop = cfg.get('search_console_property', cfg.get('property'))
                if not prop:
                    results[service] = {'status': 'not_configured', 'indexed': None}
                    continue
                sitemap = cfg.get('sitemap_url', blog['url'].rstrip('/') + '/sitemap.xml')
                endpoint = 'https://www.googleapis.com/webmasters/v3/sites/' + quote(prop, safe='') + '/sitemaps/' + quote(sitemap, safe='')
                code, data = _request(endpoint, 'PUT', token=_google_token('https://www.googleapis.com/auth/webmasters'))
            elif service == 'bing':
                key = _secret(credentials, 'bing_api_key')
                if not key:
                    results[service] = {'status': 'not_configured', 'indexed': None}
                    continue
                endpoint = 'https://ssl.bing.com/webmaster/api.svc/json/SubmitUrl?' + urlencode({'apikey': key})
                code, data = _request(endpoint, data={'siteUrl': cfg.get('bing_site_url', blog['url'].rstrip('/') + '/'), 'url': url})
                if code == 200 and data.get('ErrorCode'):
                    code = 400
            else:
                per_site = credentials.get('sites', {}).get(blog['id'], {})
                key = _secret(per_site, 'indexnow_key') or _secret(credentials, 'indexnow_key')
                if not key:
                    results[service] = {'status': 'not_configured', 'indexed': None}
                    continue
                host = urlparse(blog['url']).netloc
                key_location = cfg.get('indexnow_key_location', blog['url'].rstrip('/') + '/' + key + '.txt')
                if urlparse(key_location).netloc != host:
                    raise ValueError('IndexNow key location must belong to site')
                code, data = _request('https://api.indexnow.org/indexnow', data={'host': host, 'key': key, 'keyLocation': key_location, 'urlList': [url]})
            results[service] = {'status': 'accepted' if 200 <= code < 300 else 'failed', 'http_status': code, 'indexed': None}
        except Exception:
            # A transport timeout may have accepted the submission; do not blindly replay.
            results[service] = {'status': 'unknown', 'indexed': None}
        finally:
            if results.get(service, {}).get('status') != 'accepted':
                results['followups'].append({'service': service, 'url': url, 'status': results.get(service, {}).get('status', 'unknown')})
    return results


def insights(blog: dict, days: int = 28) -> dict:
    """Optional read-only GSC queries and GA4 organic landing-page observations."""
    if not 1 <= days <= 90:
        raise ValueError('Insights window must be 1..90 days')
    end = date.today() - timedelta(days=3)
    start = end - timedelta(days=days - 1)
    result = {}
    cfg = blog.get('search', {})
    prop = cfg.get('search_console_property', cfg.get('property'))
    analytics = blog.get('analytics', {})
    for name in ('gsc', 'ga4'):
        try:
            if name == 'gsc':
                if not prop:
                    result[name] = {'status': 'not_configured'}
                    continue
                token = _google_token('https://www.googleapis.com/auth/webmasters.readonly')
                endpoint = 'https://www.googleapis.com/webmasters/v3/sites/' + quote(prop, safe='') + '/searchAnalytics/query'
                payload = {'startDate': start.isoformat(), 'endDate': end.isoformat(), 'dimensions': ['query', 'page'], 'rowLimit': 100}
            else:
                property_id = str(analytics.get('property_id', ''))
                if not property_id:
                    result[name] = {'status': 'not_configured'}
                    continue
                if not property_id.isdigit():
                    raise ValueError('Invalid GA4 property id')
                token = _google_token('https://www.googleapis.com/auth/analytics.readonly')
                endpoint = f'https://analyticsdata.googleapis.com/v1beta/properties/{property_id}:runReport'
                payload = {'dateRanges': [{'startDate': start.isoformat(), 'endDate': end.isoformat()}], 'dimensions': [{'name': 'landingPagePlusQueryString'}], 'metrics': [{'name': 'sessions'}, {'name': 'engagedSessions'}], 'dimensionFilter': {'andGroup': {'expressions': [{'filter': {'fieldName': 'sessionDefaultChannelGroup', 'stringFilter': {'value': 'Organic Search', 'matchType': 'EXACT'}}}, {'filter': {'fieldName': 'hostName', 'stringFilter': {'value': analytics.get('expected_hostname', urlparse(blog['url']).hostname), 'matchType': 'EXACT'}}}]}}, 'limit': 100}
            code, data = _request(endpoint, data=payload, token=token)
            result[name] = {'status': 'ok' if code == 200 else 'failed', 'http_status': code, 'data': data if code == 200 else {}}
        except Exception:
            result[name] = {'status': 'unavailable'}
    return result
