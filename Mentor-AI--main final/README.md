# AI Tutor: Intelligent Learning Assistant

This project is a comprehensive AI-powered tutoring application designed to assist users through interactive chat, document analysis, and knowledge exploration. It integrates multiple Large Language Models (LLMs), Retrieval Augmented Generation (RAG) for contextual understanding from user-uploaded documents, and knowledge graph capabilities for critical thinking. The system also includes an admin interface for managing shared knowledge resources.

---

## Core Features

### Intelligent & Interactive Chat

-   **Multi-LLM Orchestration**: The system uses an intelligent **LLM Router** (`llmRouterService.js`) that analyzes each user query against heuristic keywords (e.g., 'code', 'translate') and the current context. It dynamically selects the best-suited model from a database of configured LLMs (e.g., a coding model for a programming question, a multilingual model for translation) to ensure the highest quality response. Users can also manually override their default provider.
-   **Explainable Thinking Process (Tree of Thoughts)**: When "Critical Thinking Mode" is enabled, the application activates a **Tree of Thoughts (ToT) orchestrator** (`totOrchestrator.js`). This agent breaks complex queries into a multi-step plan, evaluates the best plan, and executes each step. Its reasoning is streamed to the user in real-time via the **Thinking Dropdown** (`ThinkingDropdown.jsx`), making the AI's decision-making process fully transparent.
-   **Custom AI Persona**: Users can tailor the AI's behavior by selecting from pre-configured system prompts (e.g., "Friendly Tutor," "Concept Explorer") or writing their own custom instructions in the **Left Panel** (`LeftPanel.jsx`). This `systemPrompt` is passed to the LLM with every request.
-   **Speech-to-Text (STT) & Text-to-Speech (TTS)**: The UI supports voice interaction. The `useWebSpeech` hook enables voice input via the browser's native Speech Recognition API, and the `useTextToSpeech` hook reads the AI's responses aloud (`ChatInput.jsx`, `MessageBubble.jsx`).
-   **Rich Content Rendering**: The AI is prompted to respond using Markdown, tables, and **KaTeX** for mathematical formulas. The frontend (`MessageBubble.jsx`, `markdownUtils.jsx`) correctly renders this rich content, including syntax-highlighted code snippets via **Prism.js**.

### Advanced Knowledge Management & RAG

-   **Multi-Modal Knowledge Ingestion**: The platform can ingest and process a wide array of sources (`SourceIngestion.jsx`). The backend `knowledge_engine.py` and `media_processor.py` can handle:
    -   **Documents**: PDF, DOCX, TXT, Markdown.
    -   **Media Files**: MP3, MP4 (audio is extracted and transcribed).
    -   **Web Content**: Standard webpage URLs and YouTube video links (transcripts are fetched).
-   **Comprehensive RAG Pipeline**: When a source is ingested, it undergoes a full processing pipeline in `ai_core.py`:
    1.  **Extraction**: Text, tables, and images are extracted using libraries like `pdfplumber`, `python-docx`, and `fitz`.
    2.  **OCR**: **Tesseract** extracts text from images or scanned PDFs.
    3.  **Transcription**: **OpenAI Whisper** transcribes audio from media files.
    4.  **Cleaning**: Text is cleaned and lemmatized using **spaCy**.
    5.  **Layout Reconstruction**: Tables are converted to Markdown and integrated with the text.
    6.  **Chunking & Embedding**: The final text is segmented and converted into vector embeddings using **Sentence Transformers**.
    7.  **Storage**: Embeddings are stored in **Qdrant**, and metadata is prepared for the Knowledge Graph.
-   **Admin-Curated Subjects**: Professors can upload foundational documents via the **Admin Dashboard**. These appear as selectable "Subjects" (`SubjectList.jsx`) for all students, allowing users to focus their RAG queries on a specific, curated curriculum.

### Personalized Learning & Academic Tools

