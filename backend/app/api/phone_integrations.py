"""Regional phone adapters and ephemeral live-call transcription sessions."""

import asyncio
import base64
import json
import math
import secrets
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from urllib.parse import urlencode
from xml.sax.saxutils import escape as xml_escape

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from websockets.asyncio.client import connect as websocket_connect

from app.api.dependencies import require_organization_access
from app.core.config.settings import settings
from app.core.gmail import decrypt_integration_secret, encrypt_integration_secret
from app.db.dependencies import get_db
from app.models.phone_connection import PhoneConnection
from app.models.target_account import TargetAccount
from app.models.target_contact import TargetContact


router = APIRouter(prefix="/organizations/{organization_id}/phone", tags=["Phone"])
router.dependencies.append(Depends(require_organization_access))
stream_router = APIRouter(tags=["Phone media stream"])


class ExotelConnectionInput(BaseModel):
    account_sid: str = Field(min_length=2, max_length=150)
    api_key: str = Field(min_length=4, max_length=500)
    api_token: str = Field(min_length=4, max_length=1000)
    agent_number: str = Field(min_length=8, max_length=30)
    caller_id: str = Field(min_length=5, max_length=30)


class TwilioConnectionInput(BaseModel):
    account_sid: str = Field(min_length=34, max_length=34)
    auth_token: str = Field(min_length=16, max_length=1000)
    agent_number: str = Field(min_length=8, max_length=30)
    caller_id: str = Field(min_length=5, max_length=30)


class UnifonicConnectionInput(BaseModel):
    apps_id: str = Field(min_length=8, max_length=500)
    agent_number: str = Field(min_length=8, max_length=30)
    caller_id: str = Field(min_length=5, max_length=30)


class DialRequest(BaseModel):
    target_account_id: str
    target_contact_id: str
    outbound_call_confirmed: bool = False
    live_assistant: bool = False
    consent_confirmed: bool = False


class UnifonicDialRequest(BaseModel):
    target_account_id: str
    target_contact_id: str
    outbound_call_confirmed: bool


class PhoneConnectionStatus(BaseModel):
    connected: bool
    provider: str = "exotel"
    region: str = "IN"
    account_sid: str | None = None
    agent_number: str | None = None
    caller_id: str | None = None
    live_stream_ready: bool


@dataclass
class LiveSession:
    organization_id: str
    target_account_id: str
    target_contact_id: str
    expected_account_sid: str
    stream_token: str
    viewer_token: str
    expires_at: float
    provider: str = "exotel"
    agent_number: str = ""
    caller_id: str = ""
    prospect_number: str = ""
    queue: asyncio.Queue = field(default_factory=lambda: asyncio.Queue(maxsize=80))
    transcript: list[str] = field(default_factory=list)
    stream_started: bool = False
    closed: bool = False
    transcription_enabled: bool = True
    sample_rate: int = 8000


_sessions: dict[str, LiveSession] = {}
_TWILIO_MARKETS = {"US": "+1", "GB": "+44", "MY": "+60"}
_GULF_MARKETS = {"AE": "+971", "SA": "+966", "QA": "+974", "BH": "+973", "KW": "+965", "OM": "+968"}


def _gulf_market_code(region: str) -> str:
    code = region.strip().upper()
    if code not in _GULF_MARKETS:
        raise HTTPException(status_code=422, detail="Choose UAE, Saudi Arabia, Qatar, Bahrain, Kuwait, or Oman.")
    return code


def _market_code(region: str) -> str:
    region = region.upper()
    if region not in _TWILIO_MARKETS:
        raise HTTPException(status_code=404, detail="Twilio calling is currently set up for US, UK, and Malaysia markets.")
    return region


def _phone_media_base() -> str:
    return settings.phone_public_ws_base or settings.exotel_public_ws_base


def _validate_e164(value: str, label: str) -> str:
    value = value.strip()
    if not value.startswith("+") or not value[1:].isdigit() or not 8 <= len(value[1:]) <= 15:
        raise HTTPException(status_code=422, detail=f"{label} must use international format, for example +919876543210.")
    return value


def _session_by_token(token: str, *, viewer: bool = False) -> LiveSession | None:
    now = time.time()
    for key, session in list(_sessions.items()):
        if session.expires_at <= now:
            _sessions.pop(key, None)
    for session in _sessions.values():
        candidate = session.viewer_token if viewer else session.stream_token
        if secrets.compare_digest(candidate, token):
            return session
    return None


@router.get("/exotel/status", response_model=PhoneConnectionStatus)
def exotel_status(organization_id: str, db: Session = Depends(get_db)):
    connection = db.scalar(select(PhoneConnection).where(
        PhoneConnection.organization_id == organization_id,
        PhoneConnection.provider == "exotel",
        PhoneConnection.region == "IN",
    ))
    return PhoneConnectionStatus(
        connected=connection is not None,
        account_sid=connection.account_sid if connection else None,
        region="IN",
        agent_number=connection.agent_number if connection else None,
        caller_id=connection.caller_id if connection else None,
        live_stream_ready=bool(settings.exotel_public_ws_base.startswith("wss://") and settings.openai_api_key),
    )


