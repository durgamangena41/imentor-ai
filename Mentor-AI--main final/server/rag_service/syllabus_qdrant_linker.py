# server/rag_service/syllabus_qdrant_linker.py
"""
Syllabus-to-Qdrant Linker - Bridges Curriculum Graph with Vector Chunks

This module:
1. Parses syllabus CSV to extract resource→topic mappings
2. Links document chunks to syllabus context during ingestion
3. Provides lookup functions for RAG queries

The key insight is that syllabus CSVs contain "Resources" columns like:
    "R1 Ch1; R2 Metric" 
which map to PDF files like R1.pdf, R2.pdf in the materials folder.
"""

import csv
import re
import os
import logging
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, field

import config

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@dataclass
class ResourceReference:
    """A parsed reference to a resource from the syllabus."""
    resource_id: str       # e.g., "R1", "R2", "R8"
    chapter: Optional[str] = None   # e.g., "Ch1", "Ch4"
    lecture: Optional[str] = None   # e.g., "Lec5", "Lec3"
    extra_info: Optional[str] = None  # Any additional context


@dataclass
class SyllabusEntry:
    """A single row from the syllabus CSV."""
    module: str             # e.g., "Module 1", "Module 2"
    lecture_number: int     # e.g., 1, 2, 15
    topic: str              # e.g., "Introduction", "Backpropagation"
    subtopics: List[str]    # e.g., ["Definition", "history", "scope"]
    resources: List[ResourceReference]  # Parsed resource references
    
    # Computed fields
    module_order: int = 0   # Numeric order of the module


@dataclass
class SyllabusContext:
    """Syllabus context to be added to Qdrant chunk metadata."""
    module: str
    module_order: int
    topic: str
    lecture_number: int
    subtopics: List[str]
    chapter: Optional[str] = None
    lecture_ref: Optional[str] = None
    prerequisites: List[str] = field(default_factory=list)


