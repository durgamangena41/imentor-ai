import os
import sys
import traceback
from flask import Flask, request, jsonify, current_app, send_from_directory, after_this_request
import logging
import atexit
import uuid
import subprocess
import tempfile
import shutil
import json
import re
from werkzeug import utils as werkzeug_utils
from duckduckgo_search import DDGS
from qdrant_client import models as qdrant_models
import sentry_sdk
from sentry_sdk.integrations.flask import FlaskIntegration
from prometheus_flask_exporter import PrometheusMetrics

import threading
try:
    from knowledge_layer_bridge import create_knowledge_bridge
except ImportError:
    def create_knowledge_bridge():
        class _FallbackKnowledgeBridge:
            async def assess_data_alignment(self, subject, existing_counts=None):
                return {
                    "status": "degraded",
                    "message": "knowledge_layer_bridge module not found; alignment feature disabled.",
                    "subject": subject,
                    "existing_counts": existing_counts or {}
                }

        return _FallbackKnowledgeBridge()
import qa_generator
# --- Add server directory to sys.path ---
SERVER_DIR = os.path.dirname(os.path.abspath(__file__))
if SERVER_DIR not in sys.path:
    sys.path.insert(0, SERVER_DIR)

import config
config.setup_logging()

# --- Import configurations and services ---
try:
    from vector_db_service import VectorDBService
    import ai_core
    import neo4j_handler
    from neo4j import exceptions as neo4j_exceptions
    import document_generator
    import google.generativeai as genai
    from prompts import CODE_ANALYSIS_PROMPT_TEMPLATE, TEST_CASE_GENERATION_PROMPT_TEMPLATE, EXPLAIN_ERROR_PROMPT_TEMPLATE, QUIZ_GENERATION_PROMPT_TEMPLATE
    import quiz_utils
    from academic_search import search_all_apis as academic_search
    from integrity_services import submit_to_turnitin, get_turnitin_report, check_bias_hybrid, calculate_readability
    import asyncio # <<< THIS IS THE FIX (Step 1)

    if config.GEMINI_API_KEY:
        genai.configure(api_key=config.GEMINI_API_KEY)
        try:
            available_models = [m.name for m in genai.list_models() if 'generateContent' in m.supported_generation_methods]
            logging.getLogger(__name__).info(f"Available Gemini models: {available_models}")
        except Exception as e:
            logging.getLogger(__name__).warning(f"Could not list available models: {e}")
        
        safety_settings = [
            {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
        ]
        LLM_MODEL = genai.GenerativeModel(config.GEMINI_MODEL_NAME, safety_settings=safety_settings)
    else:
        LLM_MODEL = None
        logging.getLogger(__name__).error("GEMINI_API_KEY not found, AI features will fail.")

    def llm_wrapper(prompt, api_key=None):
        key_to_use = api_key or config.GEMINI_API_KEY
        if not key_to_use:
            raise ConnectionError("Gemini API Key is not configured for this request.")

        genai.configure(api_key=key_to_use)
        
        safety_settings = [
            {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
        ]
        model_instance = genai.GenerativeModel(config.GEMINI_MODEL_NAME, safety_settings=safety_settings)

        for attempt in range(3):
            try:
                response = model_instance.generate_content(prompt)
                if response.parts:
                    return "".join(part.text for part in response.parts if hasattr(part, 'text'))
                elif response.prompt_feedback and response.prompt_feedback.block_reason:
                     raise ValueError(f"Prompt blocked by API. Reason: {response.prompt_feedback.block_reason_message}")
                else:
                    logger.warning("LLM returned empty response without explicit block reason.")
                    return ""
            except Exception as e:
                logger.warning(f"LLM generation attempt {attempt + 1} failed: {e}")
                if attempt == 2: raise
        return ""

except ImportError as e:
    print(f"CRITICAL IMPORT ERROR: {e}.")
    sys.exit(1)

logger = logging.getLogger(__name__)

_knowledge_engine_module = None
_media_processor_module = None
_podcast_generator_module = None
_fine_tuner_module = None


def get_knowledge_engine_module():
    global _knowledge_engine_module
    if _knowledge_engine_module is None:
        import knowledge_engine as _knowledge_engine
        _knowledge_engine_module = _knowledge_engine
    return _knowledge_engine_module


def get_media_processor_module():
    global _media_processor_module
    if _media_processor_module is None:
        import media_processor as _media_processor
        _media_processor_module = _media_processor
    return _media_processor_module


def get_podcast_generator_module():
    global _podcast_generator_module
    if _podcast_generator_module is None:
        import podcast_generator as _podcast_generator
        _podcast_generator_module = _podcast_generator
    return _podcast_generator_module


def get_fine_tuner_module():
    global _fine_tuner_module
    if _fine_tuner_module is None:
        import fine_tuner as _fine_tuner
        _fine_tuner_module = _fine_tuner
    return _fine_tuner_module

# ============================================================================
# SENTRY MONITORING (Disabled for local development)
# ============================================================================
# Sentry is disabled by default to avoid crashes when SENTRY_DSN is not set.
# To re-enable Sentry for production or debugging:
#   1. Uncomment the code block below
#   2. Set SENTRY_DSN in your .env file (e.g., SENTRY_DSN=https://your-dsn@sentry.io/...)
# ============================================================================
# if config.SENTRY_DSN:
#     sentry_sdk.init(
#         dsn=config.SENTRY_DSN,
#         integrations=[
#             FlaskIntegration(),
#         ],
#         # Set traces_sample_rate to 1.0 to capture 100%
#         # of transactions for performance monitoring.
#         traces_sample_rate=1.0,
#         # Set profiles_sample_rate to 1.0 to profile 100%
#         # of sampled transactions.
#         # We recommend adjusting this value in production.
#         profiles_sample_rate=1.0,
#     )
#     logger.info("Sentry initialized successfully for Python RAG service.")
# else:
#     logger.warn("SENTRY_DSN not found in config. Sentry is disabled for Python RAG service.")
logger.info("Sentry monitoring is disabled for local development.")


app = Flask(__name__)


metrics = PrometheusMetrics(app)
logger.info("Prometheus metrics endpoint initialized at /metrics.")

GENERATED_DOCS_DIR = os.path.join(SERVER_DIR, 'generated_docs')
os.makedirs(GENERATED_DOCS_DIR, exist_ok=True)
app.config['GENERATED_DOCS_DIR'] = GENERATED_DOCS_DIR

# Initialize services
vector_service = None
try:
    vector_service = VectorDBService()
    vector_service.setup_collection()
    app.vector_service = vector_service
except Exception as e:
    logger.critical(f"Failed to initialize VectorDBService: {e}", exc_info=True)

try:
    neo4j_handler.init_driver()
except Exception as e:
    logger.critical(f"Neo4j driver failed to initialize: {e}.")
atexit.register(neo4j_handler.close_driver)

if os.getenv("INIT_TTS_ON_START", "false").lower() in ("1", "true", "yes", "on"):
    try:
        from tts_service import initialize_tts
        initialize_tts()
    except Exception as e:
        logger.warning(f"TTS startup initialization skipped due to error: {e}")
else:
    logger.info("TTS startup initialization is disabled (INIT_TTS_ON_START=false).")


def create_error_response(message, status_code=500, details=None):
    log_message = f"API Error ({status_code}): {message}"
    if details: log_message += f" | Details: {details}"
    current_app.logger.error(log_message)
    response_payload = {"error": message}
    if details and status_code != 500: response_payload["details"] = details
    return jsonify(response_payload), status_code

# Register routes from standalone modules
qa_generator.register_qa_routes(app, llm_wrapper)

# === API Endpoints ===

@app.route('/', methods=['GET'])
def index():
    return jsonify({
        "message": "AI Tutor Python RAG Service is running",
        "health_check": "/health",
        "metrics": "/metrics"
    }), 200

# This config is now cleaner. The platform-specific logic is handled in the route.
LANGUAGE_CONFIG = {
    "python": {
        "filename": "main.py",
        "compile_cmd": None,
        "run_cmd": [sys.executable, "main.py"]
    },
    "java": {
        "filename": "Main.java",
        "compile_cmd": ["javac", "-Xlint:all", "Main.java"],
        "run_cmd": ["java", "Main"]
    },
    "c": {
        "filename": "main.c",
        "compile_cmd": ["gcc", "main.c", "-o", "main", "-Wall", "-Wextra", "-pedantic"],
        "run_cmd": ["main"] # Just the base name
    },
    "cpp": {
        "filename": "main.cpp",
        "compile_cmd": ["g++", "main.cpp", "-o", "main", "-Wall", "-Wextra", "-pedantic"],
        "run_cmd": ["main"] # Just the base name
    }
}


# --- (START) Code Executor End Points ---

@app.route('/execute_code', methods=['POST'])
def execute_code():
    data = request.get_json()
    if not data:
        return create_error_response("Request must be JSON", 400)

    code = data.get('code')
    language = data.get('language', '').lower()
    test_cases = data.get('testCases', [])

    if not code or not language:
        return create_error_response("Missing 'code' or 'language'", 400)

    lang_config = LANGUAGE_CONFIG.get(language)
    if not lang_config:
        unsupported_message = f"Language '{language}' is not currently supported for execution."
        return jsonify({"compilationError": unsupported_message}), 200

    results = []
    temp_dir = tempfile.mkdtemp()
    
    try:
        source_path = os.path.join(temp_dir, lang_config["filename"])
        with open(source_path, 'w', encoding='utf-8') as f:
            f.write(code)

        if lang_config["compile_cmd"]:
            # --- THIS IS THE FIX for FileNotFoundError ---
            try:
                compile_process = subprocess.run(
                    lang_config["compile_cmd"], cwd=temp_dir, capture_output=True,
                    text=True, timeout=10, encoding='utf-8', check=False
                )
            except FileNotFoundError:
                compiler_name = lang_config["compile_cmd"][0]
                error_msg = f"Compiler Error: The '{compiler_name}' command was not found. Please ensure the required compiler for '{language}' is installed and that its 'bin' directory is in your system's PATH environment variable."
                logger.error(error_msg)
                return jsonify({"compilationError": error_msg}), 200
            # --- END OF FIX ---
                
            if compile_process.returncode != 0:
                error_output = (compile_process.stdout + "\n" + compile_process.stderr).strip()
                logger.warning(f"Compilation failed for {language}. Error: {error_output}")
                return jsonify({"compilationError": error_output}), 200

        for i, case in enumerate(test_cases):
            case_input = case.get('input', '')
            expected_output = str(case.get('expectedOutput', '')).strip()
            
            case_result = { "input": case_input, "expected": expected_output, "output": "", "error": None, "status": "fail" }

            try:
                # --- THIS IS THE FIX ---
                # Dynamically build the command with an absolute path for compiled languages
                run_command = lang_config["run_cmd"][:] # Make a copy

                if language in ["c", "cpp"]:
                    executable_name = run_command[0]
                    if os.name == 'nt':
                        executable_name += '.exe'
                    # Create the full, unambiguous path to the executable
                    absolute_executable_path = os.path.join(temp_dir, executable_name)
                    run_command[0] = absolute_executable_path
                # --- END OF FIX ---

                run_process = subprocess.run(
                    run_command, # Use the potentially modified command
                    cwd=temp_dir,
                    input=case_input,
                    capture_output=True, text=True, timeout=5, encoding='utf-8'
                )
                stdout = run_process.stdout.strip().replace('\r\n', '\n')
                stderr = run_process.stderr.strip()
                case_result["output"] = stdout

                if run_process.returncode != 0:
                    case_result["status"] = "error"
                    case_result["error"] = stderr or "Script failed with a non-zero exit code."
                elif stderr:
                     case_result["error"] = f"Warning (stderr):\n{stderr}"
                
                if case_result["status"] != "error":
                    if stdout == expected_output:
                        case_result["status"] = "pass"
                    else:
                        case_result["status"] = "fail"
                
            except subprocess.TimeoutExpired:
                case_result["status"] = "error"
                case_result["error"] = "Execution timed out after 5 seconds."
            except Exception as exec_err:
                case_result["status"] = "error"
                case_result["error"] = f"An unexpected error occurred during execution: {str(exec_err)}"
            results.append(case_result)
    finally:
        shutil.rmtree(temp_dir)

    return jsonify({"results": results}), 200

# ... (the rest of the file remains unchanged) ...

@app.route('/analyze_code', methods=['POST'])
def analyze_code_route():
    data = request.get_json()
    if not data: return create_error_response("Request must be JSON", 400)
    
    code, language, api_key = data.get('code'), data.get('language'), data.get('apiKey')
    
    if not all([code, language]):
        return create_error_response("Missing 'code' or 'language'", 400)
        
    try:
        prompt = CODE_ANALYSIS_PROMPT_TEMPLATE.format(language=language, code=code)
        analysis = llm_wrapper(prompt, api_key)
        return jsonify({"analysis": analysis}), 200
    except Exception as e:
        return create_error_response(f"Failed to analyze code: {str(e)}", 500)

@app.route('/generate_test_cases', methods=['POST'])
def generate_test_cases_route():
    data = request.get_json()
    if not data: return create_error_response("Request must be JSON", 400)
    
    code, language, api_key = data.get('code'), data.get('language'), data.get('apiKey')
    
    if not all([code, language]):
        return create_error_response("Missing 'code' or 'language'", 400)

    try:
        prompt = TEST_CASE_GENERATION_PROMPT_TEMPLATE.format(language=language, code=code)
        response_text = llm_wrapper(prompt, api_key)
        
        json_match = re.search(r'\[.*\]', response_text, re.DOTALL)
        if not json_match:
            raise ValueError("LLM response did not contain a valid JSON array for test cases.")
        
        test_cases = json.loads(json_match.group(0))
        return jsonify({"testCases": test_cases}), 200
    except Exception as e:
        return create_error_response(f"Failed to generate test cases: {str(e)}", 500)

@app.route('/explain_error', methods=['POST'])
def explain_error_route():
    data = request.get_json()
    if not data: return create_error_response("Request must be JSON", 400)
    
    code, language, error_message, api_key = data.get('code'), data.get('language'), data.get('errorMessage'), data.get('apiKey')
    
    if not all([code, language, error_message]):
        return create_error_response("Missing 'code', 'language', or 'errorMessage'", 400)
        
    try:
        prompt = EXPLAIN_ERROR_PROMPT_TEMPLATE.format(language=language, code=code, error_message=error_message)
        explanation = llm_wrapper(prompt, api_key)
        return jsonify({"explanation": explanation}), 200
    except Exception as e:
        return create_error_response(f"Failed to explain error: {str(e)}", 500)

# --- (END) Code Executor End Points ---

# --- (START) Quiz Generator End Points ---
@app.route('/generate_quiz', methods=['POST'])
def generate_quiz_route():
    if 'file' not in request.files:
        return create_error_response("No file part in the request", 400)
    
    file = request.files['file']
    quiz_option = request.form.get('quizOption', 'standard')
    api_key = request.form.get('api_key')
    
    quiz_option_map = {
        'quick': 5,
        'standard': 10,
        'deep_dive': 15,
        'comprehensive': 20
    }
    num_questions = quiz_option_map.get(quiz_option, 10) # Default to 10

    if file.filename == '':
        return create_error_response("No selected file", 400)
    if not api_key:
        return create_error_response("API Key is required for quiz generation", 400)

    temp_dir = tempfile.mkdtemp()
    try:
        filename = werkzeug_utils.secure_filename(file.filename)
        file_path = os.path.join(temp_dir, filename)
        file.save(file_path)

        logger.info(f"Quiz Gen: Processing uploaded file '{filename}' for text extraction.")
        document_text = quiz_utils.extract_text_for_quiz(file_path)

        if not document_text or not document_text.strip():
            return create_error_response("Could not extract any text from the provided document.", 422)

        prompt = QUIZ_GENERATION_PROMPT_TEMPLATE.format(
            num_questions=num_questions,
            document_text=document_text
        )
        
        logger.info(f"Quiz Gen: Sending prompt to LLM for {num_questions} questions.")
        response_text = llm_wrapper(prompt, api_key)
        
        json_match = re.search(r'\[.*\]', response_text, re.DOTALL)
        if not json_match:
            raise ValueError("LLM response did not contain a valid JSON array for the quiz.")
        
        quiz_data = json.loads(json_match.group(0))
        logger.info(f"Quiz Gen: Successfully generated and parsed {len(quiz_data)} questions.")
        
        return jsonify({"quiz": quiz_data}), 200

    except Exception as e:
        logger.error(f"Error during quiz generation: {e}", exc_info=True)
        return create_error_response(f"Quiz Generation failed: {str(e)}", 500)
    finally:
        shutil.rmtree(temp_dir)

# --- (END) Quiz Generator End Points ---

@app.route('/query', methods=['POST'])
def search_qdrant_documents():
    current_app.logger.info("--- /query Request (RAG + KG Search) ---")
    data = request.get_json()
    if not data: return create_error_response("Request must be JSON", 400)
    
    query_text = data.get('query')
    user_id = data.get('user_id')
    document_context_name = data.get('documentContextName')
    use_kg = data.get('use_kg_critical_thinking', False) 
    
    if not query_text or not user_id:
        return create_error_response("Missing 'query' or 'user_id'", 400)

    try:
        k = data.get('k', 5)
        
        facts_from_kg = ""
        if use_kg and document_context_name:
            current_app.logger.info(f"KG search is ENABLED for doc '{document_context_name}'.")
            try:
                facts_from_kg = neo4j_handler.search_knowledge_graph(user_id, document_context_name, query_text)
            except Exception as e_kg:
                logger.error(f"Error during KG search part of RAG query: {e_kg}", exc_info=True)
                facts_from_kg = "Note: An error occurred while searching the knowledge graph."
        else:
            current_app.logger.info("KG search is DISABLED for this query.")

        must_conditions = []
        if document_context_name:
            current_app.logger.info(f"Applying document context filter for vector search: '{document_context_name}'")
            must_conditions.append(qdrant_models.FieldCondition(
                key="file_name",
                match=qdrant_models.MatchValue(value=document_context_name)
            ))
        
        qdrant_filters = qdrant_models.Filter(must=must_conditions) if must_conditions else None
        
        retrieved_docs, snippet_from_vector, docs_map = vector_service.search_documents(
            query=query_text, k=k, filter_conditions=qdrant_filters
        )
        
        final_snippet = ""
        if facts_from_kg and "No specific facts were found" not in facts_from_kg:
            final_snippet += facts_from_kg + "\n\n---\n\n"
        
        final_snippet += snippet_from_vector

        response_payload = {
            "retrieved_documents_list": [d.to_dict() for d in retrieved_docs],
            "formatted_context_snippet": final_snippet.strip(), 
            "retrieved_documents_map": docs_map,
        }
        
        current_app.logger.info(f"RAG+KG search successful. Returning {len(retrieved_docs)} documents.")
        return jsonify(response_payload), 200
        
    except Exception as e:
        logger.error(f"Error in /query (RAG+KG search): {e}", exc_info=True)
        return create_error_response(f"Query failed: {str(e)}", 500)

@app.route('/health', methods=['GET'])
def health_check():
    status_details = { "status": "error", "qdrant_service": "not_initialized", "neo4j_service": "not_initialized_via_handler", "neo4j_connection": "unknown"}
    http_status_code = 503
    if not vector_service:
        status_details["qdrant_service"] = "failed_to_initialize"
    else:
        status_details["qdrant_service"] = "initialized"
        try:
            vector_service.client.get_collection(collection_name=vector_service.collection_name)
            status_details["qdrant_collection_status"] = "exists_and_accessible"
        except Exception as e:
            status_details["qdrant_collection_status"] = f"error: {str(e)}"
    
    neo4j_ok, neo4j_conn_status = neo4j_handler.check_neo4j_connectivity()
    if neo4j_ok:
        status_details["neo4j_service"], status_details["neo4j_connection"] = "initialized_via_handler", "connected"
    else:
        status_details["neo4j_service"], status_details["neo4j_connection"] = "initialization_failed_or_handler_error", neo4j_conn_status
    
    if status_details["qdrant_service"] == "initialized" and status_details.get("qdrant_collection_status") == "exists_and_accessible" and neo4j_ok:
        status_details["status"], http_status_code = "ok", 200
    
    return jsonify(status_details), http_status_code

@app.route('/finetune', methods=['POST'])
def finetune_route():
    """
    Triggers a background fine-tuning job.
    Expected JSON:
    - job_id: unique ID for tracking
    - dataset_path: local path to the formatted training data
    - model_tag_to_update: tag to apply to the newly created model
    """
    data = request.get_json()
    if not data:
        return create_error_response("Request must be JSON", 400)
    
    job_id = data.get('job_id')
    dataset_path = data.get('dataset_path')
    model_tag = data.get('model_tag_to_update')
    course_id = data.get('course_id', 'global')
    
    if not all([job_id, dataset_path, model_tag]):
        return create_error_response("Missing job_id, dataset_path, or model_tag_to_update", 400)

    fine_tuner = get_fine_tuner_module()
    
    # Run in background to avoid blocking the main server thread
    thread = threading.Thread(
        target=fine_tuner.run_fine_tuning,
        args=(dataset_path, model_tag, job_id, course_id)
    )
    thread.daemon = True
    thread.start()
    
    logger.info(f"Accepted fine-tuning job {job_id} for model {model_tag}. Background thread started.")
    return jsonify({"message": "Fine-tuning job started in background", "jobId": job_id}), 202

@app.route('/add_document', methods=['POST'])
def add_document_qdrant():
    data = request.get_json()
    if not data: return create_error_response("Request must be JSON", 400)
    
    user_id = data.get('user_id')
    file_path = data.get('file_path') # This might be temporary or empty for URL content
    original_name = data.get('original_name')
    text_content_override = data.get('text_content_override') # NEW parameter

    if not all([user_id, original_name]):
        return create_error_response("Missing 'user_id' or 'original_name'", 400)

    # Conditional check for source of text
    if text_content_override:
        logger.info(f"Adding document '{original_name}' (from text_content_override), user '{user_id}'.")
        # ai_core.process_document_for_qdrant needs to handle text_content_override
        # Pass a dummy file_path as it's required by the signature, actual file is not read.
        processed_chunks, raw_text, kg_chunks = ai_core.process_document_for_qdrant(
            file_path="",  # Dummy, as content is overridden
            original_name=original_name,
            user_id=user_id,
            text_content_override=text_content_override # Pass the override
        )
    elif file_path and os.path.exists(file_path):
        logger.info(f"Adding document '{original_name}' (from file_path), user '{user_id}'.")
        processed_chunks, raw_text, kg_chunks = ai_core.process_document_for_qdrant(
            file_path=file_path,
            original_name=original_name,
            user_id=user_id
        )
    else:
        return create_error_response("Neither 'file_path' (and file exists) nor 'text_content_override' provided.", 400)

    num_added, status = 0, "processed_no_content"
    if processed_chunks:
        num_added = app.vector_service.add_processed_chunks(processed_chunks)
        if num_added > 0: status = "added_to_qdrant"
    
    return jsonify({
        "message": "Document processed.",
        "status": status,
        "filename": original_name,
        "num_chunks_added_to_qdrant": num_added,
        "raw_text_for_analysis": raw_text or "",
        "chunks_with_metadata": kg_chunks
    }), 201


@app.route('/academic_search', methods=['POST'])
def academic_search_route():
    data = request.get_json()
    if not data or 'query' not in data: return create_error_response("Missing 'query'", 400)
    try:
        # <<< STEP 2: THIS IS THE FIX >>>
        # Use asyncio.run() to execute the async function and get its actual result.
        results = asyncio.run(academic_search(data['query'], max_results_per_api=data.get('max_results', 3)))
        return jsonify({"success": True, "results": results}), 200
    except Exception as e:
        return create_error_response(f"Academic search failed: {str(e)}", 500)


@app.route('/enhanced_academic_search', methods=['POST'])
def enhanced_academic_search_route():
    """Enhanced academic search with PubMed integration via deep_research module."""
    data = request.get_json()
    if not data or 'query' not in data: return create_error_response("Missing 'query'", 400)
    try:
        from deep_research import enhanced_academic_search
        results = asyncio.run(enhanced_academic_search(data['query'], max_results_per_api=data.get('max_results', 5)))
        return jsonify({"success": True, "results": results, "source_count": len(results)}), 200
    except Exception as e:
        logger.error(f"Enhanced academic search failed: {e}")
        return create_error_response(f"Enhanced academic search failed: {str(e)}", 500)

@app.route('/web_search', methods=['POST'])
def web_search_route():
    data = request.get_json()
    if not data or 'query' not in data: return create_error_response("Missing 'query'", 400)
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(data['query'], max_results=5))
        return jsonify([{"title": r.get("title"), "url": r.get("href"), "content": r.get("body")} for r in results]), 200
    except Exception as e: return create_error_response(f"Web search failed: {str(e)}", 500)

@app.route('/export_podcast', methods=['POST'])
def export_podcast_route():
    current_app.logger.info("--- /export_podcast Request (gTTS + Speed-Up) ---")
    data = request.get_json()
    if not data: return create_error_response("Request must be JSON", 400)
    
    source_document_text = data.get('sourceDocumentText')
    analysis_content = data.get('analysisContent')
    podcast_options = data.get('podcastOptions', {})
    api_key = data.get('api_key')
    
    if not all([source_document_text, analysis_content, api_key]):
        return create_error_response("Missing 'sourceDocumentText', 'analysisContent', or 'api_key'", 400)

    try:
        podcast_generator = get_podcast_generator_module()
        # 1. Generate the script using the LLM (no change here)
        script = podcast_generator.generate_podcast_script(
            source_document_text, 
            analysis_content,
            podcast_options,
            lambda p: llm_wrapper(p, api_key)
        )

        # 2. Synthesize the script into a high-quality, dual-speaker MP3
        final_mp3_filename = f"podcast_final_{uuid.uuid4()}.mp3"
        final_mp3_path = os.path.join(app.config['GENERATED_DOCS_DIR'], final_mp3_filename)
        podcast_generator.create_podcast_from_script(script, final_mp3_path)

        # 3. Send the file to the user and clean up afterwards
        @after_this_request
        def cleanup(response):
            try: os.remove(final_mp3_path)
            except OSError as e: logger.error(f"Error deleting temp podcast MP3 file {final_mp3_path}: {e}")
            return response
            
        return send_from_directory(app.config['GENERATED_DOCS_DIR'], final_mp3_filename, as_attachment=True)
    except Exception as e:
        logger.error(f"Failed to generate podcast: {e}", exc_info=True)
        return create_error_response(f"Failed to generate podcast: {str(e)}", 500)

@app.route('/download_document/<filename>', methods=['GET'])
def download_document_route(filename):
    if '..' in filename: return create_error_response("Invalid filename.", 400)
    try:
        file_path = os.path.join(app.config['GENERATED_DOCS_DIR'], filename)
        if not os.path.exists(file_path): return create_error_response("File not found.", 404)
        @after_this_request
        def cleanup(response):
            try: os.remove(file_path)
            except OSError as e: logger.error(f"Error deleting temp file {file_path}: {e}")
            return response
        return send_from_directory(app.config['GENERATED_DOCS_DIR'], filename, as_attachment=True)
    except Exception as e:
        return create_error_response("Could not process download request.", 500)

# KG & DB Management Routes
@app.route('/delete_qdrant_document_data', methods=['DELETE'])
def delete_qdrant_data_route():
    data = request.get_json()
    if not data: return create_error_response("Request must be JSON", 400)
    user_id, document_name = data.get('user_id'), data.get('document_name') 
    if not user_id or not document_name: return create_error_response("Missing fields", 400)
    try:
        result = vector_service.delete_document_vectors(user_id, document_name)
        return jsonify(result), 200
    except Exception as e: return create_error_response(f"Deletion failed: {str(e)}", 500)

@app.route('/kg', methods=['POST'])
def add_or_update_kg_route():
    data = request.get_json()
    if not data: return create_error_response("Request must be JSON", 400)
    user_id, original_name, nodes, edges = data.get('userId'), data.get('originalName'), data.get('nodes'), data.get('edges')
    if not all([user_id, original_name, isinstance(nodes, list), isinstance(edges, list)]): return create_error_response("Missing fields", 400)
    try:
        result = neo4j_handler.ingest_knowledge_graph(user_id, original_name, nodes, edges)
        return jsonify({"message": "KG ingested", "status": "completed", **result}), 201
    except Exception as e: return create_error_response(f"KG ingestion failed: {str(e)}", 500)

@app.route('/kg/<user_id>/<path:document_name>', methods=['GET'])
def get_kg_route(user_id, document_name):
    try:
        kg_data = neo4j_handler.get_knowledge_graph(user_id, document_name)
        
        if kg_data is None:
            logger.info(f"No KG found for user '{user_id}', doc '{document_name}'. Returning empty graph.")
            return jsonify({"nodes": [], "edges": []}), 200
        
        return jsonify(kg_data), 200

    except Exception as e: 
        return create_error_response(f"KG retrieval failed: {str(e)}", 500)


@app.route('/kg/<user_id>/<path:document_name>', methods=['DELETE'])
def delete_kg_route(user_id, document_name):
    try:
        deleted = neo4j_handler.delete_knowledge_graph(user_id, document_name)
        return jsonify({"message": "KG deleted"}) if deleted else create_error_response("KG not found", 404)
    except Exception as e: return create_error_response(f"KG deletion failed: {str(e)}", 500)

@app.route('/query_kg', methods=['POST'])
def query_kg_route():
    current_app.logger.info("--- /query_kg Request (Knowledge Graph Search) ---")
    data = request.get_json()
    if not data: return create_error_response("Request must be JSON", 400)
    
    query_text = data.get('query')
    document_name = data.get('document_name')
    user_id = data.get('user_id')

    if not all([query_text, document_name, user_id]):
        return create_error_response("Missing 'query', 'document_name', or 'user_id'", 400)

    try:
        # Call the Neo4j handler to search the KG
        facts_from_kg = neo4j_handler.search_knowledge_graph(user_id, document_name, query_text)
        
        return jsonify({"success": True, "facts": facts_from_kg}), 200
    except neo4j_exceptions.ClientError as e:
        logger.error(f"Neo4j client error during KG query: {e}", exc_info=True)
        return create_error_response(f"Database error during KG query: {str(e)}", 500)
    except Exception as e:
        logger.error(f"Error during KG query: {e}", exc_info=True)
        return create_error_response(f"KG query failed: {str(e)}", 500)



@app.route('/analyze_integrity', methods=['POST'])
def analyze_integrity_route():
    data = request.get_json()
    text, checks, api_key = data.get('text'), data.get('checks', []), data.get('api_key')
    if not text or not checks:
        return create_error_response("Missing 'text' or 'checks' list", 400)

    results = {}
    llm_func = lambda p: llm_wrapper(p, api_key)
    
    async def main():
        import aiohttp
        async with aiohttp.ClientSession() as session:
            if 'plagiarism' in checks:
                try:
                    submission_id = await submit_to_turnitin(session, text)
                    results['plagiarism'] = {"status": "pending", "submissionId": submission_id}
                except Exception as e:
                    logger.error(f"Turnitin submission failed: {e}", exc_info=True)
                    results['plagiarism'] = {"status": "error", "message": str(e)}
    
    try:
        asyncio.run(main())
        
        if 'bias' in checks:
            try:
                results['bias'] = check_bias_hybrid(text, llm_func)
            except Exception as e:
                logger.error(f"Bias check failed: {e}", exc_info=True)
                results['bias'] = {"status": "error", "message": str(e)}
        
        if 'readability' in checks:
            try:
                results['readability'] = calculate_readability(text)
            except Exception as e:
                logger.error(f"Readability check failed: {e}", exc_info=True)
                results['readability'] = {"status": "error", "message": str(e)}

        return jsonify(results), 200
    except Exception as e:
        return create_error_response(f"Integrity analysis failed: {str(e)}", 500)


@app.route('/get_turnitin_report', methods=['POST'])
def get_turnitin_report_route():
    submission_id = request.json.get('submissionId')
    if not submission_id:
        return create_error_response("Missing 'submissionId'", 400)
    
    async def main():
        import aiohttp
        async with aiohttp.ClientSession() as session:
            return await integrity_services.get_turnitin_report(session, submission_id)

    try:
        report = asyncio.run(main())
        return jsonify({"status": "completed", "report": report}), 200
    except TimeoutError:
        return jsonify({"status": "pending"}), 202
    except Exception as e:
        return create_error_response(f"Failed to get Turnitin report: {str(e)}", 500)


# server/rag_service/app.py
# ... (imports and other routes remain the same) ...

@app.route('/generate_document', methods=['POST'])
def generate_document_route():
    # ... (initial data extraction is the same)
    data = request.get_json()
    outline, doc_type, source_text, api_key = data.get('markdownContent'), data.get('docType'), data.get('sourceDocumentText'), data.get('api_key')
    if not all([outline, doc_type, source_text, api_key]):
        return create_error_response("Missing required fields", 400)
        
    try:
        expanded_content = document_generator.expand_content_with_llm(outline, source_text, doc_type, lambda p: llm_wrapper(p, api_key))
        
        parsed_data = []
        if doc_type == 'pptx':
            parsed_data = document_generator.parse_pptx_json(expanded_content)
        else:
            parsed_data = document_generator.refined_parse_docx_markdown(expanded_content)

        # --- THIS IS THE CRITICAL VALIDATION CHECK ---
        if not parsed_data:
            logger.error(f"AI failed to generate valid structured content for a {doc_type.upper()}. The parsed data was empty after processing.")
            return create_error_response(f"The AI was unable to structure the content correctly for a {doc_type.upper()} file. Please try rephrasing or using a different source document.", 422) # 422 Unprocessable Entity

        safe_name = re.sub(r'[^a-zA-Z0-9_-]', '_', outline)[:50]
        filename = f"gen_{safe_name}_{uuid.uuid4()}.{doc_type}"
        file_path = os.path.join(app.config['GENERATED_DOCS_DIR'], filename)

        if doc_type == 'pptx':
            document_generator.create_ppt(parsed_data, file_path)
        else:
            document_generator.create_doc(parsed_data, file_path, "text_content")

        @after_this_request
        def cleanup(response):
            try:
                os.remove(file_path)
            except OSError as e:
                logger.error(f"Error deleting generated file {file_path}: {e}")
            return response

        return send_from_directory(app.config['GENERATED_DOCS_DIR'], filename, as_attachment=True)

    except Exception as e:
        logger.error(f"Error during document generation from content: {e}", exc_info=True)
        return create_error_response(f"Failed to generate document: {str(e)}", 500)


@app.route('/generate_document_from_topic', methods=['POST'])
def generate_document_from_topic_route():
    # ... (initial data extraction is the same)
    data = request.get_json()
    topic, doc_type, api_key = data.get('topic'), data.get('docType'), data.get('api_key')
    if not all([topic, doc_type, api_key]):
        return create_error_response("Missing 'topic', 'docType', or 'api_key'", 400)

    try:
        generated_content = document_generator.generate_content_from_topic(topic, doc_type, lambda p: llm_wrapper(p, api_key))

        parsed_data = []
        if doc_type == 'pptx':
            parsed_data = document_generator.parse_pptx_json(generated_content)
        else:
            parsed_data = document_generator.refined_parse_docx_markdown(generated_content)

        # --- THIS IS THE CRITICAL VALIDATION CHECK ---
        if not parsed_data:
            logger.error(f"AI failed to generate valid structured content for a {doc_type.upper()} on topic '{topic}'.")
            return create_error_response(f"The AI was unable to structure the content correctly for a {doc_type.upper()} file based on that topic. Please try a different topic.", 422)

        safe_topic = re.sub(r'[^a-zA-Z0-9_-]', '_', topic)[:50]
        filename = f"gen_{safe_topic}_{uuid.uuid4()}.{doc_type}"
        file_path = os.path.join(app.config['GENERATED_DOCS_DIR'], filename)

        if doc_type == 'pptx':
            document_generator.create_ppt(parsed_data, file_path)
        else:
            document_generator.create_doc(parsed_data, file_path, "text_content")

        @after_this_request
        def cleanup(response):
            try:
                os.remove(file_path)
            except OSError as e:
                logger.error(f"Error deleting generated file {file_path}: {e}")
            return response

        return send_from_directory(app.config['GENERATED_DOCS_DIR'], filename, as_attachment=True)
        
    except Exception as e:
        logger.error(f"Failed to generate document from topic '{topic}': {e}", exc_info=True)
        return create_error_response(f"Failed to generate document from topic: {str(e)}", 500)

# Test for sentry debug
# url : http://localhost:5000/debug-sentry-python
# @app.route('/debug-sentry-python', methods=['GET'])
# def trigger_python_sentry_error():
#     # This will cause a deliberate ZeroDivisionError
#     result = 1 / 0
#     return "This won't be reached."
# # @app.route('/finetune', methods=['POST'])
# # def finetune_route():
# #     data = request.get_json()
# #     if not data:
# #         return create_error_response("Request must be JSON", 400)
    
# #     dataset_path = data.get('dataset_path')
# #     model_name_to_update = data.get('model_name_to_update')
# #     job_id = data.get('jobId') # <-- GET THE JOB ID FROM NODE.JS

# #     if not all([dataset_path, model_name_to_update, job_id]):
# #         return create_error_response("Missing 'dataset_path', 'model_name_to_update', or 'jobId'", 400)

# #     logger.info(f"Received fine-tuning request. Job ID: {job_id}. Model to update: {model_name_to_update}.")

# #     # Define the target function for the background thread
# #     def fine_tuning_task():
# #         try:
# #             # Pass all three required arguments to the runner
# #             fine_tuner.run_fine_tuning(dataset_path, model_name_to_update, job_id)
# #         except Exception as e:
# #             logger.error(f"Background fine-tuning job {job_id} failed catastrophically: {e}", exc_info=True)
# #             # The error is already reported back to Node.js inside the runner
    
# #     # Run the fine_tuner.run_fine_tuning function in a separate, non-blocking thread
# #     thread = threading.Thread(target=fine_tuning_task)
# #     thread.daemon = True # Allows the main app to exit even if threads are running
# #     thread.start()

# #     # Immediately respond to the Node.js service
# #     return jsonify({
# #         "message": "Fine-tuning job has been successfully queued and is running in the background.",
# #         "jobId": job_id,
# #         "model_tag": model_name_to_update
# #     }), 202 # 202 Accepted indicates the request is accepted but processing is not complete
# # # --- END MODIFICATION ---

# --- Syllabus Graph Endpoints (Stream 2: Syllabus-to-Graph Mapper) ---
try:
    import syllabus_graph_handler
except ImportError as e:
    logger.warning(f"Failed to import syllabus_graph_handler: {e}")
    syllabus_graph_handler = None

@app.route('/syllabus/upload', methods=['POST'])
def upload_syllabus_route():
    """
    Upload a syllabus CSV and build a curriculum graph in Neo4j.
    
    Expected form data:
    - file: CSV file with columns (unit, topic, prerequisite)
    - courseName: Name of the course (e.g., "Machine Learning")
    """
    current_app.logger.info("--- /syllabus/upload Request (Syllabus Graph Builder) ---")
    
    if not syllabus_graph_handler:
        return create_error_response("Syllabus graph handler not available", 503)
    
    if 'file' not in request.files:
        return create_error_response("No file provided. Please upload a CSV file.", 400)
    
    file = request.files['file']
    course_name = request.form.get('courseName', '').strip()
    
    if not file.filename:
        return create_error_response("No file selected", 400)
    
    if not course_name:
        return create_error_response("Course name is required", 400)
    
    if not file.filename.lower().endswith('.csv'):
        return create_error_response("Only CSV files are supported in this version", 400)
    
    temp_dir = tempfile.mkdtemp()
    try:
        # Save uploaded file
        filename = werkzeug_utils.secure_filename(file.filename)
        file_path = os.path.join(temp_dir, filename)
        file.save(file_path)
        
        logger.info(f"Syllabus upload: Processing '{filename}' for course '{course_name}'")
        
        # Parse CSV
        concepts = syllabus_graph_handler.parse_syllabus_csv(file_path)
        
        if not concepts:
            return create_error_response("No valid concepts found in the CSV file. Please check the format.", 422)
        
        # Build graph in Neo4j
        result = syllabus_graph_handler.build_syllabus_graph(course_name, concepts)
        
        return jsonify({
            "success": True,
            "message": result['message'],
            "course": course_name,
            "conceptsProcessed": len(concepts),
            "nodesCreated": result['nodes_created'],
            "edgesCreated": result['edges_created']
        }), 201
        
    except Exception as e:
        logger.error(f"Error processing syllabus upload: {e}", exc_info=True)
        return create_error_response(f"Failed to process syllabus: {str(e)}", 500)
    finally:
        shutil.rmtree(temp_dir)

@app.route('/syllabus/courses/<course_name>', methods=['GET'])
def get_course_concepts_route(course_name):
    """Get all concepts for a course."""
    if not syllabus_graph_handler:
        return create_error_response("Syllabus graph handler not available", 503)
    
    try:
        concepts = syllabus_graph_handler.get_course_concepts(course_name)
        return jsonify({"course": course_name, "concepts": concepts}), 200
    except Exception as e:
        logger.error(f"Error retrieving course concepts: {e}", exc_info=True)
        return create_error_response(f"Failed to retrieve concepts: {str(e)}", 500)

@app.route('/syllabus/courses/<course_name>', methods=['DELETE'])
def delete_course_graph_route(course_name):
    """Delete all concepts for a course."""
    if not syllabus_graph_handler:
        return create_error_response("Syllabus graph handler not available", 503)
    
    try:
        syllabus_graph_handler.delete_course_graph(course_name)
        return jsonify({"success": True, "message": f"Course '{course_name}' deleted"}), 200
    except Exception as e:
        logger.error(f"Error deleting course graph: {e}", exc_info=True)
        return create_error_response(f"Failed to delete course: {str(e)}", 500)

# --- End Syllabus Graph Endpoints ---

# --- NEW Curriculum Graph Endpoints (Normalized Module/Topic/Subtopic Schema) ---
try:
    import curriculum_graph_handler
except ImportError as e:
    logger.warning(f"Failed to import curriculum_graph_handler: {e}")
    curriculum_graph_handler = None


@app.route('/curriculum/upload', methods=['POST'])
def upload_curriculum_route():
    """
    Upload a single unified CSV file and build curriculum graph.
    
    This is the PREFERRED endpoint for ingesting curriculum data.
    It accepts a single CSV with columns:
    - Module (e.g., "Module 1", "Module 2")
    - Lecture Number (e.g., 1, 2, 3)
    - Lecture Topic (e.g., "Introduction to Machine Learning")
    - Subtopics (comma-separated, e.g., "Definition, history, scope")
    - Resources (optional)
    
    Expected form data:
    - file: Single CSV file
    - courseName: Name of the course
    """
    current_app.logger.info("--- /curriculum/upload Request (Single CSV Ingestion) ---")
    
    if not curriculum_graph_handler:
        return create_error_response("Curriculum graph handler not available", 503)
    
    if 'file' not in request.files:
        return create_error_response("No file provided. Please upload a CSV file.", 400)
    
    file = request.files['file']
    course_name = request.form.get('courseName', '').strip()
    
    if not file.filename:
        return create_error_response("No file selected", 400)
    
    if not course_name:
        return create_error_response("Course name is required", 400)
    
    if not file.filename.lower().endswith('.csv'):
        return create_error_response("Only CSV files are supported", 400)
    
    temp_dir = tempfile.mkdtemp()
    try:
        filename = werkzeug_utils.secure_filename(file.filename)
        file_path = os.path.join(temp_dir, filename)
        file.save(file_path)
        
        logger.info(f"Curriculum upload: Processing '{filename}' for course '{course_name}'")
        
        # Delete existing curriculum data for this course first
        try:
            delete_result = curriculum_graph_handler.delete_course_curriculum(course_name)
            if delete_result.get('deleted_count', 0) > 0:
                logger.info(f"Deleted {delete_result['deleted_count']} existing nodes for course '{course_name}'")
        except Exception as delete_error:
            logger.warning(f"Could not delete existing curriculum (may not exist): {delete_error}")
        
        # Use unified CSV parser to create new curriculum
        result = curriculum_graph_handler.ingest_from_unified_csv(course_name, file_path)
        
        return jsonify({
            "success": True,
            "message": f"Curriculum graph created for '{course_name}'",
            **result
        }), 201
        
    except Exception as e:
        logger.error(f"Error processing curriculum upload: {e}", exc_info=True)
        return create_error_response(f"Failed to process curriculum: {str(e)}", 500)
    finally:
        shutil.rmtree(temp_dir)

@app.route('/curriculum/ingest', methods=['POST'])
def ingest_curriculum_route():
    """
    Ingest curriculum data from 3 CSV files: modules, topics, subtopics.
    
    Expected form data:
    - modules: CSV file with columns (module_id, module_name, order)
    - topics: CSV file with columns (topic_id, topic_name, module_id)
    - subtopics: CSV file with columns (subtopic_id, subtopic_name, topic_id)
    - courseName: Name of the course
    """
    current_app.logger.info("--- /curriculum/ingest Request (Normalized Curriculum Graph) ---")
    
    if not curriculum_graph_handler:
        return create_error_response("Curriculum graph handler not available", 503)
    
    course_name = request.form.get('courseName', '').strip()
    if not course_name:
        return create_error_response("Course name is required", 400)
    
    # Check for required files
    required_files = ['modules', 'topics', 'subtopics']
    for file_key in required_files:
        if file_key not in request.files:
            return create_error_response(f"Missing required file: {file_key}.csv", 400)
    
    temp_dir = tempfile.mkdtemp()
    try:
        file_paths = {}
        for file_key in required_files:
            file = request.files[file_key]
            if not file.filename:
                return create_error_response(f"Empty file for {file_key}", 400)
            filename = werkzeug_utils.secure_filename(file.filename)
            file_path = os.path.join(temp_dir, filename)
            file.save(file_path)
            file_paths[file_key] = file_path
        
        logger.info(f"Curriculum ingest: Processing files for course '{course_name}'")
        
        # Parse all CSVs
        modules = curriculum_graph_handler.parse_modules_csv(file_paths['modules'])
        topics = curriculum_graph_handler.parse_topics_csv(file_paths['topics'])
        subtopics = curriculum_graph_handler.parse_subtopics_csv(file_paths['subtopics'])
        
        if not modules:
            return create_error_response("No valid modules found in modules.csv", 422)
        
        # Build the curriculum graph
        result = curriculum_graph_handler.build_curriculum_graph(
            course_name, modules, topics, subtopics
        )
        
        return jsonify({
            "success": True,
            "message": f"Curriculum graph created for '{course_name}'",
            **result
        }), 201
        
    except Exception as e:
        logger.error(f"Error ingesting curriculum: {e}", exc_info=True)
        return create_error_response(f"Failed to ingest curriculum: {str(e)}", 500)
    finally:
        shutil.rmtree(temp_dir)


@app.route('/curriculum/<course>/structure', methods=['GET'])
def get_curriculum_structure_route(course):
    """
    Get the full curriculum structure: Module → Topic → Subtopic.
    """
    if not curriculum_graph_handler:
        return create_error_response("Curriculum graph handler not available", 503)
    
    try:
        structure = curriculum_graph_handler.traverse_curriculum(course)
        return jsonify(structure), 200
    except Exception as e:
        logger.error(f"Error getting curriculum structure: {e}", exc_info=True)
        return create_error_response(f"Failed to get curriculum structure: {str(e)}", 500)


@app.route('/curriculum/<course>/prerequisites/<topic_id>', methods=['GET'])
def get_topic_prerequisites_route(course, topic_id):
    """
    Get all prerequisite subtopics for a given topic.
    """
    if not curriculum_graph_handler:
        return create_error_response("Curriculum graph handler not available", 503)
    
    try:
        prerequisites = curriculum_graph_handler.get_topic_prerequisites(course, topic_id)
        return jsonify({
            "course": course,
            "topic_id": topic_id,
            "prerequisites": prerequisites
        }), 200
    except Exception as e:
        logger.error(f"Error getting prerequisites: {e}", exc_info=True)
        return create_error_response(f"Failed to get prerequisites: {str(e)}", 500)


@app.route('/curriculum/<course>/path/<topic_id>', methods=['GET'])
def get_learning_path_route(course, topic_id):
    """
    Get a dynamic learning path to reach a target topic.
    """
    if not curriculum_graph_handler:
        return create_error_response("Curriculum graph handler not available", 503)
    
    try:
        learning_path = curriculum_graph_handler.get_learning_path(course, topic_id)
        return jsonify({
            "course": course,
            "target_topic": topic_id,
            "learning_path": learning_path
        }), 200
    except Exception as e:
        logger.error(f"Error getting learning path: {e}", exc_info=True)
        return create_error_response(f"Failed to get learning path: {str(e)}", 500)


@app.route('/curriculum/<course>/next-module/<module_id>', methods=['GET'])
def get_next_module_route(course, module_id):
    """
    Get the next module in sequence.
    """
    if not curriculum_graph_handler:
        return create_error_response("Curriculum graph handler not available", 503)
    
    try:
        next_module = curriculum_graph_handler.get_next_module(course, module_id)
        return jsonify({
            "course": course,
            "current_module": module_id,
            "next_module": next_module
        }), 200
    except Exception as e:
        logger.error(f"Error getting next module: {e}", exc_info=True)
        return create_error_response(f"Failed to get next module: {str(e)}", 500)


@app.route('/curriculum/<course>/missing-prerequisites', methods=['POST'])
def detect_missing_prerequisites_route(course):
    """
    Detect which prerequisites are missing for a topic.
    
    Expected JSON:
    - topic_id: Target topic ID
    - completed_subtopics: List of completed subtopic IDs
    """
    if not curriculum_graph_handler:
        return create_error_response("Curriculum graph handler not available", 503)
    
    data = request.get_json()
    if not data:
        return create_error_response("Request must be JSON", 400)
    
    topic_id = data.get('topic_id')
    completed = data.get('completed_subtopics', [])
    
    if not topic_id:
        return create_error_response("Missing 'topic_id'", 400)
    
    try:
        missing = curriculum_graph_handler.detect_missing_prerequisites(
            course, topic_id, completed
        )
        return jsonify({
            "course": course,
            "topic_id": topic_id,
            "missing_prerequisites": missing
        }), 200
    except Exception as e:
        logger.error(f"Error detecting missing prerequisites: {e}", exc_info=True)
        return create_error_response(f"Failed to detect missing prerequisites: {str(e)}", 500)


@app.route('/curriculum/<course>', methods=['DELETE'])
def delete_curriculum_route(course):
    """
    Delete all curriculum data for a course.
    """
    if not curriculum_graph_handler:
        return create_error_response("Curriculum graph handler not available", 503)
    
    try:
        result = curriculum_graph_handler.delete_course_curriculum(course)
        return jsonify(result), 200
    except Exception as e:
        logger.error(f"Error deleting curriculum: {e}", exc_info=True)
        return create_error_response(f"Failed to delete curriculum: {str(e)}", 500)


@app.route('/curriculum/courses', methods=['GET'])
def list_courses_route():
    """
    List all courses with curriculum data.
    """
    if not curriculum_graph_handler:
        return create_error_response("Curriculum graph handler not available", 503)
    
    try:
        courses = curriculum_graph_handler.list_courses()
        return jsonify({"courses": courses}), 200
    except Exception as e:
        logger.error(f"Error listing courses: {e}", exc_info=True)
        return create_error_response(f"Failed to list courses: {str(e)}", 500)

# --- End NEW Curriculum Graph Endpoints ---

# --- Syllabus-Qdrant Document Linking Endpoints ---
try:
    import syllabus_qdrant_linker
except ImportError as e:
    logger.warning(f"Failed to import syllabus_qdrant_linker: {e}")
    syllabus_qdrant_linker = None


@app.route('/curriculum/link-documents', methods=['POST'])
def link_documents_to_curriculum_route():
    """
    Ingest documents from a folder with syllabus context enrichment.
    
    This is the main endpoint for the Syllabus-to-Graph Mapper TODO.
    It bridges the Neo4j curriculum graph with Qdrant vector chunks.
    
    Expected JSON:
    - course_name: Course identifier (e.g., "Machine Learning")
    - syllabus_csv_path: Absolute path to unified syllabus CSV
    - documents_folder: Absolute path to folder containing PDFs (R1.pdf, R2.pdf, etc.)
    - user_id: User ID for Qdrant metadata
    
    Returns:
    - Summary of ingested documents with syllabus context
    """
    current_app.logger.info("--- /curriculum/link-documents Request (Syllabus-Qdrant Linker) ---")
    
    if not syllabus_qdrant_linker:
        return create_error_response("Syllabus-Qdrant linker not available", 503)
    
    data = request.get_json()
    if not data:
        return create_error_response("Request must be JSON", 400)
    
    course_name = data.get('course_name', '').strip()
    syllabus_csv_path = data.get('syllabus_csv_path', '').strip()
    documents_folder = data.get('documents_folder', '').strip()
    user_id = data.get('user_id', '').strip()
    
    if not all([course_name, syllabus_csv_path, documents_folder, user_id]):
        return create_error_response(
            "Missing required fields: course_name, syllabus_csv_path, documents_folder, user_id", 
            400
        )
    
    if not os.path.exists(syllabus_csv_path):
        return create_error_response(f"Syllabus CSV not found: {syllabus_csv_path}", 404)
    
    if not os.path.isdir(documents_folder):
        return create_error_response(f"Documents folder not found: {documents_folder}", 404)
    
    try:
        # 1. Load syllabus CSV
        linker = syllabus_qdrant_linker.SyllabusQdrantLinker()
        num_entries = linker.load_syllabus(syllabus_csv_path, course_name)
        logger.info(f"Loaded {num_entries} syllabus entries for course '{course_name}'")
        
        # 2. Get resource summary to understand what we can link
        resource_summary = linker.get_resource_summary()
        logger.info(f"Resources in syllabus: {list(resource_summary.keys())}")
        
        # 3. Scan documents folder for matching files
        results = {
            "course_name": course_name,
            "syllabus_entries_loaded": num_entries,
            "resources_in_syllabus": list(resource_summary.keys()),
            "documents_processed": [],
            "documents_skipped": [],
            "total_chunks_added": 0
        }
        
        supported_extensions = ['.pdf', '.docx', '.pptx', '.txt', '.csv']
        
        for filename in os.listdir(documents_folder):
            file_ext = os.path.splitext(filename)[1].lower()
            if file_ext not in supported_extensions:
                continue
            
            file_path = os.path.join(documents_folder, filename)
            
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
                # Build metadata with syllabus enrichment
                base_metadata = {
                    'user_id': user_id,
                    'original_name': filename,
                    'file_name': filename
                }
                
                # Enrich with syllabus context
                enriched_metadata = linker.enrich_metadata_with_syllabus(base_metadata, filename)
                
                # Process document using ai_core
                processed_chunks, raw_text, kg_chunks = ai_core.process_document_for_qdrant(
                    file_path=file_path,
                    original_name=filename,
                    user_id=user_id
                )
                
                # Inject syllabus metadata into each chunk
                for chunk in processed_chunks:
                    if chunk.get('metadata'):
                        for key, value in enriched_metadata.items():
                            if key.startswith('syllabus_'):
                                chunk['metadata'][key] = value
                
                # Add to Qdrant
                if processed_chunks and vector_service:
                    num_added = vector_service.add_processed_chunks(processed_chunks)
                    doc_result["chunks_added"] = num_added
                    results["total_chunks_added"] += num_added
                else:
                    doc_result["chunks_added"] = 0
                
                doc_result["status"] = "success"
                results["documents_processed"].append(doc_result)
                
            except Exception as e:
                logger.error(f"Error processing document '{filename}': {e}", exc_info=True)
                doc_result["status"] = "error"
                doc_result["error"] = str(e)
                results["documents_skipped"].append(doc_result)
        
        return jsonify({
            "success": True,
            "message": f"Processed {len(results['documents_processed'])} documents for course '{course_name}'",
            **results
        }), 201
        
    except Exception as e:
        logger.error(f"Error in link-documents: {e}", exc_info=True)
        return create_error_response(f"Failed to link documents: {str(e)}", 500)


@app.route('/curriculum/resource-summary/<course_name>', methods=['GET'])
def get_resource_summary_route(course_name):
    """
    Get a summary of which topics each resource covers for a course.
    
    Requires syllabus to be loaded first via /curriculum/link-documents.
    """
    if not syllabus_qdrant_linker:
        return create_error_response("Syllabus-Qdrant linker not available", 503)
    
    linker = syllabus_qdrant_linker.get_linker()
    if not linker.loaded:
        return create_error_response(
            "No syllabus loaded. Call /curriculum/link-documents first.", 
            400
        )
    
    summary = linker.get_resource_summary()
    return jsonify({
        "course": linker.course_name,
        "resources": summary
    }), 200

# --- End Syllabus-Qdrant Document Linking Endpoints ---

# --- Unified Course Pipeline Endpoints ---
try:
    import course_pipeline
except ImportError as e:
    logger.warning(f"Failed to import course_pipeline: {e}")
    course_pipeline = None


@app.route('/course/ingest', methods=['POST'])
def ingest_course_route():
    """
    One-step course ingestion: CSV → Neo4j + Documents → Qdrant
    
    Expected JSON:
    - course_name: Course identifier (e.g., "Machine Learning")
    - syllabus_csv_path: Path to unified syllabus CSV
    - materials_folder: Path to folder containing PDFs (R1.pdf, R2.pdf, etc.)
    - user_id: User ID for Qdrant metadata (optional, defaults to "admin")
    """
    current_app.logger.info("--- /course/ingest Request (Unified Pipeline) ---")
    
    if not course_pipeline:
        return create_error_response("Course pipeline not available", 503)
    
    data = request.get_json()
    if not data:
        return create_error_response("Request must be JSON", 400)
    
    course_name = data.get('course_name', '').strip()
    syllabus_csv_path = data.get('syllabus_csv_path', '').strip()
    materials_folder = data.get('materials_folder', '').strip()
    user_id = data.get('user_id', 'admin').strip()
    
    if not all([course_name, syllabus_csv_path, materials_folder]):
        return create_error_response(
            "Missing required fields: course_name, syllabus_csv_path, materials_folder", 
            400
        )
    
    try:
        result = course_pipeline.ingest_course(
            course_name=course_name,
            syllabus_csv_path=syllabus_csv_path,
            materials_folder=materials_folder,
            user_id=user_id
        )
        
        if result.get('success'):
            return jsonify(result), 201
        else:
            return jsonify(result), 400
            
    except Exception as e:
        logger.error(f"Error in course ingestion: {e}", exc_info=True)
        return create_error_response(f"Course ingestion failed: {str(e)}", 500)


@app.route('/course/<course>/topic/<topic_id>/context', methods=['GET'])
def get_topic_context_route(course, topic_id):
    """
    Get combined Neo4j + Qdrant context for tutor mode.
    Returns topic info, prerequisites, next topic, and relevant chunks.
    """
    if not course_pipeline:
        return create_error_response("Course pipeline not available", 503)
    
    try:
        context = course_pipeline.get_topic_context(course, topic_id)
        return jsonify(context), 200
    except Exception as e:
        logger.error(f"Error getting topic context: {e}", exc_info=True)
        return create_error_response(f"Failed to get topic context: {str(e)}", 500)


@app.route('/course/<course>/topic/<topic_id>/next', methods=['GET'])
def get_next_curriculum_item_route(course, topic_id):
    """
    Get the next topic/subtopic/module in curriculum sequence.
    Used for auto-advance after mastery.
    """
    if not course_pipeline:
        return create_error_response("Course pipeline not available", 503)
    
    try:
        next_item = course_pipeline.get_next_curriculum_item(course, topic_id)
        return jsonify({
            "course": course,
            "current_topic": topic_id,
            "next_item": next_item,
            "course_complete": next_item is None
        }), 200
    except Exception as e:
        logger.error(f"Error getting next curriculum item: {e}", exc_info=True)
        return create_error_response(f"Failed to get next item: {str(e)}", 500)


@app.route('/course/<course>/topic/<topic_id>/missing-prerequisites', methods=['POST'])
def detect_missing_prerequisites_tutor_route(course, topic_id):
    """
    Check which prerequisites a student is missing for a topic.
    
    Expected JSON:
    - completed_subtopics: List of subtopic IDs the student has completed
    """
    if not course_pipeline:
        return create_error_response("Course pipeline not available", 503)
    
    data = request.get_json() or {}
    completed_subtopics = data.get('completed_subtopics', [])
    
    try:
        missing = course_pipeline.detect_missing_prerequisites(
            course, topic_id, completed_subtopics
        )
        return jsonify({
            "course": course,
            "topic_id": topic_id,
            "missing_prerequisites": missing,
            "has_missing": len(missing) > 0
        }), 200
    except Exception as e:
        logger.error(f"Error detecting prerequisites: {e}", exc_info=True)
        return create_error_response(f"Failed to check prerequisites: {str(e)}", 500)


@app.route('/course/<course>/visualization', methods=['GET'])
def get_curriculum_visualization_route(course):
    """
    Get curriculum data formatted for visualization.
    Returns nodes and edges for graph display in admin.
    Uses the new normalized curriculum graph handler.
    """
    if not curriculum_graph_handler:
        return create_error_response("Curriculum graph handler not available", 503)
    
    try:
        # Get curriculum structure from the NEW normalized schema
        curriculum = curriculum_graph_handler.traverse_curriculum(course)
        
        nodes = []
        edges = []
        
        # Build visualization data from curriculum structure
        modules = curriculum.get('modules', [])
        
        for i, module in enumerate(modules):
            module_id = module.get('id')
            nodes.append({
                "id": module_id,
                "label": module.get('name'),
                "type": "module",
                "order": module.get('order', i + 1)
            })
            
            # Add PRECEDES edges between modules
            if i > 0:
                prev_module = modules[i - 1]
                edges.append({
                    "from": prev_module.get('id'),
                    "to": module_id,
                    "type": "PRECEDES"
                })
            
            # Add topics for this module
            for topic in module.get('topics', []):
                topic_id = topic.get('id')
                nodes.append({
                    "id": topic_id,
                    "label": topic.get('name'),
                    "type": "topic",
                    "module_id": module_id
                })
                
                # Add HAS_TOPIC edge from module to topic
                edges.append({
                    "from": module_id,
                    "to": topic_id,
                    "type": "HAS_TOPIC"
                })
                
                # Add subtopics (prerequisites) for this topic
                for subtopic in topic.get('subtopics', []):
                    subtopic_id = subtopic.get('id')
                    
                    # Add subtopic node if not already present
                    if not any(n['id'] == subtopic_id for n in nodes):
                        nodes.append({
                            "id": subtopic_id,
                            "label": subtopic.get('name'),
                            "type": "subtopic",
                            "topic_id": topic_id
                        })
                    
                    # Add PREREQUISITE_OF edge from subtopic to topic
                    edges.append({
                        "from": subtopic_id,
                        "to": topic_id,
                        "type": "PREREQUISITE_OF"
                    })
        
        logger.info(f"Visualization for '{course}': {len(nodes)} nodes, {len(edges)} edges")
        
        return jsonify({
            "course": course,
            "nodes": nodes,
            "edges": edges
        }), 200
        
    except Exception as e:
        logger.error(f"Error getting visualization: {e}", exc_info=True)
        return create_error_response(f"Failed to get visualization: {str(e)}", 500)


# --- End Unified Course Pipeline Endpoints ---

if __name__ == '__main__':

    @app.route('/process_media_file', methods=['POST'])
    def process_media_file_route():
        """Handles direct file uploads of audio, video, or images for transcription/OCR."""
        current_app.logger.info("--- /process_media_file Request ---")
        data = request.get_json()
        if not data:
            return create_error_response("Request must be JSON", 400)

        file_path = data.get('file_path')
        media_type = data.get('media_type')  # Expected: 'audio', 'video', or 'image'

        if not file_path or not media_type:
            return create_error_response("Missing 'file_path' or 'media_type'", 400)
        if not os.path.exists(file_path):
            return create_error_response(f"File not found at path: {file_path}", 404)

        try:
            media_processor = get_media_processor_module()
            text_content = None
            if media_type == 'audio':
                text_content = media_processor.process_uploaded_audio(file_path)
            elif media_type == 'video':
                text_content = media_processor.process_uploaded_video(file_path)
            elif media_type == 'image':
                text_content = media_processor.process_uploaded_image(file_path)
            else:
                return create_error_response(f"Unsupported media_type: {media_type}", 400)
            
            if not text_content or not text_content.strip():
                return create_error_response(f"Failed to extract meaningful text from the {media_type} file.", 422)

            return jsonify({
                "success": True,
                "message": f"Successfully extracted text from {media_type} file.",
                "text_content": text_content,
            }), 200
        except Exception as e:
            logger.error(f"Error in /process_media_file for type '{media_type}': {e}", exc_info=True)
            return create_error_response(f"Failed to process {media_type} file: {str(e)}", 500)

    @app.route('/process_url', methods=['POST'])
    def process_url_source_route():
        """Handles YouTube and generic web URLs."""
        current_app.logger.info("--- /process_url Request ---")
        data = request.get_json()
        if not data: return create_error_response("Request must be JSON", 400)
        
        url = data.get('url')
        user_id = data.get('user_id')

        if not url or not user_id: return create_error_response("Missing 'url' or 'user_id'", 400)
        
        try:
            # Delegate to the knowledge engine
            knowledge_engine = get_knowledge_engine_module()
            extracted_text, final_title, source_type = knowledge_engine.process_url_source(url, user_id)
            if not extracted_text:
                return create_error_response(f"Failed to extract meaningful text from the {source_type}.", 422)

            return jsonify({
                "success": True,
                "message": f"Successfully extracted text from {source_type}.",
                "text_content": extracted_text,
                "title": final_title,
                "source_type": source_type,
            }), 200
        except Exception as e:
            logger.error(f"Error in /process_url for URL '{url}': {e}", exc_info=True)
            return create_error_response(f"Failed to process URL: {str(e)}", 500)

# Initialize Knowledge Bridge
knowledge_bridge = create_knowledge_bridge()

@app.route('/curriculum/alignment', methods=['POST'])
async def curriculum_alignment_route():
    data = request.get_json()
    if not data or 'subject' not in data:
        return create_error_response("Missing 'subject'", 400)
    
    subject = data['subject']
    existing_counts = data.get('existing_counts', {})
    
    try:
        report = await knowledge_bridge.assess_data_alignment(subject, existing_counts)
        return jsonify(report), 200
    except Exception as e:
        logger.error(f"Alignment check failed: {str(e)}")
        return create_error_response(str(e), 500)

@app.route('/augment_data', methods=['POST'])
def augment_data_route():
    """
    Applies pedagogical augmentation to provided training data.
    """
    data = request.get_json()
    if not data or 'data' not in data:
        return create_error_response("Missing 'data' array", 400)
    
    input_records = data['data']
    augmented_results = []
    
    logger.info(f"[Augmentor] Processing {len(input_records)} records for augmentation.")
    
    for item in input_records:
        try:
            from data_augmentor import run_augmentation_pipeline
            # Run augmentation (returns list of variations)
            variations = run_augmentation_pipeline(item)
            # Remove original from variations to avoid sending it back if requested
            augmented_results.extend([v for v in variations if v.get('is_augmented')])
        except Exception as e:
            logger.error(f"Augmentation failed for item: {str(e)}")
            
    return jsonify({
        "message": f"Generated {len(augmented_results)} augmented variations.",
        "augmented_data": augmented_results
    }), 200


if __name__ == '__main__':
    logger.info(f"--- Starting RAG & Knowledge API Service on port {config.API_PORT} ---")
    # Using threaded=False for stability with external processes like ffmpeg/tesseract
    app.run(host='0.0.0.0', port=config.API_PORT, debug=False, threaded=False)