-   **Personalized Study Plans**: From the `StudyPlanPage.jsx`, users can state a learning goal. The `curriculumOrchestrator.js` first uses an LLM to determine if the goal is specific enough. If not, it generates clarifying questions. Once the goal is refined, it creates a multi-module, step-by-step curriculum tailored to the user's profile and identified weaknesses, which is then saved to the `LearningPath` database model.
-   **Curriculum Knowledge Graph**: The platform uses a **normalized Neo4j knowledge graph** to represent curriculum structure:
    -   **Module → Topic → Subtopic Hierarchy**: Curriculum data is organized into `Module`, `Topic`, and `Subtopic` nodes with explicit relationships (`PRECEDES`, `HAS_TOPIC`, `PREREQUISITE_OF`).
    -   **Dynamic Prerequisite Detection**: The system can identify which subtopics must be mastered before attempting a topic, enabling adaptive learning paths.
    -   **Single CSV Ingestion**: Admins can upload a single CSV file with Module, Lecture Number, Lecture Topic, and Subtopics columns. The backend (`curriculum_graph_handler.py`) automatically parses and builds the graph.
    -   **Learning Path Generation**: Query any topic to get a complete learning path including all modules and prerequisites.
-   **Socratic Tutor Mode**: An intelligent tutoring system that uses the **Socratic method** for deeper learning:
    -   **Multi-turn Reasoning Loop**: Evaluates student responses and classifies understanding levels (UNDERSTANDS, PARTIAL, MISCONCEPTION, NO_MENTAL_MODEL).
    -   **Adaptive Questioning**: Generates follow-up Socratic questions based on the student's current understanding level.
    -   **Mastery Threshold**: Tracks consecutive correct answers and stops questioning when mastery is achieved, providing a closure message.
    -   **No Direct Explanations**: The tutor only asks questions and provides hints, encouraging active learning.
-   **Knowledge Gap Identification & Recommendations**: After a chat session concludes, the `sessionAnalysisService.js` uses an LLM to analyze the transcript. It identifies topics where the user showed confusion (**Knowledge Gaps**) and saves them to their profile. It then generates **"Next Step" recommendations** based on the key topics discussed, which are cached in **Redis** and presented at the start of the next session.
-   **Real-time Dynamic Concept Mapping**: During a live chat, the AI extracts key concepts and relationships in the background (`kgExtractionService.js`). Users can open the **Live Concept Map** (`RealtimeKgPanel.jsx`) to see an interactive **ReactFlow** visualization of how ideas in the current conversation are connected, fetched directly from the **Neo4j** graph database.
-   **Secure Code Executor & AI Assistant**: A sandboxed environment (`CodeExecutorPage.jsx`) where users can write and run code in Python, Java, C, and C++. The backend (`app.py`) uses temporary directories and the `subprocess` module for secure execution. An integrated **AI Assistant** (`AIAssistantBot.jsx`) can:
    -   **Analyze Code**: Provide a detailed review of functionality, bugs, and improvements.
    -   **Generate Test Cases**: Create a suite of standard, edge, and error cases.
    -   **Explain Errors**: Give a beginner-friendly explanation for compilation or runtime errors.
-   **Academic Integrity Suite**: A dedicated page (`AcademicIntegrityPage.jsx`) with tools to promote ethical writing. The `integrity_services.py` backend provides:
    -   **Plagiarism Detection**: Integrates with the **Turnitin API** for similarity reports.
    -   **Bias & Inclusivity Check**: Uses a hybrid approach of wordlists (`bias_wordlists.py`) and an LLM to flag potentially biased language and suggest alternatives.
    -   **Readability Analysis**: Calculates Flesch-Kincaid, Gunning Fog, and other scores using `textstat`.
-   **Generative Content Tools**:
    -   **AI Quiz Generator**: Users can upload a document, and the backend (`quiz_utils.py`, `app.py`) will use an LLM to generate a multiple-choice quiz based on its content.
    -   **Multi-Voice Podcast Generator**: Transforms any document into a high-quality, three-speaker conversational podcast. `podcast_generator.py` uses an LLM to write a script, then uses **Coqui TTS** (`tts_service.py`) to synthesize distinct voices by pitch-shifting a base voice model.
    -   **DOCX & PPTX Generation**: From any analysis modal, users can generate a report. The `document_generator.py` backend uses an LLM to expand the content and then uses the `python-docx` and `python-pptx` libraries to create and serve the downloadable files.

