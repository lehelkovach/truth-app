# Paper package

Everything the arXiv / workshop paper needs, in one place. Working system name
in the draft: **Argit** (placeholder; see the naming note in the outline). The
repository keeps its name until the author decides.

| File | What it is | Status |
|---|---|---|
| `argit-paper.md` | Full first draft, pandoc-ready Markdown | drafted; numbers come from the fixtures in this commit |
| `figures/` | CLI outputs the figures and tables are built from; regenerate with the commands at the top of each file | current |
| `figures/coverage-all.md` | `npm run coverage` on every fixture: Logic IR coverage and every dimension | current |
| `ENCODING-RELIABILITY-PROTOCOL.md` | The second-encoder pilot (§7.5 of the draft) | protocol written; needs a second encoder |
| `COMPARISON.md` | Feature table against existing tools, each cell cited | **pending**: being verified against each tool's documentation |
| `references.bib` | BibTeX for every citation in the draft | **pending**: being verified; do not submit from memory |

## What is still the author's to do

1. Review `fixtures/pierson-post/source/case.json` line by line against the two
   opinions. It was drafted with AI assistance; the paper may not cite it until a
   human has checked every proposition against the text and every modality
   against how the opinion asserts it.
2. Pick the name. Check npm and GitHub for the chosen one.
3. Recruit one second encoder and run `ENCODING-RELIABILITY-PROTOCOL.md`.
4. Read every reference in `references.bib` before submission.
5. Tag a release, archive it on Zenodo, put the DOI in the draft.
6. Convert: `pandoc docs/paper/argit-paper.md -o argit.pdf` for a preprint, or
   paste into the venue's LaTeX template.

## Regenerating the numbers

```bash
npm run coverage fixtures/pierson-post
npm run coverage fixtures/pierson-post --branch majority-answers-custom
npm run coverage fixtures/ai-risk
node src/cli.mjs compare fixtures/pierson-post main@2 majority-answers-custom
node src/cli.mjs evaluate fixtures/pierson-post --commit 2
```
