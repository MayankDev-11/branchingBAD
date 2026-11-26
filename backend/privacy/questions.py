"""Local checks and redaction for text crossing the model boundary."""

import re
import unicodedata
from functools import lru_cache

from dotenv import load_dotenv


class PrivacyUnavailable(RuntimeError):
    """The local scrubber could not be initialized."""


RED_FLAGS = re.compile(
    r"\b(?:chest (?:pain|pressure|tightness)|(?:faint|faints|fainted|fainting)|"
    r"pass(?:ed|ing)? out|sudden(?:ly)?[,\s]+(?:a\s+)?(?:very\s+)?severe headaches?|"
    r"(?:worst|thunderclap) headaches?|(?:trouble|difficulty) breathing|"
    r"shortness of breath|(?:can't|cannot|can not) breathe|"
    r"(?:can't|cant|cannot|can not|unable to|inability to) (?:i )?(?:urinate|pee|piss|pass (?:any )?urine)"
    r"(?=\s*(?:at all\b|anymore\b|[.!?,;:]|$))|"
    r"(?:no|not passing any) urine (?:comes out|at all)\b|"
    r"(?:one[- ]sided|on one side) weakness|weakness (?:on|in) one side|"
    r"self[- ]harm|suicid\w*|(?:kill|hurt|harm) myself|end my life)\b",
    re.IGNORECASE,
)

# Indic scripts contain combining vowel marks and halants that break regex \b boundaries,
# so match Hindi (Devanagari) and Kannada emergency phrases without word-boundary anchors.
MULTILINGUAL_RED_FLAGS = re.compile(
    r"(?:सीने|छाती)\s+में\s+(?:तेज\s+|तेज़\s+)?(?:दर्द|जकड़न|दबाव|भारीपन)|"
    r"सांस\s+(?:लेने\s+में\s+(?:दिक्कत|तकलीफ|तकलीफ़|परेशानी|कठिनाई)|फूलना|फूल\s+रही|नहीं\s+आ\s+रही|रुक\s+रही)|"
    r"दम\s+घुट|"
    r"बेहोश(?:ी)?|चक्कर\s+(?:आकर|खाकर)\s+गिर|"
    r"एक\s+(?:तरफ|तरफ़|हिस्से)\s+(?:में\s+)?(?:कमजोरी|कमज़ोरी|सुन्न|लकवा)|"
    r"अचानक\s+(?:बहुत\s+)?(?:तेज|तेज़|भयानक|गंभीर)\s+(?:सिर\s*दर्द|सिरदर्द)|"
    r"(?:असहनीय|सबसे\s+तेज)\s+(?:सिर\s*दर्द|सिरदर्द)|"
    r"पेशाब\s+(?:बिल्कुल\s+नहीं|बिलकुल\s+नहीं|नहीं\s+हो\s+रहा|बंद|रुक\s+गया)|"
    r"मूत्र\s+त्याग\s+करने\s+में\s+असमर्थ|"
    r"(?:खुद|ख़ुद|अपने\s+आप)\s+को\s+(?:नुकसान|नुक़सान|चोट)|आत्महत्या|खुदकुशी|जान\s+दे(?:ने|ना)|"
    r"ಎದೆ(?:ಯಲ್ಲಿ)?\s*(?:ತೀವ್ರ\s+)?(?:ನೋವು|ಬಿಗಿತ|ಒತ್ತಡ)|"
    r"ಉಸಿರಾ(?:ಡಲು\s+(?:ಕಷ್ಟ|ತೊಂದರೆ)|ಟದ\s+ತೊಂದರೆ|ಟ\s+ಕಷ್ಟ)|ಉಸಿರು\s*(?:ಗಟ್ಟ|ಕಟ್ಟ)|"
    r"ಮೂರ್ಛೆ|ಪ್ರಜ್ಞೆ\s*(?:ತಪ್ಪ|ಕಳೆದುಕೊ)|"
    r"ಒಂದು\s*(?:ಬದಿ(?:ಯಲ್ಲಿ|ಯ)?|ಕಡೆ)\s*(?:ದೌರ್ಬಲ್ಯ|ಬಲಹೀನತೆ|ಮರಗಟ್ಟ|ಪಕ್ಷಪಾತ)|"
    r"(?:ಹಠಾತ್|ಹಠಾತ್ತನೆ|ದಿಢೀರ್)\s*(?:ತೀವ್ರ|ಅತಿಯಾದ)?\s*ತಲೆ\s*ನೋವು|"
    r"ಮೂತ್ರ\s*(?:ವಿಸರ್ಜನೆ\s+ಆಗುತ್ತಿಲ್ಲ|ಬರುತ್ತಿಲ್ಲ|ತಡೆ|ನಿಂತು)|"
    r"ಆತ್ಮಹತ್ಯೆ|ಸ್ವಯಂ\s*ಹಾನಿ|(?:ನನ್ನನ್ನು\s*ನಾನೇ|ಸ್ವತಃ)\s*ನೋಯಿಸ|ಪ್ರಾಣ\s*ತೆಗೆದುಕೊ"
)

IDENTIFIERS = (
    re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b", re.IGNORECASE),
    re.compile(r"(?<!\d)(?:\d[ -]?){11}\d(?!\d)"),
    re.compile(r"(?<!\w)(?:\+?91[ -]?)?\d{3,5}[ -]?\d{3,5}[ -]?\d{2,4}(?!\w)"),
    re.compile(r"[\w.+-]+@[\w.-]+\.[a-z]{2,}", re.IGNORECASE),
)


def normalized(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).replace("’", "'")
    return " ".join("".join(c for c in text if unicodedata.category(c) != "Cf").split())


def is_red_flag(question: str) -> bool:
    clean = normalized(question)
    return RED_FLAGS.search(clean) is not None or MULTILINGUAL_RED_FLAGS.search(clean) is not None


@lru_cache(maxsize=1)
def _analyzer():
    load_dotenv()
    try:
        import spacy
        from presidio_analyzer import AnalyzerEngine
        from presidio_analyzer.nlp_engine import NlpEngineProvider

        model = "en_core_web_sm"
        if not spacy.util.is_package(model):
            raise PrivacyUnavailable("Install the local spaCy English model.")
        provider = NlpEngineProvider(nlp_configuration={
            "nlp_engine_name": "spacy",
            "models": [{"lang_code": "en", "model_name": model}],
        })
        return AnalyzerEngine(nlp_engine=provider.create_engine(), supported_languages=["en"])
    except ImportError as exc:
        raise PrivacyUnavailable("Install the local Presidio dependencies.") from exc


def scrub_identifiers(text: str, full_name: str = "", email: str = "") -> str:
    text = normalized(text)
    for identifier in (email, full_name, *normalized(full_name).split()):
        if identifier:
            text = re.sub(rf"(?<!\w){re.escape(normalized(identifier))}(?!\w)", "[REDACTED]", text, flags=re.I)
    for pattern in IDENTIFIERS:
        text = pattern.sub("[REDACTED]", text)
    return text


def scrub_question(question: str, full_name: str = "", email: str = "") -> str:
    text = scrub_identifiers(question, full_name, email)

    findings = _analyzer().analyze(text=text, language="en")
    # Merge overlaps before replacing so offsets always refer to the original string.
    spans: list[tuple[int, int]] = []
    for item in sorted(findings, key=lambda finding: finding.start):
        if spans and item.start <= spans[-1][1]:
            spans[-1] = (spans[-1][0], max(item.end, spans[-1][1]))
        else:
            spans.append((item.start, item.end))
    for start, end in reversed(spans):
        text = text[:start] + "[REDACTED]" + text[end:]
    return text
