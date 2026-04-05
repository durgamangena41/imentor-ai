# server/rag_service/syllabus_graph_handler.py
"""
Syllabus Graph Handler - Stream 2: Syllabus-to-Graph Mapper

⚠️ DEPRECATED: This module uses a flat :Concept node structure. 
For new implementations, use curriculum_graph_handler.py which provides:
- Proper Module → Topic → Subtopic hierarchy
- PRECEDES relationships between modules
- HAS_TOPIC relationships from modules to topics
- PREREQUISITE_OF relationships from subtopics to topics

This module is kept for backwards compatibility only.

Handles parsing of syllabus CSV files and building curriculum graphs in Neo4j.
Creates (:Concept) nodes and [:PREREQUISITE_OF] relationships.

This module is course-agnostic and can handle any future syllabus.
"""

import csv
import re
import logging
import warnings
from typing import List, Dict, Optional
import config

logger = logging.getLogger(__name__)

# Import Neo4j driver management from existing handler
try:
    from neo4j_handler import get_driver_instance
except ImportError:
    logger.error("Failed to import Neo4j driver from neo4j_handler")
    get_driver_instance = None


def normalize_concept_id(course: str, topic: str) -> str:
    """
    Generate a deterministic concept ID from course and topic.
    
    Rule: {course}_{topic} → lowercase → replace spaces/special chars with "_"
    
    Example:
        "Machine Learning" + "Supervised Learning" 
        → "machine_learning_supervised_learning"
    """
    combined = f"{course}_{topic}"
    # Lowercase and replace non-alphanumeric chars with underscores
    normalized = re.sub(r'[^a-zA-Z0-9]+', '_', combined.lower())
    # Remove leading/trailing underscores and collapse multiple underscores
    normalized = re.sub(r'_+', '_', normalized).strip('_')
    return normalized


# --- CSV Format Detection and Column Mapping ---

# Column name mappings for different CSV formats
COLUMN_MAPPINGS = {
    # Lecture-based format
    'lecture_topic': 'topic',
    'lecture_number': 'lecture_number',
    'module': 'unit',
    'subtopics': '_ignore',
    'resources': '_ignore',
    # Standard format (already normalized)
    'topic': 'topic',
    'unit': 'unit',
    'prerequisite': 'prerequisite',
}


def _detect_csv_format(fieldnames: List[str]) -> str:
    """
    Detect the CSV format based on column names.
    
    Returns:
        'lecture_based' - Has Lecture Topic, Lecture Number, Module columns
        'standard' - Has topic, unit, prerequisite columns
        'unknown' - Unrecognized format
    """
    normalized_names = {name.strip().lower().replace(' ', '_') for name in fieldnames}
    
    # Check for lecture-based format
    if 'lecture_topic' in normalized_names and 'lecture_number' in normalized_names:
        return 'lecture_based'
    
    # Check for standard format
    if 'topic' in normalized_names:
        return 'standard'
    
    return 'unknown'


def _normalize_column_name(name: str) -> str:
    """Normalize a column name for consistent mapping."""
    return name.strip().lower().replace(' ', '_')


def _map_row_to_concept(row: Dict, fieldnames: List[str], csv_format: str) -> Optional[Dict]:
    """
    Map a CSV row to a concept dictionary based on the detected format.
    
    Returns:
        Concept dict with keys: unit, topic, lecture_number (optional), prerequisite (optional)
        None if the row should be skipped
    """
    # Create normalized fieldname mapping
    field_map = {_normalize_column_name(k): k for k in fieldnames}
    
    # Extract values using the mapping
    def get_value(normalized_key: str) -> str:
        original_key = field_map.get(normalized_key)
        if original_key and original_key in row:
            val = row[original_key]
            return val.strip() if val else ''
        return ''
    
    concept = {
        'unit': '',
        'topic': '',
        'lecture_number': None,
        'prerequisite': None
    }
    
    if csv_format == 'lecture_based':
        concept['topic'] = get_value('lecture_topic')
        concept['unit'] = get_value('module')
        
        # Parse lecture number for ordering
        lecture_num_str = get_value('lecture_number')
        if lecture_num_str:
            try:
                # Handle formats like "1", "01", "Lecture 1", etc.
                num_match = re.search(r'\d+', lecture_num_str)
                if num_match:
                    concept['lecture_number'] = int(num_match.group())
            except ValueError:
                pass
                
    elif csv_format == 'standard':
        concept['topic'] = get_value('topic')
        concept['unit'] = get_value('unit')
        concept['prerequisite'] = get_value('prerequisite') or None
    
    # Skip rows without a topic
    if not concept['topic']:
        return None
    
    return concept