### Administrator & Platform Management

-   **Full Analytics Dashboard**: The `/admin/analytics` route (`AnalyticsDashboardPage.jsx`) provides a comprehensive overview of platform health. Backend routes in `analytics.js` query **MongoDB** for user counts and **Elasticsearch** for event logs to populate charts showing user growth, feature adoption, and content engagement.
-   **Secure Dataset Management**: The admin dashboard features a `DatasetManager.jsx` for managing fine-tuning datasets. It interfaces with `s3Service.js` to use **pre-signed URLs**, allowing direct, secure uploads from the admin's browser to an **AWS S3** bucket without routing large files through the application server.
-   **Feedback Loop for Model Fine-Tuning**:
    1.  **Feedback Collection**: Users can give thumbs up/down feedback on AI responses (`MessageBubble.jsx`). This is stored in the `LLMPerformanceLog` collection (`feedback.js`).
    2.  **Orchestration**: An admin can trigger a fine-tuning job from the dashboard (`ModelFeedbackStats.jsx`).
    3.  **Execution**: The Node.js backend (`finetuning.js`) collects all positive feedback data, saves it to a shared volume, and calls the Python service. The `fine_tuner.py` script then uses **Unsloth** and Hugging Face's `SFTTrainer` to fine-tune a base model (e.g., Llama 3) and registers the new, improved model with **Ollama**.
-   **Secure Authentication & API Key Management**: The platform uses JWTs for session management with hashed passwords stored using `bcryptjs`. The admin dashboard (`ApiKeyRequestManager.jsx`) allows professors to review and approve/reject student requests for a system-provided Gemini API key. Approved keys are encrypted (`crypto.js`) and stored in the user's profile.

### Full-Stack Observability

-   **Centralized Logging**: The Node.js (`logger.js`) and Python (`config.py`) backends are configured to output structured **JSON logs**. A **Filebeat** container (`filebeat.yml`) is configured to ship these logs to an **Elasticsearch** instance.
-   **Log Visualization & Search**: A **Kibana** service is deployed, providing a powerful UI to search, filter, and create visualizations from the aggregated application logs, enabling deep debugging and user activity tracking.
-   **Performance Monitoring**: The Node.js backend exposes a `/metrics` endpoint using **prom-client**. A **Prometheus** container (`prometheus.yml`) is configured to scrape this endpoint, collecting real-time application metrics like HTTP request latency and error rates.
-   **Dashboards & Alerting**: A **Grafana** instance is deployed with a pre-configured data source for Prometheus and a sample dashboard (`dashboard.json`), allowing for easy visualization of application health and performance.
-   **Real-time Error Tracking**: Both the Node.js (`instrument.js`) and Python (`app.py`) services are integrated with **Sentry** for real-time, cross-platform error aggregation, reporting, and alerting.

### Complete Gamification System 🎮

**Version:** 1.1.2 | **Status:** ✅ Production Ready | **Last Updated:** January 22, 2026

The platform includes a sophisticated gamification layer designed to boost user engagement and learning motivation:

