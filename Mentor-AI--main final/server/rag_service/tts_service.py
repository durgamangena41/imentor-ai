# server/rag_service/tts_service.py
import torch
import logging
from transformers import SpeechT5Processor, SpeechT5ForTextToSpeech, SpeechT5HifiGan
from datasets import load_dataset
from pydub import AudioSegment
import io
import numpy as np
import soundfile as sf

logger = logging.getLogger(__name__)

# --- Model Configuration ---
# Microsoft SpeechT5 is a high-quality, local, multi-speaker model
MODEL_ID = "microsoft/speecht5_tts"
VOCODER_ID = "microsoft/speecht5_hifigan"

processor = None
model = None
vocoder = None
speaker_embeddings = None

def initialize_tts():
    """
    Initializes the SpeechT5 model and loads speaker embeddings.
    """
    global processor, model, vocoder, speaker_embeddings
    
    if model is None:
        try:
            device = "cuda" if torch.cuda.is_available() else "cpu"
            logger.info(f"Initializing SpeechT5 TTS on device: {device}")
            
            processor = SpeechT5Processor.from_pretrained(MODEL_ID)
            model = SpeechT5ForTextToSpeech.from_pretrained(MODEL_ID).to(device)
            vocoder = SpeechT5HifiGan.from_pretrained(VOCODER_ID).to(device)
            
            # Load xvector embeddings for different speakers from the CMU Arctic dataset
            logger.info("Loading speaker embeddings...")
            
            # Try to load speaker embeddings, but fallback to random if it fails
            try:
                embeddings_dataset = load_dataset(
                    "Matthijs/cmu-arctic-xvectors",
                    split="validation"
                )
                speaker_embeddings = {
                    'A': torch.tensor(embeddings_dataset[7306]["xvector"]).unsqueeze(0).to(device),
                    'B': torch.tensor(embeddings_dataset[0]["xvector"]).unsqueeze(0).to(device),
                    'C': torch.tensor(embeddings_dataset[2000]["xvector"]).unsqueeze(0).to(device)
                }
                logger.info("Speaker embeddings loaded from CMU Arctic dataset.")
            except Exception as e:
                logger.warning(f"Failed to load speaker embeddings: {e}. Using random fallback.")
                fallback_embed = torch.randn(1, 512).to(device)
                speaker_embeddings = {
                    'A': fallback_embed,
                    'B': fallback_embed,
                    'C': fallback_embed
                }
            logger.info("SpeechT5 initialized successfully.")
        except Exception as e:
            logger.critical(f"FATAL: Could not initialize SpeechT5. TTS will fail. Error: {e}", exc_info=True)

def synthesize_speech(text: str, speaker: str) -> AudioSegment:
    """
    Synthesizes speech using SpeechT5 with specific speaker embeddings.

    Args:
        text (str): The text to synthesize.
        speaker (str): The speaker identifier ('A', 'B', or 'C').

    Returns:
        AudioSegment: A pydub AudioSegment object of the synthesized speech.
    """
    global model, processor, vocoder, speaker_embeddings

    if model is None:
        initialize_tts()
        if model is None:
            raise RuntimeError("TTS service failed to initialize.")
    
    try:
        device = model.device
        
        # 1. Prepare Inputs
        inputs = processor(text=text, return_tensors="pt").to(device)
        
        # 2. Select Speaker Embedding
        speaker_key = speaker.upper()
        # Fallback to 'A' if speaker not found
        speaker_vector = speaker_embeddings.get(speaker_key, speaker_embeddings.get('A'))
        
        # Safety check if even 'A' is missing (shouldn't happen due to init logic)
        if speaker_vector is None:
             speaker_vector = torch.randn(1, 512).to(device)

        # 3. Generate Speech
        with torch.no_grad():
            speech = model.generate_speech(inputs["input_ids"], speaker_vector, vocoder=vocoder)

        # 4. Convert to AudioSegment (pydub)
        # SpeechT5 output is 16kHz numpy array
        speech_np = speech.cpu().numpy()
        
        # Create a buffer
        wav_buffer = io.BytesIO()
        sf.write(wav_buffer, speech_np, samplerate=16000, format='WAV')
        wav_buffer.seek(0)
        
        audio_segment = AudioSegment.from_wav(wav_buffer)
        
        return audio_segment

    except Exception as e:
        logger.error(f"Error during TTS synthesis for speaker {speaker}: {e}", exc_info=True)
        raise IOError(f"Failed to synthesize audio for speaker {speaker}.")
