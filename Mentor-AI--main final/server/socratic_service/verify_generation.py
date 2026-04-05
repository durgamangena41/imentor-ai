import google.generativeai as genai
import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '../.env'))
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    print("API Key missing")
    exit(1)

genai.configure(api_key=GEMINI_API_KEY)

MODEL_NAME = 'gemini-2.0-flash'
print(f"Testing generation with model: {MODEL_NAME}")

try:
    model = genai.GenerativeModel(MODEL_NAME)
    response = model.generate_content("Hello, can you hear me?")
    print(f"Success! Response: {response.text}")
except Exception as e:
    print(f"Failed with {MODEL_NAME}: {e}")