-   **Advanced XP System**: Dynamic 1-20 XP rewards per message based on 6-dimension quality analysis (Question Quality, Sentence Structure, Vocabulary, Topic Depth, Clarity, Effort). Level-adjusted rewards ensure fairness.
-   **Daily Streaks with Multipliers**: Consecutive day tracking with XP multipliers (1.0×, 1.2×, 1.5×) and milestone rewards at 3, 7, 14, 30, 60, and 100 days. Automatic reset on missed days.
-   **Energy & Fatigue System**: Intelligent fatigue detection based on session duration and message frequency. Energy depletion varies (-5, -10, -15) with forced 30-minute breaks at 0% and time-based regeneration (+10 per 15 minutes).
-   **Bounty Questions**: AI-powered daily question generation based on knowledge gap analysis from the last 7 days of chat history. Questions are difficulty-scaled (easy/medium/hard/expert) and award learning credits (10-50) plus XP bonuses. Includes automatic 24-hour expiration with cleanup.
-   **Learning Credits Economy**: Separate currency from XP, earned through bounty completions. Credits can unlock premium features with full transaction history tracking.
-   **Boss Battles**: Automatic weak topic identification generates challenging 5-question battles every 4 hours. Features AI-generated revision plans for failures, score-based XP rewards (40-90 + 20 bonus for perfect), and special achievement badges.
-   **18 Unique Badges**: Achievements across 6 categories (XP Milestones, Level Milestones, Streak Achievements, Boss Battle victories, Bounty completions, Credit accumulation) with automatic awarding.
-   **13 Frontend UI Components**: LevelBadge, RankBadge, XPProgressModal, EnergyBar, BountyCreditsPage, BossBattles, BadgesShowcase, SkillTreeMap, SkillTreeGameMap, SkillTreeGames, SkillTreeLanding, SkillTreeOverview, SkillAssessmentModal - all with animations and real-time updates.
-   **Admin Gamification Dashboard**: 8 stat cards (Active Users, Average Level, Total XP, Active Streaks, Boss Battles, Badges Earned, Active Bounties, Credits Awarded), top performers leaderboard, XP distribution charts, and manual XP awarding capability.
-   **4 Automated Cron Jobs**: Daily bounty generation (9 AM IST), boss battle generation (every 4 hours), automatic bounty cleanup (every 2 hours), and boss battle cleanup (every 2 hours).

**Implementation Status:**
- ✅ **12/12 Features Complete (100%)**
- ✅ All backend services functional
- ✅ All frontend components implemented
- ✅ Real-time XP tracking and updates
- ✅ Full admin dashboard with analytics

**Recent Updates (v1.1.2 - Jan 22, 2026):**
- ✅ Fixed duplicate code in `skillTreeService.js` and `ConceptContribution.js`
- ✅ Corrected DuckDuckGo search import (`ddgs` → `duckduckgo_search`)
- ✅ Moved `knowledgeStateService.js` from routes to services directory
- ✅ Removed non-existent `LearningProfile.jsx` import from App.jsx
- ✅ Verified Advanced XP System (1-20 range) is actively working
- ✅ Confirmed all gamification features are production-ready

For complete gamification documentation, see:
- `GAMIFICATION_README.md` - Feature overview and detailed implementation
- `GAMIFICATION_IMPLEMENTATION_STATUS.md` - Development status
- `GAMIFICATION_CHANGELOG.md` - Version history and updates
- `FRONTEND_GAMIFICATION_SCORING.md` - Real-time scoring details

---

## Development Walkthrough

This section documents the key features and implementations developed by our team.

### 1. Curriculum Knowledge Graph (Syllabus-to-Graph Mapper)

**Purpose:** Convert course syllabi into a navigable, queryable knowledge graph for adaptive learning.

**Implementation Details:**
- **Normalized Neo4j Schema:** `Module → Topic → Subtopic` hierarchy with explicit relationships (`PRECEDES`, `HAS_TOPIC`, `PREREQUISITE_OF`)
- **Single CSV Ingestion:** Upload a CSV with columns (Module, Lecture Number, Lecture Topic, Subtopics) and the system automatically builds the graph
- **Dynamic Prerequisite Detection:** Identifies which subtopics must be mastered before attempting a topic
- **Files:** `curriculum_graph_handler.py`, `curriculumOrchestrator.js`, `machine_learning_syllabus.csv`

**How to Use:**
1. Prepare a CSV file with Module, Lecture_No, Lecture_Topic, Subtopics columns
2. Use the admin interface or API to upload the syllabus
3. Query the Neo4j graph to get learning paths and prerequisites

### 2. Socratic Tutor Mode (Multi-turn Reasoning Loop)

**Purpose:** Implement an AI tutor that uses the Socratic method, asking questions instead of giving direct answers.

