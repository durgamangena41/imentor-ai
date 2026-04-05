# Gamification System - Detailed Documentation

**Version:** 1.1.2 | **Status:** ✅ Production Ready | **Last Updated:** January 22, 2026

## Overview

The Gamification System enhances user engagement through game mechanics, creating a rewarding and motivating learning experience. This document provides comprehensive details about the gamification features.

## 🎮 Core Components

### 1. Advanced XP (Experience Points) System ⭐

**Status:** ✅ COMPLETE (Backend + Frontend)

**Dynamic XP Calculation** based on **6-Dimension Quality Analysis**:

The Advanced XP System evaluates each user message across 6 dimensions and awards **1-20 XP** (instead of the old 1/3/10 system):

#### Quality Dimensions Analyzed

| Dimension | Weight | What It Measures |
|-----------|--------|------------------|
| **Question Quality** | 25% | Depth, clarity, and thoughtfulness of the question |
| **Sentence Structure** | 15% | Grammar, coherence, and complexity |
| **Vocabulary** | 15% | Word choice, technical terminology usage |
| **Topic Depth** | 20% | Understanding level and conceptual complexity |
| **Clarity** | 15% | How well the question is articulated |
| **Effort** | 10% | Demonstrated preparation and research |

#### XP Calculation Formula

```javascript
// Base XP from quality scores (1-20 range)
baseXP = calculateXP(evaluation, userLevel);

// Level adjustment (higher level = more XP for same quality)
levelMultiplier = 1 + (userLevel * 0.05); // +5% per level

// Streak multiplier (1.0× to 1.5×)
streakMultiplier = getStreakMultiplier(currentStreak);

// Final XP awarded
finalXP = baseXP * levelMultiplier * streakMultiplier;
```

#### XP Range Examples

| Quality Score | Base XP | Level 5 (+25%) | With 30-day Streak (+50%) |
|---------------|---------|----------------|---------------------------|
| Low (20-40) | 1-5 XP | 1.25-6.25 XP | 1.88-9.38 XP |
| Medium (40-60) | 6-12 XP | 7.5-15 XP | 11.25-22.5 XP |
| High (60-80) | 13-17 XP | 16.25-21.25 XP | 24.38-31.88 XP |
| Excellent (80-100) | 18-20 XP | 22.5-25 XP | 33.75-37.5 XP |

#### AI-Powered with Fallback

- **Primary:** Uses LLM (Gemini/Ollama) to analyze message quality
- **Fallback:** Keyword-based scoring if AI fails
- **Real-time:** Evaluated during both streaming and non-streaming chat

#### Implementation Files

**Backend:**
- `server/services/advancedXPEvaluator.js` (10KB) - Main evaluation logic
  - `evaluateMessageQuality()` - 6-dimension analysis
  - `calculateXP()` - XP calculation with level adjustment
  - `getFallbackEvaluation()` - Keyword-based backup
- `server/routes/chat.js` - Integrated in chat flow
- `server/models/GamificationProfile.js` - XP storage and level calculation

**Frontend:**
- `XPProgressModal.jsx` (11KB) - Visual XP progress display
- TopNav integration - Real-time XP updates
- Console logs - Detailed quality breakdown for debugging

### 2. Leveling System

Levels are calculated based on total XP using a progressive scale:

```javascript
calculateLevel() {
    const xp = this.totalXP;
    if (xp < 100) return 1;
    if (xp < 350) return 2;
    if (xp < 850) return 3;
    if (xp < 1700) return 4;
    if (xp < 3000) return 5;
    // ... continues with increasing thresholds
    return Math.floor(Math.log2(xp / 100)) + 2;
}
```

### 3. Daily Streaks

**Streak Mechanics:**
- **Increment**: Send at least 1 meaningful message per day
- **Reset**: Miss a day → streak resets to 0
- **Multipliers**: Higher streaks = higher XP bonuses

| Streak Days | XP Multiplier |
|-------------|---------------|
| 1-2 days | 1.0× |
| 3-6 days | 1.2× |
| 7-13 days | 1.3× |
| 14-29 days | 1.4× |
| 30+ days | 1.5× |

**Milestone Badges:**
- 🔥 3 days: "Warming Up"
- 🌟 7 days: "Week Warrior"
- 💪 14 days: "Dedicated Learner"
- 🏆 30 days: "Monthly Master"
- 👑 60 days: "Learning Legend"

**Files:**
- `server/services/streakService.js`

### 4. Energy System

Prevents burnout by tracking engagement fatigue:

| Activity | Energy Cost |
|----------|-------------|
| Normal message | -5 |
| Long session (>30 min) | -10 per message |
| Rapid-fire (>5 msgs/2 min) | -15 per message |

**Recovery:**
- Regenerates ~10 energy per 15 minutes
- Full recovery in ~2.5 hours