@router.put("/exotel/connection", response_model=PhoneConnectionStatus)
def save_exotel_connection(
    organization_id: str,
    data: ExotelConnectionInput,
    db: Session = Depends(get_db),
):
    if not (settings.gmail_token_encryption_key or settings.session_secret):
        raise HTTPException(status_code=503, detail="Set a stable encryption key before storing provider credentials.")
    agent_number = _validate_e164(data.agent_number, "Your phone number")
    connection = db.scalar(select(PhoneConnection).where(
        PhoneConnection.organization_id == organization_id,
        PhoneConnection.provider == "exotel",
        PhoneConnection.region == "IN",
    ))
    if connection is None:
        connection = PhoneConnection(organization_id=organization_id, provider="exotel", region="IN")
        db.add(connection)
    connection.account_sid = data.account_sid.strip()
    connection.agent_number = agent_number
    connection.caller_id = data.caller_id.strip()
    connection.credentials_encrypted = encrypt_integration_secret(json.dumps({
        "api_key": data.api_key,
        "api_token": data.api_token,
    }))
    db.commit()
    db.refresh(connection)
    return PhoneConnectionStatus(
        connected=True,
        account_sid=connection.account_sid,
        region="IN",
        agent_number=connection.agent_number,
        caller_id=connection.caller_id,
        live_stream_ready=bool(settings.exotel_public_ws_base.startswith("wss://") and settings.openai_api_key),
    )


@router.delete("/exotel/connection")
def remove_exotel_connection(organization_id: str, db: Session = Depends(get_db)):
    connection = db.scalar(select(PhoneConnection).where(
        PhoneConnection.organization_id == organization_id,
        PhoneConnection.provider == "exotel",
        PhoneConnection.region == "IN",
    ))
    if connection:
        db.delete(connection)
        db.commit()
    return {"connected": False}


@router.post("/exotel/dial")
async def dial_with_exotel(
    organization_id: str,
    data: DialRequest,
    db: Session = Depends(get_db),
):
    if not data.outbound_call_confirmed:
        raise HTTPException(status_code=400, detail="Confirm that you are allowed to place this business call and will follow the target country's calling rules.")
    if data.live_assistant and not data.consent_confirmed:
        raise HTTPException(status_code=400, detail="Confirm the required notice and permission for live call audio and transcription.")
    if data.live_assistant and not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="Add OPENAI_API_KEY before enabling live call assistance.")
    if data.live_assistant and not settings.exotel_public_ws_base.startswith("wss://"):
        raise HTTPException(status_code=503, detail="Live assistance needs a public secure WebSocket address (wss://). Turn live assistance off to place a regular call.")
    connection = db.scalar(select(PhoneConnection).where(
        PhoneConnection.organization_id == organization_id,
        PhoneConnection.provider == "exotel",
        PhoneConnection.region == "IN",
    ))
    if connection is None:
        raise HTTPException(status_code=409, detail="Connect this client's Exotel account first.")
    account = db.scalar(select(TargetAccount).where(
        TargetAccount.id == data.target_account_id,
        TargetAccount.organization_id == organization_id,
    ))
    if account is None:
        raise HTTPException(status_code=404, detail="Saved prospect company was not found.")
    contact = db.scalar(select(TargetContact).where(
        TargetContact.id == data.target_contact_id,
        TargetContact.target_account_id == account.id,
    ))
    if contact is None:
        raise HTTPException(status_code=404, detail="Saved contact was not found under that company.")
    if contact.do_not_contact:
        raise HTTPException(status_code=409, detail="This person is marked do not contact.")
    if not contact.phone:
        raise HTTPException(status_code=422, detail="Add a phone number to this saved contact first.")
    prospect_number = _validate_e164(contact.phone, "Prospect phone number")

    viewer_token = None
    if data.live_assistant:
        stream_token = secrets.token_urlsafe(36)
        viewer_token = secrets.token_urlsafe(36)
        live = LiveSession(
            organization_id=organization_id,
            target_account_id=account.id,
            target_contact_id=contact.id,
            expected_account_sid=connection.account_sid,
            stream_token=stream_token,
            viewer_token=viewer_token,
            expires_at=time.time() + 60 * 60,
        )
        _sessions[viewer_token] = live
        stream_url = settings.exotel_public_ws_base.rstrip("/") + "/calls/exotel/media?" + urlencode({"token": stream_token})
    credentials = json.loads(decrypt_integration_secret(connection.credentials_encrypted))
    endpoint = f"{settings.exotel_api_base_url.rstrip('/')}/v1/Accounts/{connection.account_sid}/Calls/connect"
    payload = {
        "From": connection.agent_number,
        "To": prospect_number,
        "CallerId": connection.caller_id,
        "Record": "false",
        "TimeLimit": "3600",
        "CustomField": f"org:{organization_id[:24]}",
    }
    if data.live_assistant:
        payload["StreamUrl"] = stream_url
        payload["StreamBegin"] = "at Leg2Connect"
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(endpoint, data=payload, auth=(credentials["api_key"], credentials["api_token"]))
        if response.status_code >= 400:
            if viewer_token:
                _sessions.pop(viewer_token, None)
            raise HTTPException(status_code=502, detail=f"Exotel could not start the call (HTTP {response.status_code}). Check the account, caller ID, permissions, and available balance.")
        result = response.json()
        call = result.get("Call", {}) if isinstance(result, dict) else {}
        if not call.get("Sid"):
            if viewer_token:
                _sessions.pop(viewer_token, None)
            raise HTTPException(status_code=502, detail="Exotel returned no call reference. No live session was opened.")
    except httpx.HTTPError as error:
        if viewer_token:
            _sessions.pop(viewer_token, None)
        raise HTTPException(status_code=502, detail="Could not reach Exotel. Check the provider setup and try again.") from error
    return {
        "provider": "exotel",
        "call_sid": call["Sid"],
        "status": call.get("Status", "queued"),
        "viewer_token": viewer_token,
        "viewer_token": viewer_token,
        "notice": "Your phone will ring first, then Exotel connects the prospect." + (" Live captions are on; no audio file or transcript is saved by this app." if data.live_assistant else " Live assistance is off; no audio is streamed to this app."),
    }