**Implementation Details:**
- **Understanding Classification:** Evaluates student responses as `UNDERSTANDS`, `PARTIAL`, `MISCONCEPTION`, or `NO_MENTAL_MODEL`
- **Adaptive Questioning:** Generates follow-up questions based on classification
- **Mastery Threshold:** Stops questioning after 2-3 consecutive `UNDERSTANDS` classifications
- **Session State Tracking:** Uses session-level state to track conversation context
- **Files:** `socraticTutorService.js`, `tutorSystemPrompt.js`, `promptTemplates.js`

**Key Features:**
- Never gives direct explanations - only asks questions and provides hints
- Tracks progress toward mastery per module
- Provides closure message when mastery is achieved

### 3. Contextual Memory System

**Purpose:** Maintain persistent knowledge of student learning patterns across sessions.

**Implementation Details:**
- **StudentKnowledgeState Model:** Tracks concepts, understanding levels, strengths, weaknesses, and learning patterns
- **ConceptUnderstanding Schema:** Tracks mastery scores (0-100), learning velocity, confidence scores
- **Learning Profile:** Tracks dominant learning style, pace, preferred depth
- **Files:** `StudentKnowledgeState.js`, `contextualMemoryMiddleware.js`

**Tracked Data:**
- Mastery level per concept (not_exposed → struggling → learning → comfortable → mastered)
- Misconceptions detected and whether they've been corrected
- Session insights with breakthrough moments and struggle areas

### 4. RAG System with Qdrant Integration

**Purpose:** Provide context-aware responses by retrieving relevant information from uploaded documents.

**Implementation Details:**
- **Vector Database:** Qdrant for storing and querying document embeddings
- **Syllabus Linking:** Enriches chunk metadata with syllabus information
- **Multi-Modal Ingestion:** Supports PDF, DOCX, TXT, Markdown, MP3, MP4, and web content
- **Files:** `ai_core.py`, `qdrant_service.py`, `syllabus_qdrant_linker.py`, `query_service.py`

**Pipeline:**
1. Document → Extraction → OCR/Transcription → Cleaning → Chunking → Embedding → Qdrant Storage

### 5. Gamification System

**Purpose:** Boost user engagement through game mechanics and rewards.

**Key Components:**
- **XP System:** Dynamic 1-20 XP based on message quality analysis
- **Daily Streaks:** Multipliers (1.0×, 1.2×, 1.5×) and milestone rewards
- **Energy System:** Fatigue detection with forced breaks
- **Bounty Questions:** AI-generated daily challenges based on knowledge gaps
- **Boss Battles:** 5-question challenges on weak topics every 4 hours
- **18 Badges:** Achievements across 6 categories
- **Files:** `gamification/` folder (frontend), `gamification.js` (backend routes)

### 6. Prompt Templates System

**Purpose:** Structured prompts for consistent AI responses across different tasks.

**Available Templates:**
- Document Analysis: FAQ generation, topic extraction, mindmap creation
- Knowledge Graph: Entity and relationship extraction
- Socratic Tutoring: Question generation, understanding evaluation
- Files: `promptTemplates.js`

> 📖 **For detailed implementation documentation, see the [Feature Walkthroughs](./walkthrough/README.md) folder.**

---

## Getting Started

### Prerequisites

You will need the following software installed on your system to run the application.

-   **Node.js**: Version 18.x
-   **npm**: Comes bundled with Node.js
-   **Python**: Version 3.10–3.11 (3.10 is recommended)
-   **pip**: Comes bundled with Python
-   **MongoDB**: For database storage
-   **Docker & Docker Compose**: To run containerized services (Qdrant, Neo4j, ELK Stack, etc.)
-   **Tesseract OCR**: For processing image-based documents
-   **FFmpeg**: For audio and podcast generation

---

## Installation & Deployment

### Linux Setup (Debian/Ubuntu)

Follow the exact process to deploy this application in the Local Area Network

### Steps

1. Clone the Repository

```bash
git clone https://github.com/Karthi-k235/Nit.git
```

2. Move to Nit folder

```bash
cd Nit
```

3. Run install.sh script file

```bash
bash install.sh
```

