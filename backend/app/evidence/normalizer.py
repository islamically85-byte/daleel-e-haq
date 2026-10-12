import re
import unicodedata

# Arabic diacritics pattern (Tashkeel)
ARABIC_DIACRITICS = re.compile(r"[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]")
TATWEEL = "\u0640"


def normalize_arabic(text: str) -> str:
    """
    Normalizes Arabic text for robust search without modifying canonical original text:
    - Removes Tashkeel (harakat / diacritics)
    - Removes Tatweel / Kashida
    - Normalizes various forms of Alif (أ, إ, آ, ٱ -> ا)
    - Normalizes Ta Marbuta (ة -> ه)
    - Normalizes Alif Maqsura (ى -> ي)
    - Strips whitespace
    """
    if not text:
        return ""
    
    # Remove diacritics
    text = ARABIC_DIACRITICS.sub("", text)
    
    # Remove tatweel
    text = text.replace(TATWEEL, "")
    
    # Normalize Alifs
    text = re.sub(r"[أإآٱ]", "ا", text)
    
    # Normalize Ta Marbuta
    text = text.replace("ة", "ه")
    
    # Normalize Alif Maqsura
    text = text.replace("ى", "ي")
    
    # Normalize multiple whitespaces
    text = re.sub(r"\s+", " ", text).strip()
    return text


def normalize_urdu(text: str) -> str:
    """
    Normalizes Urdu search text:
    - Normalizes Arabic/Urdu character variants (e.g., ك vs ک, ي vs ی, ة vs ہ)
    - Removes diacritics (Zabar, Zer, Pesh)
    """
    if not text:
        return ""
    
    # Remove diacritics
    text = ARABIC_DIACRITICS.sub("", text)
    
    # Normalize kaf
    text = text.replace("ك", "ک")
    
    # Normalize yeh
    text = text.replace("ي", "ی").replace("ى", "ی")
    
    # Normalize heh
    text = text.replace("ة", "ہ").replace("ه", "ہ")
    
    # Normalize whitespace
    text = re.sub(r"\s+", " ", text).strip()
    return text


def extract_potential_quran_reference(query: str):
    """
    Extracts potential surah and ayah numbers from queries like:
    - "2:255"
    - "Surah 2 Verse 255"
    - "Al-Baqarah 255"
    - "سورة البقرة 255"
    - "2/255"
    Returns (surah_num, ayah_num) or None.
    """
    # Pattern: 1:1 or 2:255 or 2/255
    match = re.search(r"\b([1-9][0-9]?|1[0-1][0-4])[:/]([1-9][0-9]{0,2})\b", query)
    if match:
        surah = int(match.group(1))
        ayah = int(match.group(2))
        return (surah, ayah)
    
    # Pattern: surah X ayah Y or verse Y
    match2 = re.search(r"(?:surah|sura|chapter)\s*([1-9][0-9]?|1[0-1][0-4])\s*(?:ayah|ayat|verse)\s*([1-9][0-9]{0,2})", query, re.IGNORECASE)
    if match2:
        return (int(match2.group(1)), int(match2.group(2)))
        
    return None
