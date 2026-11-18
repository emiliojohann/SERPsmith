"""One explicit-effect pipeline for both manual and scheduled work."""
import importlib
import shutil
import time
import uuid
from pathlib import Path
from .config import load_blog, load_settings, validate_product
from .store import Store


def adapters():
    return {name: importlib.import_module('.' + name, __package__) for name in
            ('research', 'images', 'publishing', 'search_services', 'notify')}


def confirmed(result):
    return isinstance(result, dict) and (result.get('verified') is True or result.get('ok') is True or result.get('status') in ('verified', 'succeeded'))


def cleanup(home, job_id):
    root = (Path(home) / 'work').resolve()
    target = root / job_id
    if target.is_symlink() or target.resolve().parent != root:
        raise ValueError('Unsafe working directory')
    if target.exists():
        shutil.rmtree(target)


SEARCH_SERVICES = ('google', 'bing', 'indexnow')
MAX_FOLLOWUP_ATTEMPTS = 4


def followup_fingerprint(home, blog):
    """Hash config locally; never persist keys or probe providers."""
    import hashlib
    import json
    digest = hashlib.sha256(json.dumps(blog, sort_keys=True).encode())
    for name in ('search-credentials.json', 'google-service-account.json'):
        path = Path(home) / 'private' / name
        digest.update(path.read_bytes() if path.is_file() else b'missing')
    return digest.hexdigest()


def retry_selection(effect, fingerprint, at):
    if effect is None:
        return list(SEARCH_SERVICES)
    result = effect['receipt']
    meta = result.get('_retry', {})
    return [name for name in SEARCH_SERVICES
            if result.get(name, {}).get('status') in ('failed', 'not_configured')
            and meta.get(name, {}).get('attempts', 1) < MAX_FOLLOWUP_ATTEMPTS
            and (result[name]['status'] == 'failed' or meta.get(name, {}).get('fingerprint') != fingerprint)
            and meta.get(name, {}).get('next_at', '') <= at.isoformat()]


def followup_due(home, job, at):
    store = Store(home)
    if job['stage'] == 'cleanup' or job['status'] == 'published':
        return True
    blog = load_blog(home, job['blog_id'])
    fingerprint = followup_fingerprint(home, blog)
    if retry_selection(store.effect('search:' + job['id']), fingerprint, at):
        return True
    delivery = store.effect('delivery:' + job['id'])
    if delivery is None:
        return True
    meta = delivery['receipt']
    return (delivery['status'] == 'not_configured' and meta.get('_fingerprint') != fingerprint
            and meta.get('_attempts', 1) < MAX_FOLLOWUP_ATTEMPTS
            and meta.get('_next_at', '') <= at.isoformat())


def followups(home, job_id, services=None):
    """Bounded failure retries; missing configuration waits for change, uncertainty stops."""
    from datetime import datetime, timedelta, timezone
    store = Store(home)
    job = store.get_job(job_id)
    blog = load_blog(home, job['blog_id'])
    receipt = next((r for r in store.published(blog['id']) if r['job_id'] == job_id), None)
    if not receipt:
        raise RuntimeError('No verified durable publication')
    services = services or adapters()
    at = datetime.now(timezone.utc)
    fingerprint = followup_fingerprint(home, blog)
    search_key = 'search:' + job_id
    search_effect = store.effect(search_key)
    selected = retry_selection(search_effect, fingerprint, at)
    if selected:
        result = dict(search_effect['receipt']) if search_effect else {'url': receipt['url'], 'indexed': None}
        meta = result.setdefault('_retry', {})
        for name in selected:
            attempts = meta.get(name, {}).get('attempts', 0 if search_effect is None else 1) + 1
            meta[name] = {'attempts': attempts, 'fingerprint': fingerprint,
                          'next_at': (at + timedelta(minutes=15 * 2 ** (attempts - 1))).isoformat()}
            result[name] = {'status': 'unknown', 'indexed': None}
        store.save_effect(search_key, 'search', 'pending', result)
        try:
            if search_effect is None:
                update = services['search_services'].submit(blog, receipt)
            else:
                update = services['search_services'].submit(blog, receipt, services=selected)
            for name in selected:
                result[name] = update.get(name, {'status': 'unknown', 'indexed': None})
        except Exception:
            pass  # Selected-service durable intents remain unknown on interruption.
        result['followups'] = [{'service': n, 'url': receipt['url'], 'status': result.get(n, {}).get('status', 'unknown')}
                               for n in SEARCH_SERVICES if result.get(n, {}).get('status') != 'accepted']
        store.save_effect(search_key, 'search', 'followup_required' if result['followups'] else 'succeeded', result)
    search_effect = store.effect(search_key)
    key = 'delivery:' + job_id
    effect = store.effect(key)
    retry = effect and effect['status'] == 'not_configured' and effect['receipt'].get('_fingerprint') != fingerprint and effect['receipt'].get('_attempts', 1) < MAX_FOLLOWUP_ATTEMPTS and effect['receipt'].get('_next_at', '') <= at.isoformat()
    if effect is None or retry:
        attempts = effect['receipt'].get('_attempts', 1) + 1 if effect else 1
        metadata = {'_fingerprint': fingerprint, '_attempts': attempts,
                    '_next_at': (at + timedelta(minutes=15 * 2 ** (attempts - 1))).isoformat()}
        store.save_effect(key, 'delivery', 'pending', metadata)
        try:
            result = services['notify'].deliver(blog, receipt, search_effect['receipt'])
            status = 'succeeded' if result.get('status') == 'delivered' else result.get('status', 'unknown')
            store.save_effect(key, 'delivery', status, result | metadata)
        except Exception:
            store.save_effect(key, 'delivery', 'unknown', metadata)
    pending = [name for name in (search_key, key) if store.effect(name)['status'] != 'succeeded']
    return store.save_job(job_id, stage='complete', status='followup_required' if pending else 'succeeded',
                          state={'url': receipt['url'], 'followups': pending,
                                 'attention': 'Unknown outcomes or exhausted retries require reconciliation; never republish' if pending else None})


