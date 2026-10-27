# Paper package

Everything the arXiv / workshop paper needs, in one place. Working system name
in the draft: **Argit** (placeholder; see the naming note in the outline). The
repository keeps its name until the author decides.

| File | What it is | Status |
|---|---|---|
| `argit-paper.md` | Full first draft, pandoc-ready Markdown with `[@key]` citations | drafted; numbers come from the fixtures in this commit |
| `OUTLINE.md` | The plan the draft follows, with the verified venue table | current |
| `figures/` | CLI outputs the figures and tables are built from; regenerate with the commands at the top of each file | current |
| `figures/coverage-all.md` | `npm run coverage` on every fixture: Logic IR coverage and every dimension | current |
| `ENCODING-RELIABILITY-PROTOCOL.md` | The second-encoder pilot (§7.5 of the draft) | protocol written; needs a second encoder |
| `COMPARISON.md` | Feature table against ten existing tools, every cell with a source URL, read 2026-10-27 | current |
| `references.bib` | 29 BibTeX entries, every DOI verified 2026-10-27; three fields flagged for manual confirmation | current |

## Deadline that matters

ArgMining 2027 (EACL, Athens): direct submission **15 December 2026**, 8 pages plus references. Everything else in reach has passed or is rolling; see `OUTLINE.md` §8.

## What is still the author's to do

1. Review `fixtures/pierson-post/source/case.json` line by line against the two
   opinions. It was drafted with AI assistance; the paper may not cite it until a
   human has checked every proposition against the text and every modality
   against how the opinion asserts it.
2. Pick the name. Check npm and GitHub for the chosen one.
3. Recruit one second encoder and run `ENCODING-RELIABILITY-PROTOCOL.md`.
4. Read every reference in `references.bib` before submission.
5. Tag a release, archive it on Zenodo, put the DOI in the draft.
6. Convert: `cd docs/paper && pandoc argit-paper.md --citeproc -o argit.pdf` for a
   preprint, or paste into the venue's LaTeX template.

## Regenerating the numbers

```bash
npm run coverage fixtures/pierson-post
npm run coverage fixtures/pierson-post --branch majority-answers-custom
npm run coverage fixtures/ai-risk
node src/cli.mjs compare fixtures/pierson-post main@2 majority-answers-custom
node src/cli.mjs evaluate fixtures/pierson-post --commit 2
```