@router.get("/unifonic/{region}/status", response_model=PhoneConnectionStatus)
def unifonic_status(organization_id: str, region: str, db: Session = Depends(get_db)):
    region = _gulf_market_code(region)
    connection = db.scalar(select(PhoneConnection).where(
        PhoneConnection.organization_id == organization_id,
        PhoneConnection.provider == "unifonic",
        PhoneConnection.region == region,
    ))
    return PhoneConnectionStatus(
        connected=connection is not None,
        provider="unifonic",
        region=region,
        agent_number=connection.agent_number if connection else None,
        caller_id=connection.caller_id if connection else None,
        live_stream_ready=False,
    )


@router.put("/unifonic/{region}/connection", response_model=PhoneConnectionStatus)
def save_unifonic_connection(
    organization_id: str,
    region: str,
    data: UnifonicConnectionInput,
    db: Session = Depends(get_db),
):
    region = _gulf_market_code(region)
    if not (settings.gmail_token_encryption_key or settings.session_secret):
        raise HTTPException(status_code=503, detail="Set a stable encryption key before storing provider credentials.")
    agent_number = _validate_e164(data.agent_number, "Your phone number")
    caller_id = _validate_e164(data.caller_id, "Unifonic outbound caller ID")
    connection = db.scalar(select(PhoneConnection).where(
        PhoneConnection.organization_id == organization_id,
        PhoneConnection.provider == "unifonic",
        PhoneConnection.region == region,
    ))
    if connection is None:
        connection = PhoneConnection(organization_id=organization_id, provider="unifonic", region=region)
        db.add(connection)
    connection.account_sid = "Unifonic Voice"
    connection.agent_number = agent_number
    connection.caller_id = caller_id
    connection.credentials_encrypted = encrypt_integration_secret(json.dumps({"apps_id": data.apps_id.strip()}))
    db.commit()
    return PhoneConnectionStatus(
        connected=True,
        provider="unifonic",
        region=region,
        agent_number=agent_number,
        caller_id=caller_id,
        live_stream_ready=False,
    )


@router.delete("/unifonic/{region}/connection")
def remove_unifonic_connection(organization_id: str, region: str, db: Session = Depends(get_db)):
    region = _gulf_market_code(region)
    connection = db.scalar(select(PhoneConnection).where(
        PhoneConnection.organization_id == organization_id,
        PhoneConnection.provider == "unifonic",
        PhoneConnection.region == region,
    ))
    if connection:
        db.delete(connection)
        db.commit()
    return {"connected": False, "provider": "unifonic", "region": region}


