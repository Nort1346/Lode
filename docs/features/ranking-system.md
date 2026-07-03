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
| Language | Score | Patterns |
|----------|-------|----------|
| Polish Dub | 30 | `pldub`, `pl.dub`, `polish dub` |
| Polish Lektor | 25 | `lektor.pl`, `pl.lek` |
| Polish Sub | 22 | `plsub`, `napisy.pl` |
| English | 15 | `eng`, `en.sub`, `en.dub` |
| Other | 8 | Fallback |

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

## Season Packs

Season packs are detected and ranked separately:
- Matched by `S01`, `Sezon 01`, `Season 1` patterns
- Excluded from per-episode results
- Shown in a dedicated "Season Packs" section
- Size thresholds differ from per-episode
