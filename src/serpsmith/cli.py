"""Structured CLI. External effects always require an explicit --publish flag."""
import argparse
import json
import sys
import time
from pathlib import Path
from .config import home_path, initialize, list_blogs, load_blog, load_settings, validate_blog, write_json
from .store import Store


def parser():
    p = argparse.ArgumentParser(prog='serpsmith')
    p.add_argument('--home', type=Path, default=None)
    sub = p.add_subparsers(dest='command', required=True)
    init = sub.add_parser('init'); init.add_argument('--setup', type=Path); init.add_argument('--history', type=Path)
    sub.add_parser('status'); sub.add_parser('doctor')
    blogs = sub.add_parser('blogs').add_subparsers(dest='action', required=True)
    blogs.add_parser('list')
    add = blogs.add_parser('add'); add.add_argument('--file', type=Path)
    run = sub.add_parser('run'); run.add_argument('--blog', required=True); run.add_argument('--topic'); run.add_argument('--request-key'); run.add_argument('--publish', action='store_true')
    retry = sub.add_parser('retry'); retry.add_argument('job_id'); retry.add_argument('--publish', action='store_true')
    recover = sub.add_parser('recover'); recover.add_argument('job_id'); recover.add_argument('--confirm-worker-stopped', action='store_true', required=True)
    schedule = sub.add_parser('schedule').add_subparsers(dest='action', required=True)
    for action in ('pause', 'resume'):
        item = schedule.add_parser(action); item.add_argument('--blog')
    for name in ('tick', 'service'):
        item = sub.add_parser(name); item.add_argument('--publish', action='store_true')
        if name == 'service':
            item.add_argument('--interval', type=int, default=60)
    reminder = sub.add_parser('reminders')
    reminder.add_argument('--publish', action='store_true')
    reminder_actions = reminder.add_mutually_exclusive_group()
    reminder_actions.add_argument('--ack', nargs='+')
    reminder_actions.add_argument('--send', action='store_true')
    return p


def dispatch(args):
    home = (args.home or home_path()).expanduser().resolve()
    # Adapter credential resolution must share the exact CLI-selected canonical root.
    import os
    os.environ['SERPSMITH_HOME'] = str(home)
    command = args.command
    if command == 'init':
        result = {'created': initialize(home, args.setup), 'automation_enabled': load_settings(home)['automation_enabled']}
        if args.history:
            result['history'] = Store(home).seed_history(args.history)
        return result
    store = Store(home)
    if command == 'status':
        return {'automation_enabled': load_settings(home)['automation_enabled'], 'blogs': [{'id': b['id'], 'enabled': b.get('enabled', False)} for b in list_blogs(home)], 'jobs': [{k: j[k] for k in ('id', 'blog_id', 'kind', 'stage', 'status')} for j in store.list_jobs()], 'published': store.published()}
    if command == 'doctor':
        from .config import offline_doctor
        return offline_doctor(home) | {'sqlite': 'ok'}
    if command == 'blogs':
        if args.action == 'list':
            return list_blogs(home)
        from .config import guided_blog
        if args.file is None and not sys.stdin.isatty():
            raise ValueError('Interactive onboarding needs a terminal; agents should use --file')
        blog = validate_blog(json.loads(args.file.read_text())) if args.file else guided_blog()
        target = home / 'blogs' / (blog['id'] + '.json')
        if target.exists():
            raise ValueError('Blog already exists')
        blog['enabled'] = False
        write_json(target, blog)
        return load_blog(home, blog['id'])
    if command in ('run', 'retry'):
        from .pipeline import run_job
        if command == 'run':
            load_blog(home, args.blog)
            job = store.create_job(args.blog, topic=args.topic, request_key=args.request_key)
        else:
            job = store.get_job(args.job_id)
        return run_job(home, job['id'], publish=args.publish)
    if command == 'recover':
        job = store.get_job(args.job_id)
        store.release(job['id'])
        return {'job_id': job['id'], 'lock_released': True, 'effects_preserved': True}
    if command == 'schedule':
        enabled = args.action == 'resume'
        if args.blog:
            blog = load_blog(home, args.blog); blog['enabled'] = enabled
            write_json(home / 'blogs' / (blog['id'] + '.json'), blog)
            return {'blog_id': blog['id'], 'enabled': enabled}
        settings = load_settings(home); settings['automation_enabled'] = enabled
        write_json(home / 'settings.json', settings)
        return {'automation_enabled': enabled, 'service_registered': False}
    if command in ('tick', 'service'):
        from .scheduler import tick
        if command == 'tick':
            return tick(home, publish=args.publish)
        if args.interval < 1:
            raise ValueError('interval must be positive')
        while True:
            print(json.dumps(tick(home, publish=args.publish)), flush=True)
            time.sleep(args.interval)
    if command == 'reminders':
        from .scheduler import reminders, acknowledge_reminders, send_reminders
        if args.send:
            if not args.publish:
                raise ValueError('Reminder delivery requires --send --publish')
            return {'deliveries': send_reminders(home)}
        return acknowledge_reminders(home, args.ack) if args.ack else {'reminders': reminders(home)}
    raise ValueError('Unknown command')


def main():
    try:
        result = dispatch(parser().parse_args())
        print(json.dumps(result, indent=2))
        return 0
    except KeyboardInterrupt:
        return 130
    except Exception as exc:
        print(json.dumps({'error': str(exc), 'type': type(exc).__name__}), file=sys.stderr)
        return 1
