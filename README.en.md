# repo-pet

[![Release](https://img.shields.io/github/v/release/sascha910-RS/repo-pet?label=release)](https://github.com/sascha910-RS/repo-pet/releases) [![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE) · [Deutsch](README.md)

A GitHub Action that turns your repository's commit activity, CI status and
issue hygiene into a pixel pet, and commits the animated SVG to a branch of
its own every day.

## This repository's pet

![repo-pet](https://raw.githubusercontent.com/sascha910-RS/repo-pet/pet-output/pet.svg)

Generated live, daily at 06:17 UTC.

## The four states

| happy | content | sad | sick |
| :---: | :---: | :---: | :---: |
| ![happy](docs/gallery/happy.svg) | ![content](docs/gallery/content.svg) | ![sad](docs/gallery/sad.svg) | ![sick](docs/gallery/sick.svg) |

Body width shows satiety, colour saturation shows health. The two bars below
are satiety and health as numbers.

## Quick start

```yaml
name: repo-pet

on:
  schedule:
    - cron: "17 6 * * *"
  workflow_dispatch:

permissions:
  contents: write

jobs:
  pet:
    runs-on: ubuntu-latest
    steps:
      - uses: sascha910-RS/repo-pet@v1
        with:
          github_token: ${{ github.token }}
```

Run it once by hand under *Actions*, then put this in your README:

```markdown
![repo-pet](https://raw.githubusercontent.com/OWNER/REPO/pet-output/pet.svg)
```

## Inputs

| Input | Default | Meaning |
| --- | --- | --- |
| `github_token` | — (required) | Usually `${{ github.token }}`. The job needs `contents: write`. |
| `output_branch` | `pet-output` | Branch the SVG lives in. Created as an orphan if it does not exist. |
| `output_filename` | `pet.svg` | Path inside that branch. Subdirectories are allowed. |
| `repository` | current repo | The repo being measured. The commit always goes to your own repo. |
| `user` | — | Measure a person instead of a repo: their commit activity and the state of their repos. Takes precedence over `repository`. |
| `dry_run` | `false` | Renders and shows the result in the job summary, writes nothing. |

## Outputs

| Output | Example |
| --- | --- |
| `mood` | `content` |
| `satiety` | `64` |
| `health` | `52` |
| `svg_url` | `https://raw.githubusercontent.com/…/pet.svg` (empty on `dry_run`) |

## How the state is calculated

**Satiety** comes from commits in the last 7 days: 14 commits is full. From
that, 12 points are subtracted per day without a commit, after a 2-day grace
period — so a weekend costs nothing.

**Health** starts at 70. A green CI run adds 25, a red one subtracts 45, a
cancelled one subtracts 10. On top of that, the ratio of open to recently
closed issues: up to +10, up to −25.

**Mood**, in fixed order, illness first:

| | |
| --- | --- |
| `sick` | health below 40 |
| `happy` | satiety ≥ 70 **and** health ≥ 70 |
| `sad` | satiety below 35 |
| `content` | everything else |

Missing data never costs points. A repo without CI is not ill, just unknown.
An empty repo ends up `sad`, not `sick`.

Every threshold is a named constant at the top of
[`src/state.ts`](src/state.ts).

## FAQ

**Why a separate branch?**
The SVG potentially changes every day. On the default branch it would bury
the history of your actual code.

**How soon does an update show up?**
Within five minutes. `raw.githubusercontent.com` is not served through Camo,
so the usual badge-caching problem does not apply here and no cache buster is
needed — details in [docs/caching.md](docs/caching.md).

**No commit was created.**
Then nothing changed. The action compares the Git blob hash and skips
identical content; a history of identical commits would be pure noise.

**"Resource not accessible by integration"**
The job is missing `permissions: contents: write`. If that is already there,
*Settings → Actions → General → Workflow permissions* also has to be set to
"Read and write".

**Can I watch someone else's repository?**
Yes, via `repository`. The SVG still lands in your own repo.

**Can the pet reflect all of my activity instead of one repo?**
Yes, via `user`. Satiety then comes from your commits across all projects,
and health from a cross-section: the share of green CI runs across your most
recently pushed repos, plus open versus recently closed issues. A single red
side project will not make the pet ill — only a majority will.

**Does that include my private repositories?**
Not with `github.token`, which only sees public activity. For private
contributions you need a PAT with `read:user` scope and the "Include private
contributions on my profile" setting.

**Why is the animation pure CSS?**
`raw.githubusercontent.com` serves SVGs with
`default-src 'none'; …; sandbox`. JavaScript and SMIL are dead there, while
`style-src 'unsafe-inline'` explicitly permits the style block.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) — in German, as are the code comments.
The short version: `npm run preview` writes a `preview.html` showing every
mood in three widths, on both a light and a dark background.

## Licence

MIT, see [LICENSE](LICENSE).
