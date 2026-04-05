# server/rag_service/course_pipeline.py
"""
Unified Course Ingestion Pipeline

Orchestrates:
1. Syllabus CSV → Neo4j curriculum graph (Module→Topic→Subtopic)
2. Course materials → Qdrant with topic metadata linking
3. Topic context queries for Tutor Mode
"""

import os
import logging
from typing import Dict, List, Optional, Any

import config

logger = logging.getLogger(__name__)

# Import dependent modules
try:
    import curriculum_graph_handler
except ImportError as e:
    logger.warning(f"Failed to import curriculum_graph_handler: {e}")
    curriculum_graph_handler = None

try:
    import syllabus_qdrant_linker
except ImportError as e:
    logger.warning(f"Failed to import syllabus_qdrant_linker: {e}")
    syllabus_qdrant_linker = None

try:
    import ai_core
except ImportError as e:
    logger.warning(f"Failed to import ai_core: {e}")
    ai_core = None

try:
    import vector_db_service
except ImportError as e:
    logger.warning(f"Failed to import vector_db_service: {e}")
    vector_db_service = None


# ============================================================================
# UNIFIED COURSE INGESTION
# ============================================================================

def ingest_course(
    course_name: str,
    syllabus_csv_path: str,
    materials_folder: str,
    user_id: str = "admin"
) -> Dict[str, Any]:
    """
    One-step course ingestion pipeline.
    
    1. Parse syllabus CSV → build Neo4j graph (Module→Topic→Subtopic)
    2. Scan materials folder → ingest to Qdrant with topic metadata
    3. Return combined summary
    
    Args:
        course_name: Course identifier (e.g., "Machine Learning")
        syllabus_csv_path: Path to unified syllabus CSV
        materials_folder: Path to folder containing PDFs (R1.pdf, R2.pdf, etc.)
        user_id: User ID for Qdrant metadata (default: "admin")
    
    Returns:
        Combined ingestion summary with Neo4j and Qdrant stats
    """
    result = {
        "success": False,
        "course_name": course_name,
        "neo4j": {},
        "qdrant": {},
        "errors": []
    }
    
    # Validate inputs
    if not os.path.exists(syllabus_csv_path):
        result["errors"].append(f"Syllabus CSV not found: {syllabus_csv_path}")
        return result
    
    if not os.path.isdir(materials_folder):
        result["errors"].append(f"Materials folder not found: {materials_folder}")
        return result
    
    # ---- Phase 1: Build Neo4j Curriculum Graph ----
    logger.info(f"[Course Pipeline] Phase 1: Building Neo4j graph for '{course_name}'")
    
    if not curriculum_graph_handler:
        result["errors"].append("curriculum_graph_handler not available")
        return result
    
    try:
        neo4j_result = curriculum_graph_handler.ingest_from_unified_csv(
            course_name, syllabus_csv_path
        )
        result["neo4j"] = {
            "modules_created": neo4j_result.get("modules_created", 0),
            "topics_created": neo4j_result.get("topics_created", 0),
            "subtopics_created": neo4j_result.get("subtopics_created", 0),
            "precedes_relationships": neo4j_result.get("precedes_relationships", 0),
            "has_topic_relationships": neo4j_result.get("has_topic_relationships", 0),
            "prerequisite_of_relationships": neo4j_result.get("prerequisite_of_relationships", 0)
        }
        logger.info(f"[Course Pipeline] Neo4j graph created: {result['neo4j']}")
    except Exception as e:
        logger.error(f"[Course Pipeline] Neo4j ingestion failed: {e}", exc_info=True)
        result["errors"].append(f"Neo4j ingestion failed: {str(e)}")
        return result
    
    # ---- Phase 2: Ingest Materials to Qdrant with Syllabus Linking ----
    logger.info(f"[Course Pipeline] Phase 2: Ingesting materials to Qdrant")
    
    if not syllabus_qdrant_linker or not ai_core or not vector_db_service:
        missing = []
        if not syllabus_qdrant_linker: missing.append("syllabus_qdrant_linker")
        if not ai_core: missing.append("ai_core")
        if not vector_db_service: missing.append("vector_db_service")
        result["errors"].append(f"Missing modules: {', '.join(missing)}")
        # Still return partial success with Neo4j
        result["success"] = True
        result["qdrant"] = {"status": "skipped", "reason": "Missing Qdrant modules"}
        return result
    
    try:
        # Load syllabus for linking
        linker = syllabus_qdrant_linker.SyllabusQdrantLinker()
        num_entries = linker.load_syllabus(syllabus_csv_path, course_name)
        logger.info(f"[Course Pipeline] Loaded {num_entries} syllabus entries for linking")
        
        # Get resource summary
        resource_summary = linker.get_resource_summary()
        logger.info(f"[Course Pipeline] Resources in syllabus: {list(resource_summary.keys())}")
        
        # Scan and process documents
        qdrant_stats = {
            "syllabus_entries_loaded": num_entries,
            "resources_in_syllabus": list(resource_summary.keys()),
            "documents_processed": [],
            "documents_skipped": [],
            "total_chunks_added": 0
        }
        
        supported_extensions = ['.pdf', '.docx', '.pptx', '.txt']
        
        for filename in os.listdir(materials_folder):
            file_ext = os.path.splitext(filename)[1].lower()
            if file_ext not in supported_extensions:
                continue
            
            file_path = os.path.join(materials_folder, filename)
            
            # Get syllabus context for this document
            syllabus_ctx = linker.get_context_for_document(filename)
            
            doc_result = {
                "filename": filename,
                "syllabus_linked": syllabus_ctx is not None
            }
            
            if syllabus_ctx:
                doc_result["syllabus_context"] = {
                    "module": syllabus_ctx.module,
                    "topic": syllabus_ctx.topic,
                    "lecture_number": syllabus_ctx.lecture_number
                }
            
            try:
                # Process document
                processed_chunks, raw_text, kg_chunks = ai_core.process_document_for_qdrant(
                    file_path=file_path,
                    original_name=filename,
                    user_id=user_id
                )
                
                # Inject syllabus metadata into each chunk
                enriched_metadata = linker.enrich_metadata_with_syllabus({}, filename)
                for chunk in processed_chunks:
                    if chunk.get('metadata'):
                        for key, value in enriched_metadata.items():
                            if key.startswith('syllabus_'):
                                chunk['metadata'][key] = value
                        # Also add course_name for multi-course support
                        chunk['metadata']['course_name'] = course_name
                
                # Add to Qdrant
                if processed_chunks:
                    num_added = vector_db_service.add_processed_chunks(processed_chunks)
                    doc_result["chunks_added"] = num_added
                    qdrant_stats["total_chunks_added"] += num_added
                else:
                    doc_result["chunks_added"] = 0
                
                doc_result["status"] = "success"
                qdrant_stats["documents_processed"].append(doc_result)
                
            except Exception as e:
                logger.error(f"[Course Pipeline] Error processing '{filename}': {e}", exc_info=True)
                doc_result["status"] = "error"
                doc_result["error"] = str(e)
                qdrant_stats["documents_skipped"].append(doc_result)
        
        result["qdrant"] = qdrant_stats
        
    except Exception as e:
        logger.error(f"[Course Pipeline] Qdrant ingestion failed: {e}", exc_info=True)
        result["errors"].append(f"Qdrant ingestion failed: {str(e)}")
    
    result["success"] = True
    logger.info(f"[Course Pipeline] Ingestion complete for '{course_name}'")
    return result


