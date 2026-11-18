"""Concise Hermes-native reports. Pipeline owns durable intent/delivery deduplication."""
from __future__ import annotations
from datetime import date
import json
import subprocess


def render(blog: dict, receipt: dict, search: dict) -> str:
    labels = {'google': 'Google Search Console', 'bing': 'Bing', 'indexnow': 'IndexNow'}
    wording = {'accepted': 'Submitted (indexing not confirmed)', 'not_configured': 'Not configured', 'failed': 'Submission failed', 'unknown': 'Submission unconfirmed'}
    lines = [receipt['title'].replace('\n', ' '), receipt['url'], '']
    for key, label in labels.items():
        status = search.get(key, {}).get('status', 'unknown')
        lines.append(label + ': ' + wording.get(status, 'Submission unconfirmed'))
    return '\n'.join(lines)


def _send(blog, text):
    cfg = blog.get('notifications', blog.get('notification', {}))
    target = cfg.get('target')
    if not target:
        return {'status': 'not_configured'}
    command = [cfg.get('hermes_command', 'hermes')]
    if cfg.get('profile'):
        command += ['-p', cfg['profile']]
    command += ['send', '--to', target, '--file', '-', '--json']
    try:
        p = subprocess.run(command, input=text, text=True, capture_output=True, timeout=60)
    except (subprocess.TimeoutExpired, OSError):
        return {'status': 'unknown'}
    # Do not expose CLI stdout/stderr: provider errors may contain credentials.
    if p.returncode:
        return {'status': 'unknown'}
    try:
        data = json.loads(p.stdout)
    except ValueError:
        return {'status': 'unknown'}
    if data.get('success') is True and not data.get('error') and not data.get('skipped'):
        return {'status': 'delivered', 'message_id': data.get('message_id'), 'verification': 'hermes-provider-ack'}
    return {'status': 'unknown'}


def deliver(blog: dict, receipt: dict, search: dict) -> dict:
    return _send(blog, render(blog, receipt, search))


def reminder_items(publications: list[dict], today: date | None = None, days=(30, 60, 90)) -> list[dict]:
    """Pure metadata-only selection; caller persists sent dedupe keys in Store."""
    today = today or date.today()
    items = []
    for p in publications:
        published = date.fromisoformat(str(p.get('published_at', p.get('date', '')))[:10])
        age = (today - published).days
        if age in days:
            items.append({'url': p['url'], 'title': p['title'], 'days': age, 'dedupe_key': f"{p['url']}:{age}"})
    return items


def deliver_reminders(blog: dict, items: list[dict]) -> dict:
    if not items:
        return {'status': 'nothing_due'}
    text = 'Article check-ins\n' + '\n'.join(f"{p['days']} days: {p['title']}\n{p['url']}" for p in items)
    return _send(blog, text)
