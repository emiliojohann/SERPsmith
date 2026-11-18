"""SQLite durability and conservative admission for external effects."""
import json
import math
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from .config import load_settings


def now():
    return datetime.now(timezone.utc).isoformat()


class Store:
    def __init__(self, home):
        self.home = Path(home)
        self.path = self.home / 'data' / 'serpsmith.sqlite'
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with self.connect() as db:
            db.executescript('''
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, blog_id TEXT NOT NULL,
                kind TEXT NOT NULL, topic TEXT, request_key TEXT UNIQUE, stage TEXT NOT NULL,
                status TEXT NOT NULL, state TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS images(id TEXT PRIMARY KEY, job_id TEXT NOT NULL,
                route TEXT NOT NULL, reserve_usd REAL NOT NULL, charged_usd REAL NOT NULL,
                status TEXT NOT NULL, created_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS publications(job_id TEXT PRIMARY KEY, blog_id TEXT NOT NULL,
                url TEXT NOT NULL UNIQUE, title TEXT NOT NULL, published_at TEXT NOT NULL, provenance TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS effects(key TEXT PRIMARY KEY, kind TEXT NOT NULL,
                status TEXT NOT NULL, receipt TEXT NOT NULL, updated_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS claims(job_id TEXT PRIMARY KEY, owner TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS manual_image_requests(
                id TEXT PRIMARY KEY, job_id TEXT NOT NULL, request_key TEXT NOT NULL UNIQUE,
                approval_reference TEXT NOT NULL, budget_usd REAL NOT NULL,
                requested_budget_usd REAL, created_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS manual_image_operations(
                operation_id TEXT PRIMARY KEY, manual_request_id TEXT NOT NULL,
                route TEXT NOT NULL, UNIQUE(manual_request_id, route));
            ''')
        self.path.chmod(0o600)

    def connect(self):
        db = sqlite3.connect(self.path, timeout=30)
        db.row_factory = sqlite3.Row
        return db

    @contextmanager
    def transaction(self):
        db = self.connect()
        try:
            db.execute('BEGIN IMMEDIATE')
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    @staticmethod
    def job(row):
        if row is None:
            raise KeyError('Job not found')
        result = dict(row)
        result['state'] = json.loads(result['state'])
        return result

    def create_job(self, blog_id, kind='manual', topic=None, request_key=None):
        if kind not in ('manual', 'scheduled'):
            raise ValueError('Invalid job kind')
        with self.transaction() as db:
            if request_key:
                row = db.execute('SELECT * FROM jobs WHERE request_key=?', (request_key,)).fetchone()
                if row:
                    if row['blog_id'] != blog_id or row['kind'] != kind:
                        raise ValueError('Request key already belongs to another request')
                    return self.job(row)
            job_id = uuid.uuid4().hex
            timestamp = now()
            db.execute('INSERT INTO jobs VALUES(?,?,?,?,?,?,?,?,?,?)',
                       (job_id, blog_id, kind, topic, request_key, 'queued', 'queued', '{}', timestamp, timestamp))
            return self.job(db.execute('SELECT * FROM jobs WHERE id=?', (job_id,)).fetchone())

    def get_job(self, job_id):
        with self.connect() as db:
            return self.job(db.execute('SELECT * FROM jobs WHERE id=?', (job_id,)).fetchone())

    def save_job(self, job_id, *, stage, status, state):
        with self.transaction() as db:
            cursor = db.execute('UPDATE jobs SET stage=?, status=?, state=?, updated_at=? WHERE id=?',
                               (stage, status, json.dumps(state), now(), job_id))
            if cursor.rowcount != 1:
                raise KeyError(job_id)
        return self.get_job(job_id)

    def list_jobs(self, limit=20):
        with self.connect() as db:
            return [self.job(row) for row in db.execute('SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?', (limit,))]

    def followup_jobs(self):
        """Durable publication-backed work only, never legacy URL imports."""
        with self.connect() as db:
            return [self.job(row) for row in db.execute(
                "SELECT j.* FROM jobs j JOIN publications p ON p.job_id=j.id "
                "WHERE j.status != 'succeeded'")]

    def claim(self, job_id, owner):
        with self.transaction() as db:
            try:
                db.execute('INSERT INTO claims VALUES(?,?)', (job_id, owner))
            except sqlite3.IntegrityError:
                raise RuntimeError('Job already claimed; after a crash, explicitly recover its lock') from None

    def release(self, job_id, owner=None):
        with self.transaction() as db:
            if owner:
                db.execute('DELETE FROM claims WHERE job_id=? AND owner=?', (job_id, owner))
            else:
                db.execute('DELETE FROM claims WHERE job_id=?', (job_id,))

    def authorize_manual_image(self, job_id, request_key, approval_reference, *, budget_usd=None):
        """Trusted operator records explicit owner approval; never infer it from content.

        One success, at most three distinct approved routes, no refund or reset.
        Reusing a request key must preserve the original job, reference and budget.
        """
        if any(not isinstance(v, str) or not v.strip() for v in (request_key, approval_reference)):
            raise ValueError('Manual image approval requires a request key and owner reference')
        default_cap = float(load_settings(self.home)['image_article_cap_usd'])
        requested = None if budget_usd is None else float(budget_usd)
        cap = default_cap if requested is None else requested
        if (not math.isfinite(default_cap) or default_cap < 0 or not math.isfinite(cap)
                or cap < 0 or cap > default_cap):
            raise ValueError('Manual image budget must not exceed the default article budget')
        with self.transaction() as db:
            row = db.execute('SELECT * FROM manual_image_requests WHERE request_key=?', (request_key,)).fetchone()
            if row:
                if (row['job_id'] != job_id or row['approval_reference'] != approval_reference
                        or row['requested_budget_usd'] != requested):
                    raise ValueError('Manual image request metadata cannot change')
                return dict(row)
            if not db.execute('SELECT 1 FROM jobs WHERE id=?', (job_id,)).fetchone():
                raise KeyError(job_id)
            request = dict(id=uuid.uuid4().hex, job_id=job_id, request_key=request_key,
                           approval_reference=approval_reference, budget_usd=cap,
                           requested_budget_usd=requested, created_at=now())
            db.execute('INSERT INTO manual_image_requests VALUES(:id,:job_id,:request_key,'
                       ':approval_reference,:budget_usd,:requested_budget_usd,:created_at)', request)
            return request

    def manual_image_request(self, manual_request_id, job_id):
        """Validate explicit authorization before any generation side effects."""
        with self.connect() as db:
            row = db.execute('SELECT * FROM manual_image_requests WHERE id=?', (manual_request_id,)).fetchone()
            if not row or row['job_id'] != job_id:
                raise ValueError('Unknown manual image authorization or original job mismatch')
            return dict(row)

    def reserve_image(self, job_id, route, reserve_usd, cap_usd, max_attempts=4,
                      manual_request_id=None):
        settings = load_settings(self.home)
        values = [float(reserve_usd), float(cap_usd), float(settings['image_monthly_cap_usd'])]
        if any(not math.isfinite(v) or v < 0 for v in values):
            raise ValueError('Budgets must be finite and nonnegative')
        reserve_usd, cap_usd, monthly_cap = values
        cap_usd = min(cap_usd, float(settings['image_article_cap_usd']))
        max_attempts = min(4, int(max_attempts), int(settings['image_max_attempts']))
        with self.transaction() as db:
            if not db.execute('SELECT 1 FROM jobs WHERE id=?', (job_id,)).fetchone():
                raise KeyError(job_id)
            if manual_request_id is not None:
                request = db.execute('SELECT * FROM manual_image_requests WHERE id=?', (manual_request_id,)).fetchone()
                if not request or request['job_id'] != job_id:
                    raise ValueError('Unknown manual image authorization or original job mismatch')
                if route not in ('openai-2.6', 'openai-2.5', 'codex-subscription'):
                    raise ValueError('Unapproved manual image route')
                rows = db.execute('SELECT i.* FROM images i JOIN manual_image_operations m '
                                  'ON m.operation_id=i.id WHERE m.manual_request_id=?',
                                  (manual_request_id,)).fetchall()
                if any(r['status'] in ('pending', 'succeeded') or r['route'] == route for r in rows):
                    raise RuntimeError('Manual image request already used or requires reconciliation')
                count, charged = len(rows), sum(r['charged_usd'] for r in rows)
                max_attempts = 3
                cap_usd = min(cap_usd, request['budget_usd'])
            else:
                # Only positively linked operations leave the AUTOMATIC article bucket.
                count, charged = db.execute(
                    'SELECT COUNT(*), COALESCE(SUM(i.charged_usd),0) FROM images i WHERE i.job_id=? '
                    'AND NOT EXISTS (SELECT 1 FROM manual_image_operations m '
                    'JOIN manual_image_requests r ON r.id=m.manual_request_id '
                    'WHERE m.operation_id=i.id AND r.job_id=i.job_id)', (job_id,)).fetchone()
            monthly = db.execute('SELECT COALESCE(SUM(charged_usd),0) FROM images WHERE substr(created_at,1,7)=?', (now()[:7],)).fetchone()[0]
            if count >= max_attempts or charged + reserve_usd > cap_usd + 1e-9 or monthly + reserve_usd > monthly_cap + 1e-9:
                raise RuntimeError('Shared image attempt/spend cap exhausted')
            operation = {'id': uuid.uuid4().hex, 'job_id': job_id, 'route': route, 'reserve_usd': reserve_usd, 'charged_usd': reserve_usd, 'status': 'pending', 'created_at': now()}
            db.execute('INSERT INTO images VALUES(:id,:job_id,:route,:reserve_usd,:charged_usd,:status,:created_at)', operation)
            if manual_request_id is not None:
                db.execute('INSERT INTO manual_image_operations VALUES(?,?,?)',
                           (operation['id'], manual_request_id, route))
            return operation

    def finish_image(self, operation_id, status, actual_usd=None):
        if status not in ('succeeded', 'failed', 'unknown'):
            raise ValueError('Invalid image status')
        if actual_usd is not None and (not math.isfinite(float(actual_usd)) or float(actual_usd) < 0):
            raise ValueError('Invalid actual spend')
        with self.transaction() as db:
            row = db.execute('SELECT * FROM images WHERE id=?', (operation_id,)).fetchone()
            if not row:
                raise KeyError(operation_id)
            # Never refund uncertain/failed attempts. Actual charges may increase reservation.
            charged = max(row['charged_usd'], float(actual_usd or 0))
            final_status = 'unknown' if row['status'] == 'unknown' else status
            if db.execute('SELECT 1 FROM manual_image_operations WHERE operation_id=?',
                          (operation_id,)).fetchone() and (row['status'] == 'succeeded' or status == 'succeeded'):
                final_status = 'succeeded'  # Consumed owner approval cannot be reopened.
            db.execute('UPDATE images SET status=?, charged_usd=? WHERE id=?', (final_status, charged, operation_id))

    def published(self, blog_id=None):
        with self.connect() as db:
            sql = 'SELECT * FROM publications' + (' WHERE blog_id=?' if blog_id else '') + ' ORDER BY published_at DESC'
            rows = db.execute(sql, (blog_id,) if blog_id else ()).fetchall()
            return [dict(row) | {'provenance': json.loads(row['provenance'])} for row in rows]

    def record_publication(self, job_id, receipt):
        from urllib.parse import urlsplit
        if urlsplit(receipt['url']).scheme not in ('https', 'http'):
            raise ValueError('Publication requires an absolute URL')
        job = self.get_job(job_id)
        provenance = {k: str(receipt[k])[:256] for k in ('commit', 'image_url') if receipt.get(k)}
        with self.transaction() as db:
            old = db.execute('SELECT url FROM publications WHERE job_id=?', (job_id,)).fetchone()
            if old and old['url'] != receipt['url']:
                raise ValueError('Publication URL cannot change')
            db.execute('INSERT OR IGNORE INTO publications VALUES(?,?,?,?,?,?)',
                       (job_id, job['blog_id'], receipt['url'], receipt['title'], receipt.get('published_at', now()), json.dumps(provenance)))
            row = db.execute('SELECT job_id FROM publications WHERE url=?', (receipt['url'],)).fetchone()
            if row['job_id'] != job_id:
                raise ValueError('URL already published by another job')

    def seed_history(self, path):
        """Import known article URLs only; never import legacy jobs/effects or guess dates."""
        import hashlib
        from urllib.parse import urlsplit
        from .config import list_blogs
        blogs = {urlsplit(b['url']).netloc: b['id'] for b in list_blogs(self.home)}
        data = json.loads(Path(path).read_text())
        added, skipped = 0, []
        with self.transaction() as db:
            for url in sorted(set(data.get('known_article_urls', []))):
                parsed = urlsplit(url)
                if parsed.scheme not in ('https', 'http') or parsed.netloc not in blogs or not parsed.path.startswith('/blog/') or Path(parsed.path).suffix.lower() in ('.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'):
                    skipped.append(url)
                    continue
                identifier = 'history:' + hashlib.sha256(url.encode()).hexdigest()
                # Empty date deliberately means unknown; reminders skip it.
                cursor = db.execute('INSERT OR IGNORE INTO publications VALUES(?,?,?,?,?,?)',
                    (identifier, blogs[parsed.netloc], url, parsed.path.rstrip('/').rsplit('/', 1)[-1], '',
                     json.dumps({'source': 'legacy-known-url', 'verification': 'historical-not-reverified', 'title': 'URL slug; actual title unknown'})))
                added += cursor.rowcount
        return {'seeded_articles': added, 'skipped_nonarticle_urls': skipped, 'imported_jobs': 0, 'imported_effects': 0}

    def effect(self, key):
        with self.connect() as db:
            row = db.execute('SELECT * FROM effects WHERE key=?', (key,)).fetchone()
            return dict(row) | {'receipt': json.loads(row['receipt'])} if row else None

    def save_effect(self, key, kind, status, receipt=None):
        with self.transaction() as db:
            db.execute('INSERT INTO effects VALUES(?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET status=excluded.status,receipt=excluded.receipt,updated_at=excluded.updated_at',
                       (key, kind, status, json.dumps(receipt or {}), now()))
