# Portable Humanizer integration

## Status and source

Starting with `serpsmith-core-v5`, the prose pass uses the portable `blader/humanizer` Agent Skill instead of an OpenClaw-specific CLI.

Reviewed baseline:

- Source: `https://github.com/blader/humanizer`
- Version: `2.9.1`
- Reviewed commit: `523374dee72d67c7b2b5f858ea0094ffda49c3ac`
- License: MIT
- Runtime artifact: plain Markdown `SKILL.md`
- Executable dependency: none

The upstream package is an editorial instruction skill. It does not provide a deterministic command-line scorer and does not prove whether a human or AI wrote text.

## Installation

Install the skill through the target harness's governed skill mechanism. Compatible Agent Skills runtimes may use:

```bash
npx skills add blader/humanizer --global
```

Use `--agent '*'` only when the operator deliberately wants to install it for every supported local harness. OpenClaw operators use Skill Workshop or another approved skill-management path rather than overwriting live skill files manually.

Reload the agent session after installation when the harness does not hot-reload skills. Verify that the discovered skill is named `humanizer` and its metadata version is at least `2.9.1`.

Do not auto-update. Review each upstream release, its license, prompt changes, package validation, and SERPsmith regression fixtures before changing the pinned baseline.

## SERPsmith invocation

Use embedded mode:

1. Finish research, sourcing, the brief, and the complete article draft.
2. Pass only the article prose through the installed Humanizer skill.
3. Run its draft, audit, and revision loop internally.
4. Use only the final rewrite in the article package.
5. Restore or preserve exact protected tokens and SERPsmith formatting rules.
6. Rerun all factual and site-specific validation.

Protected content includes:

- Frontmatter, metadata fields, JSON, XML, HTML attributes, code, and structured data
- Citations, quotations, source titles, author names, dates, numbers, URLs, and link targets
- Product names, feature names, medical or legal wording, and other verified claims
- Article-body H2/H3 headings, which remain in standard English Title Case under SERPsmith policy
- Search terms whose removal would change the article's intent or accuracy

The generic skill's Title Case warning does not override SERPsmith's established heading convention. Its style preferences also do not authorize claim changes, citation removal, keyword stuffing, fabricated specificity, or rewriting text inside quotations.

## Completion and failure

A pass completes only when:

- the portable skill was available at a reviewed compatible version;
- the final rewrite preserves supported information and protected tokens;
- no new fact, name, number, date, quotation, or citation was introduced;
- required headings remain in standard English Title Case; and
- post-pass content, citation, link, metadata, product-claim, and site validation passes.

Record the skill name, version, embedded mode, completion status, and any intentional preserved exceptions. Do not report a numerical score because this implementation has no scoring engine.

If the skill is missing, incompatible, or produces an unsafe rewrite, stop before publication. In unattended mode, persist the failed gate and report the exact installation or review action required. Do not fall back to the retired OpenClaw-specific Humanizer CLI, silently skip the pass, or treat a subjective AI-detection score as proof of authorship.

## Upgrade fixture

Before adopting a newer upstream version, test one representative article from each active site and verify:

- facts and citations are unchanged;
- links and exact product terms survive;
- H2/H3 headings remain in SERPsmith Title Case;
- the result removes obvious formulaic language without flattening the brand voice;
- no scheduler, profile isolation, or publication gate changes; and
- all SERPsmith repository and profile tests pass.