@router.post("/unifonic/{region}/dial")
async def dial_with_unifonic(
    organization_id: str,
    region: str,
    data: UnifonicDialRequest,
    db: Session = Depends(get_db),
):
    region = _gulf_market_code(region)
    if not data.outbound_call_confirmed:
        raise HTTPException(status_code=400, detail="Confirm that you are allowed to place this business call and will follow the destination country's calling rules.")
    connection = db.scalar(select(PhoneConnection).where(
        PhoneConnection.organization_id == organization_id,
        PhoneConnection.provider == "unifonic",
        PhoneConnection.region == region,
    ))
    if connection is None:
        raise HTTPException(status_code=409, detail="Connect this client's Unifonic account for the selected country first.")
    account = db.scalar(select(TargetAccount).where(
        TargetAccount.id == data.target_account_id,
        TargetAccount.organization_id == organization_id,
    ))
    if account is None:
        raise HTTPException(status_code=404, detail="Saved prospect company was not found.")
    contact = db.scalar(select(TargetContact).where(
        TargetContact.id == data.target_contact_id,
        TargetContact.target_account_id == account.id,
    ))
    if contact is None:
        raise HTTPException(status_code=404, detail="Saved contact was not found under that company.")
    if contact.do_not_contact:
        raise HTTPException(status_code=409, detail="This person is marked do not contact.")
    if not contact.phone:
        raise HTTPException(status_code=422, detail="Add a phone number to this saved contact first.")
    prospect_number = _validate_e164(contact.phone, "Prospect phone number")
    if not prospect_number.startswith(_GULF_MARKETS[region]):
        raise HTTPException(status_code=422, detail="This contact's phone number does not match the selected Gulf country.")
    credentials = json.loads(decrypt_integration_secret(connection.credentials_encrypted))
    call_reference = secrets.token_urlsafe(18)
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                "https://voice.unifonic.com/v1/calls",
                headers={"AppsId": credentials["apps_id"], "Content-Type": "application/json"},
                json={
                    "recipient": [connection.agent_number, prospect_number],
                    "callerId": connection.caller_id,
                    "type": "ivr",
                    "ivr": {
                        "say": "Please wait while we connect your call.",
                        "language": "english",
                        "voice": "female",
                        "conference": True,
                    },
                    "referenceId": call_reference,
                },
            )
        if response.status_code >= 400:
            raise HTTPException(status_code=502, detail="Unifonic could not start the call. Check the Voice application, approved outbound caller ID, destination-country permissions, and account balance.")
        result = response.json()
        provider_call_id = result.get("callId") if isinstance(result, dict) else None
        if not isinstance(provider_call_id, str) or not provider_call_id:
            raise HTTPException(status_code=502, detail="Unifonic did not return a call reference. No call was confirmed as started.")
    except HTTPException:
        raise
    except (httpx.HTTPError, ValueError) as error:
        raise HTTPException(status_code=502, detail="Could not reach Unifonic. Check the Voice setup and try again.") from error
    return {
        "provider": "unifonic",
        "region": region,
        "call_id": provider_call_id,
        "status": result.get("status", "queued"),
        "notice": "Unifonic is calling your phone and the prospect, then connecting the answered legs. Live assistant is off; this call is not streamed or transcribed by this app.",
    }


@router.get("/twilio/{region}/status", response_model=PhoneConnectionStatus)
def twilio_status(organization_id: str, region: str, db: Session = Depends(get_db)):
    region = _market_code(region)
    connection = db.scalar(select(PhoneConnection).where(
        PhoneConnection.organization_id == organization_id,
        PhoneConnection.provider == "twilio",
        PhoneConnection.region == region,
    ))
    return PhoneConnectionStatus(
        connected=connection is not None,
        provider="twilio",
        region=region,
        account_sid=connection.account_sid if connection else None,
        agent_number=connection.agent_number if connection else None,
        caller_id=connection.caller_id if connection else None,
        live_stream_ready=bool(_phone_media_base().startswith("wss://") and settings.openai_api_key),
    )


@router.put("/twilio/{region}/connection", response_model=PhoneConnectionStatus)
async def save_twilio_connection(
    organization_id: str,
    region: str,
    data: TwilioConnectionInput,
    db: Session = Depends(get_db),
):
    region = _market_code(region)
    if not data.account_sid.startswith("AC"):
        raise HTTPException(status_code=422, detail="Twilio Account SID must start with AC.")
    if not (settings.gmail_token_encryption_key or settings.session_secret):
        raise HTTPException(status_code=503, detail="Set a stable encryption key before storing provider credentials.")
    agent_number = _validate_e164(data.agent_number, "Your phone number")
    caller_id = _validate_e164(data.caller_id, "Twilio phone number")
    if region != "MY" and not caller_id.startswith(_TWILIO_MARKETS[region]):
        raise HTTPException(status_code=422, detail=f"The Twilio caller ID must match the selected {region} market's country code.")
    auth = (data.account_sid.strip(), data.auth_token)
    api_root = f"https://api.twilio.com/2010-04-01/Accounts/{data.account_sid.strip()}"
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            account_response = await client.get(f"{api_root}.json", auth=auth)
            if account_response.status_code >= 400:
                raise HTTPException(status_code=422, detail="Twilio could not verify this Account SID and Auth Token.")
            numbers_response = await client.get(f"{api_root}/IncomingPhoneNumbers.json", params={"PhoneNumber": caller_id, "PageSize": 100}, auth=auth)
            if numbers_response.status_code >= 400:
                raise HTTPException(status_code=502, detail="Twilio authenticated the account but could not check its caller ID numbers.")
            owned_numbers = numbers_response.json().get("incoming_phone_numbers", [])
            caller_is_owned = any(item.get("phone_number") == caller_id for item in owned_numbers)
            if not caller_is_owned and region != "MY":
                verified_response = await client.get(f"{api_root}/OutgoingCallerIds.json", params={"PhoneNumber": caller_id, "PageSize": 100}, auth=auth)
                if verified_response.status_code >= 400:
                    raise HTTPException(status_code=502, detail="Twilio authenticated the account but could not check verified caller IDs.")
                verified_ids = verified_response.json().get("outgoing_caller_ids", [])
                caller_is_owned = any(item.get("phone_number") == caller_id for item in verified_ids)
            if not caller_is_owned:
                if region == "MY":
                    raise HTTPException(status_code=422, detail="Malaysia calls require a Twilio-owned caller ID; verified personal caller IDs are not supported there.")
                raise HTTPException(status_code=422, detail="Use a Twilio-owned number or a caller ID verified on this Twilio account.")
    except HTTPException:
        raise
    except httpx.HTTPError as error:
        raise HTTPException(status_code=502, detail="Could not verify this Twilio account right now. Please retry.") from error
    connection = db.scalar(select(PhoneConnection).where(
        PhoneConnection.organization_id == organization_id,
        PhoneConnection.provider == "twilio",
        PhoneConnection.region == region,
    ))
    if connection is None:
        connection = PhoneConnection(organization_id=organization_id, provider="twilio", region=region)
        db.add(connection)
    connection.account_sid = data.account_sid.strip()
    connection.agent_number = agent_number
    connection.caller_id = caller_id
    connection.credentials_encrypted = encrypt_integration_secret(json.dumps({"auth_token": data.auth_token}))
    db.commit()
    return PhoneConnectionStatus(
        connected=True,
        provider="twilio",
        region=region,
        account_sid=connection.account_sid,
        agent_number=connection.agent_number,
        caller_id=connection.caller_id,
        live_stream_ready=bool(_phone_media_base().startswith("wss://") and settings.openai_api_key),
    )