class SyllabusQdrantLinker:
    """
    Links syllabus structure to document chunks for Qdrant ingestion.
    
    Usage:
        linker = SyllabusQdrantLinker()
        linker.load_syllabus("/path/to/syllabus.csv")
        
        # During document ingestion:
        ctx = linker.get_context_for_document("R1.pdf")
        if ctx:
            chunk_metadata['syllabus_module'] = ctx.module
            chunk_metadata['syllabus_topic'] = ctx.topic
            # etc.
    """
    
    def __init__(self):
        self.syllabus_entries: List[SyllabusEntry] = []
        # Map: resource_id → list of syllabus entries that reference it
        self.resource_to_entries: Dict[str, List[SyllabusEntry]] = {}
        self.loaded = False
        self.course_name: Optional[str] = None
    
    def load_syllabus(self, csv_path: str, course_name: str = "Unknown Course") -> int:
        """
        Load and parse a syllabus CSV file.
        
        Expected columns (flexible naming):
        - Module: "Module", "module", "Unit", etc.
        - Lecture Number: "Lecture Number", "lecture_number", "Order", etc.
        - Lecture Topic: "Lecture Topic", "Topic", "lecture_topic", etc.
        - Subtopics: "Subtopics", "subtopics", "Concepts", etc.
        - Resources: "Resources", "resources", "Materials", etc.
        
        Returns:
            Number of entries loaded
        """
        self.course_name = course_name
        self.syllabus_entries = []
        self.resource_to_entries = {}
        
        # Try multiple encodings
        encodings_to_try = ['utf-8-sig', 'utf-8', 'latin-1', 'cp1252']
        
        content = None
        for encoding in encodings_to_try:
            try:
                with open(csv_path, 'r', encoding=encoding) as f:
                    content = f.read()
                logger.info(f"Successfully read syllabus CSV with encoding: {encoding}")
                break
            except UnicodeDecodeError:
                continue
        
        if content is None:
            raise ValueError(f"Could not read CSV file with any supported encoding: {csv_path}")
        
        # Parse CSV from string
        import io
        reader = csv.DictReader(io.StringIO(content))
        
        if not reader.fieldnames:
            raise ValueError("CSV file has no headers")
        
        # Normalize field names for flexible column matching
        normalized_fields = {name.strip().lower().replace(' ', '_'): name for name in reader.fieldnames}
        
        # Define possible column names for each field
        module_keys = ['module', 'unit', 'section']
        lecture_num_keys = ['lecture_number', 'lecture_no', 'lecture', 'order', 'number']
        topic_keys = ['lecture_topic', 'topic', 'title', 'name', 'lecture_title']
        subtopic_keys = ['subtopics', 'subtopic', 'concepts', 'sub_topics', 'prerequisites']
        resource_keys = ['resources', 'resource', 'materials', 'refs', 'references']
        
        def find_column(possible_keys: List[str]) -> Optional[str]:
            for key in possible_keys:
                if key in normalized_fields:
                    return normalized_fields[key]
            return None
        
        module_col = find_column(module_keys)
        lecture_num_col = find_column(lecture_num_keys)
        topic_col = find_column(topic_keys)
        subtopic_col = find_column(subtopic_keys)
        resource_col = find_column(resource_keys)
        
        logger.info(f"Column mapping: module={module_col}, lecture={lecture_num_col}, "
                   f"topic={topic_col}, subtopics={subtopic_col}, resources={resource_col}")
        
        if not topic_col:
            raise ValueError(f"Could not find topic column. Headers: {reader.fieldnames}")
        
        module_order_map: Dict[str, int] = {}
        
        for row_num, row in enumerate(reader, start=2):
            try:
                # Extract module
                module_name = row.get(module_col, '').strip() if module_col else f"Module {row_num}"
                
                # Assign module order based on first appearance
                if module_name and module_name not in module_order_map:
                    module_order_map[module_name] = len(module_order_map) + 1
                
                module_order = module_order_map.get(module_name, 0)
                
                # Extract lecture number
                lecture_num = 0
                if lecture_num_col:
                    lecture_str = row.get(lecture_num_col, '')
                    if lecture_str:
                        num_match = re.search(r'\d+', str(lecture_str))
                        if num_match:
                            lecture_num = int(num_match.group())
                
                # Extract topic
                topic_name = row.get(topic_col, '').strip()
                if not topic_name:
                    logger.warning(f"Row {row_num}: Missing topic, skipping")
                    continue
                
                # Extract subtopics (comma-separated)
                subtopics: List[str] = []
                if subtopic_col:
                    subtopics_str = row.get(subtopic_col, '').strip()
                    if subtopics_str:
                        subtopics = [s.strip() for s in subtopics_str.split(',') if s.strip()]
                
                # Extract and parse resources
                resources: List[ResourceReference] = []
                if resource_col:
                    resources_str = row.get(resource_col, '').strip()
                    if resources_str:
                        resources = self._parse_resources(resources_str)
                
                entry = SyllabusEntry(
                    module=module_name,
                    lecture_number=lecture_num,
                    topic=topic_name,
                    subtopics=subtopics,
                    resources=resources,
                    module_order=module_order
                )
                
                self.syllabus_entries.append(entry)
                
                # Build resource→entries mapping
                for ref in resources:
                    if ref.resource_id not in self.resource_to_entries:
                        self.resource_to_entries[ref.resource_id] = []
                    self.resource_to_entries[ref.resource_id].append(entry)
                    
            except Exception as e:
                logger.warning(f"Error parsing row {row_num}: {e}")
                continue
        
        self.loaded = True
        logger.info(f"Loaded {len(self.syllabus_entries)} syllabus entries, "
                   f"{len(self.resource_to_entries)} unique resources")
        
        return len(self.syllabus_entries)
    
    def _parse_resources(self, resources_str: str) -> List[ResourceReference]:
        """
        Parse resource references from a string like:
        "R1 Ch1; R2 Lec5; R8 Ch6"
        
        Returns list of ResourceReference objects.
        """
        resources = []
        
        # Split by semicolon or comma
        parts = re.split(r'[;,]', resources_str)
        
        for part in parts:
            part = part.strip()
            if not part:
                continue
            
            # Pattern: R<number> followed by optional Ch<number> or Lec<number>
            # Examples: "R1 Ch1", "R2 Lec5", "R8 Ch6; R7 Ch3"
            match = re.match(
                r'(R\d+)\s*(?:([Cc]h(?:apter)?\.?\s*\d+)|([Ll]ec(?:ture)?\.?\s*\d+))?\s*(.*)?',
                part
            )
            
            if match:
                resource_id = match.group(1).upper()  # Normalize to uppercase
                chapter = match.group(2)
                lecture = match.group(3)
                extra = match.group(4)
                
                # Clean up chapter/lecture references
                if chapter:
                    chapter = re.sub(r'\s+', '', chapter)  # Remove spaces
                if lecture:
                    lecture = re.sub(r'\s+', '', lecture)
                
                resources.append(ResourceReference(
                    resource_id=resource_id,
                    chapter=chapter,
                    lecture=lecture,
                    extra_info=extra.strip() if extra else None
                ))
            else:
                # Try to extract just the resource ID
                resource_match = re.search(r'(R\d+)', part, re.IGNORECASE)
                if resource_match:
                    resources.append(ResourceReference(
                        resource_id=resource_match.group(1).upper(),
                        extra_info=part
                    ))
        
        return resources
    
    def get_context_for_document(self, document_name: str) -> Optional[SyllabusContext]:
        """
        Get syllabus context for a document based on filename matching.
        
        Args:
            document_name: Document filename (e.g., "R1.pdf", "R2.pdf")
        
        Returns:
            SyllabusContext if found, None otherwise
        """
        if not self.loaded:
            logger.warning("Syllabus not loaded. Call load_syllabus() first.")
            return None
        
        # Extract resource ID from filename
        # Matches: R1.pdf, R1_chapter1.pdf, R2.pdf, etc.
        match = re.match(r'(R\d+)', document_name, re.IGNORECASE)
        if not match:
            logger.debug(f"Document '{document_name}' doesn't match resource pattern (R<number>)")
            return None
        
        resource_id = match.group(1).upper()
        
        if resource_id not in self.resource_to_entries:
            logger.debug(f"Resource '{resource_id}' not found in syllabus")
            return None
        
        entries = self.resource_to_entries[resource_id]
        
        if not entries:
            return None
        
        # Use the first matching entry (most common case)
        # For documents referenced in multiple lectures, we take the first one
        entry = entries[0]
        
        # Find the specific reference for chapter/lecture info
        chapter = None
        lecture_ref = None
        for ref in entry.resources:
            if ref.resource_id == resource_id:
                chapter = ref.chapter
                lecture_ref = ref.lecture
                break
        
        return SyllabusContext(
            module=entry.module,
            module_order=entry.module_order,
            topic=entry.topic,
            lecture_number=entry.lecture_number,
            subtopics=entry.subtopics,
            chapter=chapter,
            lecture_ref=lecture_ref,
            prerequisites=[]  # To be filled from Neo4j if needed
        )
    
    def get_all_contexts_for_document(self, document_name: str) -> List[SyllabusContext]:
        """
        Get ALL syllabus contexts for a document (for documents referenced in multiple lectures).
        
        Returns:
            List of SyllabusContext objects
        """
        if not self.loaded:
            logger.warning("Syllabus not loaded. Call load_syllabus() first.")
            return []
        
        match = re.match(r'(R\d+)', document_name, re.IGNORECASE)
        if not match:
            return []
        
        resource_id = match.group(1).upper()
        
        if resource_id not in self.resource_to_entries:
            return []
        
        contexts = []
        for entry in self.resource_to_entries[resource_id]:
            chapter = None
            lecture_ref = None
            for ref in entry.resources:
                if ref.resource_id == resource_id:
                    chapter = ref.chapter
                    lecture_ref = ref.lecture
                    break
            
            contexts.append(SyllabusContext(
                module=entry.module,
                module_order=entry.module_order,
                topic=entry.topic,
                lecture_number=entry.lecture_number,
                subtopics=entry.subtopics,
                chapter=chapter,
                lecture_ref=lecture_ref,
                prerequisites=[]
            ))
        
        return contexts
    
    def enrich_metadata_with_syllabus(
        self, 
        metadata: Dict[str, Any], 
        document_name: str
    ) -> Dict[str, Any]:
        """
        Enrich chunk/document metadata with syllabus context.
        
        Args:
            metadata: Existing metadata dictionary
            document_name: Document filename
        
        Returns:
            Enriched metadata dictionary
        """
        ctx = self.get_context_for_document(document_name)
        
        if ctx:
            metadata['syllabus_module'] = ctx.module
            metadata['syllabus_module_order'] = ctx.module_order
            metadata['syllabus_topic'] = ctx.topic
            metadata['syllabus_lecture_number'] = ctx.lecture_number
            metadata['syllabus_subtopics'] = ctx.subtopics
            metadata['syllabus_chapter'] = ctx.chapter
            metadata['syllabus_course'] = self.course_name
            
            # Format a human-readable context string
            metadata['syllabus_context'] = (
                f"{ctx.module} → Lecture {ctx.lecture_number}: {ctx.topic}"
            )
        else:
            # Document not in syllabus - set default values
            metadata['syllabus_module'] = None
            metadata['syllabus_context'] = "General Reference (not mapped to syllabus)"
        
        return metadata
    
    def get_resource_summary(self) -> Dict[str, List[str]]:
        """
        Get a summary of which topics each resource covers.
        
        Returns:
            Dict mapping resource_id to list of topics
        """
        summary = {}
        for resource_id, entries in self.resource_to_entries.items():
            summary[resource_id] = [
                f"Module {e.module_order} Lecture {e.lecture_number}: {e.topic}"
                for e in entries
            ]
        return summary


# Global instance for module-level access
_linker_instance: Optional[SyllabusQdrantLinker] = None


def get_linker() -> SyllabusQdrantLinker:
    """Get or create the global SyllabusQdrantLinker instance."""
    global _linker_instance
    if _linker_instance is None:
        _linker_instance = SyllabusQdrantLinker()
    return _linker_instance


def load_syllabus(csv_path: str, course_name: str = "Unknown Course") -> int:
    """Convenience function to load syllabus into global instance."""
    return get_linker().load_syllabus(csv_path, course_name)


def get_context_for_document(document_name: str) -> Optional[SyllabusContext]:
    """Convenience function to get context from global instance."""
    return get_linker().get_context_for_document(document_name)


def enrich_metadata_with_syllabus(metadata: Dict[str, Any], document_name: str) -> Dict[str, Any]:
    """Convenience function to enrich metadata from global instance."""
    return get_linker().enrich_metadata_with_syllabus(metadata, document_name)
