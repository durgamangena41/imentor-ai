import os
import google.generativeai as genai
from dotenv import load_dotenv

# Load .env from server directory
dotenv_path = os.path.join(os.path.dirname(__file__), '..', '.env')
load_dotenv(dotenv_path=dotenv_path)

api_key = os.getenv('GEMINI_API_KEY')
genai.configure(api_key=api_key)

with open('available_models.txt', 'w') as f:
    try:
        f.write("Available models:\n")
        for m in genai.list_models():
            if 'generateContent' in m.supported_generation_methods:
                f.write(f"- {m.name}\n")
    except Exception as e:
        f.write(f"Error listing models: {e}\n")
