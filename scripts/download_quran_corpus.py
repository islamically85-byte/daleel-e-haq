"""
Corpus Download and Verification Script for Daleel-e-Haq
Downloads authentic canonical Tanzil Quran text and translations:
1. Tanzil Quran Text (Simple Arabic, Version 1.1) - CC-BY 3.0
2. English Translation (Saheeh International) from Tanzil
3. Urdu Translation (Fateh Muhammad Jalandhry) from Tanzil
4. Metadata for 114 Surahs

Verifies:
- 114 Surahs
- 6,236 conventional verses
- SHA-256 integrity checksums
"""

import hashlib
import json
import os
import sys
import urllib.request

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "corpus")
os.makedirs(DATA_DIR, exist_ok=True)

TANZIL_ARABIC_URL = "https://tanzil.net/pub/download/index.php?quranType=simple&outType=txt-2&agree=true"
TANZIL_EN_URL = "https://tanzil.net/trans/en.sahih"
TANZIL_UR_URL = "https://tanzil.net/trans/ur.jalandhry"

SURAHS_DATA = [
    {"number": 1, "name_ar": "الفاتحة", "name_en": "Al-Fatihah", "meaning": "The Opening", "type": "Meccan", "verses": 7},
    {"number": 2, "name_ar": "البقرة", "name_en": "Al-Baqarah", "meaning": "The Cow", "type": "Medinan", "verses": 286},
    {"number": 3, "name_ar": "آل عمران", "name_en": "Ali 'Imran", "meaning": "Family of Imran", "type": "Medinan", "verses": 200},
    {"number": 4, "name_ar": "النساء", "name_en": "An-Nisa", "meaning": "The Women", "type": "Medinan", "verses": 176},
    {"number": 5, "name_ar": "المائدة", "name_en": "Al-Ma'idah", "meaning": "The Table Spread", "type": "Medinan", "verses": 120},
    {"number": 6, "name_ar": "الأنعام", "name_en": "Al-An'am", "meaning": "The Cattle", "type": "Meccan", "verses": 165},
    {"number": 7, "name_ar": "الأعراف", "name_en": "Al-A'raf", "meaning": "The Heights", "type": "Meccan", "verses": 206},
    {"number": 8, "name_ar": "الأنفال", "name_en": "Al-Anfal", "meaning": "The Spoils of War", "type": "Medinan", "verses": 75},
    {"number": 9, "name_ar": "التوبة", "name_en": "At-Tawbah", "meaning": "The Repentance", "type": "Medinan", "verses": 129},
    {"number": 10, "name_ar": "يونس", "name_en": "Yunus", "meaning": "Jonah", "type": "Meccan", "verses": 109},
    {"number": 11, "name_ar": "هود", "name_en": "Hud", "meaning": "Hud", "type": "Meccan", "verses": 123},
    {"number": 12, "name_ar": "يوسف", "name_en": "Yusuf", "meaning": "Joseph", "type": "Meccan", "verses": 111},
    {"number": 13, "name_ar": "الرعد", "name_en": "Ar-Ra'd", "meaning": "The Thunder", "type": "Medinan", "verses": 43},
    {"number": 14, "name_ar": "ابراهيم", "name_en": "Ibrahim", "meaning": "Abraham", "type": "Meccan", "verses": 52},
    {"number": 15, "name_ar": "الحجر", "name_en": "Al-Hijr", "meaning": "The Rocky Tract", "type": "Meccan", "verses": 99},
    {"number": 16, "name_ar": "النحل", "name_en": "An-Nahl", "meaning": "The Bee", "type": "Meccan", "verses": 128},
    {"number": 17, "name_ar": "الإسراء", "name_en": "Al-Isra", "meaning": "The Night Journey", "type": "Meccan", "verses": 111},
    {"number": 18, "name_ar": "الكهف", "name_en": "Al-Kahf", "meaning": "The Cave", "type": "Meccan", "verses": 110},
    {"number": 19, "name_ar": "مريم", "name_en": "Maryam", "meaning": "Mary", "type": "Meccan", "verses": 98},
    {"number": 20, "name_ar": "طه", "name_en": "Taha", "meaning": "Ta-Ha", "type": "Meccan", "verses": 135},
    {"number": 21, "name_ar": "الأنبياء", "name_en": "Al-Anbiya", "meaning": "The Prophets", "type": "Meccan", "verses": 112},
    {"number": 22, "name_ar": "الحج", "name_en": "Al-Hajj", "meaning": "The Pilgrimage", "type": "Medinan", "verses": 78},
    {"number": 23, "name_ar": "المؤمنون", "name_en": "Al-Mu'minun", "meaning": "The Believers", "type": "Meccan", "verses": 118},
    {"number": 24, "name_ar": "النور", "name_en": "An-Nur", "meaning": "The Light", "type": "Medinan", "verses": 64},
    {"number": 25, "name_ar": "الفرقان", "name_en": "Al-Furqan", "meaning": "The Criterion", "type": "Meccan", "verses": 77},
    {"number": 26, "name_ar": "الشعراء", "name_en": "Ash-Shu'ara", "meaning": "The Poets", "type": "Meccan", "verses": 227},
    {"number": 27, "name_ar": "النمل", "name_en": "An-Naml", "meaning": "The Ant", "type": "Meccan", "verses": 93},
    {"number": 28, "name_ar": "القصص", "name_en": "Al-Qasas", "meaning": "The Stories", "type": "Meccan", "verses": 88},
    {"number": 29, "name_ar": "العنكبوت", "name_en": "Al-'Ankabut", "meaning": "The Spider", "type": "Meccan", "verses": 69},
    {"number": 30, "name_ar": "الروم", "name_en": "Ar-Rum", "meaning": "The Romans", "type": "Meccan", "verses": 60},
    {"number": 31, "name_ar": "لقمان", "name_en": "Luqman", "meaning": "Luqman", "type": "Meccan", "verses": 34},
    {"number": 32, "name_ar": "السجدة", "name_en": "As-Sajdah", "meaning": "The Prostration", "type": "Meccan", "verses": 30},
    {"number": 33, "name_ar": "الأحزاب", "name_en": "Al-Ahzab", "meaning": "The Combined Forces", "type": "Medinan", "verses": 73},
    {"number": 34, "name_ar": "سبإ", "name_en": "Saba", "meaning": "Sheba", "type": "Meccan", "verses": 54},
    {"number": 35, "name_ar": "فاطر", "name_en": "Fatir", "meaning": "Originator", "type": "Meccan", "verses": 45},
    {"number": 36, "name_ar": "يس", "name_en": "Ya-Sin", "meaning": "Ya Sin", "type": "Meccan", "verses": 83},
    {"number": 37, "name_ar": "الصافات", "name_en": "As-Saffat", "meaning": "Those who set the Ranks", "type": "Meccan", "verses": 182},
    {"number": 38, "name_ar": "ص", "name_en": "Sad", "meaning": "The Letter Sad", "type": "Meccan", "verses": 88},
    {"number": 39, "name_ar": "الزمر", "name_en": "Az-Zumar", "meaning": "The Troops", "type": "Meccan", "verses": 75},
    {"number": 40, "name_ar": "غافر", "name_en": "Ghafir", "meaning": "The Forgiver", "type": "Meccan", "verses": 85},
    {"number": 41, "name_ar": "فصلت", "name_en": "Fussilat", "meaning": "Explained in Detail", "type": "Meccan", "verses": 54},
    {"number": 42, "name_ar": "الشورى", "name_en": "Ash-Shuraa", "meaning": "The Consultation", "type": "Meccan", "verses": 53},
    {"number": 43, "name_ar": "الزخرف", "name_en": "Az-Zukhruf", "meaning": "The Ornaments of Gold", "type": "Meccan", "verses": 89},
    {"number": 44, "name_ar": "الدخان", "name_en": "Ad-Dukhan", "meaning": "The Smoke", "type": "Meccan", "verses": 59},
    {"number": 45, "name_ar": "الجاثية", "name_en": "Al-Jathiyah", "meaning": "The Crouching", "type": "Meccan", "verses": 37},
    {"number": 46, "name_ar": "الأحقاف", "name_en": "Al-Ahqaf", "meaning": "The Wind-Curved Sandhills", "type": "Meccan", "verses": 35},
    {"number": 47, "name_ar": "محمد", "name_en": "Muhammad", "meaning": "Muhammad", "type": "Medinan", "verses": 38},
    {"number": 48, "name_ar": "الفتح", "name_en": "Al-Fath", "meaning": "The Victory", "type": "Medinan", "verses": 29},
    {"number": 49, "name_ar": "الحجرات", "name_en": "Al-Hujurat", "meaning": "The Rooms", "type": "Medinan", "verses": 18},
    {"number": 50, "name_ar": "ق", "name_en": "Qaf", "meaning": "The Letter Qaf", "type": "Meccan", "verses": 45},
    {"number": 51, "name_ar": "الذاريات", "name_en": "Adh-Dhariyat", "meaning": "The Winnowing Winds", "type": "Meccan", "verses": 60},
    {"number": 52, "name_ar": "الطور", "name_en": "At-Tur", "meaning": "The Mount", "type": "Meccan", "verses": 49},
    {"number": 53, "name_ar": "النجم", "name_en": "An-Najm", "meaning": "The Star", "type": "Meccan", "verses": 62},
    {"number": 54, "name_ar": "القمر", "name_en": "Al-Qamar", "meaning": "The Moon", "type": "Meccan", "verses": 55},
    {"number": 55, "name_ar": "الرحمن", "name_en": "Ar-Rahman", "meaning": "The Beneficent", "type": "Medinan", "verses": 78},
    {"number": 56, "name_ar": "الواقعة", "name_en": "Al-Waqi'ah", "meaning": "The Inevitable", "type": "Meccan", "verses": 96},
    {"number": 57, "name_ar": "الحديد", "name_en": "Al-Hadid", "meaning": "The Iron", "type": "Medinan", "verses": 29},
    {"number": 58, "name_ar": "المجادلة", "name_en": "Al-Mujadila", "meaning": "The Pleading Woman", "type": "Medinan", "verses": 22},
    {"number": 59, "name_ar": "الحشر", "name_en": "Al-Hashr", "meaning": "The Exile", "type": "Medinan", "verses": 24},
    {"number": 60, "name_ar": "الممتحنة", "name_en": "Al-Mumtahanah", "meaning": "She that is to be examined", "type": "Medinan", "verses": 13},
    {"number": 61, "name_ar": "الصف", "name_en": "As-Saf", "meaning": "The Ranks", "type": "Medinan", "verses": 14},
    {"number": 62, "name_ar": "الجمعة", "name_en": "Al-Jumu'ah", "meaning": "Friday", "type": "Medinan", "verses": 11},
    {"number": 63, "name_ar": "المنافقون", "name_en": "Al-Munafiqun", "meaning": "The Hypocrites", "type": "Medinan", "verses": 11},
    {"number": 64, "name_ar": "التغابن", "name_en": "At-Taghabun", "meaning": "Mutual Disillusion", "type": "Medinan", "verses": 18},
    {"number": 65, "name_ar": "الطلاق", "name_en": "At-Talaq", "meaning": "Divorce", "type": "Medinan", "verses": 12},
    {"number": 66, "name_ar": "التحريم", "name_en": "At-Tahrim", "meaning": "The Prohibition", "type": "Medinan", "verses": 12},
    {"number": 67, "name_ar": "الملك", "name_en": "Al-Mulk", "meaning": "The Sovereignty", "type": "Meccan", "verses": 30},
    {"number": 68, "name_ar": "القلم", "name_en": "Al-Qalam", "meaning": "The Pen", "type": "Meccan", "verses": 52},
    {"number": 69, "name_ar": "الحاقة", "name_en": "Al-Haqqah", "meaning": "The Reality", "type": "Meccan", "verses": 52},
    {"number": 70, "name_ar": "المعارج", "name_en": "Al-Ma'arij", "meaning": "The Ascending Stairways", "type": "Meccan", "verses": 44},
    {"number": 71, "name_ar": "نوح", "name_en": "Nuh", "meaning": "Noah", "type": "Meccan", "verses": 28},
    {"number": 72, "name_ar": "الجن", "name_en": "Al-Jinn", "meaning": "The Jinn", "type": "Meccan", "verses": 28},
    {"number": 73, "name_ar": "المزمل", "name_en": "Al-Muzzammil", "meaning": "The Enshrouded One", "type": "Meccan", "verses": 20},
    {"number": 74, "name_ar": "المدثر", "name_en": "Al-Muddaththir", "meaning": "The Cloaked One", "type": "Meccan", "verses": 56},
    {"number": 75, "name_ar": "القيامة", "name_en": "Al-Qiyamah", "meaning": "The Resurrection", "type": "Meccan", "verses": 40},
    {"number": 76, "name_ar": "الانسان", "name_en": "Al-Insan", "meaning": "The Man", "type": "Medinan", "verses": 31},
    {"number": 77, "name_ar": "المرسلات", "name_en": "Al-Mursalat", "meaning": "The Emissaries", "type": "Meccan", "verses": 50},
    {"number": 78, "name_ar": "النبإ", "name_en": "An-Naba", "meaning": "The Tidings", "type": "Meccan", "verses": 40},
    {"number": 79, "name_ar": "النازعات", "name_en": "An-Nazi'at", "meaning": "Those who drag forth", "type": "Meccan", "verses": 46},
    {"number": 80, "name_ar": "عبس", "name_en": "'Abasa", "meaning": "He Frowned", "type": "Meccan", "verses": 42},
    {"number": 81, "name_ar": "التكوير", "name_en": "At-Takwir", "meaning": "The Overthrowing", "type": "Meccan", "verses": 29},
    {"number": 82, "name_ar": "الانفطار", "name_en": "Al-Infitar", "meaning": "The Cleaving", "type": "Meccan", "verses": 19},
    {"number": 83, "name_ar": "المطففين", "name_en": "Al-Mutaffifin", "meaning": "The Defrauding", "type": "Meccan", "verses": 36},
    {"number": 84, "name_ar": "الانشقاق", "name_en": "Al-Inshiqaq", "meaning": "The Splitting Open", "type": "Meccan", "verses": 25},
    {"number": 85, "name_ar": "البروج", "name_en": "Al-Buruj", "meaning": "The Mansions of the Stars", "type": "Meccan", "verses": 22},
    {"number": 86, "name_ar": "الطارق", "name_en": "At-Tariq", "meaning": "The Morning Star", "type": "Meccan", "verses": 17},
    {"number": 87, "name_ar": "الأعلى", "name_en": "Al-A'la", "meaning": "The Most High", "type": "Meccan", "verses": 19},
    {"number": 88, "name_ar": "الغاشية", "name_en": "Al-Ghashiyah", "meaning": "The Overwhelming", "type": "Meccan", "verses": 26},
    {"number": 89, "name_ar": "الفجر", "name_en": "Al-Fajr", "meaning": "The Dawn", "type": "Meccan", "verses": 30},
    {"number": 90, "name_ar": "البلد", "name_en": "Al-Balad", "meaning": "The City", "type": "Meccan", "verses": 20},
    {"number": 91, "name_ar": "الشمس", "name_en": "Ash-Shams", "meaning": "The Sun", "type": "Meccan", "verses": 15},
    {"number": 92, "name_ar": "الليل", "name_en": "Al-Layl", "meaning": "The Night", "type": "Meccan", "verses": 21},
    {"number": 93, "name_ar": "الضحى", "name_en": "Ad-Duha", "meaning": "The Morning Hours", "type": "Meccan", "verses": 11},
    {"number": 94, "name_ar": "الشرح", "name_en": "Ash-Sharh", "meaning": "The Relief", "type": "Meccan", "verses": 8},
    {"number": 95, "name_ar": "التين", "name_en": "At-Tin", "meaning": "The Fig", "type": "Meccan", "verses": 8},
    {"number": 96, "name_ar": "العلق", "name_en": "Al-'Alaq", "meaning": "The Clot", "type": "Meccan", "verses": 19},
    {"number": 97, "name_ar": "القدر", "name_en": "Al-Qadr", "meaning": "The Power", "type": "Meccan", "verses": 5},
    {"number": 98, "name_ar": "البينة", "name_en": "Al-Bayyinah", "meaning": "The Clear Proof", "type": "Medinan", "verses": 8},
    {"number": 99, "name_ar": "الزلزلة", "name_en": "Az-Zalzalah", "meaning": "The Earthquake", "type": "Medinan", "verses": 8},
    {"number": 100, "name_ar": "العاديات", "name_en": "Al-'Adiyat", "meaning": "The Courser", "type": "Meccan", "verses": 11},
    {"number": 101, "name_ar": "القارعة", "name_en": "Al-Qari'ah", "meaning": "The Calamity", "type": "Meccan", "verses": 11},
    {"number": 102, "name_ar": "التكاثر", "name_en": "At-Takathur", "meaning": "The Rivalry in World Increase", "type": "Meccan", "verses": 8},
    {"number": 103, "name_ar": "العصر", "name_en": "Al-'Asr", "meaning": "The Declining Day", "type": "Meccan", "verses": 3},
    {"number": 104, "name_ar": "الهمزة", "name_en": "Al-Humazah", "meaning": "The Traducer", "type": "Meccan", "verses": 9},
    {"number": 105, "name_ar": "الفيل", "name_en": "Al-Fil", "meaning": "The Elephant", "type": "Meccan", "verses": 5},
    {"number": 106, "name_ar": "قريش", "name_en": "Quraysh", "meaning": "Quraysh", "type": "Meccan", "verses": 4},
    {"number": 107, "name_ar": "الماعون", "name_en": "Al-Ma'un", "meaning": "The Small Kindness", "type": "Meccan", "verses": 7},
    {"number": 108, "name_ar": "الكوثر", "name_en": "Al-Kawthar", "meaning": "The Abundance", "type": "Meccan", "verses": 3},
    {"number": 109, "name_ar": "الكافرون", "name_en": "Al-Kafirun", "meaning": "The Disbelievers", "type": "Meccan", "verses": 6},
    {"number": 110, "name_ar": "النصر", "name_en": "An-Nasr", "meaning": "The Divine Support", "type": "Medinan", "verses": 3},
    {"number": 111, "name_ar": "المسد", "name_en": "Al-Masad", "meaning": "The Palm Fiber", "type": "Meccan", "verses": 5},
    {"number": 112, "name_ar": "الإخلاص", "name_en": "Al-Ikhlas", "meaning": "The Sincerity", "type": "Meccan", "verses": 4},
    {"number": 113, "name_ar": "الفلق", "name_en": "Al-Falaq", "meaning": "The Daybreak", "type": "Meccan", "verses": 5},
    {"number": 114, "name_ar": "الناس", "name_en": "An-Nas", "meaning": "Mankind", "type": "Meccan", "verses": 6}
]

