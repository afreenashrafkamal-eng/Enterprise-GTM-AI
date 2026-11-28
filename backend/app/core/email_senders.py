"""Provider adapters for sending reviewed outbound messages.

Keep consent, recipient validation, client isolation, and send history in the API.
Provider-specific token renewal and HTTP message delivery belong in adapters here.
"""

import base64
import asyncio
import smtplib
import ssl
from email.message import EmailMessage
from email.policy import SMTP
from typing import Protocol

import httpx

from app.core.config.settings import settings


class SenderFailure(Exception):
    def __init__(self, http_status: int, message: str, outcome_unknown: bool = False):
        super().__init__(message)
        self.http_status = http_status
        self.message = message
        self.outcome_unknown = outcome_unknown


class EmailSender(Protocol):
    async def refresh_access_token(
        self,
        client: httpx.AsyncClient,
        *,
        refresh_token: str,
        client_id: str,
        client_secret: str,
    ) -> tuple[str, int, str | None]: ...

    async def send_message(
        self,
        client: httpx.AsyncClient,
        *,
        access_token: str,
        sender_email: str,
        recipient_email: str,
        subject: str,
        body: str,
    ) -> str | None: ...


class GmailSender:
    async def refresh_access_token(
        self,
        client: httpx.AsyncClient,
        *,
        refresh_token: str,
        client_id: str,
        client_secret: str,
    ) -> tuple[str, int, str | None]:
        try:
            response = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "refresh_token": refresh_token,
                    "grant_type": "refresh_token",
                },
            )
        except httpx.HTTPError as error:
            raise SenderFailure(502, "Google could not refresh the Gmail connection.") from error
        if not response.is_success:
            raise SenderFailure(409, "Reconnect Gmail before sending; its saved permission expired.")
        try:
            data = response.json()
            access_token = data.get("access_token")
            if not isinstance(access_token, str) or not access_token:
                raise ValueError("No access token")
            expires_in = int(data.get("expires_in", 3600))
            refresh = data.get("refresh_token")
            return access_token, expires_in, refresh if isinstance(refresh, str) and refresh else None
        except (ValueError, TypeError, AttributeError) as error:
            raise SenderFailure(502, "Google did not return a refreshed Gmail permission.") from error

    async def send_message(
        self,
        client: httpx.AsyncClient,
        *,
        access_token: str,
        sender_email: str,
        recipient_email: str,
        subject: str,
        body: str,
    ) -> str | None:
        message = EmailMessage(policy=SMTP)
        message["From"] = sender_email
        message["To"] = recipient_email
        message["Subject"] = subject
        message.set_content(body)
        raw = base64.urlsafe_b64encode(message.as_bytes()).decode("ascii").rstrip("=")
        try:
            response = await client.post(
                "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
                headers={"Authorization": f"Bearer {access_token}"},
                json={"raw": raw},
            )
        except httpx.HTTPError as error:
            raise SenderFailure(
                502,
                "Send outcome could not be confirmed; check Gmail before retrying.",
                outcome_unknown=True,
            ) from error
        if response.status_code == 401:
            raise SenderFailure(409, "The Gmail connection expired. Reconnect; some earlier messages may already have been sent.")
        if not response.is_success:
            raise SenderFailure(502, "Gmail rejected a message.")
        try:
            data = response.json()
        except ValueError:
            return None
        provider_message_id = data.get("id") if isinstance(data, dict) else None
        return provider_message_id if isinstance(provider_message_id, str) else None


class SmtpSender:
    """Environment-configured SMTP sender for a future custom-domain mailbox."""

    async def refresh_access_token(
        self,
        client: httpx.AsyncClient,
        *,
        refresh_token: str,
        client_id: str,
        client_secret: str,
    ) -> tuple[str, int, str | None]:
        raise SenderFailure(400, "SMTP mailboxes do not use Google OAuth tokens.")

    async def send_message(
        self,
        client: httpx.AsyncClient,
        *,
        access_token: str,
        sender_email: str,
        recipient_email: str,
        subject: str,
        body: str,
    ) -> str | None:
        if not all((settings.smtp_host, settings.smtp_username, settings.smtp_password, settings.smtp_from_email)):
            raise SenderFailure(503, "SMTP is selected but its mailbox settings are incomplete.")

        message = EmailMessage(policy=SMTP)
        message["From"] = sender_email
        message["To"] = recipient_email
        message["Subject"] = subject
        message.set_content(body)

        def deliver() -> str | None:
            smtp = None
            try:
                timeout = 20
                if settings.smtp_use_ssl:
                    smtp = smtplib.SMTP_SSL(
                        settings.smtp_host,
                        settings.smtp_port,
                        timeout=timeout,
                        context=ssl.create_default_context(),
                    )
                else:
                    smtp = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=timeout)
                    if settings.smtp_starttls:
                        smtp.starttls(context=ssl.create_default_context())
                smtp.login(settings.smtp_username, settings.smtp_password)
                try:
                    refused = smtp.send_message(message, to_addrs=[recipient_email])
                except (smtplib.SMTPServerDisconnected, TimeoutError, OSError) as error:
                    raise SenderFailure(
                        502,
                        "SMTP send outcome could not be confirmed; check the mailbox Sent folder before retrying.",
                        outcome_unknown=True,
                    ) from error
                except smtplib.SMTPException as error:
                    raise SenderFailure(502, "The SMTP server rejected the message.") from error
                if refused:
                    raise SenderFailure(502, "The SMTP server refused the recipient.")
                return message.get("Message-ID")
            except SenderFailure:
                raise
            except (smtplib.SMTPAuthenticationError, smtplib.SMTPConnectError, smtplib.SMTPHeloError) as error:
                raise SenderFailure(502, "SMTP connection or authentication failed; check the mailbox settings.") from error
            except (smtplib.SMTPException, OSError, TimeoutError) as error:
                raise SenderFailure(502, "SMTP delivery failed before confirmation; check the mailbox before retrying.", outcome_unknown=True) from error
            finally:
                if smtp is not None:
                    try:
                        smtp.quit()
                    except (smtplib.SMTPException, OSError):
                        smtp.close()

        return await asyncio.to_thread(deliver)


def get_email_sender(provider: str = "gmail") -> EmailSender:
    if provider == "gmail":
        return GmailSender()
    if provider == "smtp":
        return SmtpSender()
    raise ValueError(f"Unknown email sender provider: {provider}")