# ============================================================================
# TOPIC CONTEXT FOR TUTOR MODE
# ============================================================================

def get_topic_context(course: str, topic_id: str) -> Dict[str, Any]:
    """
    Get combined curriculum + RAG context for Tutor Mode.
    
    Returns:
        - neo4j: topic info, prerequisites, next topic
        - qdrant: relevant document chunks for the topic
    """
    result = {
        "course": course,
        "topic_id": topic_id,
        "topic": None,
        "prerequisites": [],
        "next_topic": None,
        "qdrant_chunks": []
    }
    
    if not curriculum_graph_handler:
        return result
    
    try:
        # Get topic info from curriculum
        prerequisites = curriculum_graph_handler.get_topic_prerequisites(course, topic_id)
        result["prerequisites"] = prerequisites
        
        # Get next topic in learning path
        learning_path = curriculum_graph_handler.get_learning_path(course, topic_id)
        if learning_path:
            # Find current topic and get next
            for i, item in enumerate(learning_path):
                if item.get('id') == topic_id and i + 1 < len(learning_path):
                    result["next_topic"] = learning_path[i + 1]
                    break
        
        # Get topic name from curriculum
        curriculum = curriculum_graph_handler.traverse_curriculum(course)
        for module in curriculum.get('modules', []):
            for topic in module.get('topics', []):
                if topic.get('id') == topic_id:
                    result["topic"] = {
                        "id": topic_id,
                        "name": topic.get('name'),
                        "module_id": module.get('id'),
                        "module_name": module.get('name')
                    }
                    break
        
    except Exception as e:
        logger.error(f"[Course Pipeline] Error getting topic context: {e}", exc_info=True)
    
    # Get Qdrant chunks for this topic (search by topic name)
    if vector_db_service and result.get("topic"):
        try:
            topic_name = result["topic"].get("name", "")
            if topic_name:
                # Search Qdrant for chunks related to this topic
                chunks = vector_db_service.query_documents(
                    query_text=topic_name,
                    user_id="admin",  # Admin documents
                    top_k=5
                )
                result["qdrant_chunks"] = [
                    {
                        "text": c.get("content", c.get("text", "")),
                        "score": c.get("score", 0),
                        "metadata": c.get("metadata", {})
                    }
                    for c in chunks
                ]
        except Exception as e:
            logger.error(f"[Course Pipeline] Error querying Qdrant: {e}")
    
    return result