4. Open project folder in the file manager and delete the node_modules and package-lock.json in **frontend** folder
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
```

5. Open Project in Vs code and open the .env file present in the server folder and do the further steps as mentioned

6. For JWT_SECRET, You need to generate a strong secret key for JWT authentication.  
Do **NOT** use the placeholder `GENERATE_A_STRONG_RANDOM_SECRET_KEY_HERE`.

#### 1. Generate a random secret:
Run the following commands in your terminal and place the generated key in the value

```bash
openssl rand -base64 32
```

#### 2. Generate a 64-character hexadecimal secret:
Run the following command in your terminal (Linux/macOS):

```bash
openssl rand -hex 32
```
and modify

```bash
ENCRYPTION_SECRET="your_generated_secret_here"
```

7. Provide your Gemini api key and Ollama url for admin ( Necessary)

8. **Sentry DSN Setup** ( Necessary )

We use [Sentry](https://sentry.io) for error tracking and monitoring.  
To connect your application to Sentry, you’ll need a `SENTRY_DSN`.


9. **Nodemail setup** ( Necessary )

Add the mail creadentials and all into the env file as below with your own credentials ( You can ask the process to AI )

```bash
EMAIL_HOST="smtp.gmail.com"
EMAIL_PORT=587
EMAIL_USER="user mail"
EMAIL_PASS="email password"
```

#### 1. Create a free Sentry account
- Go to [https://sentry.io/signup/](https://sentry.io/signup/)
- Sign up using GitHub, GitLab, or email.

#### 2. Create a new project
- Once logged in, click **Projects → Create Project**.
- Choose your platform (e.g., **Node.js**, **React**, **Express**, etc.).
- Give the project a name (example: `my-app`).
- Select or create an **Organization** (Sentry groups projects inside orgs).
- Click **Create Project**.

#### 3. Get your DSN
- After creating the project, Sentry shows you a **setup page** with code snippets.
- Look for something like: https://<PUBLIC_KEY>@o<ORG_ID>.ingest.sentry.io/<PROJECT_ID>

That’s your **DSN**.

#### 4. Add it to your `.env` file
```env
SENTRY_DSN="https://<PUBLIC_KEY>@o<ORG_ID>.ingest.sentry.io/<PROJECT_ID>"
```

9. ☁️ AWS S3 Credentials Setup

Some functionalities (like dataset backup, cloud file storage, and retrieval) require AWS S3.  
These credentials are **optional**, but **needed if you want cloud features to work**.

#### 1. Create an AWS Account
- Go to [https://aws.amazon.com](https://aws.amazon.com) and sign up.
- You’ll need to add billing details (AWS has a Free Tier).

#### 2. Create an S3 Bucket
- Log in to the **AWS Management Console**.
- Navigate to **Services → S3 → Create bucket**.
- Enter a **unique bucket name** (e.g., `my-app-datasets`).
- Choose a region (e.g., `us-east-1`).
- Leave defaults or adjust according to your needs.
- Click **Create bucket**.

#### 3. Create an IAM User for S3 Access
- Go to **IAM (Identity & Access Management)** in AWS.
- Click **Users → Add Users**.
- Choose a username (e.g., `my-app-s3-user`).
- Select **Programmatic access** (so you can use Access Key/Secret).
- Attach permissions → choose **Attach existing policies directly**.
- Select **AmazonS3FullAccess** (or create a more restricted policy).
- Click **Next** and finish user creation.

#### 4. Get Access Keys
- After creating the IAM user, download the **Access Key ID** and **Secret Access Key**.
- Keep them safe — you won’t be able to see the secret again later.

#### 5. Add to your `.env` file
```env
S3_BUCKET_NAME="your-s3-bucket-name-here"
AWS_ACCESS_KEY_ID="your-access-key-id"
AWS_SECRET_ACCESS_KEY="your-secret-access-key"
AWS_REGION="us-east-1"
```



10. Check & Stop Old Containers

- Before running new containers, make sure no old ones are active:

```bash
sudo docker ps
```
If you see any containers running from a previous setup, stop them:


```bash
sudo docker compose down
```

11. Start Docker Services

Now bring up all required services in detached mode:

```bash
sudo docker compose up -d
```

12. Expose Application to LAN

- Run Rag Service

```bash
cd server/rag_service
source venv/bin/activate
python app.py
```

- Run server

Open new terminal

```bash
cd server
npm run dev
```


- Run frontend

Open new terminal

```bash
cd frontend
npm run dev
```


**Export into lan**

```bash
sudo ufw allow 2000/tcp
sudo ufw allow 2173/tcp
sudo ufw allow 2001/tcp
sudo ufw allow 2003:2009/tcp
```



### Thats it...It will be deployed in LAN

---

### Windows Setup

For Windows, dependencies must be installed individually. Using a package manager like **Chocolatey** can simplify the process.

> [!NOTE]
> After installing command-line tools like FFmpeg or Tesseract, you must add their installation `bin` directories to your system's PATH environment variable and restart your terminal or command prompt.

#### Prerequisites Installation

1. **Docker Desktop**: Download and install from the [official Docker website](https://www.docker.com/products/docker-desktop/)
2. **Node.js**: Download and run the [Node.js 18.x LTS installer](https://nodejs.org/)
3. **Python**: Install Python 3.10 from the [Microsoft Store](https://apps.microsoft.com/store/detail/python-310/9PJPW5LDXLZ5) or [python.org](https://www.python.org/downloads/). Ensure you check **"Add Python to PATH"** during installation
4. **MongoDB**: Download and run the [MongoDB Community Server installer](https://www.mongodb.com/try/download/community)
5. **Tesseract OCR**: Download and run an installer from the [Tesseract at UB Mannheim project](https://github.com/UB-Mannheim/tesseract/wiki)
6. **FFmpeg**: Download the [FFmpeg binaries](https://ffmpeg.org/download.html), extract the files, and add the `bin` folder to your system's PATH

#### 1. Clone the Repository

```bash
git clone https://github.com/NIT-Andhra-AI/iMentor-Team3.git
cd iMentor-Team3
```

#### 2. Configure Environment Variables

> [!IMPORTANT]
> The `.env` files contain sensitive information like API keys and database credentials. They are ignored by Git via the `.gitignore` file and should never be committed to your repository.

**Backend Server** (`server/.env`):

```env
PORT=2000
MONGO_URI="mongodb://localhost:27017/chatbot_gemini"
JWT_SECRET="your_super_strong_and_secret_jwt_key"
GEMINI_API_KEY="your_gemini_api_key_here"
PYTHON_RAG_SERVICE_URL="http://127.0.0.1:2001"
OLLAMA_API_BASE_URL="http://localhost:11434"
OLLAMA_DEFAULT_MODEL="qwen2.5:14b-instruct"
ENCRYPTION_SECRET="your_64_char_hex_secret_here"
SENTRY_DSN="your_sentry_dsn_here"
REDIS_URL="redis://localhost:6379"
FIXED_ADMIN_USERNAME=admin@admin.com
FIXED_ADMIN_PASSWORD=admin123
ELASTICSEARCH_URL=http://localhost:2006

