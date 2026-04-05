# 🧠 Contextual Memory System - Quick Start Guide

## 🎯 What Is This?

The **Contextual Memory System** allows the AI tutor to remember each student's learning journey across sessions. It tracks:
- ✅ What concepts you've mastered
- ✅ What topics you struggle with
- ✅ Your misconceptions and weaknesses
- ✅ Your learning style and pace

**Result:** The tutor adapts its teaching style automatically based on your history.

---

## 🚀 Quick Start (3 Steps)

### **Step 1: The System Works Automatically**

No setup needed! Every time you chat with the tutor:
1. Your knowledge state is loaded
2. The tutor adapts its responses based on your history
3. After the conversation, insights are extracted and saved

### **Step 2: View Your Learning Profile**

```bash
GET /api/knowledge-state
Authorization: Bearer <your-token>
```

**Response:**
```json
{
  "profile": {
    "learningStyle": "visual",
    "learningPace": "moderate",
    "preferredDepth": "balanced"
  },
  "summary": {
    "totalConcepts": 15,
    "mastered": 5,
    "learning": 7,
    "struggling": 3
  },
  "concepts": [
    {
      "name": "recursion.base_case",
      "mastery": 45,
      "difficulty": "high",
      "understandingLevel": "struggling",
      "lastPracticed": "2026-01-24T14:30:00Z"
    }
  ]
}
```

### **Step 3: Control Your Privacy**

#### Export Your Data
```bash
GET /api/knowledge-state/export
```

#### Reset Your Memory
```bash
DELETE /api/knowledge-state/reset
Content-Type: application/json

{
  "confirmReset": true
}
```

#### Opt Out of Tracking
```bash
PATCH /api/knowledge-state/opt-out
Content-Type: application/json

{
  "optOut": true
}
```

---

## 🎓 How It Works (Simple Explanation)

### **Example: Learning Recursion**

#### **Session 1 (Monday)**
```
You: "What is recursion?"
Tutor: [Explains recursion]
You: [Answers incorrectly, forgets base case]
```

**Behind the scenes:**
```javascript
{
  conceptName: "recursion.base_case",
  masteryScore: 30,  // Low score
  difficulty: "high", // Marked as difficult for you
  misconceptions: ["Forgets base case"]
}
```

#### **Session 2 (Tuesday)**
```
You: "Can you explain recursion again?"
Tutor: "Let me explain it differently this time...

Think of recursion like Russian nesting dolls. Each doll contains 
a smaller doll inside, until you reach the smallest one (the base 
case) that doesn't open anymore.

Let me show you a simple example..."
```

**What happened?**
- ✅ Tutor remembered you struggled with recursion
- ✅ Used a simpler analogy (nesting dolls)
- ✅ Emphasized the base case (your weak point)
- ✅ Did NOT say "I remember you struggled" (silent adaptation)

---

## 📊 What Gets Tracked?

### **For Each Concept:**

| Field | Example | Description |
|-------|---------|-------------|
| **Name** | `recursion.base_case` | Granular concept name |
| **Mastery** | `45` | Score from 0-100 |
| **Difficulty** | `high` | How hard it is for YOU |
| **Understanding** | `struggling` | Current level |
| **Misconceptions** | `["Forgets base case"]` | Common mistakes |
| **Strengths** | `["Understands recursion concept"]` | What you're good at |
| **Weaknesses** | `["Base case design"]` | What you struggle with |
| **Last Practiced** | `2026-01-24` | When you last worked on it |
| **Learning Velocity** | `2.5` | How fast you're improving |

---

## 🔒 Privacy & Control

### **You Own Your Data**

- ✅ **View anytime:** `GET /api/knowledge-state`
- ✅ **Export as JSON:** `GET /api/knowledge-state/export`
- ✅ **Reset completely:** `DELETE /api/knowledge-state/reset`
- ✅ **Opt out:** `PATCH /api/knowledge-state/opt-out`

### **No Cross-User Leakage**

- Your memory is tied to your `userId`
- No other user can access your learning history
- All endpoints require authentication

---

## 🎯 How the Tutor Adapts

### **If You're Struggling:**
- ✅ Uses simpler language
- ✅ Provides more examples
- ✅ Asks checkpoint questions earlier
- ✅ Introduces analogies
- ✅ Slows down the pace

### **If You've Mastered:**
- ✅ Skips basic explanations
- ✅ Moves to advanced topics
- ✅ Uses challenge questions
- ✅ Increases the pace

---

## 🧪 Testing

### **Quick Test:**
```bash
node server/scripts/quickTestMemory.js
```

**Output:**
```
🧪 Quick Contextual Memory Test

✅ Connected to MongoDB
✅ Created knowledge state
✅ Updated with insights
✅ Retrieved contextual memory
✅ Cleanup complete

🎉 All basic tests passed!
```

---

## 📚 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/knowledge-state` | GET | View your profile |
| `/api/knowledge-state/export` | GET | Export as JSON |
| `/api/knowledge-state/reset` | DELETE | Reset memory |
| `/api/knowledge-state/opt-out` | PATCH | Opt out of tracking |
| `/api/knowledge-state/struggling` | GET | View struggling topics |
| `/api/knowledge-state/mastered` | GET | View mastered topics |
| `/api/knowledge-state/health-check` | GET | Validate integrity |

---

## 🛡️ Safety Features

### **Error Handling:**
- ✅ If memory fails to load → Tutor continues without memory
- ✅ Invalid data is validated and sanitized
- ✅ Contradictory states are auto-corrected

### **Contradictory State Prevention:**
```javascript
// Example: You can't be "mastered" AND "high difficulty"
if (mastered && difficulty === 'high') {
  difficulty = 'low'; // Auto-corrected
}
```

---

## 📖 Full Documentation

For complete details, see:
- **Architecture & API:** `server/docs/CONTEXTUAL_MEMORY.md`
- **Implementation Summary:** `IMPLEMENTATION_SUMMARY.md`
- **Requirements Checklist:** `REQUIREMENTS_CHECKLIST.md`

---

## 🎉 Summary

### **What You Get:**
- ✅ Personalized tutoring that remembers your learning journey
- ✅ Automatic adaptation based on your strengths/weaknesses
- ✅ Full privacy controls (export, reset, opt-out)
- ✅ No visible latency (< 200ms)
- ✅ Error-safe operation (never blocks tutoring)

### **How to Use:**
1. **Just chat normally** - The system works automatically
2. **View your profile** - `GET /api/knowledge-state`
3. **Control your privacy** - Export, reset, or opt out anytime

---

**Status:** ✅ **READY TO USE**

Start chatting with the tutor, and it will automatically remember your learning journey!
