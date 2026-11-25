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
    return RED_FLAGS.search(normalized(question)) is not None


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


def scrub_question(question: str, full_name: str = "", email: str = "") -> str:
    text = normalized(question)
    for identifier in (email, full_name, *normalized(full_name).split()):
        if identifier:
            text = re.sub(rf"(?<!\w){re.escape(normalized(identifier))}(?!\w)", "[REDACTED]", text, flags=re.I)
    for pattern in IDENTIFIERS:
        text = pattern.sub("[REDACTED]", text)

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