@router.delete("/twilio/{region}/connection")
def remove_twilio_connection(organization_id: str, region: str, db: Session = Depends(get_db)):
    region = _market_code(region)
    connection = db.scalar(select(PhoneConnection).where(
        PhoneConnection.organization_id == organization_id,
        PhoneConnection.provider == "twilio",
        PhoneConnection.region == region,
    ))
    if connection:
        db.delete(connection)
        db.commit()
    return {"connected": False, "provider": "twilio", "region": region}


@router.post("/twilio/{region}/dial")
async def dial_with_twilio(
    organization_id: str,
    region: str,
    data: DialRequest,
    db: Session = Depends(get_db),
):
    region = _market_code(region)
    if not data.outbound_call_confirmed:
        raise HTTPException(status_code=400, detail="Confirm that you are allowed to place this business call and will follow the target country's calling rules.")
    if data.live_assistant and not data.consent_confirmed:
        raise HTTPException(status_code=400, detail="Confirm the required notice and permission for live call audio and transcription.")
    media_base = _phone_media_base()
    if data.live_assistant and not settings.openai_api_key:
        raise HTTPException(status_code=503, detail="Add OPENAI_API_KEY before enabling live call assistance.")
    if data.live_assistant and not media_base.startswith("wss://"):
        raise HTTPException(status_code=503, detail="Live assistance needs PHONE_PUBLIC_WS_BASE with a public secure WebSocket address (wss://). Turn live assistance off to place a regular call.")
    connection = db.scalar(select(PhoneConnection).where(
        PhoneConnection.organization_id == organization_id,
        PhoneConnection.provider == "twilio",
        PhoneConnection.region == region,
    ))
    if connection is None:
        raise HTTPException(status_code=409, detail=f"Connect this client's Twilio {region} account first.")
    account = db.scalar(select(TargetAccount).where(
        TargetAccount.id == data.target_account_id,
        TargetAccount.organization_id == organization_id,
    ))
    if account is None:
        raise HTTPException(status_code=404, detail="Saved prospect company was not found.")
    contact = db.scalar(select(TargetContact).where(
        TargetContact.id == data.target_contact_id,
        TargetContact.target_account_id == account.id,
    ))
    if contact is None:
        raise HTTPException(status_code=404, detail="Saved contact was not found under that company.")
    if contact.do_not_contact:
        raise HTTPException(status_code=409, detail="This person is marked do not contact.")
    if not contact.phone:
        raise HTTPException(status_code=422, detail="Add a phone number to this saved contact first.")
    prospect_number = _validate_e164(contact.phone, "Prospect phone number")
    if not prospect_number.startswith(_TWILIO_MARKETS[region]):
        raise HTTPException(status_code=422, detail=f"This contact's phone number does not match the selected {region} market.")

    viewer_token = None
    stream_markup = ""
    if data.live_assistant:
        stream_token = secrets.token_urlsafe(36)
        viewer_token = secrets.token_urlsafe(36)
        live = LiveSession(
            organization_id=organization_id,
            target_account_id=account.id,
            target_contact_id=contact.id,
            expected_account_sid=connection.account_sid,
            provider="twilio",
            agent_number=connection.agent_number,
            caller_id=connection.caller_id,
            prospect_number=prospect_number,
            stream_token=stream_token,
            viewer_token=viewer_token,
            expires_at=time.time() + 60 * 60,
        )
        _sessions[viewer_token] = live
        stream_url = media_base.rstrip("/") + "/calls/twilio/media"
        stream_markup = (
            "<Start><Stream track=\"both_tracks\" url=\"" + xml_escape(stream_url) + "\">"
            "<Parameter name=\"token\" value=\"" + xml_escape(stream_token) + "\"/>"
            "</Stream></Start>"
        )
    inline_twiml = (
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
        "<Response>" + stream_markup + "<Dial callerId=\"" + xml_escape(connection.caller_id) + "\" answerOnBridge=\"true\">"
        "<Number>" + xml_escape(prospect_number) + "</Number></Dial></Response>"
    )
    credentials = json.loads(decrypt_integration_secret(connection.credentials_encrypted))
    endpoint = f"https://api.twilio.com/2010-04-01/Accounts/{connection.account_sid}/Calls.json"
    payload = {
        "To": connection.agent_number,
        "From": connection.caller_id,
        "Twiml": inline_twiml,
        "TimeLimit": "3600",
    }
    try:
        async with httpx.AsyncClient(timeout=25) as client:
            response = await client.post(endpoint, data=payload, auth=(connection.account_sid, credentials["auth_token"]), follow_redirects=False)
        if response.status_code >= 400:
            if viewer_token:
                _sessions.pop(viewer_token, None)
            raise HTTPException(status_code=502, detail=f"Twilio could not start the call (HTTP {response.status_code}). Check this account's country permissions, phone number, caller ID, and balance.")
        result = response.json()
        if not result.get("sid"):
            if viewer_token:
                _sessions.pop(viewer_token, None)
            raise HTTPException(status_code=502, detail="Twilio returned no call reference. No live session was opened.")
    except httpx.HTTPError as error:
        if viewer_token:
            _sessions.pop(viewer_token, None)
        raise HTTPException(status_code=502, detail="Could not reach Twilio. Check the provider setup and try again.") from error
    return {
        "provider": "twilio",
        "region": region,
        "call_sid": result["sid"],
        "status": result.get("status", "queued"),
        "viewer_token": viewer_token,
        "notice": "Your phone will ring first, then Twilio connects the prospect." + (" Live captions are on; no recording is requested and captions stay temporary." if data.live_assistant else " Live assistance is off; no audio is streamed to this app."),
    }