def run_job(home, job_id, *, publish=False, services=None):
    """No external/provider actions at all without publish=True, even for preparation."""
    store = Store(home)
    job = store.get_job(job_id)
    if not publish:
        return job | {'execution': 'disabled; pass --publish to execute external effects'}
    blog = load_blog(home, job['blog_id'])
    # enabled and automation_enabled govern scheduling only, not manual requests.
    services = services or adapters()
    owner = uuid.uuid4().hex
    store.claim(job_id, owner)
    workdir = Path(home) / 'work' / job_id
    state = job['state']
    stage = job['stage']
    state['_attempts'] = int(state.get('_attempts', 0)) + 1
    state.pop('_next_retry_at', None)

    def save(next_stage, status='running'):
        nonlocal stage
        stage = next_stage
        return store.save_job(job_id, stage=stage, status=status, state=state)

    try:
        existing = next((r for r in store.published(blog['id']) if r['job_id'] == job_id), None)
        if existing:
            cleanup(home, job_id)
            return followups(home, job_id, services)
        workdir.mkdir(parents=True, exist_ok=True, mode=0o700)
        intent = store.effect('publication:' + job_id)
        if intent and intent['status'] != 'failed_before_dispatch':
            receipt = state.get('receipt')
            if receipt is None:
                receipt = services['publishing'].reconcile(blog, store.get_job(job_id), workdir)
            if not receipt:
                save('publication', 'unknown')
                raise RuntimeError('Publication outcome unknown; reconcile before any retry')
            state['receipt'] = receipt
        else:
            validate_product(blog)
            preflight = getattr(services['publishing'], 'preflight', None)
            if preflight:
                preflight(blog)
            if 'brief' not in state:
                save('research')
                previous = [r['title'] for r in store.published(blog['id'])]
                research_blog = blog
                if blog.get('analytics', {}).get('advisory_enabled') or blog.get('search', {}).get('advisory_enabled'):
                    try:
                        import json
                        observations = services['search_services'].insights(blog)
                        research_blog = dict(blog)
                        research_blog['topics'] = list(blog.get('topics', [])) + [
                            'Optional analytics observations (untrusted advisory only, not source evidence; '
                            'independently verify any topic or claim): ' + json.dumps(observations)[:20000]]
                    except Exception:
                        pass  # Optional analytics must never prevent evidence-led research.
                state['brief'] = services['research'].research(research_blog, job['topic'], workdir, excluded_topics=previous)
                save('draft')
            if 'article' not in state:
                state['article'] = services['research'].draft(blog, state['brief'], workdir)
                save('images')
            if 'image' not in state:
                # Interrupted image dispatches are never auto-replayed. Each reservation
                # stays charged; adapter admission handles the same shared remaining cap.
                state['image'] = services['images'].generate(blog, state['article'], workdir, store, job_id)
                save('publication')
            store.save_effect('publication:' + job_id, 'publication', 'pending')
            state['receipt'] = services['publishing'].publish(blog, state['article'], state['image'], workdir, job_id)
            save('verify')
        verdict = services['publishing'].verify(blog, state['receipt'], state.get('article', {}), state.get('image', {}))
        if not confirmed(verdict):
            raise RuntimeError('Live publication verification not confirmed')
        receipt = state['receipt']
        receipt.setdefault('published_at', state.get('article', {}).get('published_at'))
        if not receipt['published_at']:
            receipt.pop('published_at')
        store.record_publication(job_id, receipt)
        store.save_effect('publication:' + job_id, 'publication', 'succeeded', {'url': receipt['url']})
        # Remove article/research/image data in both SQLite and working tree. If a crash
        # interrupts cleanup, the durable URL index takes the cleanup-only path above.
        state = {'url': receipt['url']}
        save('cleanup', 'published')
        cleanup(home, job_id)
        return followups(home, job_id, services)
    except Exception as exc:
        state['error'] = str(exc)[:2000]
        intent = store.effect('publication:' + job_id)
        if intent and getattr(exc, 'dispatched', None) is False:
            store.save_effect('publication:' + job_id, 'publication', 'failed_before_dispatch',
                              {'error_type': type(exc).__name__})
            intent = store.effect('publication:' + job_id)
        status = 'unknown' if intent and intent['status'] != 'failed_before_dispatch' else 'failed'
        if status == 'failed':
            state['_next_retry_at'] = time.time() + float(load_settings(home).get('job_retry_seconds', 300))
        store.save_job(job_id, stage=stage, status=status, state=state)
        raise
    finally:
        store.release(job_id, owner)