def get_next_curriculum_item(course: str, current_topic_id: str) -> Optional[Dict[str, Any]]:
    """
    Get the next topic/subtopic/module in curriculum sequence.
    Used for auto-advance after mastery.
    
    Returns:
        Next item dict or None if course is complete
    """
    if not curriculum_graph_handler:
        return None
    
    try:
        curriculum = curriculum_graph_handler.traverse_curriculum(course)
        modules = curriculum.get('modules', [])
        
        # Find current topic and return next
        found_current = False
        for module in modules:
            for topic in module.get('topics', []):
                if found_current:
                    # This is the next topic
                    return {
                        "type": "topic",
                        "id": topic.get('id'),
                        "name": topic.get('name'),
                        "module_id": module.get('id'),
                        "module_name": module.get('name')
                    }
                if topic.get('id') == current_topic_id:
                    found_current = True
            
            # If we found current topic but no more topics in this module,
            # move to next module's first topic
            if found_current and module != modules[-1]:
                next_module_idx = modules.index(module) + 1
                next_module = modules[next_module_idx]
                if next_module.get('topics'):
                    first_topic = next_module['topics'][0]
                    return {
                        "type": "topic",
                        "id": first_topic.get('id'),
                        "name": first_topic.get('name'),
                        "module_id": next_module.get('id'),
                        "module_name": next_module.get('name')
                    }
        
        # Course complete
        return None
        
    except Exception as e:
        logger.error(f"[Course Pipeline] Error getting next curriculum item: {e}", exc_info=True)
        return None


def detect_missing_prerequisites(
    course: str,
    topic_id: str,
    completed_subtopics: List[str]
) -> List[Dict[str, Any]]:
    """
    Check if student lacks prerequisites for a topic.
    
    Args:
        course: Course name
        topic_id: Current topic ID
        completed_subtopics: List of subtopic IDs the student has completed
    
    Returns:
        List of missing prerequisite subtopics to traverse back to
    """
    if not curriculum_graph_handler:
        return []
    
    try:
        # Get all prerequisites for this topic
        prerequisites = curriculum_graph_handler.get_topic_prerequisites(course, topic_id)
        
        # Find which ones are missing
        completed_set = set(completed_subtopics)
        missing = [
            prereq for prereq in prerequisites
            if prereq.get('id') not in completed_set
        ]
        
        return missing
        
    except Exception as e:
        logger.error(f"[Course Pipeline] Error detecting missing prerequisites: {e}", exc_info=True)
        return []


def get_curriculum_visualization(course: str) -> Dict[str, Any]:
    """
    Get curriculum data formatted for visualization.
    Returns nodes and edges for graph display.
    
    Used by admin to visualize the curriculum graph with Qdrant connections.
    """
    if not curriculum_graph_handler:
        return {"nodes": [], "edges": [], "error": "curriculum_graph_handler not available"}
    
    try:
        # Get curriculum structure
        curriculum = curriculum_graph_handler.traverse_curriculum(course)
        
        nodes = []
        edges = []
        
        # Add module nodes
        modules = curriculum.get('modules', [])
        for i, module in enumerate(modules):
            module_id = module.get('id')
            nodes.append({
                "id": module_id,
                "label": module.get('name'),
                "type": "module",
                "order": module.get('order', i)
            })
            
            # Add PRECEDES edges between modules
            if i > 0:
                prev_module = modules[i - 1]
                edges.append({
                    "from": prev_module.get('id'),
                    "to": module_id,
                    "type": "PRECEDES"
                })
            
            # Add topic nodes
            for topic in module.get('topics', []):
                topic_id = topic.get('id')
                nodes.append({
                    "id": topic_id,
                    "label": topic.get('name'),
                    "type": "topic",
                    "module_id": module_id
                })
                
                # Add HAS_TOPIC edge
                edges.append({
                    "from": module_id,
                    "to": topic_id,
                    "type": "HAS_TOPIC"
                })
                
                # Add prerequisite nodes and edges
                for prereq in topic.get('prerequisites', []):
                    prereq_id = prereq.get('id')
                    # Check if node already exists
                    if not any(n['id'] == prereq_id for n in nodes):
                        nodes.append({
                            "id": prereq_id,
                            "label": prereq.get('name'),
                            "type": "subtopic",
                            "topic_id": topic_id
                        })
                    
                    edges.append({
                        "from": prereq_id,
                        "to": topic_id,
                        "type": "PREREQUISITE_OF"
                    })
        
        # Add Qdrant document counts per topic (if available)
        if vector_db_service:
            for node in nodes:
                if node['type'] == 'topic':
                    try:
                        # Count documents linked to this topic
                        # This is a simplified check - in production you'd query by metadata filter
                        node['qdrant_doc_count'] = 0  # Placeholder
                    except:
                        pass
        
        return {
            "course": course,
            "nodes": nodes,
            "edges": edges,
            "stats": {
                "total_modules": len([n for n in nodes if n['type'] == 'module']),
                "total_topics": len([n for n in nodes if n['type'] == 'topic']),
                "total_subtopics": len([n for n in nodes if n['type'] == 'subtopic']),
                "total_edges": len(edges)
            }
        }
        
    except Exception as e:
        logger.error(f"[Course Pipeline] Error getting curriculum visualization: {e}", exc_info=True)
        return {"nodes": [], "edges": [], "error": str(e)}
