# Curriculum Knowledge Graph (Syllabus-to-Graph Mapper)

## Overview

The Curriculum Knowledge Graph converts course syllabi into a navigable, queryable knowledge graph that enables adaptive learning paths. It uses **Neo4j** as the graph database to represent the hierarchical structure of educational content.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CSV Syllabus File                        │
│   (Module, Lecture_No, Lecture_Topic, Subtopics)                │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    curriculum_graph_handler.py                   │
│   - Parses CSV                                                   │
│   - Creates Module, Topic, Subtopic nodes                       │
│   - Establishes relationships                                    │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Neo4j Database                          │
│                                                                  │
│   ┌──────────┐     HAS_TOPIC      ┌───────────┐                │
│   │  Module  │ ─────────────────► │   Topic   │                │
│   └──────────┘                    └───────────┘                │
│        │                               │                        │
│        │ PRECEDES                      │ HAS_SUBTOPIC           │
│        ▼                               ▼                        │
│   ┌──────────┐                    ┌───────────┐                │
│   │  Module  │                    │  Subtopic │                │
│   └──────────┘                    └───────────┘                │
│                                        │                        │
│                                        │ PREREQUISITE_OF        │
│                                        ▼                        │
│                                   ┌───────────┐                │
│                                   │  Subtopic │                │
│                                   └───────────┘                │
└─────────────────────────────────────────────────────────────────┘
```

## Node Schema

### Module Node
```cypher
(:Module {
    name: String,           // e.g., "Module I: Introduction"
    order: Integer          // Sequential order (1, 2, 3...)
})
```

### Topic Node
```cypher
(:Topic {
    name: String,           // e.g., "Introduction to Machine Learning"
    lecture_no: Integer     // Lecture number from syllabus
})
```

### Subtopic Node
```cypher
(:Subtopic {
    name: String            // e.g., "Supervised Learning Basics"
})
```

## Relationship Types

| Relationship | From | To | Description |
|--------------|------|-----|-------------|
| `PRECEDES` | Module | Module | Sequential ordering of modules |
| `HAS_TOPIC` | Module | Topic | Module contains this topic |
| `HAS_SUBTOPIC` | Topic | Subtopic | Topic contains this subtopic |
| `PREREQUISITE_OF` | Subtopic | Subtopic | Must learn A before B |

## File Locations

| File | Location | Purpose |
|------|----------|---------|
| `curriculum_graph_handler.py` | `server/rag_service/` | Main handler for CSV ingestion and graph creation |
| `curriculumOrchestrator.js` | `server/services/` | Node.js orchestrator for curriculum operations |
| `machine_learning_syllabus.csv` | `server/rag_service/data/` | Sample syllabus CSV |

## CSV Format

The input CSV must have the following columns:

```csv
Module,Lecture_No,Lecture_Topic,Subtopics
"Module I: Introduction",1,"Introduction to Machine Learning","Definition; Types of Learning; Applications"
"Module I: Introduction",2,"Supervised Learning","Classification; Regression; Model Evaluation"
```

**Column Details:**
- **Module**: Module name (grouped together)
- **Lecture_No**: Sequential lecture number within the course
- **Lecture_Topic**: Main topic title for the lecture
- **Subtopics**: Semicolon-separated list of subtopics

## Usage

### 1. Prepare Your Syllabus CSV

Create a CSV file following the format above. Place it in `server/rag_service/data/`.

### 2. Ingest the Syllabus

**Via Python Script:**
```python
from curriculum_graph_handler import CurriculumGraphHandler

handler = CurriculumGraphHandler()
handler.ingest_syllabus("data/your_syllabus.csv", course_name="Machine Learning")
```

**Via API Endpoint:**
```bash
POST /api/curriculum/ingest
Content-Type: multipart/form-data

file: <your_syllabus.csv>
course_name: "Machine Learning"
```

### 3. Query Learning Paths

**Get Prerequisites for a Topic:**
```cypher
MATCH (s:Subtopic {name: "Neural Networks"})<-[:PREREQUISITE_OF*]-(prereq:Subtopic)
RETURN prereq.name AS prerequisite
ORDER BY length(path)
```

**Get All Topics in Order:**
```cypher
MATCH (m:Module)-[:HAS_TOPIC]->(t:Topic)
RETURN m.name, t.name, t.lecture_no
ORDER BY m.order, t.lecture_no
```

## Dynamic Prerequisite Detection

The system can automatically infer prerequisites based on:
1. **Lecture Order**: Topic in Lecture 3 may require Topic from Lecture 2
2. **Keyword Matching**: "Advanced Neural Networks" likely requires "Introduction to Neural Networks"
3. **Explicit Mapping**: CSV can include a `Prerequisites` column for explicit dependencies

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/curriculum/ingest` | Upload and process syllabus CSV |
| `GET` | `/api/curriculum/:course/structure` | Get full course structure |
| `GET` | `/api/curriculum/:course/prerequisites/:topic` | Get prerequisites for a topic |
| `GET` | `/api/curriculum/:course/learning-path/:topic` | Get complete learning path to topic |

## Integration with Tutor

The Curriculum Knowledge Graph integrates with the Socratic Tutor to:
1. Identify which topics a student needs to master first
2. Generate questions focused on prerequisite knowledge gaps
3. Track mastery progression through the graph
4. Suggest next topics based on current understanding

## Contributors

- **A R L S Hari Priya** (@HariPriya-2124) - Syllabus Graph handling, Neo4j integration
- **P Sai Karthik** (@Karthi-k235) - Skill tree system, prerequisite detection

---

*Last Updated: January 2026*
