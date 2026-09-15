# Image system

SERPsmith creates article-specific images automatically. Operators configure brand direction once; they do not write a new prompt for every article.

## Inputs

Each image brief combines:

1. exact article title and one-sentence focus;
2. primary query and reader intent;
3. audience and emotional promise;
4. the site's external `image_direction` configuration;
5. recent image history and recorded prompts;
6. factual, product, legal, medical, and brand restrictions.

If required inputs are missing, stop before image generation.

## v0.1 default

The reliable beta default is premium photorealistic editorial imagery:

- believable natural scene;
- wide 16:9 composition;
- clear focal point and useful negative space;
- restrained, site-appropriate palette;
- no generated words, letters, numbers, labels, watermarks, logos, screens, UI, or pseudo-text;
- no misleading claims, generic stock staging, clutter, distorted anatomy, or irrelevant symbolism.

## Clarity over cleverness

Prefer literal, functional, or immediately recognizable visual relationships over poetic or opaque metaphors, especially for instructional, technical, workflow, and product topics. At least one candidate should use a direct visual concept whenever one is available. Do not make both candidates abstract merely to appear original.

Apply a three-second clarity test to the final rendered image, not to the written prompt: show or inspect the image with the exact article title as context. A reasonable viewer should be able to state the functional connection immediately without being told the backstory. The title supplies context; the image must show the recognizable core subject or action, but it does not need to independently encode every modifier in the title. Before the bounded fallback limit, an image that needs prompt rationale fails the normal selection gate and triggers a more direct candidate. After six reviewed candidates, clarity may become a disclosed quality exception only when the best candidate remains relevant and fallback-eligible under the hard gates below.

Reject unrelated visual signals of destruction, injury, decay, abandonment, danger, or loss unless those ideas are central to the article. A visually striking image is not relevant merely because a narrative can be invented after generation.

A site may override style explicitly, but one consistent style per site is recommended for v0.1.

## Profile configuration

```yaml
image_direction:
  style: premium photorealistic editorial photography
  mood: calm, practical, trustworthy
  palette:
    - navy
    - warm white
    - muted green
  composition: wide cinematic scene with one clear focal point
  prefer:
    - believable environments
    - natural light
    - useful negative space
  avoid:
    - generated text or pseudo-text
    - third-party logos or brands
    - generic stock-photo staging
    - repeated subjects or metaphors from recent posts
```

Dimensions, formats, quality, metadata stripping, and social-crawler rules belong in `image_policy`, not `image_direction`.

## Visual rotation and motif budget

Before writing candidate prompts, inventory at least the six most recently published article images when available. For each image, record:

- subject or character;
- environment;
- focal object or action;
- camera perspective or composition;
- metaphor or material.

Turn that inventory into an explicit recent-image conflict list. Count visually equivalent devices as one motif rather than treating cosmetic changes as variety. In particular, loose sheets, document cards, sticky notes, browser-window tiles, clipped page layouts, and floating rectangular panels all belong to the shared paper/card motif.

Load the private site-namespaced owner image-feedback ledger before briefing. Convert each applicable rejection reason into an explicit constraint in both candidate briefs. Treat concept families rejected twice as forbidden until the owner explicitly clears them. Keep this ledger outside the website repository.

When the owner rejects an image, preserve the concrete reason, assign a stable concept family, and record the feedback even when the rejection arrives after publication or outside a scheduled run. Run the ledger's `verify` command before generating the replacement and again before reporting the correction complete. Daily memory, chat history, and the replacement itself do not satisfy this durable-feedback gate.

If a motif appears in either of the two most recent images or at least twice in the last six, exclude it from both new candidate briefs unless it is genuinely necessary for the article to pass the three-second clarity test. When that exception is necessary, candidate B must avoid the motif completely and the checkpoint must explain why candidate A needed it. A site's recurring palette, lighting mood, and overall photographic style should remain recognizable, but palette continuity never counts as meaningful concept variation.

Relative to each of the two most recent images, each candidate must change at least two of these axes: subject or character, environment, focal object or action, camera perspective or composition, and metaphor or material. Candidate A and B must still differ meaningfully from each other. Do not solve repetition by merely changing a person's age, gender, clothing, or the color and arrangement of the same cards.

## Automatic article image brief

SERPsmith constructs:

```text
Article title: [exact title]
Article focus: [specific one-sentence idea]
Query and intent: [query + reader goal]
Reader promise: [audience + desired feeling/outcome]
Site direction: [style, mood, palette, composition, preferences]
Recent-image conflicts: [six-image motif inventory, repeated devices, and subjects/compositions/metaphors to avoid]
Rotation proof: [at least two axes changed relative to each of the two most recent images]
Concept: [candidate A or B, visibly different]
Production: wide 16:9, article-specific, text-free, factually safe
Clarity test: [literal connection a title-only viewer should recognize within three seconds]
```

Candidate A and B must differ meaningfully in scene, subject/action, composition, or metaphor. A cosmetic color change is not a second concept. When a direct concept exists, at least one candidate must use it rather than an abstract metaphor.

