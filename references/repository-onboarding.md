# Repository onboarding

Use this flow for every Git-backed website before creating a production profile. Repository access is site-specific configuration; repository safety rules remain universal core policy.

## User prerequisites

The user must control the repository and know which branch deploys the live website. SERPsmith needs:

- a local clone or runtime-accessible Git working tree;
- a configured upstream remote;
- permission to read and normally push to one approved branch;
- a documented content format and content adapter;
- a verifiable deployment path;
- reviewed repository instructions.

SERPsmith does not need repository administration, billing, organization ownership, secret-management administration, force-push permission, or access to unrelated repositories.

## Connect the repository

1. Back up the repository and confirm its remote host.
2. Clone it through the runtime's reviewed Git credential method. Prefer SSH or another least-privilege noninteractive credential supported by the runtime.
3. Never paste an SSH private key, personal access token, deploy credential, or recovery code into chat, a site profile, repository instructions, or committed files.
4. Confirm the intended remote name, normally origin.
5. Confirm the exact write branch and its upstream.
6. Confirm whether direct pushes are allowed. If the branch requires pull requests, configure and test a reviewed pull-request adapter instead of bypassing protection.
7. Verify the working tree is clean, synchronized, non-shallow enough for required checks, and free of conflicts.
8. Confirm normal pushes work without force. SERPsmith never force-pushes or rewrites history.
9. Record the repository's public website URL and deployment behavior.
10. Keep the local repository path in the private external profile only.

## Map the website structure

Document article source location, content format, required schema/front matter, URL and slug rules, image paths, sitemap and discovery files, internal-link conventions, safe validation/build commands, allowed and prohibited files, deployment behavior, and live-verification method.

Reuse a reviewed content adapter when the structure matches. Otherwise build and manually validate a site-specific adapter before publishing.

## Add repository instructions

Copy templates/site-repository-instructions.md into the connected website repository as SERPSMITH.md, or merge the same information into the repository's existing agent instruction file.

The user must replace every placeholder and review the completed instructions. Add the file to repository_instruction_files in the private site profile.

Repository instructions may narrow permitted paths and commands. They may not override SERPsmith core safety, image validation, retry limits, publication gates, or search onboarding.

## Read-only repository preflight

Before creating content, verify expected repository/site identity, approved remote/branch, clean synchronized tree, SSH or reviewed credential access, loaded repository instructions, matching content adapter, known content/image/discovery paths, allowed validation commands, deployment verification, and external state roots.

If any item is missing, stop and tell the user exactly what to provide. Do not create files, commit, push, deploy, notify search engines, or schedule a job.

## First-run sequence

1. Repository preflight only.
2. Search-engine onboarding and sanitized readiness report.
3. One manual research and draft cycle.
4. Review article, images, reciprocal links, and complete diff.
5. Explicit publication approval.
6. Normal push and live verification.
7. Search notifications.
8. Only after success, request separate authorization for unattended scheduling.