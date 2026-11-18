"""Passive local scheduling. Installing this package registers no background jobs."""
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from .config import list_blogs, load_settings
from .store import Store


def tick(home, *, publish=False, at=None):
    settings = load_settings(home)
    at = at or datetime.now(timezone.utc)
    if at.tzinfo is None:
        raise ValueError('tick requires a timezone-aware datetime')
    store = Store(home)
    jobs = []
    followups = []
    reminder_deliveries = []
    if publish:
        from .pipeline import run_job, followup_due
        for job in store.followup_jobs():
            try:
                if not followup_due(home, job, at):
                    continue
                followups.append(run_job(home, job['id'], publish=True))
            except Exception as exc:
                followups.append({'id': job['id'], 'error': str(exc)[:500]})
        if settings.get('reminders_enabled', True) and reminders(home, at=at):
            reminder_deliveries = send_reminders(home)
    if not settings['automation_enabled']:
        return {'automation_enabled': False, 'jobs': jobs, 'followups': followups,
                'reminders': reminder_deliveries}
    for blog in list_blogs(home):
        if not blog.get('enabled', False):
            continue
        local = at.astimezone(ZoneInfo(blog['timezone']))
        hour, minute = map(int, blog['schedule']['time'].split(':'))
        if local.weekday() not in blog['schedule']['weekdays'] or (local.hour, local.minute) < (hour, minute):
            continue
        key = f"slot:{blog['id']}:{local.date().isoformat()}:{blog['schedule']['time']}"
        job = store.create_job(blog['id'], kind='scheduled', request_key=key)
        safe_retry = (job['status'] == 'failed'
                      and int(job['state'].get('_attempts', 0)) < int(settings.get('job_retry_attempts', 3))
                      and float(job['state'].get('_next_retry_at', 0)) <= at.timestamp())
        if publish and (job['status'] == 'queued' or safe_retry):
            from .pipeline import run_job
            try:
                job = run_job(home, job['id'], publish=True)
            except Exception:
                job = store.get_job(job['id'])
        # Service logs must not retain article/research payloads after later cleanup.
        jobs.append({k: job[k] for k in ('id', 'blog_id', 'kind', 'stage', 'status')})
    return {'automation_enabled': True, 'jobs': jobs, 'followups': followups,
            'reminders': reminder_deliveries}


def reminders(home, *, at=None):
    """Consolidated URL-only reminder data; merely listing it never sends a message."""
    at = at or datetime.now(timezone.utc)
    store = Store(home)
    due = []
    for publication in store.published():
        if not publication['published_at']:
            continue  # Imported URL history has no trustworthy publication date.
        date = datetime.fromisoformat(publication['published_at'].replace('Z', '+00:00'))
        if date.tzinfo is None:
            date = date.replace(tzinfo=timezone.utc)
        for days in load_settings(home)['reminders_days']:
            key = f"reminder:{publication['job_id']}:{days}"
            if date + timedelta(days=days) <= at and not store.effect(key):
                due.append({'key': key, 'days': days, 'blog_id': publication['blog_id'],
                            'url': publication['url'], 'title': publication['title']})
    return due


def send_reminders(home, *, notifier=None):
    """Explicit consolidated delivery, with durable no-replay intent per due item."""
    import uuid
    from .config import load_blog
    if notifier is None:
        from .notify import deliver_reminders
        notifier = deliver_reminders
    store = Store(home)
    results = []
    blog_ids = sorted({item['blog_id'] for item in reminders(home)})
    for blog_id in blog_ids:
        owner = uuid.uuid4().hex
        lock = 'reminders:' + blog_id
        store.claim(lock, owner)
        try:
            items = [item for item in reminders(home) if item['blog_id'] == blog_id]
            if not items:
                continue
            for item in items:
                store.save_effect(item['key'], 'reminder', 'pending')
            try:
                result = notifier(load_blog(home, blog_id), items)
                status = 'succeeded' if result.get('status') == 'delivered' else result.get('status', 'unknown')
            except Exception:
                result, status = {'status': 'unknown'}, 'unknown'
            for item in items:
                store.save_effect(item['key'], 'reminder', status, result)
            results.append({'blog_id': blog_id, 'items': len(items), 'delivery': result})
        finally:
            store.release(lock, owner)
    return results


def acknowledge_reminders(home, keys):
    """Explicit acknowledgement after operator delivery, never simulated send success."""
    store = Store(home)
    due = {item['key'] for item in reminders(home)}
    for key in keys:
        if key not in due:
            raise ValueError('Reminder is not pending: ' + key)
        store.save_effect(key, 'reminder', 'acknowledged')
    return {'acknowledged': keys}