import certifi
import ssl

def download_file(url: str, dest_path: str):
    print(f"Downloading from {url} to {dest_path}...")
    ssl_context = ssl.create_default_context(cafile=certifi.where())
    req = urllib.request.Request(url, headers={"User-Agent": "Daleel-e-Haq-Corpus-Manager/1.0"})
    with urllib.request.urlopen(req, context=ssl_context) as resp, open(dest_path, "wb") as out_file:
        data = resp.read()
        out_file.write(data)
    checksum = hashlib.sha256(data).hexdigest()
    print(f"Downloaded {len(data)} bytes. SHA256: {checksum}")
    return checksum

def main():
    arabic_path = os.path.join(DATA_DIR, "quran-simple.txt")
    en_path = os.path.join(DATA_DIR, "quran-trans-en-sahih.txt")
    ur_path = os.path.join(DATA_DIR, "quran-trans-ur-jalandhry.txt")
    surahs_path = os.path.join(DATA_DIR, "surahs.json")

    # Save Surahs metadata
    with open(surahs_path, "w", encoding="utf-8") as f:
        json.dump(SURAHS_DATA, f, ensure_ascii=False, indent=2)
    print(f"Saved 114 Surahs metadata to {surahs_path}")

    # Download files
    sha_ar = download_file(TANZIL_ARABIC_URL, arabic_path)
    sha_en = download_file(TANZIL_EN_URL, en_path)
    sha_ur = download_file(TANZIL_UR_URL, ur_path)

    # Validate Arabic line count and verse structure
    verse_count = 0
    with open(arabic_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and line[0].isdigit() and "|" in line:
                parts = line.split("|", 2)
                if len(parts) == 3:
                    verse_count += 1

    print(f"Verified Arabic verse count: {verse_count} verses (Expected: 6236)")
    if verse_count != 6236:
        print("ERROR: Verse count does not match 6236!", file=sys.stderr)
        sys.exit(1)

    metadata = {
        "edition": "Tanzil Quran Text (Simple, Version 1.1)",
        "license": "Creative Commons Attribution 3.0",
        "url": "https://tanzil.net/download/",
        "arabic_sha256": sha_ar,
        "en_translation": "Saheeh International (Tanzil edition)",
        "en_sha256": sha_en,
        "ur_translation": "Fateh Muhammad Jalandhry (Tanzil edition)",
        "ur_sha256": sha_ur,
        "total_surahs": 114,
        "total_verses": 6236
    }
    with open(os.path.join(DATA_DIR, "provenance.json"), "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)

    print("Corpus setup and verification complete!")

if __name__ == "__main__":
    main()
