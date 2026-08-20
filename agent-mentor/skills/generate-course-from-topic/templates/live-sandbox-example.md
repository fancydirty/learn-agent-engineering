# agentmentor-live sample template

This is a complete, valid `agentmentor-live` fenced-block sample. Use it in front-end lessons where learners need to see a real rendered/interactive result.

## Field contract (matches `lib/live-sandbox.ts`)
- `id`: unique identifier within the course (kebab-case)
- `label`: 2-6 word action name, tied to this lesson
- `goal`: one concrete sentence telling the learner what to achieve
- `files`: object with `html`/`css`/`js` fields (at least one must be non-empty, each ≤4096 bytes)
- `solution`: optional object; its keys must match non-empty fields already in `files`, giving a reference answer
- `copyPurpose`: the specific problem the user wants to resolve after copying their current attempt to an agent
- `v` (optional): contract version, positive integer, defaults to 1. Omit unless you need a new capability.
- `choices` (optional): click-to-select mode. `{target, intro?, items:[{label, code}]}` — clicking an item replaces the whole `files[target]` segment and previews immediately; good for "feel the effect of a few values of one property." 2-6 items, `label` ≤24 chars and unique, `code` ≤1024 bytes with no external links, `intro` ≤120 chars.
- `checks` (optional): deterministic completion assertions. Array of 1-8 entries, each `{selector, css?, text?, count?}` — `selector` is required (CSS selector, ≤200 chars), and at least one of `css`/`text`/`count` must be given. `css` is a `{property: expected-value}` object — **use kebab-case property names, and values in computed form** (the shape `getComputedStyle` returns, e.g. `rgb(255, 0, 0)` not `red`, `16px` not `1em`); `text` is a substring the element's text must contain; `count` is the number of elements the selector must match (positive integer). A block with `checks` auto-marks "goal achieved" (🎯 + toast) once the learner's edits pass all of them; a block without `checks` falls back to reveal-answer + self-assessment. Prefer `checks` whenever the goal can be expressed as a deterministic assertion.

## Usage rules
- Must be **strict JSON**
- **Self-contained, no external links**: any segment containing `https?://` is a violation
- At most 1 per lesson (rendering is expensive)
- Only for front-end-visible effects; do not use for back-end/data-structure/algorithm/CLI or other non-rendering topics

## Sample: center a card with CSS Flexbox

```agentmentor-live
{
  "id": "flex-center-card",
  "label": "center the card",
  "goal": "Change the CSS so .card is centered horizontally in its container",
  "files": {
    "html": "<div class=\"container\">\n  <div class=\"card\">I'm a card</div>\n</div>",
    "css": ".container {\n  width: 100%;\n  height: 200px;\n  background: #f0f0f0;\n  border: 2px dashed #ccc;\n}\n\n.card {\n  width: 150px;\n  padding: 20px;\n  background: white;\n  border: 1px solid #ddd;\n  border-radius: 8px;\n}",
    "js": ""
  },
  "solution": {
    "css": ".container {\n  width: 100%;\n  height: 200px;\n  background: #f0f0f0;\n  border: 2px dashed #ccc;\n  display: flex;\n  justify-content: center;\n  align-items: center;\n}\n\n.card {\n  width: 150px;\n  padding: 20px;\n  background: white;\n  border: 1px solid #ddd;\n  border-radius: 8px;\n}"
  },
  "copyPurpose": "Copy my current CSS attempt and its rendered result to an agent so it can check whether I understand how flexbox centering works"
}
```

## Sample: deterministic completion with checks

Same centering exercise, with a `css` assertion added to `.container` (computed-value form, kebab-case property names). The learner's edits auto-mark completion once all three properties match:

```agentmentor-live
{
  "id": "flex-center-card-checked",
  "label": "center the card",
  "goal": "Change .container's CSS so .card is centered both horizontally and vertically",
  "files": {
    "html": "<div class=\"container\">\n  <div class=\"card\">I'm a card</div>\n</div>",
    "css": ".container {\n  height: 200px;\n  background: #f0f0f0;\n  border: 2px dashed #ccc;\n}\n\n.card {\n  width: 150px;\n  padding: 20px;\n  background: white;\n}"
  },
  "solution": {
    "css": ".container {\n  height: 200px;\n  background: #f0f0f0;\n  border: 2px dashed #ccc;\n  display: flex;\n  justify-content: center;\n  align-items: center;\n}\n\n.card {\n  width: 150px;\n  padding: 20px;\n  background: white;\n}"
  },
  "checks": [
    { "selector": ".container", "css": { "display": "flex", "justify-content": "center", "align-items": "center" } }
  ],
  "copyPurpose": "Copy my current CSS attempt and its rendered result to an agent so it can check whether I understand how flexbox centering works"
}
```

## Bad smells (avoid these)
- Purely static display (understandable without changing code): that should be a plain code block
- Goal too open-ended ("make a nice-looking page"): no way to judge completion
- Contains an external URL (`<img src="https://...">`): must be self-contained
- Using a live block in a non-front-end topic (Python/back-end/algorithms): there's no rendered effect to see
- Multiple live blocks in one lesson: rendering is expensive, at most 1 per lesson
- `solution` provides a segment not present in `files`: e.g. `files` only has `css`, but `solution` includes `js`

## Generation loop quick reference

- Validate the containing course: `node scripts/course-guard.mjs <course-dir>`
- Self-check in the real reader: run `npm run dev`, open the draft lesson, and test both the initial and solution states.