### 5. Learning Credits

**Separate currency from XP:**
- Earned through Bounty Questions and Boss Battles
- Can be spent on premium features (future)

---

## 🎯 Bounty Question System

### What Are Bounties?

AI-generated daily challenges based on the student's knowledge gaps from their chat history.

### Bounty Structure

```javascript
{
    bountyId: "uuid",
    userId: ObjectId,
    topic: "Machine Learning",
    difficulty: "medium",
    knowledgeGap: "Weak in gradient descent intuition",
    questionText: "Explain why learning rate affects convergence...",
    questionType: "open_ended",
    creditReward: 25,
    xpBonus: 25,
    expiresAt: Date (24 hours from creation),
    status: "active" | "completed" | "expired"
}
```

### Rewards by Difficulty

| Difficulty | Credits | XP Bonus |
|------------|---------|----------|
| Easy | 10 | +10 |
| Medium | 25 | +25 |
| Hard | 40 | +50 |
| Expert | 50 | +100 |

### Files
- `server/models/BountyQuestion.js`
- `frontend/src/components/gamification/BountyCreditsPage.jsx`

---

## ⚔️ Boss Battles

### Concept

5-question challenge battles on topics where the student is weak. Generated periodically (every 4 hours).

### Battle Flow

```
1. System identifies weak topics from StudentKnowledgeState
2. Generates 5 questions of increasing difficulty
3. Student answers within time limit
4. Score calculated:
   - 5/5: Perfect victory + Badge + 110 XP
   - 4/5: Victory + Badge + 75 XP
   - 3/5: Partial win + 55 XP
   - <3/5: Loss + Revision plan generated
```

### Files
- `server/models/BossBattle.js`
- `frontend/src/components/gamification/BossBattles.jsx`

---

## 🌲 Skill Trees

### Architecture

The Skill Tree system uses a dual-model architecture:
- **SkillNode** - Defines skill definitions (admin-managed)
- **SkillTree** - Tracks user progress per skill

### SkillNode Schema

```javascript
const SkillNodeSchema = {
    skillId: String,           // Unique identifier (e.g., "ml_basics")
    name: String,              // Display name
    description: String,       // Max 500 chars
    category: String,          // Grouping (e.g., "Machine Learning")
    
    // Prerequisites System
    prerequisites: [String],   // Array of skillIds that must be mastered first
    masteryThreshold: Number,  // Default: 80% required to unlock dependents
    
    // Assessment Questions (AI-generated)
    assessmentQuestions: [{
        difficulty: 'easy' | 'medium' | 'hard',
        question: String,
        options: [String],     // For MCQ format
        correctAnswer: String,
        explanation: String
    }],
    maxAssessmentAttempts: Number,  // Default: 3
    
    // Associated Content
    relatedDocuments: [ObjectId],  // Links to AdminDocument
    relatedTopics: [String],
    
    // Visual Positioning (for fog-of-war map)
    position: {
        x: Number,
        y: Number,
        tier: Number           // Higher tier = more advanced (min: 1)
    },
    
    // Metadata & Economy
    estimatedHours: Number,
    difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert',
    xpCost: Number,            // XP required to unlock
    creditCost: Number,        // Credits required to unlock
    rewards: {
        xpBonus: Number,       // XP awarded on mastery
        creditBonus: Number,   // Credits awarded on mastery
        badge: String          // Badge ID awarded on mastery
    },
    icon: String,
    color: String,             // Default: '#6366f1'
    isActive: Boolean          // Default: true
}
```

### User SkillTree Schema

Tracks individual user progress:

```javascript
const SkillTreeSchema = {
    userId: ObjectId,          // Reference to User
    unlockedNodes: [{
        nodeId: String,
        unlockedAt: Date
    }],
    totalNodesUnlocked: Number,
    currentTier: Number,       // Highest tier reached
    lastUpdated: Date
}
```

### Key Features

**Circular Dependency Detection:**
- Pre-save validation prevents circular prerequisites
- Uses recursive DFS algorithm to detect cycles

**Node Unlocking Logic:**
```javascript
canUnlockNode(nodeId, skillNodeData) {
    // Returns: { canUnlock: boolean, reason: string, missingPrereqs?: string[] }
}
```

**Mastery Tracking:**
- Stored in `GamificationProfile.skillMastery` (Map of skillId → percentage)
- Moving average calculation: `newMastery = (current * 0.7) + (assessmentScore * 0.3)`

### Fog-of-War Mechanics

- Skills start "locked" (hidden in fog)
- Mastering prerequisites → unlocks dependent skills
- Progress visually reveals the skill tree map
- Tier-based progression ensures structured learning

### Service Functions

