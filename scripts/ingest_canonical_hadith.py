"""
Script to ingest authenticated Sahih Hadith corpus (Sahih al-Bukhari & Sahih Muslim)
into Daleel-e-Haq's approved SQLite database (hadith_records & hadith_fts).
"""
import sys
import os
import sqlite3

# Ensure backend directory is in python path
backend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

from app.evidence.hadith_importer import import_hadith_record, get_hadith_status
from app.db.connection import get_connection

CANONICAL_SAHIH_HADITHS = [
    {
        "collection": "Sahih al-Bukhari",
        "collection_slug": "sahih_bukhari",
        "edition": "Sahih al-Bukhari (Darussalam)",
        "edition_version": "1.0",
        "book_number": 1,
        "book_name": "Revelation (كتاب بدء الوحي)",
        "chapter_number": 1,
        "chapter_name": "How the Divine Revelation started being revealed to Allah's Messenger",
        "hadith_number": 1,
        "narrator": "Umar bin Al-Khattab (عمر بن الخطاب رضي الله عنه)",
        "chain_isnad": "Al-Humaydi -> Sufyan -> Yahya ibn Sa'id al-Ansari -> Muhammad ibn Ibrahim al-Taymi -> Alqama ibn Waqqas -> Umar ibn al-Khattab",
        "text_ar": "إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ، وَإِنَّمَا لِكُلِّ امْرِئٍ مَا نَوَى، فَمَنْ كَانَتْ هِجْرَتُهُ إِلَى دُنْيَا يُصِيبُهَا أَوْ إِلَى امْرَأَةٍ يَنْكِحُهَا فَهِجْرَتُهُ إِلَى مَا هَاجَرَ إِلَيْهِ.",
        "translation_en": "Actions are but by intention and every man shall have but that which he intended. Thus he whose migration was for Allah and His Messenger, his migration is for Allah and His Messenger, and he whose migration was for some worldly benefit or to take a woman in marriage, his migration was for that which he migrated.",
        "translation_ur": "اعمال کا دارومدار صرف نیتوں پر ہے اور ہر انسان کے لیے وہی ہے جس کی اس نے نیت کی۔ پس جس کی ہجرت دنیا حاصل کرنے کے لیے ہو یا کسی عورت سے نکاح کے لیے، تو اس کی ہجرت اسی کے لیے شمار ہوگی جس کے لیے اس نے ہجرت کی۔",
        "grade": "Sahih",
        "graded_by": "Imam al-Bukhari & Imam Muslim (Muttafaqun Alayh)",
        "provenance_url": "https://sunnah.com/bukhari:1",
        "rights_basis": "Classical Hadith Text (Public Domain)",
        "review_status": "approved"
    },
    {
        "collection": "Sahih Muslim",
        "collection_slug": "sahih_muslim",
        "edition": "Sahih Muslim (Darussalam)",
        "edition_version": "1.0",
        "book_number": 1,
        "book_name": "Faith (كتاب الإيمان)",
        "chapter_number": 1,
        "chapter_name": "Explanation of Faith, Islam and Excellence (Hadith Jibril)",
        "hadith_number": 8,
        "narrator": "Umar bin Al-Khattab (عمر بن الخطاب رضي الله عنه)",
        "chain_isnad": "Abu Khaythama -> Waki -> Kahmas -> Abdullah ibn Buraydah -> Yahya ibn Ya'mar -> Abdullah ibn Umar -> Umar ibn al-Khattab",
        "text_ar": "قَالَ: فَأَخْبِرْنِي عَنِ الإِسْلاَمِ. قَالَ رَسُولُ اللَّهِ صلى الله عليه وسلم: الإِسْلاَمُ أَنْ تَشْهَدَ أَنْ لاَ إِلَهَ إِلاَّ اللَّهُ وَأَنَّ مُحَمَّدًا رَسُولُ اللَّهِ، وَتُقِيمَ الصَّلاَةَ، وَتُؤْتِيَ الزَّكَاةَ، وَتَصُومَ رَمَضَانَ، وَتَحُجَّ الْبَيْتَ إِنِ اسْتَطَعْتَ إِلَيْهِ سَبِيلاً. قَالَ: صَدَقْتَ. قَالَ: فَأَخْبِرْنِي عَنِ الإِيمَانِ. قَالَ: أَنْ تُؤْمِنَ بِاللَّهِ، وَمَلاَئِكَتِهِ، وَكُتُبِهِ، وَرُسُلِهِ، وَالْيَوْمِ الآخِرِ، وَتُؤْمِنَ بِالْقَدَرِ خَيْرِهِ وَشَرِّهِ. قَالَ: صَدَقْتَ. قَالَ: فَأَخْبِرْنِي عَنِ الإِحْسَانِ. قَالَ: أَنْ تَعْبُدَ اللَّهَ كَأَنَّكَ تَرَاهُ فَإِنْ لَمْ تَكُنْ تَرَاهُ فَإِنَّهُ يَرَاكَ.",
        "translation_en": "Gabriel said: Inform me about Islam. The Messenger of Allah said: Islam is that you testify that there is no god but Allah and that Muhammad is the Messenger of Allah, and you establish prayer, pay zakat, observe the fast of Ramadan, and perform pilgrimage to the House if you are able to bear the journey. He said: You have spoken the truth. He said: Inform me about Iman (Faith). The Prophet said: It is to believe in Allah, His angels, His books, His messengers, the Last Day, and to believe in divine destiny, both the good and the bad of it. He said: You have spoken the truth. He said: Inform me about Ihsan. The Prophet said: It is to worship Allah as though you see Him, and if you do not see Him, then truly He sees you.",
        "translation_ur": "جبریل علیہ السلام نے عرض کیا: مجھے اسلام کے بارے میں بتائیے۔ رسول اللہ صلی اللہ علیہ وسلم نے فرمایا: اسلام یہ ہے کہ تم گواہی دو کہ اللہ کے سوا کوئی معبود نہیں اور محمد اللہ کے رسول ہیں، اور نماز قائم کرو، زکوٰۃ ادا کرو، رمضان کے روزے رکھو، اور اگر استطاعت ہو تو بیت اللہ کا حج کرو۔ انہوں نے کہا: آپ نے سچ فرمایا۔ پھر پوچھا: مجھے ایمان کے بارے میں بتائیے۔ فرمایا: یہ کہ تم اللہ پر، اس کے فرشتوں پر، اس کی کتابوں پر، اس کے رسولوں پر، یومِ آخرت پر اور تقدیر کے اچھے اور برے ہونے پر ایمان لاؤ۔ انہوں نے کہا: آپ نے سچ فرمایا۔ پھر پوچھا: مجھے احسان کے بارے میں بتائیے۔ فرمایا: یہ کہ تم اللہ کی عبادت اس طرح کرو گویا تم اسے دیکھ رہے ہو، اور اگر تم اسے نہیں دیکھ رہے تو وہ یقیناً تمہیں دیکھ رہا ہے۔",
        "grade": "Sahih",
        "graded_by": "Imam Muslim (Sahih Muslim #8)",
        "provenance_url": "https://sunnah.com/muslim:8",
        "rights_basis": "Classical Hadith Text (Public Domain)",
        "review_status": "approved"
    },
    {
        "collection": "Sahih al-Bukhari",
        "collection_slug": "sahih_bukhari",
        "edition": "Sahih al-Bukhari (Darussalam)",
        "edition_version": "1.0",
        "book_number": 2,
        "book_name": "Belief (كتاب الإيمان)",
        "chapter_number": 1,
        "chapter_name": "The Foundation of Islam",
        "hadith_number": 8,
        "narrator": "Abdullah ibn Umar (عبد الله بن عمر رضي الله عنهما)",
        "chain_isnad": "Ubaydullah ibn Musa -> Hanzala ibn Abi Sufyan -> Ikrimah ibn Khalid -> Ibn Umar",
        "text_ar": "بُنِيَ الإِسْلاَمُ عَلَى خَمْسٍ: شَهَادَةِ أَنْ لاَ إِلَهَ إِلاَّ اللَّهُ وَأَنَّ مُحَمَّدًا رَسُولُ اللَّهِ، وَإِقَامِ الصَّلاَةِ، وَإِيتَاءِ الزَّكَاةِ، وَالْحَجِّ، وَصَوْمِ رَمَضَانَ.",
        "translation_en": "Islam is based on five principles: To testify that none has the right to be worshipped but Allah and Muhammad is Allah's Apostle; to offer the prayers dutifully and perfectly; to pay Zakat; to perform Hajj; and to observe fast during the month of Ramadan.",
        "translation_ur": "اسلام کی بنیاد پانچ چیزوں پر رکھی گئی ہے: اس بات کی گواہی دینا کہ اللہ کے سوا کوئی معبود برحق نہیں اور محمد اللہ کے رسول ہیں، نماز قائم کرنا، زکوٰۃ دینا، حج کرنا اور رمضان کے روزے رکھنا۔",
        "grade": "Sahih",
        "graded_by": "Imam al-Bukhari & Imam Muslim (Muttafaqun Alayh)",
        "provenance_url": "https://sunnah.com/bukhari:8",
        "rights_basis": "Classical Hadith Text (Public Domain)",
        "review_status": "approved"
    },
    {
        "collection": "Sahih al-Bukhari",
        "collection_slug": "sahih_bukhari",
        "edition": "Sahih al-Bukhari (Darussalam)",
        "edition_version": "1.0",
        "book_number": 2,
        "book_name": "Belief (كتاب الإيمان)",
        "chapter_number": 7,
        "chapter_name": "To desire for one's brother what one desires for oneself",
        "hadith_number": 13,
        "narrator": "Anas ibn Malik (أنس بن مالك رضي الله عنه)",
        "chain_isnad": "Musaddad -> Yahya -> Shu'bah -> Qatadah -> Anas",
        "text_ar": "لاَ يُؤْمِنُ أَحَدُكُمْ حَتَّى يُحِبَّ لأَخِيهِ مَا يُحِبُّ لِنَفْسِهِ.",
        "translation_en": "None of you will have faith till he wishes for his (Muslim) brother what he likes for himself.",
        "translation_ur": "تم میں سے کوئی شخص اس وقت تک مومن نہیں ہو سکتا جب تک کہ وہ اپنے بھائی کے لیے وہی پسند نہ کرے جو اپنے لیے پسند کرتا ہے۔",
        "grade": "Sahih",
        "graded_by": "Imam al-Bukhari & Imam Muslim (Muttafaqun Alayh)",
        "provenance_url": "https://sunnah.com/bukhari:13",
        "rights_basis": "Classical Hadith Text (Public Domain)",
        "review_status": "approved"
    },
    {
        "collection": "Sahih al-Bukhari",
        "collection_slug": "sahih_bukhari",
        "edition": "Sahih al-Bukhari (Darussalam)",
        "edition_version": "1.0",
        "book_number": 66,
        "book_name": "Virtues of the Quran (كتاب فضائل القرآن)",
        "chapter_number": 21,
        "chapter_name": "The best among you are those who learn the Quran and teach it",
        "hadith_number": 5027,
        "narrator": "Uthman bin Affan (عثمان بن عفان رضي الله عنه)",
        "chain_isnad": "Hajjaj ibn Minhal -> Shu'bah -> Alqama ibn Marthad -> Sa'd ibn Ubaydah -> Abu Abdurrahman al-Sulami -> Uthman",
        "text_ar": "خَيْرُكُمْ مَنْ تَعَلَّمَ الْقُرْآنَ وَعَلَّمَهُ.",
        "translation_en": "The best among you are those who learn the Quran and teach it.",
        "translation_ur": "تم میں سے سب سے بہتر وہ شخص ہے جو قرآن سیکھے اور اسے دوسروں کو سکھائے۔",
        "grade": "Sahih",
        "graded_by": "Imam al-Bukhari (Sahih al-Bukhari #5027)",
        "provenance_url": "https://sunnah.com/bukhari:5027",
        "rights_basis": "Classical Hadith Text (Public Domain)",
        "review_status": "approved"
    },
    {
        "collection": "Sahih al-Bukhari",
        "collection_slug": "sahih_bukhari",
        "edition": "Sahih al-Bukhari (Darussalam)",
        "edition_version": "1.0",
        "book_number": 53,
        "book_name": "Peacemaking (كتاب الصلح)",
        "chapter_number": 5,
        "chapter_name": "Rejection of unauthorized innovations",
        "hadith_number": 2697,
        "narrator": "Aisha bint Abi Bakr (عائشة رضي الله عنها)",
        "chain_isnad": "Ya'qub -> Ibrahim ibn Sa'd -> Ibn Shihab al-Zuhri -> Al-Qasim ibn Muhammad -> Aisha",
        "text_ar": "مَنْ أَحْدَثَ فِي أَمْرِنَا هَذَا مَا لَيْسَ فِيهِ فَهُوَ رَدٌّ.",
        "translation_en": "If somebody innovates something which is not in harmony with the principles of our religion, that thing is to be rejected.",
        "translation_ur": "جس نے ہمارے اس دین میں کوئی ایسی نئی بات ایجاد کی جو اس میں سے نہیں ہے تو وہ مردود ہے۔",
        "grade": "Sahih",
        "graded_by": "Imam al-Bukhari & Imam Muslim (Muttafaqun Alayh)",
        "provenance_url": "https://sunnah.com/bukhari:2697",
        "rights_basis": "Classical Hadith Text (Public Domain)",
        "review_status": "approved"
    },
    {
        "collection": "Sahih Muslim",
        "collection_slug": "sahih_muslim",
        "edition": "Sahih Muslim (Darussalam)",
        "edition_version": "1.0",
        "book_number": 1,
        "book_name": "Faith (كتاب الإيمان)",
        "chapter_number": 23,
        "chapter_name": "Explanation that religion is sincerity (بيان أن الدين النصيحة)",
        "hadith_number": 55,
        "alternate_numbering": "Sunnah.com: 55a; In-book: Book 1, Hadith 95; USC-MSA: Book 1, Hadith 98",
        "narrator": "Tamim al-Dari (تميم الداري رضي الله عنه)",
        "chain_isnad": "Muhammad ibn Abbad -> Sufyan -> Suhayl -> Ata ibn Yazid -> Tamim al-Dari",
        "text_ar": "الدِّينُ النَّصِيحَةُ. قُلْنَا: لِمَنْ؟ قَالَ: لِلَّهِ وَلِكِتَابِهِ وَلِرَسُولِهِ وَلأَئِمَّةِ الْمُسْلِمِينَ وَعَامَّتِهِمْ.",
        "translation_en": "The Prophet said: Religion is sincerity (An-Nasihah). We said: To whom? He said: To Allah, His Book, His Messenger, and to the leaders of the Muslims and their common folk.",
        "translation_ur": "رسول اللہ صلی اللہ علیہ وسلم نے فرمایا: دین خیر خواہی کا نام ہے۔ ہم نے عرض کیا: کس کے لیے؟ آپ نے فرمایا: اللہ کے لیے، اس کی کتاب کے لیے، اس کے رسول کے لیے، اور مسلمانوں کے حکمرانوں اور ان کے عام لوگوں کے لیے۔",
        "grade": "Sahih",
        "graded_by": "Imam Muslim (Sahih Muslim #55a / In-book: Bk 1, H 95)",
        "provenance_url": "https://sunnah.com/muslim:55a",
        "rights_basis": "Classical Hadith Text (Public Domain)",
        "review_status": "approved"
    },
    {
        "collection": "Sahih al-Bukhari",
        "collection_slug": "sahih_bukhari",
        "edition": "Sahih al-Bukhari (Darussalam)",
        "edition_version": "1.0",
        "book_number": 78,
        "book_name": "Good Manners (كتاب الأدب)",
        "chapter_number": 76,
        "chapter_name": "Patience and controlling oneself in anger (باب ما ينهى من الغضب)",
        "hadith_number": 6114,
        "alternate_numbering": "Sunnah.com: 6114; In-book: Book 78, Hadith 141; USC-MSA: Vol. 8, Book 73, Hadith 135",
        "narrator": "Abu Hurairah (أبو هريرة رضي الله عنه)",
        "chain_isnad": "Abdullah ibn Yusuf -> Malik -> Ibn Shihab -> Sa'id ibn al-Musayyib -> Abu Hurairah",
        "text_ar": "لَيْسَ الشَّدِيدُ بِالصُّرَعَةِ، إِنَّمَا الشَّدِيدُ الَّذِي يَمْلِكُ نَفْسَهُ عِنْدَ الْغَضَبِ.",
        "translation_en": "The strong is not the one who overcomes the people by his strength, but the strong is the one who controls himself while in anger.",
        "translation_ur": "پہلوان وہ نہیں جو کشتی میں پچھاڑ دے، بلکہ اصل طاقتور وہ ہے جو غصے کے وقت اپنے نفس پر قابو رکھے۔",
        "grade": "Sahih",
        "graded_by": "Imam al-Bukhari & Imam Muslim (Muttafaqun Alayh; Sahih al-Bukhari #6114)",
        "provenance_url": "https://sunnah.com/bukhari:6114",
        "rights_basis": "Classical Hadith Text (Public Domain)",
        "review_status": "approved"
    },
    {
        "collection": "Sahih Muslim",
        "collection_slug": "sahih_muslim",
        "edition": "Sahih Muslim (Darussalam)",
        "edition_version": "1.0",
        "book_number": 48,
        "book_name": "Supplication and Remembrance (كتاب الذكر والدعاء)",
        "chapter_number": 11,
        "chapter_name": "Virtue of gathering to recite Quran, seeking knowledge, and helping brothers",
        "hadith_number": 2699,
        "narrator": "Abu Hurairah (أبو هريرة رضي الله عنه)",
        "chain_isnad": "Yahya ibn Yahya -> Abu Mu'awiyah -> Al-A'mash -> Abu Salih -> Abu Hurairah",
        "text_ar": "مَنْ نَفَّسَ عَنْ مُؤْمِنٍ كُرْبَةً مِنْ كُرَبِ الدُّنْيَا نَفَّسَ اللَّهُ عَنْهُ كُرْبَةً مِنْ كُرَبِ يَوْمِ الْقِيَامَةِ، وَمَنْ يَسَّرَ عَلَى مُعْسِرٍ يَسَّرَ اللَّهُ عَلَيْهِ فِي الدُّنْيَا وَالآخِرَةِ، وَمَنْ سَتَرَ مُسْلِمًا سَتَرَهُ اللَّهُ فِي الدُّنْيَا وَالآخِرَةِ، وَاللَّهُ فِي عَوْنِ الْعَبْدِ مَا كَانَ الْعَبْدُ فِي عَوْنِ أَخِيهِ، وَمَنْ سَلَكَ طَرِيقًا يَلْتَمِسُ فِيهِ عِلْمًا سَهَّلَ اللَّهُ لَهُ بِهِ طَرِيقًا إِلَى الْجَنَّةِ.",
        "translation_en": "Whoever relieves a believer's distress in this world, Allah will relieve his distress on the Day of Resurrection. Whoever helps ease a debtor, Allah will ease him in this world and the Hereafter. Whoever conceals the fault of a Muslim, Allah will conceal his fault in this world and the Hereafter. Allah helps His servant as long as the servant helps his brother. And whoever treads a path seeking knowledge, Allah makes easy for him a path to Paradise.",
        "translation_ur": "جس نے کسی مومن کی دنیاوی تکالیف میں سے کوئی تکلیف دور کی، اللہ تعالیٰ قیامت کے دن اس کی تکلیفوں میں سے ایک تکلیف دور فرمائے گا۔ اور جس نے کسی تنگ دست کے لیے آسانی پیدا کی، اللہ دنیا اور آخرت میں اس کے لیے آسانی فرمائے گا۔ اور جس نے کسی مسلمان کی پردہ پوشی کی، اللہ دنیا اور آخرت میں اس کے لیے آسانی فرمائے گا۔ اور اللہ بندے کی مدد میں رہتا ہے جب تک بندہ اپنے بھائی کی مدد میں رہتا ہے۔ اور جو شخص علم کی تلاش کے راستے پر چلا، اللہ اس کے لیے جنت کا راستہ آسان فرما دیتا ہے۔",
        "grade": "Sahih",
        "graded_by": "Imam Muslim (Sahih Muslim #2699)",
        "provenance_url": "https://sunnah.com/muslim:2699",
        "rights_basis": "Classical Hadith Text (Public Domain)",
        "review_status": "approved"
    },
    {
        "collection": "Sahih al-Bukhari",
        "collection_slug": "sahih_bukhari",
        "edition": "Sahih al-Bukhari (Darussalam)",
        "edition_version": "1.0",
        "book_number": 60,
        "book_name": "Prophets (كتاب أحاديث الأنبياء)",
        "chapter_number": 50,
        "chapter_name": "Mention of the Children of Israel and honesty in transmission",
        "hadith_number": 3461,
        "narrator": "Abdullah ibn Amr ibn al-Aas (عبد الله بن عمرو رضي الله عنهما)",
        "chain_isnad": "Abu Asim -> Al-Awza'i -> Hassan ibn Atiyyah -> Abu Kabsha -> Abdullah ibn Amr",
        "text_ar": "بَلِّغُوا عَنِّي وَلَوْ آيَةً، وَحَدِّثُوا عَنْ بَنِي إِسْرَائِيلَ وَلاَ حَرَجَ، وَمَنْ كَذَبَ عَلَىَّ مُتَعَمِّدًا فَلْيَتَبَوَّأْ مَقْعَدَهُ مِنَ النَّارِ.",
        "translation_en": "Convey from me, even if it is one verse, and relate from the Children of Israel without hesitation. And whoever tells a lie against me intentionally will surely take his place in Hellfire.",
        "translation_ur": "مجھ سے (احکامِ دین) آگے پہنچاؤ خواہ ایک ہی آیت ہو، اور بنی اسرائیل سے روایات بیان کرو اس میں کوئی حرج نہیں، اور جس نے مجھ پر جان بوجھ کر جھوٹ باندھا وہ اپنا ٹھکانہ جہنم میں بنا لے۔",
        "grade": "Sahih",
        "graded_by": "Imam al-Bukhari (Sahih al-Bukhari #3461)",
        "provenance_url": "https://sunnah.com/bukhari:3461",
        "rights_basis": "Classical Hadith Text (Public Domain)",
        "review_status": "approved"
    },
    {
        "collection": "Sahih Muslim",
        "collection_slug": "sahih_muslim",
        "edition": "Sahih Muslim (Darussalam)",
        "edition_version": "1.0",
        "book_number": 1,
        "book_name": "Faith (كتاب الإيمان)",
        "chapter_number": 65,
        "chapter_name": "Islam began as something strange and will revert to being strange",
        "hadith_number": 145,
        "narrator": "Abu Hurairah (أبو هريرة رضي الله عنه)",
        "chain_isnad": "Muhammad ibn Rafi -> Abd al-Razzaq -> Ma'mar -> Suhayl -> Abu Salih -> Abu Hurairah",
        "text_ar": "بَدَأَ الإِسْلاَمُ غَرِيبًا وَسَيَعُودُ كَمَا بَدَأَ غَرِيبًا فَطُوبَى لِلْغُرَبَاءِ.",
        "translation_en": "Islam initiated as something strange, and it would revert to its position of being strange. So good tidings for the strangers.",
        "translation_ur": "اسلام اجنبی حالت میں شروع ہوا اور عنقریب اسی طرح اجنبی ہو جائے گا جیسے شروع ہوا تھا، پس خوشخبری ہے اجنبیوں (حق پر قائم رہنے والوں) کے لیے۔",
        "grade": "Sahih",
        "graded_by": "Imam Muslim (Sahih Muslim #145)",
        "provenance_url": "https://sunnah.com/muslim:145",
        "rights_basis": "Classical Hadith Text (Public Domain)",
        "review_status": "approved"
    },
    {
        "collection": "Sahih al-Bukhari",
        "collection_slug": "sahih_bukhari",
        "edition": "Sahih al-Bukhari (Darussalam)",
        "edition_version": "1.0",
        "book_number": 81,
        "book_name": "To make the Heart Tender (كتاب الرقاق)",
        "chapter_number": 38,
        "chapter_name": "Humility and Devotion (Hadith Qudsi - باب التواضع)",
        "hadith_number": 6502,
        "alternate_numbering": "Sunnah.com: 6502; In-book: Book 81, Hadith 91; USC-MSA: Vol. 8, Book 76, Hadith 509",
        "narrator": "Abu Hurairah (أبو هريرة رضي الله عنه)",
        "chain_isnad": "Muhammad ibn Uthman -> Khalid ibn Makhlad -> Sulayman ibn Bilal -> Sharik ibn Abi Namir -> Ata -> Abu Hurairah",
        "text_ar": "إِنَّ اللَّهَ قَالَ: مَنْ عَادَى لِي وَلِيًّا فَقَدْ آذَنْتُهُ بِالْحَرْبِ، وَمَا تَقَرَّبَ إِلَىَّ عَبْدِي بِشَىْءٍ أَحَبَّ إِلَىَّ مِمَّا افْتَرَضْتُ عَلَيْهِ، وَمَا يَزَالُ عَبْدِي يَتَقَرَّبُ إِلَىَّ بِالنَّوَافِلِ حَتَّى أُحِبَّهُ، فَإِذَا أَحْبَبْتُهُ كُنْتُ سَمْعَهُ الَّذِي يَسْمَعُ بِهِ، وَبَصَرَهُ الَّذِي يُبْصِرُ بِهِ، وَيَدَهُ الَّتِي يَبْطِشُ بِهَا، وَرِجْلَهُ الَّتِي يَمْشِي بِهَا، وَإِنْ سَأَلَنِي لأُعْطِيَنَّهُ، وَلَئِنِ اسْتَعَاذَنِي لأُعِيذَنَّهُ.",
        "translation_en": "Allah said: Whosoever shows enmity to someone devoted to Me, I shall be at war with him. My servant draws not near to Me with anything more loved by Me than the religious duties I have enjoined upon him, and My servant continues to draw near to Me with supererogatory works so that I shall love him. When I love him I am his hearing with which he hears, his seeing with which he sees, his hand with which he strikes and his foot with which he walks. Were he to ask [something] of Me, I would surely give it to him, and were he to ask Me for refuge, I would surely grant him it.",
        "translation_ur": "اللہ تعالیٰ نے فرمایا: جو میرے کسی ولی سے دشمنی رکھے تو میرا اس کے خلاف اعلانِ جنگ ہے۔ اور میرا بندہ جن چیزوں کے ذریعے میرا قرب حاصل کرتا ہے ان میں مجھے سب سے زیادہ پسند وہ فرائض ہیں جو میں نے اس پر لازم کیے ہیں، اور میرا بندہ نفل عبادات کے ذریعے مسلسل میرا قرب حاصل کرتا رہتا ہے یہاں تک کہ میں اس سے محبت کرنے لگتا ہوں۔ پھر جب میں اس سے محبت کرتا ہوں تو میں اس کا کان بن جاتا ہوں جس سے وہ سنتا ہے، اس کی آنکھ بن جاتا ہوں جس سے وہ دیکھتا ہے، اس کا ہاتھ بن جاتا ہوں جس سے وہ پکڑتا ہے، اور اس کا پاؤں بن جاتا ہوں جس سے وہ چلتا ہے۔ اگر وہ مجھ سے مانگے تو میں اسے ضرور دیتا ہوں، اور اگر وہ میری پناہ چاہے تو میں اسے ضرور پناہ دیتا ہوں۔",
        "grade": "Sahih",
        "graded_by": "Imam al-Bukhari (Sahih al-Bukhari #6502)",
        "provenance_url": "https://sunnah.com/bukhari:6502",
        "rights_basis": "Classical Hadith Text (Public Domain)",
        "review_status": "approved"
    }
]

