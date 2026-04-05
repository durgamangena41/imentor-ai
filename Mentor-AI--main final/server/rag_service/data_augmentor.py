import random
import logging
from typing import List, Dict

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("data_augmentor")

class DataAugmentor:
    """
    Handles data augmentation for instructional datasets.
    Implements paraphrasing, difficulty variations, and distraction insertion.
    """

    def __init__(self):
        # In a full setup, we might load a T5 paraphraser here.
        # For Py3.12 and this architecture, we use pedagogical augmentation rules.
        self.difficulty_modifiers = {
            "beginner": ["Briefly explain", "In simple terms,", "Give an easy example of"],
            "advanced": ["Critically analyze", "Discuss the implications of", "Explain the complex relationship between"],
        }

    def augment_instruction(self, instruction: str) -> List[str]:
        """
        Creates multiple variations of a single instruction.
        """
        variations = []
        
        # 1. Paraphrasing by Wording Changes
        templates = [
            f"Can you tell me about {instruction.lower()}?",
            f"Explain {instruction.lower()} to a student.",
            f"I'm confused about {instruction.lower()}, can you help?",
            f"Provide a detailed breakdown of {instruction.lower()}."
        ]
        
        # Select 2 random paraphrases
        variations.extend(random.sample(templates, 2))
        
        return variations

    def vary_difficulty(self, instruction: str) -> List[Dict]:
        """
        Generates instruction variations at different Bloom's Taxonomy levels.
        """
        modified = []
        for level, prefixes in self.difficulty_modifiers.items():
            prefix = random.choice(prefixes)
            modified.append({
                "instruction": f"{prefix} {instruction}",
                "difficulty": level
            })
        return modified

    def inject_noise(self, text: str) -> str:
        """
        Simulates student typos or informal language to increase model robustness.
        """
        # Simple heuristic noise
        words = text.split()
        if len(words) > 5:
            idx = random.randint(0, len(words) - 1)
            # Simulate a common typo or lowercase conversion
            words[idx] = words[idx].lower()
        return " ".join(words)

def run_augmentation_pipeline(item: Dict) -> List[Dict]:
    """
    Entry point for augmenting a single training pair.
    """
    augmentor = DataAugmentor()
    output = []
    
    # Original
    output.append(item)
    
    # Paraphrased variations
    paras = augmentor.augment_instruction(item["instruction"])
    for p in paras:
        output.append({
            "instruction": p,
            "output": item["output"],
            "difficulty": item.get("difficulty", "intermediate"),
            "is_augmented": True
        })
        
    return output
