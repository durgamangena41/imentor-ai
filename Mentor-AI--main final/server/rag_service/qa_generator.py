# server/rag_service/qa_generator.py
import json
import logging
import re
from flask import request, jsonify
import config

logger = logging.getLogger(__name__)

QA_GENERATION_PROMPT = """
You are an expert curriculum developer. Given the following course material, generate 5-10 high-quality Q&A pairs.
For each pair, include:
1. 'instruction': A student-like question or a task related to the content.
2. 'output': A detailed, accurate, and helpful educational response.
3. 'difficulty': One of 'easy', 'medium', 'hard'.
4. 'taxonomy': A list of relevant sub-topics.

**INPUT MATERIAL:**
{text}

**FORMAT:**
Return ONLY a valid JSON array of objects.
Example:
[
  {{
    "instruction": "What are the three laws of motion?",
    "output": "Isaac Newton's three laws of motion are...",
    "difficulty": "medium",
    "taxonomy": ["Physics", "Mechanics", "Newtonian Laws"]
  }}
]
"""

def register_qa_routes(app, llm_wrapper):
    @app.route('/generate_qa', methods=['POST'])
    def generate_qa_endpoint():
        data = request.get_json()
        text = data.get('text')
        if not text:
            return jsonify({"error": "Missing 'text' for Q&A generation"}), 400
        
        try:
            prompt = QA_GENERATION_PROMPT.format(text=text[:15000]) # Limit input
            response_text = llm_wrapper(prompt)
            
            # Extract JSON from block if necessary
            json_match = re.search(r'\[.*\]', response_text, re.DOTALL)
            if not json_match:
                logger.error(f"Failed to parse JSON from LLM response: {response_text}")
                return jsonify({"error": "Invalid response format from LLM"}), 500
            
            qa_pairs = json.loads(json_match.group(0))
            return jsonify({"qa_pairs": qa_pairs}), 200
            
        except Exception as e:
            logger.error(f"Q&A generation failed: {e}", exc_info=True)
            return jsonify({"error": str(e)}), 500