# AWS S3 (Optional - for cloud features)
S3_BUCKET_NAME=""
AWS_ACCESS_KEY_ID=""
AWS_SECRET_ACCESS_KEY=""
AWS_REGION="us-east-1"
```

**Frontend** (`frontend/.env`):

```env
VITE_API_BASE_URL=http://localhost:2000/api
VITE_ADMIN_USERNAME=admin@admin.com
VITE_ADMIN_PASSWORD=admin123
```

Edit the `.env` files with your actual credentials.

### 3. Install Dependencies & Seed Database

This step installs all required packages and populates the database with the initial LLM models for the admin panel.

1.  **Install Node.js & Python packages**:
    ```bash
    # In one terminal (from root directory)
    cd server
    npm install
    
    # In a second terminal (from root directory)
    cd server/rag_service
    pip install -r requirements.txt
    python -m spacy download en_core_web_sm
    ```

2.  **Seed the LLM Data for the Admin Panel**:
    > [!IMPORTANT]
    > This script must be run once before starting the application. It populates the database with the default LLM providers, making them available for the AI Router and admin dashboard.
    ```bash
    # In your first terminal (the one in the 'server' directory)
    node scripts/seedLLMs.js
    ```

### 4. Running The Application

Open multiple terminal windows to run each component of the application in the correct order.

1.  **Start Docker Services**: Run all containerized services in detached mode.
    ```bash
    # From the root directory of the project
    docker compose up -d
    ```

2.  **Run the Python RAG Service**:
    ```bash
    # In your second terminal (the 'server/rag_service' directory)
    python app.py
    ```

3.  **Run the Node.js Backend**:
    ```bash
    # In your first terminal (the 'server' directory)
    npm start
    ```

4.  **Run the Frontend Application**:
    ```bash
    # In a third terminal (from root directory)
    cd frontend
    npm install
    npm run dev
    ```

You can now access the application at **`http://localhost:2173`** in your browser.