def _infer_prerequisites_from_order(concepts: List[Dict]) -> List[Dict]:
    """
    Infer prerequisites based on lecture order within each module/unit.
    
    Logic:
    - Sort by lecture_number (ascending) within each unit
    - Lecture 1 → no prerequisite
    - Lecture N → prerequisite = Lecture N-1 (same module)
    
    Returns:
        Concepts list with inferred prerequisites
    """
    if not concepts:
        return concepts
    
    # Check if any concepts have lecture numbers
    has_lecture_numbers = any(c.get('lecture_number') is not None for c in concepts)
    
    if not has_lecture_numbers:
        logger.info("No lecture numbers found, skipping prerequisite inference")
        return concepts
    
    # Group by unit/module
    units = {}
    for concept in concepts:
        unit = concept.get('unit', 'default')
        if unit not in units:
            units[unit] = []
        units[unit].append(concept)
    
    # Sort each unit by lecture number and infer prerequisites
    result = []
    for unit_name, unit_concepts in units.items():
        # Sort by lecture number (concepts without lecture_number go to the end)
        sorted_concepts = sorted(
            unit_concepts,
            key=lambda c: (c.get('lecture_number') is None, c.get('lecture_number') or 0)
        )
        
        previous_topic = None
        for concept in sorted_concepts:
            # If no explicit prerequisite, infer from previous lecture
            if concept.get('prerequisite') is None and previous_topic:
                concept['prerequisite'] = previous_topic
                logger.debug(f"Inferred prerequisite: '{previous_topic}' → '{concept['topic']}'")
            
            previous_topic = concept['topic']
            result.append(concept)
    
    inferred_count = sum(1 for c in result if c.get('prerequisite'))
    logger.info(f"Inferred {inferred_count} prerequisites from lecture order")
    
    return result


def parse_syllabus_csv(file_path: str) -> List[Dict]:
    """
    Parse a syllabus CSV file into concept objects.
    
    Supports multiple CSV formats:
    1. Lecture-based: Lecture Topic, Lecture Number, Module, Subtopics, Resources
    2. Standard: unit, topic, prerequisite
    
    For lecture-based format, prerequisites are inferred from lecture order.
    
    Returns:
        List of concept dictionaries with keys:
        - unit: str
        - topic: str  
        - prerequisite: str or None
    """
    concepts = []
    
    # Try multiple encodings to handle Windows-specific characters
    encodings_to_try = ['utf-8-sig', 'utf-8', 'latin-1', 'cp1252']
    content = None
    
    for encoding in encodings_to_try:
        try:
            with open(file_path, 'r', encoding=encoding) as f:
                content = f.read()
            logger.info(f"Successfully read CSV with encoding: {encoding}")
            break
        except UnicodeDecodeError:
            logger.debug(f"Encoding {encoding} failed, trying next...")
            continue
    
    if content is None:
        raise ValueError(f"Could not read CSV file with any supported encoding")
    
    try:
        import io
        
        # Detect delimiter from content
        sample = content[:2048]
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=',;\t')
        except csv.Error:
            dialect = csv.excel  # Default to comma-separated
        
        reader = csv.DictReader(io.StringIO(content), dialect=dialect)
        
        if not reader.fieldnames:
            logger.error("CSV file has no headers")
            return []
        
        # Detect CSV format
        csv_format = _detect_csv_format(reader.fieldnames)
        logger.info(f"Detected CSV format: {csv_format}")
        logger.info(f"CSV columns: {reader.fieldnames}")
        
        if csv_format == 'unknown':
            logger.warning(
                f"Unknown CSV format. Expected columns: "
                f"[Lecture Topic, Lecture Number, Module] or [topic, unit, prerequisite]. "
                f"Found: {reader.fieldnames}"
            )
            # Try to proceed with standard format as fallback
            csv_format = 'standard'
        
        for row_num, row in enumerate(reader, start=2):
            concept = _map_row_to_concept(row, reader.fieldnames, csv_format)
            
            if concept:
                concepts.append(concept)
                logger.debug(f"Row {row_num}: Parsed concept '{concept['topic']}'")
            else:
                logger.warning(f"Row {row_num}: Missing topic, skipping")
    
        # Infer prerequisites from lecture order if not explicitly provided
        if csv_format == 'lecture_based':
            concepts = _infer_prerequisites_from_order(concepts)
        
        logger.info(f"Parsed {len(concepts)} concepts from syllabus CSV ({csv_format} format)")
        
        # Log summary of parsed concepts
        for concept in concepts:
            prereq_info = f" (prereq: {concept['prerequisite']})" if concept.get('prerequisite') else ""
            logger.debug(f"  - [{concept.get('unit', 'N/A')}] {concept['topic']}{prereq_info}")
        
        return concepts
        
    except FileNotFoundError:
        logger.error(f"Syllabus CSV file not found: {file_path}")
        raise
    except Exception as e:
        logger.error(f"Error parsing syllabus CSV: {e}", exc_info=True)
        raise