@stream_router.api_route("/calls/twilio/twiml", methods=["GET", "POST"])
def twilio_call_instructions(token: str = Query(...)):
    session = _session_by_token(token)
    if session is None or session.provider != "twilio":
        return Response("<Response><Hangup/></Response>", media_type="application/xml", status_code=404)
    stream_url = _phone_media_base().rstrip("/") + "/calls/twilio/media"
    xml = (
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
        "<Response><Start><Stream track=\"both_tracks\" url=\"" + xml_escape(stream_url) + "\">"
        "<Parameter name=\"token\" value=\"" + xml_escape(session.stream_token) + "\"/>"
        "</Stream></Start><Dial callerId=\"" + xml_escape(session.caller_id) + "\" answerOnBridge=\"true\">"
        "<Number>" + xml_escape(session.prospect_number) + "</Number></Dial></Response>"
    )
    return Response(xml, media_type="application/xml")


async def _open_transcriber():
    socket = await websocket_connect(
        "wss://api.openai.com/v1/realtime?intent=transcription",
        additional_headers={"Authorization": f"Bearer {settings.openai_api_key}"},
        open_timeout=20,
        max_size=2**20,
    )
    await socket.send(json.dumps({
        "type": "session.update",
        "session": {
            "type": "transcription",
            "audio": {
                "input": {
                    "format": {"type": "audio/pcm", "rate": 24000},
                    "transcription": {"model": "gpt-live-transcribe"},
                    "turn_detection": None,
                }
            },
        },
    }))
    return socket


def _resample_pcm16(payload: bytes, source_rate: int) -> bytes:
    """Linear interpolation for mono signed PCM16 into the 24 kHz transcription format."""
    if source_rate == 24000:
        return payload
    if source_rate not in (8000, 16000) or len(payload) < 2:
        raise ValueError("Unsupported Exotel audio sample rate")
    sample_count = len(payload) // 2
    samples = [int.from_bytes(payload[index:index + 2], "little", signed=True) for index in range(0, sample_count * 2, 2)]
    output_count = round(sample_count * 24000 / source_rate)
    output = bytearray(output_count * 2)
    ratio = source_rate / 24000
    for index in range(output_count):
        source = index * ratio
        left = min(int(source), sample_count - 1)
        right = min(left + 1, sample_count - 1)
        fraction = source - left
        value = round(samples[left] * (1 - fraction) + samples[right] * fraction)
        output[index * 2:index * 2 + 2] = max(-32768, min(32767, value)).to_bytes(2, "little", signed=True)
    return bytes(output)


def _mulaw_to_pcm16(payload: bytes) -> bytes:
    """Decode Twilio's G.711 μ-law, 8 kHz mono media into signed PCM16."""
    output = bytearray(len(payload) * 2)
    for index, encoded in enumerate(payload):
        value = (~encoded) & 0xFF
        sign = value & 0x80
        exponent = (value >> 4) & 0x07
        mantissa = value & 0x0F
        sample = ((mantissa << 3) + 0x84) << exponent
        sample -= 0x84
        if sign:
            sample = -sample
        output[index * 2:index * 2 + 2] = max(-32768, min(32767, sample)).to_bytes(2, "little", signed=True)
    return bytes(output)


async def _publish(session: LiveSession, event: dict):
    if event.get("type") == "conversation.item.input_audio_transcription.completed":
        text = str(event.get("transcript", "")).strip()
        if text:
            session.transcript.append(text)
            session.transcript = session.transcript[-40:]
    message = json.dumps(event)
    try:
        session.queue.put_nowait(message)
    except asyncio.QueueFull:
        try:
            session.queue.get_nowait()
            session.queue.put_nowait(message)
        except (asyncio.QueueEmpty, asyncio.QueueFull):
            pass