---

## Observability Stack

The application stack includes a full suite of monitoring tools. Access them via your browser:

> [!NOTE]
> The Neo4j Browser at `http://localhost:2004` will prompt for a username and password. The default credentials, as set in the `docker-compose.yml` file, are `neo4j` / `password`.

-   **Grafana**: `http://localhost:2009` (Visualize application performance metrics)
-   **Kibana**: `http://localhost:2007` (Explore and search application logs)
-   **Prometheus**: `http://localhost:2008` (View raw metrics and service discovery)
-   **Qdrant UI**: `http://localhost:2003/dashboard` (Inspect vector database collections)
-   **Neo4j Browser**: `http://localhost:2004` (Query and visualize the knowledge graph)

---

## Contributors

### Team Members & Contributions

| Name | GitHub | Key Contributions |
|------|--------|-------------------|
| **P Sai Karthik** | [@Karthi-k235](https://github.com/Karthi-k235) | • PDF element extraction (text, tables, images, scanned documents) <br>• Prompt templates for document analysis (FAQ, topics, mindmap) <br>•Handling Of Graphs In Neo4j <br>• Comprehensive skill tree system for tutor (modules, topics, subtopics, mastery tracking) <br>• First Socratic Loop implementation <br>• Knowledge Graph generation service |
| **A R S L Hari Priya** | [@HariPriya-2124](https://github.com/HariPriya-2124) | • RAG system with Qdrant vector database integration <br>• Syllabus linking and query services <br>• Analytics API development <br>• Syllabus Graph handling <br> • User profile and orchestrator status endpoints <br>• Neo4j configuration for knowledge graph integration |
| **S Tejaswini** | [@Tejaswini-1906](https://github.com/Tejaswini-1906) | • AI tutor system prompt generation <br>• Comprehensive frontend API service <br>• Implementation of the Second Iteration of Socratic Loop with working mode <br>• Python RAG service configuration <br>• Admin management routes <br>|
| **S Swarna Sri** | [@swarna49](https://github.com/swarna49) | • StudentKnowledgeState Mongoose model configuration <br>• Contextual memory system integration <br>• Integration of Context memeory to tutor <br>• UI/UX improvements and tweaks |
| **P Nithin** | [@Nithin974](https://github.com/Nithin974) | • Gamification bounty questions system <br>• Bloom's Taxonomy Scoring Engine <br>• Bounty Question System implementation <br>• Gamification system (skill trees, boss battles, bounty credits) <br>• Admin gamification Dashboard |
| **M Tejaswin** | [@Teja-9703](https://github.com/Teja-9703) | • Frontend API service enhancements <br>• Admin Gamification Dashboard APIs (XP awarding, skill tree CRUD, skill battles, contributions management) <br>• Implementation of skill tree mechanics  <br>• File upload and knowledge source management |
| **M Lilly Sri** | [@Lillysri02](https://github.com/Lillysri02) | • Testing & Quality Assurance <br>• Documentation support <br>• Assisted in resolving merge conflicts |

---

## Demo Video

👉 [Click to Watch the Full Application Demo](https://drive.google.com/file/d/1mbimvtCUj9GBU7yLRP_66JWbDeskONGP/view?usp=sharing)