def _build_graph_transactional(tx, course_name: str, concepts: List[Dict]) -> Dict:
    """
    Transactional function to build the syllabus graph in Neo4j.
    
    Creates:
    - (:Concept {id, name, unit, course}) nodes
    - [:PREREQUISITE_OF] relationships
    """
    nodes_created = 0
    edges_created = 0
    
    # First pass: Create all concept nodes
    for concept in concepts:
        concept_id = normalize_concept_id(course_name, concept['topic'])
        
        # MERGE the concept node
        merge_query = """
        MERGE (c:Concept {id: $id})
        ON CREATE SET 
            c.name = $name,
            c.unit = $unit,
            c.course = $course,
            c.createdAt = datetime()
        ON MATCH SET
            c.name = $name,
            c.unit = $unit,
            c.course = $course,
            c.updatedAt = datetime()
        RETURN c
        """
        result = tx.run(
            merge_query,
            id=concept_id,
            name=concept['topic'],
            unit=concept['unit'],
            course=course_name
        )
        if result.single():
            nodes_created += 1
    
    # Second pass: Create prerequisite relationships
    for concept in concepts:
        if not concept['prerequisite']:
            continue
            
        topic_id = normalize_concept_id(course_name, concept['topic'])
        prereq_id = normalize_concept_id(course_name, concept['prerequisite'])
        
        # First, ensure the prerequisite node exists (in case it wasn't in the CSV)
        merge_prereq_query = """
        MERGE (p:Concept {id: $prereq_id})
        ON CREATE SET 
            p.name = $prereq_name,
            p.course = $course,
            p.createdAt = datetime()
        """
        tx.run(
            merge_prereq_query,
            prereq_id=prereq_id,
            prereq_name=concept['prerequisite'],
            course=course_name
        )
        
        # Create the PREREQUISITE_OF relationship
        # Direction: prerequisite -[:PREREQUISITE_OF]-> concept
        # Meaning: You must understand the prerequisite before the concept
        rel_query = """
        MATCH (prereq:Concept {id: $prereq_id})
        MATCH (concept:Concept {id: $concept_id})
        MERGE (prereq)-[r:PREREQUISITE_OF]->(concept)
        RETURN r
        """
        result = tx.run(
            rel_query,
            prereq_id=prereq_id,
            concept_id=topic_id
        )
        if result.single():
            edges_created += 1
    
    return {
        'nodes_created': nodes_created,
        'edges_created': edges_created
    }


def build_syllabus_graph(course_name: str, concepts: List[Dict]) -> Dict:
    """
    DEPRECATED: Use curriculum_graph_handler.build_curriculum_graph() instead.
    
    Build a curriculum graph in Neo4j from parsed syllabus concepts.
    
    Args:
        course_name: Name of the course (e.g., "Machine Learning")
        concepts: List of concept dictionaries from parse_syllabus_csv()
        
    Returns:
        Dictionary with success status and counts
    """
    if not get_driver_instance:
        raise ConnectionError("Neo4j driver not available")
    
    if not concepts:
        return {
            'success': True,
            'message': 'No concepts to process',
            'nodes_created': 0,
            'edges_created': 0
        }
    
    try:
        driver = get_driver_instance()
        
        with driver.session(database=config.NEO4J_DATABASE) as session:
            result = session.execute_write(
                _build_graph_transactional, 
                course_name, 
                concepts
            )
        
        logger.info(
            f"Syllabus graph built for course '{course_name}': "
            f"{result['nodes_created']} nodes, {result['edges_created']} edges"
        )
        
        return {
            'success': True,
            'message': f"Syllabus graph created for '{course_name}'",
            'course': course_name,
            'nodes_created': result['nodes_created'],
            'edges_created': result['edges_created']
        }
        
    except Exception as e:
        logger.error(f"Error building syllabus graph: {e}", exc_info=True)
        raise


def get_course_concepts(course_name: str) -> List[Dict]:
    """
    Retrieve all concepts for a given course from Neo4j.
    
    Args:
        course_name: Name of the course
        
    Returns:
        List of concept dictionaries
    """
    if not get_driver_instance:
        raise ConnectionError("Neo4j driver not available")
    
    try:
        driver = get_driver_instance()
        
        with driver.session(database=config.NEO4J_DATABASE) as session:
            result = session.run(
                """
                MATCH (c:Concept {course: $course})
                OPTIONAL MATCH (prereq:Concept)-[:PREREQUISITE_OF]->(c)
                RETURN c.id AS id, c.name AS name, c.unit AS unit, 
                       COLLECT(prereq.name) AS prerequisites
                ORDER BY c.unit, c.name
                """,
                course=course_name
            )
            
            concepts = [dict(record) for record in result]
            
        logger.info(f"Retrieved {len(concepts)} concepts for course '{course_name}'")
        return concepts
        
    except Exception as e:
        logger.error(f"Error retrieving course concepts: {e}", exc_info=True)
        raise


def delete_course_graph(course_name: str) -> bool:
    """
    Delete all concepts and relationships for a given course.
    
    Args:
        course_name: Name of the course to delete
        
    Returns:
        True if deletion was successful
    """
    if not get_driver_instance:
        raise ConnectionError("Neo4j driver not available")
    
    try:
        driver = get_driver_instance()
        
        with driver.session(database=config.NEO4J_DATABASE) as session:
            result = session.run(
                """
                MATCH (c:Concept {course: $course})
                DETACH DELETE c
                RETURN count(c) AS deleted_count
                """,
                course=course_name
            )
            record = result.single()
            deleted_count = record['deleted_count'] if record else 0
            
        logger.info(f"Deleted {deleted_count} concepts for course '{course_name}'")
        return True
        
    except Exception as e:
        logger.error(f"Error deleting course graph: {e}", exc_info=True)
        raise