@stream_router.websocket("/calls/exotel/media")
async def exotel_media_stream(websocket: WebSocket, token: str = Query(...)):
    session = _session_by_token(token)
    if session is None or session.stream_started or not session.transcription_enabled:
        await websocket.close(code=1008)
        return
    session.stream_started = True
    await websocket.accept()
    exotel_socket = None
    openai_socket = None
    reader_task = None
    try:
        exotel_socket = websocket
        openai_socket = await _open_transcriber()
        await _publish(session, {"type": "status", "status": "listening"})
        last_voice = 0.0
        has_voice = False
        async def read_transcripts():
            async for message in openai_socket:
                try:
                    event = json.loads(message)
                except (TypeError, json.JSONDecodeError):
                    continue
                kind = event.get("type", "")
                if kind in ("conversation.item.input_audio_transcription.delta", "conversation.item.input_audio_transcription.completed"):
                    await _publish(session, event)
                elif kind == "error":
                    detail = event.get("error", {}).get("message", "Transcription unavailable")
                    await _publish(session, {"type": "status", "status": "error", "detail": detail[:250]})
        reader_task = asyncio.create_task(read_transcripts())
        while True:
            raw = await exotel_socket.receive_text()
            event = json.loads(raw)
            if not session.transcription_enabled and openai_socket:
                await openai_socket.close()
                openai_socket = None
                if reader_task:
                    reader_task.cancel()
                    reader_task = None
            if event.get("event") == "start":
                stream_account_sid = str(event.get("start", {}).get("account_sid", ""))
                if stream_account_sid and not secrets.compare_digest(stream_account_sid, session.expected_account_sid):
                    raise ValueError("Phone provider stream account did not match the connected client.")
                media = event.get("start", {}).get("media_format", {})
                rate = int(media.get("sample_rate", "8000"))
                if rate not in (8000, 16000, 24000):
                    raise ValueError("Exotel supplied an unsupported sample rate")
                session.sample_rate = rate
            elif event.get("event") == "media":
                if not session.transcription_enabled or openai_socket is None:
                    continue
                audio = base64.b64decode(event.get("media", {}).get("payload", ""), validate=False)
                if not audio:
                    continue
                rate = int(event.get("media", {}).get("sample_rate", str(session.sample_rate)))
                pcm = _resample_pcm16(audio, rate)
                await openai_socket.send(json.dumps({
                    "type": "input_audio_buffer.append",
                    "audio": base64.b64encode(pcm).decode("ascii"),
                }))
                sample_values = [int.from_bytes(pcm[index:index + 2], "little", signed=True) for index in range(0, len(pcm) - 1, 2)]
                rms = math.sqrt(sum(value * value for value in sample_values) / max(len(sample_values), 1))
                now = time.monotonic()
                if rms > 480:
                    last_voice = now
                    has_voice = True
                elif has_voice and now - last_voice > 0.8:
                    await openai_socket.send(json.dumps({"type": "input_audio_buffer.commit"}))
                    has_voice = False
            elif event.get("event") == "stop":
                if has_voice and openai_socket:
                    await openai_socket.send(json.dumps({"type": "input_audio_buffer.commit"}))
                    await asyncio.sleep(1.5)
                await _publish(session, {"type": "status", "status": "ended"})
                break
    except WebSocketDisconnect:
        pass
    except Exception as error:
        await _publish(session, {"type": "status", "status": "error", "detail": str(error)[:250]})
    finally:
        session.transcription_enabled = False
        session.closed = True
        if reader_task:
            reader_task.cancel()
        if openai_socket:
            await openai_socket.close()
        await _publish(session, {"type": "status", "status": "ended"})


