import base64
import json

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import require_organization_access
from app.core.config.settings import settings
from app.core.gmail import encrypt_integration_secret
from app.db.dependencies import get_db
from app.models.prospect_data_connection import ProspectDataConnection


router = APIRouter(
    prefix="/organizations/{organization_id}/integrations/prospect-data",
    tags=["Prospect Data Integrations"],
    dependencies=[Depends(require_organization_access)],
)
ALLOWED_PROVIDERS = {"apollo", "lusha", "zoominfo"}


class ConnectionInput(BaseModel):
    api_key: str | None = Field(default=None, min_length=8, max_length=2000)
    client_id: str | None = Field(default=None, min_length=4, max_length=500)
    client_secret: str | None = Field(default=None, min_length=8, max_length=2000)


def _get(db: Session, organization_id: str, provider: str) -> ProspectDataConnection | None:
    return db.scalar(select(ProspectDataConnection).where(
        ProspectDataConnection.organization_id == organization_id,
        ProspectDataConnection.provider == provider,
    ))


async def _verify_apollo(api_key: str) -> None:
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get(
                "https://api.apollo.io/api/v1/auth/health",
                headers={"x-api-key": api_key, "Content-Type": "application/json", "Cache-Control": "no-cache"},
            )
    except httpx.HTTPError as error:
        raise HTTPException(status_code=502, detail="Apollo could not be reached. Try again later.") from error
    if response.status_code == 401:
        raise HTTPException(status_code=400, detail="Apollo rejected this API key. Check the key and try again.")
    if response.status_code == 403:
        raise HTTPException(status_code=400, detail="This Apollo key or plan cannot use API access.")
    if not response.is_success:
        raise HTTPException(status_code=502, detail=f"Apollo returned an error ({response.status_code}).")
    result = response.json()
    if result.get("healthy") is not True or result.get("is_logged_in") is not True:
        raise HTTPException(status_code=400, detail="Apollo did not confirm this API key as ready.")


async def _verify_zoominfo(client_id: str, client_secret: str) -> None:
    basic = base64.b64encode(f"{client_id}:{client_secret}".encode("utf-8")).decode("ascii")
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                "https://api.zoominfo.com/gtm/oauth/v1/token",
                headers={"Authorization": f"Basic {basic}", "Content-Type": "application/x-www-form-urlencoded"},
                data={"grant_type": "client_credentials"},
            )
    except httpx.HTTPError as error:
        raise HTTPException(status_code=502, detail="ZoomInfo could not be reached. Try again later.") from error
    if response.status_code in (400, 401, 403):
        raise HTTPException(status_code=400, detail="ZoomInfo did not accept these OAuth credentials or this app is not enabled for API access.")
    if not response.is_success or not response.json().get("access_token"):
        raise HTTPException(status_code=502, detail=f"ZoomInfo could not verify the connection ({response.status_code}).")


@router.get("/status")
def connection_status(organization_id: str, db: Session = Depends(get_db)):
    rows = db.scalars(select(ProspectDataConnection).where(ProspectDataConnection.organization_id == organization_id)).all()
    saved = {row.provider: row for row in rows}
    return {
        "providers": {
            name: {
                "connected": name in saved,
                "verified": saved[name].verified if name in saved else False,
                "connected_at": saved[name].connected_at if name in saved else None,
                "used_in_search": False,
            }
            for name in sorted(ALLOWED_PROVIDERS)
        }
    }


@router.put("/{provider}")
async def save_connection(organization_id: str, provider: str, data: ConnectionInput, db: Session = Depends(get_db)):
    provider = provider.casefold()
    if provider not in ALLOWED_PROVIDERS:
        raise HTTPException(status_code=404, detail="This prospecting provider is not supported.")
    if not (settings.gmail_token_encryption_key or settings.session_secret):
        raise HTTPException(status_code=503, detail="Set a stable encryption key before storing provider credentials.")

    if provider in {"apollo", "lusha"}:
        if not data.api_key:
            raise HTTPException(status_code=422, detail="Enter the provider API key.")
        credentials = {"api_key": data.api_key.strip()}
        verified = provider == "apollo"
        if provider == "apollo":
            await _verify_apollo(credentials["api_key"])
    else:
        if not data.client_id or not data.client_secret:
            raise HTTPException(status_code=422, detail="Enter both the ZoomInfo client ID and client secret.")
        credentials = {"client_id": data.client_id.strip(), "client_secret": data.client_secret.strip()}
        await _verify_zoominfo(credentials["client_id"], credentials["client_secret"])
        verified = True

    row = _get(db, organization_id, provider)
    if row is None:
        row = ProspectDataConnection(organization_id=organization_id, provider=provider, credentials_encrypted="")
        db.add(row)
    row.credentials_encrypted = encrypt_integration_secret(json.dumps(credentials))
    row.verified = verified
    db.commit()
    db.refresh(row)
    return {"provider": provider, "connected": True, "verified": verified, "connected_at": row.connected_at, "used_in_search": False}


@router.delete("/{provider}", status_code=204)
def disconnect(organization_id: str, provider: str, db: Session = Depends(get_db)):
    provider = provider.casefold()
    if provider not in ALLOWED_PROVIDERS:
        raise HTTPException(status_code=404, detail="This prospecting provider is not supported.")
    row = _get(db, organization_id, provider)
    if row:
        db.delete(row)
        db.commit()
    return None
