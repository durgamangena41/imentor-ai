# RAG System with Qdrant Integration

## Overview

The Retrieval-Augmented Generation (RAG) system enhances AI responses by retrieving relevant context from uploaded documents. It uses **Qdrant** as the vector database to store and query document embeddings efficiently.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    DOCUMENT INGESTION FLOW                       │
└─────────────────────────────────────────────────────────────────┘

     ┌──────────┐     ┌──────────┐     ┌──────────┐
     │   PDF    │     │   DOCX   │     │   MP4    │
     │   TXT    │     │    MD    │     │   MP3    │
     │  Scanned │     │   URL    │     │ YouTube  │
     └────┬─────┘     └────┬─────┘     └────┬─────┘
          │                │                │
          └────────────────┼────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      ai_core.py                                  │
│                                                                  │
│   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐          │
│   │  EXTRACTION │   │     OCR     │   │ TRANSCRIBE  │          │
│   │  pdfplumber │   │  Tesseract  │   │   Whisper   │          │
│   │  python-docx│   │             │   │             │          │
│   └──────┬──────┘   └──────┬──────┘   └──────┬──────┘          │
│          │                 │                 │                   │
│          └─────────────────┼─────────────────┘                   │
│                            │                                     │
│                            ▼                                     │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                      CLEANING                            │   │
│   │   - Remove noise, headers/footers                        │   │
│   │   - Lemmatization (spaCy)                                │   │
│   │   - Table → Markdown conversion                          │   │
│   └─────────────────────────────────────────────────────────┘   │
│                            │                                     │
│                            ▼                                     │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                      CHUNKING                            │   │
│   │   - Semantic chunking (by section/paragraph)             │   │
│   │   - Overlap for context preservation                     │   │
│   │   - Metadata attachment                                  │   │
│   └─────────────────────────────────────────────────────────┘   │
│                            │                                     │
│                            ▼                                     │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                     EMBEDDING                            │   │
│   │   - Sentence Transformers (all-MiniLM-L6-v2)            │   │
│   │   - 384-dimensional vectors                              │   │
│   └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    QDRANT VECTOR DATABASE                        │
│                                                                  │
│   Collection: user_{userId}_documents                           │
│                                                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  Point ID: uuid                                          │   │
│   │  Vector: [0.12, -0.34, 0.56, ...]  (384 dimensions)      │   │
│   │  Payload: {                                               │   │
│   │      text: "chunk content...",                           │   │
│   │      source: "document.pdf",                             │   │
│   │      page: 5,                                             │   │
│   │      chunk_index: 12,                                     │   │
│   │      module: "Module I",                                  │   │
│   │      topic: "Neural Networks"                            │   │
│   │  }                                                        │   │
│   └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## File Locations

| File | Location | Purpose |
|------|----------|---------|
| `ai_core.py` | `server/rag_service/` | Main document processing pipeline |
| `qdrant_service.py` | `server/rag_service/` | Qdrant connection and operations |
| `query_service.py` | `server/rag_service/` | Query processing and retrieval |
| `syllabus_qdrant_linker.py` | `server/rag_service/` | Links chunks to syllabus metadata |
| `config.py` | `server/rag_service/` | Configuration settings |

## Supported File Types

| Category | Formats | Processing Method |
|----------|---------|-------------------|
| Documents | PDF, DOCX, TXT, MD | Text extraction (pdfplumber, python-docx) |
| Scanned Documents | PDF (image-based) | OCR (Tesseract) |
| Media | MP3, MP4 | Audio transcription (Whisper) |
| Web | URLs, YouTube links | Web scraping, transcript extraction |

## Ingestion Pipeline

### Step 1: Extraction

```python
# ai_core.py
def extract_content(file_path: str, file_type: str) -> dict:
    """Extract text, tables, and images from document."""
    
    if file_type == 'pdf':
        with pdfplumber.open(file_path) as pdf:
            text_content = []
            tables = []
            
            for page in pdf.pages:
                text_content.append(page.extract_text())
                tables.extend(page.extract_tables())
                
        return {
            'text': '\n'.join(text_content),
            'tables': tables,
            'is_scanned': detect_scanned_pdf(pdf)
        }
```

### Step 2: OCR (For Scanned Documents)

```python
def ocr_document(file_path: str) -> str:
    """Use Tesseract for scanned documents."""
    
    images = convert_from_path(file_path)
    extracted_text = []
    
    for image in images:
        text = pytesseract.image_to_string(image)
        extracted_text.append(text)
    
    return '\n'.join(extracted_text)
```

### Step 3: Cleaning

```python
def clean_text(text: str) -> str:
    """Clean and normalize extracted text."""
    
    # Load spaCy model
    nlp = spacy.load('en_core_web_sm')
    doc = nlp(text)
    
    # Lemmatization
    cleaned = ' '.join([token.lemma_ for token in doc 
                       if not token.is_stop and not token.is_punct])
    
    return cleaned
```

### Step 4: Chunking