| Function | Description |
|----------|-------------|
| `isSkillUnlocked(userId, skillId)` | Check if skill is accessible |
| `getUserSkillTree(userId)` | Get full tree state with unlock status |
| `updateSkillMastery(userId, skillId, score)` | Update mastery after assessment |
| `getSkillAssessment(userId, skillId)` | Get questions for unlocked skill |
| `submitSkillAssessment(userId, skillId, answers)` | Grade answers, update mastery |
| `getSkillTreeStats(userId)` | Get overall progress statistics |
| `unlockSkillNode(userId, nodeId)` | Manually unlock a node |

### Files
- `server/models/SkillTree.js` - SkillNode + SkillTree Mongoose schemas
- `server/services/skillTreeService.js` - Business logic
- `server/models/GamificationProfile.js` - Mastery tracking (skillMastery Map)

---

## 🏅 Badges (18 Total)

### Categories

| Category | Examples |
|----------|----------|
| XP Milestones | 🌟 First 100 XP, ⚡ 1000 XP Club |
| Level Milestones | 📈 Level 5, 🚀 Level 10 |
| Streaks | 🔥 3-Day, 🏆 30-Day |
| Boss Battles | 👑 First Win, ⭐ Perfect Score |
| Bounties | 🎯 Bounty Hunter, 💎 Treasure Master |
| Credits | 💰 50 Credits, 🏦 200 Credits |

### Files
- `server/services/badgeService.js`

---

## 🖥️ Frontend Components

| Component | Purpose |
|-----------|---------|
| `LevelBadge.jsx` | Displays current level |
| `RankBadge.jsx` | Shows rank tier |
| `XPProgressModal.jsx` | XP progress bar with next level |
| `EnergyBar.jsx` | Current energy display |
| `BountyCreditsPage.jsx` | Bounty challenges UI |
| `BossBattles.jsx` | Boss battle interface |
| `BadgesShowcase.jsx` | Badge collection display |
| `CreditsDisplay.jsx` | Credit balance |

**Location:** `frontend/src/components/gamification/`

---

## 📊 API Endpoints

### User Gamification APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/gamification/profile` | Get user's full gamification profile |
| GET | `/api/gamification/skill-tree` | Get user's skill tree state |
| GET | `/api/gamification/skill/:skillId/assessment` | Get assessment questions for a skill |
| POST | `/api/gamification/skill/:skillId/assessment` | Submit assessment answers |
| GET | `/api/gamification/bounties` | Get active bounties |
| POST | `/api/gamification/bounty/:id/submit` | Submit bounty answer |
| GET | `/api/gamification/boss-battles` | Get available boss battles |
| POST | `/api/gamification/boss-battle/:id/submit` | Submit battle answers |
| GET | `/api/gamification/leaderboard/:topic` | Get topic leaderboard |
| GET | `/api/gamification/streak` | Get streak info |
| GET | `/api/gamification/energy` | Get energy status |
| GET | `/api/gamification/credits` | Get credit balance |
| GET | `/api/gamification/badges` | Get user's earned badges |
| GET | `/api/gamification/badges/all` | Get all available badges |

### Admin Gamification APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/gamification/overview` | Get overall gamification statistics |
| GET | `/api/admin/gamification/active-streaks` | Get users with active streaks |
| GET | `/api/admin/gamification/users` | Get all users with gamification stats |
| POST | `/api/admin/gamification/award-xp` | Manually award XP to a user |
| GET | `/api/admin/gamification/skill-tree` | Get all skills (admin view) |
| POST | `/api/admin/gamification/skill-tree` | Create a new skill |
| PUT | `/api/admin/gamification/skill-tree/:skillId` | Update a skill |
| DELETE | `/api/admin/gamification/skill-tree/:skillId` | Delete a skill |
| GET | `/api/admin/gamification/boss-battles` | Get all boss battles |
| GET | `/api/admin/gamification/contributions` | Get all concept contributions |
| PUT | `/api/admin/gamification/contribution/:id/approve` | Approve a contribution |
| PUT | `/api/admin/gamification/contribution/:id/reject` | Reject a contribution |

---

## 🔄 Cron Jobs

| Job | Schedule | Purpose |
|-----|----------|---------|
| Daily Bounty Generation | 9 AM IST | Create new bounties from knowledge gaps |
| Boss Battle Generation | Every 4 hours | Create battles for weak topics |
| Bounty Cleanup | Every 2 hours | Expire old bounties |
| Battle Cleanup | Every 2 hours | Expire incomplete battles |

---

## 👥 Contributors

- **S Tejaswini** (@Tejaswini-1906) - Gamification system architecture, skill trees, boss battles
- **P Nithin** (@Nithin974) - Bounty questions, Bloom's Taxonomy Scoring Engine
- **M Tejaswin** (@Teja-9703) - Admin Gamification APIs, frontend gamification integration

---

*Last Updated: January 18, 2026*