# Quarantine list of legacy numbering mismatches to protect against regressions
LEGACY_QUARANTINED_HADITHS = [
    {
        "collection": "Sahih Muslim",
        "collection_slug": "sahih_muslim",
        "hadith_number": 77,
        "text_ar": "الدِّينُ النَّصِيحَةُ",
        "translation_en": "[QUARANTINED: Discrepancy detected. Muslim 77 is about the Ansar; canonical reference for Religion is Sincerity is Muslim 55a]",
        "translation_ur": "[قرنطینہ شدہ: حوالہ نمبر 77 غلط ہے، صحیح حوالہ صحیح مسلم 55a ہے]",
        "narrator": "Tamim al-Dari",
        "grade": "Unverified Reference",
        "graded_by": "Quarantined by Daleel Safety Audit",
        "provenance_url": "https://sunnah.com/muslim:77",
        "rights_basis": "Audit Quarantine",
        "review_status": "quarantined"
    },
    {
        "collection": "Sahih al-Bukhari",
        "collection_slug": "sahih_bukhari",
        "hadith_number": 6011,
        "text_ar": "لَيْسَ الشَّدِيدُ بِالصُّرَعَةِ",
        "translation_en": "[QUARANTINED: Discrepancy detected. Bukhari 6011 is about believers' mutual affection; canonical reference for controlling anger is Bukhari 6114]",
        "translation_ur": "[قرنطینہ شدہ: حوالہ نمبر 6011 غلط ہے، صحیح حوالہ صحیح بخاری 6114 ہے]",
        "narrator": "Abu Hurairah",
        "grade": "Unverified Reference",
        "graded_by": "Quarantined by Daleel Safety Audit",
        "provenance_url": "https://sunnah.com/bukhari:6011",
        "rights_basis": "Audit Quarantine",
        "review_status": "quarantined"
    },
    {
        "collection": "Sahih al-Bukhari",
        "collection_slug": "sahih_bukhari",
        "hadith_number": 6491,
        "text_ar": "مَنْ عَادَى لِي وَلِيًّا",
        "translation_en": "[QUARANTINED: Discrepancy detected. Bukhari 6491 is about recording of intentions; canonical reference for Hadith Qudsi of Allah's Wali is Bukhari 6502]",
        "translation_ur": "[قرنطینہ شدہ: حوالہ نمبر 6491 غلط ہے، صحیح حوالہ صحیح بخاری 6502 ہے]",
        "narrator": "Abu Hurairah",
        "grade": "Unverified Reference",
        "graded_by": "Quarantined by Daleel Safety Audit",
        "provenance_url": "https://sunnah.com/bukhari:6491",
        "rights_basis": "Audit Quarantine",
        "review_status": "quarantined"
    }
]


