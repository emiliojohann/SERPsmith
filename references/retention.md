# Completed-run retention

Run retention only after the final publication report is confirmed delivered.

```bash
node scripts/prune-completed-runs.mjs /absolute/private/site-profile.json --keep 3 --source-root /absolute/generated-media --transient-media-root /absolute/inspection-media --apply
```

The command is a dry run unless `--apply` is present. Repeat `--source-root` for each exact external root a checkpoint-selected image may reference. Omit optional roots when the selected source is already inside its run directory.

For every site:

- keep exactly the newest three completed article runs;
- preserve every incomplete or failed resumable run regardless of age;
- preserve analytics snapshots, recommendation ledgers, locks, and unrelated namespaced state;
- resolve the checkpoint-selected source image before deletion;
- copy and hash-verify that image at `selected-image/source.<ext>` inside each retained completed run;
- remove all other candidate images, production derivatives, preview renders, screenshots, and crop-inspection images from retained completed run directories;
- remove only the exact matching transient inspection directory when `--transient-media-root` is configured;
- never touch website repositories, canonical production assets, Git history, or media outside the exact run key.

The resolver accepts current and legacy checkpoint selection fields. It fails closed without deleting anything when a retained run has images but the selected source is missing or ambiguous.

Record the sanitized JSON result in the checkpoint or run log. A cleanup failure after publication does not roll back or republish the article; it fails the unattended job so the owner can repair retention safely.

Run the retention regression before unattended release, then canary the distributable command against a disposable site-namespaced state root.