```python
def chunk_document(text: str, chunk_size: int = 500, overlap: int = 50) -> list:
    """Split text into overlapping chunks."""
    
    chunks = []
    sentences = text.split('.')
    current_chunk = []
    current_length = 0
    
    for sentence in sentences:
        if current_length + len(sentence) > chunk_size:
            chunks.append(' '.join(current_chunk))
            # Keep overlap
            current_chunk = current_chunk[-2:]  
            current_length = sum(len(s) for s in current_chunk)
        
        current_chunk.append(sentence)
        current_length += len(sentence)
    
    return chunks
```

### Step 5: Embedding

```python
from sentence_transformers import SentenceTransformer

model = SentenceTransformer('all-MiniLM-L6-v2')

def embed_chunks(chunks: list) -> list:
    """Generate embeddings for text chunks."""
    embeddings = model.encode(chunks)
    return embeddings.tolist()
```

### Step 6: Storage in Qdrant

```python
from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct, VectorParams

def store_in_qdrant(user_id: str, chunks: list, embeddings: list, metadata: dict):
    """Store embeddings in Qdrant."""
    
    client = QdrantClient(host="localhost", port=6333)
    collection_name = f"user_{user_id}_documents"
    
    # Create collection if not exists
    client.recreate_collection(
        collection_name=collection_name,
        vectors_config=VectorParams(size=384, distance="Cosine")
    )
    
    # Insert points
    points = [
        PointStruct(
            id=str(uuid.uuid4()),
            vector=embedding,
            payload={
                "text": chunk,
                "source": metadata["source"],
                "page": metadata.get("page", 0),
                "chunk_index": i
            }
        )
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings))
    ]
    
    client.upsert(collection_name=collection_name, points=points)
```

## Syllabus Linking

The `syllabus_qdrant_linker.py` enriches chunk metadata with syllabus information:

```python
def link_chunk_to_syllabus(chunk_text: str, syllabus_topics: list) -> dict:
    """Link a chunk to relevant syllabus topics."""
    
    # Use embedding similarity to find matching topics
    chunk_embedding = model.encode(chunk_text)
    topic_embeddings = model.encode(syllabus_topics)
    
    similarities = cosine_similarity([chunk_embedding], topic_embeddings)[0]
    best_match_idx = similarities.argmax()
    
    if similarities[best_match_idx] > 0.5:  # Threshold
        return {
            "matched_topic": syllabus_topics[best_match_idx],
            "confidence": float(similarities[best_match_idx])
        }
    
    return {"matched_topic": None, "confidence": 0.0}
```

## Query Flow

```
┌─────────────────┐
│   User Query    │
│ "What is GD?"   │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     QUERY SERVICE                                │
│                                                                  │
│   1. Embed query using same model                               │
│   2. Search Qdrant for similar chunks                           │
│   3. Re-rank results by relevance                               │
│   4. Return top-k chunks as context                             │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      LLM RESPONSE                                │
│                                                                  │
│   System: You are an AI tutor. Use the following context:       │
│   [Retrieved chunks from Qdrant]                                │
│                                                                  │
│   User: What is GD?                                             │
│                                                                  │
│   AI: Based on your course materials, Gradient Descent is...    │
└─────────────────────────────────────────────────────────────────┘
```

### Query Code

```python
def query_documents(user_id: str, query: str, top_k: int = 5) -> list:
    """Retrieve relevant chunks for a query."""
    
    client = QdrantClient(host="localhost", port=6333)
    collection_name = f"user_{user_id}_documents"
    
    # Embed query
    query_embedding = model.encode(query).tolist()
    
    # Search
    results = client.search(
        collection_name=collection_name,
        query_vector=query_embedding,
        limit=top_k
    )
    
    return [
        {
            "text": hit.payload["text"],
            "source": hit.payload["source"],
            "score": hit.score
        }
        for hit in results
    ]
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/add_document` | Ingest a new document |
| `POST` | `/query` | Query documents for relevant context |
| `GET` | `/documents` | List all ingested documents |
| `DELETE` | `/document/:id` | Remove a document from Qdrant |

### Add Document Request
```bash
POST /add_document
Content-Type: multipart/form-data

file: <document.pdf>
user_id: "user_123"
original_name: "machine_learning_notes.pdf"
```

### Query Request
```bash
POST /query
Content-Type: application/json

{
    "user_id": "user_123",
    "query": "Explain gradient descent",
    "top_k": 5
}
```

## Configuration

```python
# config.py
QDRANT_HOST = os.getenv("QDRANT_HOST", "localhost")
QDRANT_PORT = int(os.getenv("QDRANT_PORT", 6333))
EMBEDDING_MODEL = "all-MiniLM-L6-v2"
CHUNK_SIZE = 500
CHUNK_OVERLAP = 50
```

## Docker Setup

Qdrant runs as a Docker container:

```yaml
# docker-compose.yml
qdrant:
  image: qdrant/qdrant:latest
  ports:
    - "2003:6333"
  volumes:
    - qdrant_storage:/qdrant/storage
```

Access the Qdrant dashboard at: `http://localhost:2003/dashboard`

## Contributors

- **A R L S Hari Priya** (@HariPriya-2124) - RAG system, Qdrant integration, Syllabus linking
- **P Sai Karthik** (@Karthi-k235) - PDF element extraction

---

*Last Updated: January 2026*
