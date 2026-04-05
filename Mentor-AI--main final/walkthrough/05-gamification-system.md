# Gamification System

## Overview

The Gamification System boosts engagement through XP, levels, streaks, bounty questions, boss battles, and badges.

## Core Components

| Component | Purpose |
|-----------|---------|
| XP System | Dynamic 1-20 XP per message based on quality |
| Streaks | Daily login rewards with multipliers |
| Energy | Prevents burnout with forced breaks |
| Bounties | Daily AI-generated challenges |
| Boss Battles | 5-question battles on weak topics |
| Badges | 18 achievements across 6 categories |
| Credits | Currency earned through challenges |

## XP Calculation

XP is based on **6-dimension quality analysis**:

- Question Quality (20%)
- Sentence Structure (15%)
- Vocabulary (15%)
- Topic Depth (25%)
- Clarity (15%)
- Effort (10%)

**Streak Multipliers:**
| Days | Multiplier |
|------|------------|
| 1-2 | 1.0× |
| 3-6 | 1.2× |
| 7+ | 1.5× |

## Bounty Questions

Daily AI-generated challenges based on knowledge gaps:

| Difficulty | Credits | XP Bonus |
|------------|---------|----------|
| Easy | 10 | +10 |
| Medium | 25 | +25 |
| Hard | 40 | +50 |
| Expert | 50 | +100 |

**Cron:** Daily at 9 AM IST

## Boss Battles

5-question challenges every 4 hours on weak topics:

| Score | Reward |
|-------|--------|
| 5/5 | 110 XP + Badge |
| 4/5 | 75 XP + Badge |
| <4/5 | 40 XP + Revision Plan |

## Frontend Components

- `LevelBadge.jsx` - Current level display
- `XPProgressModal.jsx` - Progress bar
- `EnergyBar.jsx` - Energy status
- `BountyCreditsPage.jsx` - Bounty UI
- `BossBattles.jsx` - Battle interface
- `BadgesShowcase.jsx` - Badge collection

## Files

| File | Location |
|------|----------|
| `gamification.js` | `server/routes/` |
| `gamificationService.js` | `server/services/` |
| UI Components | `frontend/src/components/gamification/` |

## Contributors

- **S Tejaswini** (@Tejaswini-1906) - Gamification system
- **P Nithin** (@Nithin974) - Bounty questions, Bloom's Taxonomy

---
*Last Updated: January 2026*
