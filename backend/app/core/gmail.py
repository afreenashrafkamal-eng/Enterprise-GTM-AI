"""Helpers for protecting OAuth tokens stored in the local database."""

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.core.config.settings import settings


def _cipher() -> Fernet:
    secret = settings.gmail_token_encryption_key or settings.session_secret
    if len(secret.encode("utf-8")) < 32:
        raise RuntimeError(
            "Set GMAIL_TOKEN_ENCRYPTION_KEY to a stable secret of at least 32 characters."
        )
    derived_key = hashlib.sha256(
        b"enterprise-gtm-ai:gmail-token:v1:" + secret.encode("utf-8")
    ).digest()
    return Fernet(base64.urlsafe_b64encode(derived_key))


def encrypt_token(token: str) -> str:
    return _cipher().encrypt(token.encode("utf-8")).decode("ascii")


def decrypt_token(token: str) -> str:
    try:
        return _cipher().decrypt(token.encode("ascii")).decode("utf-8")
    except InvalidToken as error:
        raise RuntimeError(
            "Saved Gmail credentials cannot be decrypted. Reconnect Gmail after checking the token encryption key."
        ) from error


def encrypt_integration_secret(secret: str) -> str:
    """Encrypt a third-party integration secret using its own derived key."""
    cipher = _cipher_for_domain(b"enterprise-gtm-ai:integration-secret:v1:")
    return cipher.encrypt(secret.encode("utf-8")).decode("ascii")


def decrypt_integration_secret(secret: str) -> str:
    try:
        cipher = _cipher_for_domain(b"enterprise-gtm-ai:integration-secret:v1:")
        return cipher.decrypt(secret.encode("ascii")).decode("utf-8")
    except InvalidToken as error:
        raise RuntimeError(
            "Saved integration credentials cannot be decrypted. Check the stable token encryption key."
        ) from error


def _cipher_for_domain(domain: bytes) -> Fernet:
    secret = settings.gmail_token_encryption_key or settings.session_secret
    if len(secret.encode("utf-8")) < 32:
        raise RuntimeError("Set GMAIL_TOKEN_ENCRYPTION_KEY or SESSION_SECRET to a stable secret of at least 32 characters.")
    derived_key = hashlib.sha256(domain + secret.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(derived_key))