@stream_router.websocket("/calls/twilio/media")
async def twilio_media_stream(websocket: WebSocket):
    await websocket.accept()
    session: LiveSession | None = None
    sockets: dict[str, object] = {}
    readers: list[asyncio.Task] = []
    last_voice: dict[str, float] = {}
    has_voice: dict[str, bool] = {}
    try:
        while True:
            event = json.loads(await websocket.receive_text())
            kind = event.get("event")
            if kind == "start":
                start = event.get("start", {})
                token = str(start.get("customParameters", {}).get("token", ""))
                session = _session_by_token(token)
                if session is None or session.provider != "twilio" or session.stream_started:
                    await websocket.close(code=1008)
                    return
                account_sid = str(start.get("accountSid", ""))
                if account_sid and not secrets.compare_digest(account_sid, session.expected_account_sid):
                    raise ValueError("Twilio stream account did not match the connected client.")
                session.stream_started = True
                tracks = start.get("tracks", ["inbound", "outbound"])
                if not session.transcription_enabled:
                    await _publish(session, {"type": "status", "status": "stopped"})
                    break
                for track in tracks:
                    if track not in ("inbound", "outbound"):
                        continue
                    socket = await _open_transcriber()
                    sockets[track] = socket
                    last_voice[track] = 0.0
                    has_voice[track] = False

                    async def read_track(track_name: str, openai_socket):
                        async for message in openai_socket:
                            try:
                                transcript_event = json.loads(message)
                            except (TypeError, json.JSONDecodeError):
                                continue
                            event_type = transcript_event.get("type", "")
                            if event_type in ("conversation.item.input_audio_transcription.delta", "conversation.item.input_audio_transcription.completed"):
                                transcript_event["speaker"] = "you" if track_name == "inbound" else "other party"
                                if transcript_event.get("item_id"):
                                    transcript_event["item_id"] = f"{track_name}:{transcript_event['item_id']}"
                                await _publish(session, transcript_event)
                            elif event_type == "error":
                                detail = transcript_event.get("error", {}).get("message", "Transcription unavailable")
                                await _publish(session, {"type": "status", "status": "error", "detail": detail[:250]})

                    readers.append(asyncio.create_task(read_track(track, socket)))
                await _publish(session, {"type": "status", "status": "listening"})
            elif kind == "media" and session is not None:
                if not session.transcription_enabled:
                    for socket in sockets.values():
                        await socket.close()
                    sockets.clear()
                    continue
                media = event.get("media", {})
                track = str(media.get("track", "inbound"))
                socket = sockets.get(track)
                if socket is None:
                    continue
                encoded = base64.b64decode(media.get("payload", ""), validate=False)
                if not encoded:
                    continue
                pcm = _resample_pcm16(_mulaw_to_pcm16(encoded), 8000)
                await socket.send(json.dumps({
                    "type": "input_audio_buffer.append",
                    "audio": base64.b64encode(pcm).decode("ascii"),
                }))
                values = [int.from_bytes(pcm[index:index + 2], "little", signed=True) for index in range(0, len(pcm) - 1, 2)]
                rms = math.sqrt(sum(value * value for value in values) / max(len(values), 1))
                now = time.monotonic()
                if rms > 480:
                    last_voice[track] = now
                    has_voice[track] = True
                elif has_voice.get(track) and now - last_voice.get(track, now) > 0.8:
                    await socket.send(json.dumps({"type": "input_audio_buffer.commit"}))
                    has_voice[track] = False
            elif kind == "stop":
                if session:
                    for track, socket in sockets.items():
                        if has_voice.get(track):
                            await socket.send(json.dumps({"type": "input_audio_buffer.commit"}))
                    await asyncio.sleep(1.5)
                    await _publish(session, {"type": "status", "status": "ended"})
                break
    except WebSocketDisconnect:
        pass
    except Exception as error:
        if session:
            await _publish(session, {"type": "status", "status": "error", "detail": str(error)[:250]})
    finally:
        if session:
            session.transcription_enabled = False
            session.closed = True
        for reader in readers:
            reader.cancel()
        for socket in sockets.values():
            try:
                await socket.close()
            except Exception:
                pass


@stream_router.websocket("/calls/exotel/live")
async def exotel_live_view(websocket: WebSocket, token: str = Query(...)):
    session = _session_by_token(token, viewer=True)
    if session is None:
        await websocket.close(code=1008)
        return
    await websocket.accept()
    try:
        await websocket.send_text(json.dumps({"type": "snapshot", "transcript_lines": session.transcript, "status": "ended" if session.closed else "waiting"}))
        while not session.closed:
            message = await asyncio.wait_for(session.queue.get(), timeout=30)
            await websocket.send_text(message)
    except (WebSocketDisconnect, asyncio.TimeoutError):
        pass
    finally:
        session.transcription_enabled = False
        session.closed = True
        session.transcript.clear()
        await websocket.close()


@stream_router.websocket("/calls/twilio/live")
async def twilio_live_view(websocket: WebSocket, token: str = Query(...)):
    session = _session_by_token(token, viewer=True)
    if session is None or session.provider != "twilio":
        await websocket.close(code=1008)
        return
    await websocket.accept()
    try:
        await websocket.send_text(json.dumps({"type": "snapshot", "transcript_lines": session.transcript, "status": "ended" if session.closed else "waiting"}))
        while not session.closed:
            message = await asyncio.wait_for(session.queue.get(), timeout=30)
            await websocket.send_text(message)
    except (WebSocketDisconnect, asyncio.TimeoutError):
        pass
    finally:
        session.transcription_enabled = False
        session.closed = True
        session.transcript.clear()
        await websocket.close()


@stream_router.delete("/calls/exotel/live/{token}")
async def stop_exotel_live_assist(token: str):
    session = _session_by_token(token, viewer=True)
    if session is None:
        raise HTTPException(status_code=404, detail="Live assistant session has ended or expired.")
    session.transcription_enabled = False
    session.transcript.clear()
    session.closed = True
    await _publish(session, {"type": "status", "status": "stopped"})
    return {"stopped": True, "transcript_cleared": True}


@stream_router.delete("/calls/twilio/live/{token}")
async def stop_twilio_live_assist(token: str):
    session = _session_by_token(token, viewer=True)
    if session is None or session.provider != "twilio":
        raise HTTPException(status_code=404, detail="Live assistant session has ended or expired.")
    session.transcription_enabled = False
    session.transcript.clear()
    session.closed = True
    await _publish(session, {"type": "status", "status": "stopped"})
    return {"stopped": True, "transcript_cleared": True}
