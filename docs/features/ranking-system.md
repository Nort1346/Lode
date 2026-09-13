# Ranking System

## Overview

The torrent ranking system scores and ranks search results from Prowlarr based on configurable weights for resolution, language, seeders, size, source, and group.

## How It Works

1. Prowlarr returns raw search results
2. Each result is parsed for metadata (resolution, source, language, group)
3. Scores are calculated using weighted criteria
4. Top N results are marked as "recommended"
5. Results sorted by score (descending)

## Scoring Components

### Resolution (weight: 40)
| Resolution | Score |
|-----------|-------|
| 2160p / 4K | 20 |
| 1080p | 40 |
| 720p | 20 |
| 480p / 576p | 5 |

### Language (weight: 30)

Language detection uses a nested profile → format model. Each language profile contains one or more format types (dubbing, subtitles, lektor, VOSTFR, etc.). Scores are normalized by the language weight, so the same raw score produces the same contribution regardless of the weight.

| Profile | Format | Score | Example Patterns |
|---------|--------|-------|-----------------|
| Polish (`pl`) | Dubbing | 30 | `pldub`, `pl.dub`, `polish dub` |
| Polish (`pl`) | Lektor | 25 | `lektor.pl`, `pl.lek` |
| Polish (`pl`) | Subtitles | 22 | `plsub`, `napisy.pl` |
| German (`de`) | Dubbing | 30 | `german dub`, `de dub` |
| German (`de`) | Subtitles | 22 | `german sub`, `de sub` |
| French (`fr`) | Dubbing | 30 | `francese`, `fr dub` |
| French (`fr`) | VOSTFR | 25 | `vostfr`, `francophone` |
| French (`fr`) | Subtitles | 22 | `fr sub` |
| Spanish (`es`) | Dubbing | 30 | `spanish dub`, `es dub` |
| Spanish (`es`) | Subtitles | 22 | `spanish sub`, `es sub` |
| Portuguese BR (`pt-br`) | Dubbing | 30 | `dublagem`, `pt-br dub` |
| Portuguese BR (`pt-br`) | Subtitles | 22 | `pt-br sub`, `legendado` |
| English (`en`) | Dubbing | 30 | `english`, `eng` |
| English (`en`) | Subtitles | 22 | `en sub` |
| Other | Original | 8 | Fallback |

Default scores are intentionally equal across languages (dubbing = 30, subtitles = 22) so no language is biased by default. The preferred language (defaults to `en`, matching the app locale) can be changed in the admin UI.

### Seeders (weight: 100)
- Higher seed count = higher score
- Normalized against maximum in result set

### Size (weight: 20)
Threshold-based scoring varies by content type:

**Movies**:
| Size Range | Score |
|-----------|-------|
| 0-0.5 GB | 3 |
| 0.5-1 GB | 8 |
| 1-2 GB | 12 |
| 2-15 GB | 20 |
| 15-30 GB | 15 |
| 30-50 GB | 8 |
| 50+ GB | 3 |

**Series** (per episode):
| Size Range | Score |
|-----------|-------|
| 0-0.2 GB | 3 |
| 0.2-0.5 GB | 8 |
| 0.5-2 GB | 12 |
| 2-4 GB | 20 |
| 4-8 GB | 12 |
| 8+ GB | 5 |

### Source (weight: 10)
| Source | Score |
|--------|-------|
| Remux | 10 |
| Blu-ray | 9 |
| BDRip | 8 |
| WEB-DL | 8 |
| WEBRip | 7 |
| HDRip | 6 |
| HDTV | 5 |
| DVDRip | 4 |
| CAM/TS/TC | 1 |

### Group (weight: 5)
Known release groups get bonus points. 24 known groups configured.

### Title Relevance
- **Word match**: +15 per matching word
- **Year match**: +10
- **Full title match**: +10
- **Penalty**: -20 for mismatches

## Configuration

Admin can customize all weights and thresholds via Admin → Ranking.

### Reset to Defaults
```bash
POST /api/admin/ranking/config.reset
```

### Legacy Migration

Older configs stored a flat `languages` array (e.g. `pl-dub`, `pl-lektor`). On first load, `getRankingConfig()` auto-migrates to the new `languageProfiles` structure by grouping entries on the prefix before the first hyphen:

- `pl-dub` → profile `pl`, format `dub`
- `pl-lektor` → profile `pl`, format `lektor`
- `other` (fallback) → profile `other`, format `original`

Scores and patterns are preserved. The migration is transparent to the admin UI.

## Season Packs

Season packs are detected and ranked separately:
- Matched by `S01`, `Sezon 01`, `Season 1` patterns
- Excluded from per-episode results
- Shown in a dedicated "Season Packs" section
- Size thresholds differ from per-episode
