import re
import secrets
from typing import Tuple

# Exclusively Argon2id via argon2-cffi (fallback to bcrypt ONLY if argon2 unavailable; NEVER SHA-256)
_HASHER_MODE = "none"
_argon2_hasher = None

try:
    from argon2 import PasswordHasher, Type
    from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

    _argon2_hasher = PasswordHasher(
        time_cost=3,
        memory_cost=65536,
        parallelism=2,
        hash_len=32,
        salt_len=16,
        type=Type.ID,
    )
    _HASHER_MODE = "argon2id"
except ImportError:
    try:
        import bcrypt  # type: ignore

        _HASHER_MODE = "bcrypt"
    except ImportError:
        _HASHER_MODE = "missing"


EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def normalize_email(email: str) -> str:
    return email.strip().lower()


def validate_email(email: str) -> bool:
    return bool(EMAIL_RE.match(normalize_email(email)))


def validate_password_policy(password: str) -> Tuple[bool, str]:
    if len(password) < 8:
        return False, "Password must be at least 8 characters long."
    if not re.search(r"[A-Za-z]", password):
        return False, "Password must include at least one letter."
    if not re.search(r"\d", password):
        return False, "Password must include at least one number."
    return True, ""


def hash_password(password: str) -> str:
    if _HASHER_MODE == "argon2id" and _argon2_hasher is not None:
        return _argon2_hasher.hash(password)
    if _HASHER_MODE == "bcrypt":
        import bcrypt  # type: ignore

        return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")
    raise RuntimeError(
        "No secure password hasher installed. Install argon2-cffi: pip install argon2-cffi"
    )


def verify_password(password: str, password_hash: str) -> bool:
    if not password or not password_hash:
        return False
    if _HASHER_MODE == "argon2id" and _argon2_hasher is not None and password_hash.startswith("$argon2"):
        try:
            return bool(_argon2_hasher.verify(password_hash, password))
        except (VerifyMismatchError, VerificationError, InvalidHashError):
            return False
    if _HASHER_MODE == "bcrypt" and password_hash.startswith("$2"):
        import bcrypt  # type: ignore

        try:
            return bool(bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8")))
        except ValueError:
            return False
    return False


def generate_session_id() -> str:
    return secrets.token_urlsafe(32)