## Selection rubric

Inspect both candidates at original detail. Reject an image for:

- weak connection to the exact title;
- a connection that requires the prompt rationale or a verbal explanation;
- a rendered result whose visible meaning differs from the intended concept;
- unrelated damage, decay, danger, or loss that changes the emotional message;
- misleading product, health, or technical symbolism;
- repeated visual language from recent posts;
- text, pseudo-text, logos, or branded elements;
- malformed anatomy, hands, materials, lighting, scale, depth, or perspective;
- contradictory action logic: when the concept depends on a person operating, revealing, handing off, or reviewing something, their pose, gaze, and body orientation must visibly attend to that action or its intended recipient;
- generic staging or unusable social-card composition;
- accidental clipping of a face or essential gesture/action, or of an object whose completeness is necessary to understand the scene;
- a final hero, card, or social crop that cuts through the primary subject or removes the visual evidence connecting the image to the title.

Rank every reviewed candidate by hard-gate eligibility first, then title relevance, clarity, responsive composition, emotional fit, realism, distinctness, and clean hierarchy. Before six candidates have been reviewed, choose a candidate only when it passes every gate; otherwise generate a more direct concept.

After six reviewed candidates, select the highest-ranked fallback-eligible candidate when none passes every quality gate. Fallback eligibility still requires relevance plus all hard publication gates: no unsafe or misleading claim, unrelated destruction/danger, generated or pseudo-text, logo/brand, severe meaning-breaking generation defect, missing derivative, or invalid file/MIME/dimensions. A fallback may carry documented clarity, composition, anatomy, subject-clipping, gesture, or responsive-crop weaknesses when the image remains coherent, recognizable, and technically usable. Record all six rankings, the exact exception, and why the selected candidate is still usable. If no candidate is eligible, stop safely.

## Production

Default output:

- exact 1280 x 720 WebP hero around quality 82;
- exact 1280 x 720 JPEG social image around quality 85, derived locally from the final WebP;
- identical composition and dimensions;
- stripped unnecessary metadata;
- matching lowercase hyphenated base filename;
- no overwrite of existing assets.

Focal-crop; never stretch. Preserve the face when present, the essential gesture/action, and the visual evidence connecting the image to the title. Intentional portrait, waist-up, environmental, and partial framing are allowed. A complete body, every hand or finger, and expendable props do not need to survive every crop. Require complete visibility only when an object's completeness is necessary to understand the scene. Inspect the source at original detail before cropping, then inspect the exact 1280 x 720 WebP and derived JPEG after cropping. Reject a crop that cuts a face or essential gesture, clips a meaning-critical object, or destroys the title connection. Do not reject solely because a nonessential body edge, hand edge, or prop leaves the frame, and do not invent coordinate bands or one universal safe rectangle. Never hide a real meaning-critical crop failure with stretching or generic padding. Never generate the JPEG separately with AI.

## Attempts and bounded fallback

Review at most six generated candidates per run, normally two meaningfully different concepts with up to three candidates or refinements each. A provider retry that returns no usable image does not count as a reviewed candidate. Retry only a definite transient provider failure; keep the prompt unchanged for the first retry and change one execution variable only for the final provider retry. Never duplicate an active request.

If any candidate passes every gate before the sixth review, select it and stop generating. If none passes every quality gate after six reviews, use the highest-ranked fallback-eligible candidate and continue publication under the existing authorization. Mark the checkpoint and final report `best_available_image_fallback`; state the exact clarity or responsive-composition exception and tell the owner to review the live image when convenient. Do not present the fallback as a failed publication.

When the owner rejects the same concept twice, abandon that concept family instead of making another local pose, gaze, crop, or prop correction. Generate a meaningfully different subject, action, or metaphor that still passes the title-clarity and rotation rules. Treat the repeated rejection as evidence that the concept is wrong, not merely that one rendering needs refinement.

Stop before publication only when all candidates fail a hard publication gate, required derivatives cannot be produced, authorization is absent, or another non-image publication gate fails. Never select an unrelated, unsafe, misleading, branded, text-filled, severely corrupted, or technically invalid image merely to complete a run.

## Live validation

After deployment, verify dimensions, MIME, URL, metadata references, WebP hero rendering, JPEG social metadata, and configured crawler user agents. Inspect the actual rendered desktop hero, mobile hero, blog-card thumbnail, and social-card image. Passing file dimensions alone is insufficient. A live crop that is blank, corrupt, missing, technically invalid, unsafe, or misleading is a hard post-push failure. Subject clipping, weakened gestures, reduced title clarity, and other aesthetic crop misses may remain live under `best_available_image_fallback`; record the exact weakness and recommend owner review, then complete configured search notifications. Keep source candidates and temporary previews until conversion, live verification, and reporting are complete. Then follow `retention.md`: preserve only the checkpoint-selected source image in each retained completed run and remove rejected candidates, derivatives, previews, inspection crops, and screenshots.