def ingest():
    conn = get_connection()
    cursor = conn.cursor()

    # Clear prior test/unverified records from hadith_records & hadith_fts
    cursor.execute("DELETE FROM hadith_records;")
    cursor.execute("DELETE FROM hadith_fts;")
    conn.commit()

    print(f"Ingesting {len(CANONICAL_SAHIH_HADITHS)} canonical Sahih Hadith records...")
    imported_ids = []
    for hadith in CANONICAL_SAHIH_HADITHS:
        hid = import_hadith_record(hadith, conn)
        imported_ids.append(hid)
        print(f"  [+] Ingested approved: {hid} - {hadith['collection']} #{hadith['hadith_number']}")

    print(f"Ingesting {len(LEGACY_QUARANTINED_HADITHS)} quarantined legacy Hadith records...")
    for hadith in LEGACY_QUARANTINED_HADITHS:
        hid = import_hadith_record(hadith, conn)
        imported_ids.append(hid)
        print(f"  [!] Ingested quarantined: {hid} - {hadith['collection']} #{hadith['hadith_number']}")

    conn.commit()
    conn.close()

    status = get_hadith_status()
    print("\nIngestion Summary:")
    print(f"  Configured: {status['is_configured']}")
    print(f"  Total records: {status['total_records']}")
    print(f"  Approved records: {status['approved_records']}")
    print(f"  Approved collections: {status['approved_collections']}")
    print(f"  Status message: {status['message']}")


if __name__ == "__main__":
    ingest()
