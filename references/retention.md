# Completed-run retention

SERPsmith's website repository and live site are canonical after publication. Each new run inventories the current content tree, sitemap, internal links, and recent production images directly; it does not need old working renders or source candidates to choose internal links.

The private checkpoint root remains useful for interruption recovery and for comparing the three most recent image concepts. Retain exactly the latest three completed article runs per site. Preserve all incomplete or failed resumable runs regardless of age, the `analytics/` directory and recommendation ledger, locks, and anything outside the selected site's checkpoint root.

After `serpsmith_finalize` succeeds, the final report message returns a confirmed delivery result, and the checkpoint records `report_delivered`:

```sh
node scripts/prune-completed-runs.mjs /absolute/private/site-profile.json --keep 3 --apply
```

Without `--apply`, the command is a dry run. It recognizes completed article checkpoints by a valid site/date/slot/slug run key, a non-empty slug, and `status: complete`. It keeps the newest three, protects resumable runs, and removes only older run-keyed artifacts beneath the exact profile checkpoint root. It never edits the website repository or published assets.

If cleanup fails, do not roll back or republish. Fail the unattended job so its configured failure alert reports the maintenance problem.
