from urllib.parse import urlsplit

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import require_organization_access
from app.core.gmail import decrypt_integration_secret, encrypt_integration_secret
from app.db.dependencies import get_db
from app.models.crm_connection import CrmConnection
from app.models.target_account import TargetAccount
from app.models.target_contact import TargetContact


router = APIRouter(
    prefix="/organizations/{organization_id}/integrations/hubspot",
    tags=["CRM Integrations"],
    dependencies=[Depends(require_organization_access)],
)
HUBSPOT_API = "https://api.hubapi.com"


class HubSpotTokenInput(BaseModel):
    private_app_token: str = Field(min_length=20, max_length=500)


def _connection(db: Session, organization_id: str) -> CrmConnection | None:
    return db.scalar(select(CrmConnection).where(
        CrmConnection.organization_id == organization_id,
        CrmConnection.provider == "hubspot",
    ))


async def _request(client: httpx.AsyncClient, method: str, path: str, token: str, **kwargs):
    try:
        response = await client.request(
            method,
            f"{HUBSPOT_API}{path}",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            **kwargs,
        )
    except httpx.HTTPError as error:
        raise HTTPException(status_code=502, detail="HubSpot could not be reached. Try again later.") from error
    if response.status_code == 401:
        raise HTTPException(status_code=409, detail="HubSpot rejected this token. Reconnect with a valid private app token.")
    if response.status_code == 403:
        raise HTTPException(status_code=403, detail="This HubSpot app is missing the company/contact permissions needed for this action.")
    if response.status_code == 429:
        raise HTTPException(status_code=429, detail="HubSpot rate limit reached. Wait a little, then retry.")
    if not response.is_success:
        raise HTTPException(status_code=502, detail=f"HubSpot returned an error ({response.status_code}).")
    if response.status_code == 204 or not response.content:
        return {}
    try:
        return response.json()
    except ValueError as error:
        raise HTTPException(status_code=502, detail="HubSpot returned an unreadable response.") from error


@router.get("/status")
def hubspot_status(organization_id: str, db: Session = Depends(get_db)):
    connection = _connection(db, organization_id)
    return {
        "provider": "hubspot",
        "connected": connection is not None,
        "portal_id": connection.portal_id if connection else None,
        "connected_at": connection.connected_at if connection else None,
    }


@router.put("/connection")
async def connect_hubspot(
    organization_id: str,
    data: HubSpotTokenInput,
    db: Session = Depends(get_db),
):
    token = data.private_app_token.strip()
    async with httpx.AsyncClient(timeout=20) as client:
        account = await _request(client, "GET", "/crm/v3/objects/companies?limit=1&properties=name", token)
    connection = _connection(db, organization_id)
    if connection is None:
        connection = CrmConnection(
            organization_id=organization_id,
            provider="hubspot",
            access_token_encrypted=encrypt_integration_secret(token),
        )
        db.add(connection)
    else:
        connection.access_token_encrypted = encrypt_integration_secret(token)
    connection.portal_id = str(account.get("portalId")) if account.get("portalId") else connection.portal_id
    db.commit()
    return {"provider": "hubspot", "connected": True, "portal_id": connection.portal_id}


@router.delete("/connection", status_code=204)
def disconnect_hubspot(organization_id: str, db: Session = Depends(get_db)):
    connection = _connection(db, organization_id)
    if connection:
        db.delete(connection)
        db.commit()
    return None


async def _search_company(client: httpx.AsyncClient, token: str, account: TargetAccount) -> str | None:
    website = account.website or ""
    domain = urlsplit(website if "://" in website else f"https://{website}").hostname
    filters = [{"propertyName": "domain", "operator": "EQ", "value": domain}] if domain else [
        {"propertyName": "name", "operator": "EQ", "value": account.company_name}
    ]
    result = await _request(client, "POST", "/crm/v3/objects/companies/search", token, json={
        "filterGroups": [{"filters": filters}], "properties": ["name", "domain"], "limit": 2,
    })
    rows = result.get("results", [])
    if len(rows) > 1:
        raise HTTPException(
            status_code=409,
            detail=f"HubSpot has multiple matching company records for {account.company_name}; sync was paused to avoid updating the wrong one.",
        )
    return rows[0].get("id") if rows else None


async def _upsert_company(client: httpx.AsyncClient, token: str, account: TargetAccount) -> str:
    properties = {"name": account.company_name}
    website = account.website or ""
    domain = urlsplit(website if "://" in website else f"https://{website}").hostname
    if domain:
        properties["domain"] = domain
    if account.industry:
        properties["industry"] = account.industry[:100]
    remote_id = await _search_company(client, token, account)
    if remote_id:
        await _request(client, "PATCH", f"/crm/v3/objects/companies/{remote_id}", token, json={"properties": properties})
        return remote_id
    result = await _request(client, "POST", "/crm/v3/objects/companies", token, json={"properties": properties})
    return str(result.get("id", ""))


async def _upsert_contact(client: httpx.AsyncClient, token: str, contact: TargetContact, company_id: str) -> bool:
    if not contact.email:
        return False
    properties = {"email": contact.email.strip().casefold(), "firstname": contact.first_name}
    if contact.last_name:
        properties["lastname"] = contact.last_name
    if contact.job_title:
        properties["jobtitle"] = contact.job_title
    if contact.phone:
        properties["phone"] = contact.phone
    if contact.do_not_contact:
        properties["hs_email_optout"] = "true"
    search = await _request(client, "POST", "/crm/v3/objects/contacts/search", token, json={
        "filterGroups": [{"filters": [{"propertyName": "email", "operator": "EQ", "value": properties["email"]}]}],
        "properties": ["email"], "limit": 1,
    })
    rows = search.get("results", [])
    if rows:
        contact_id = str(rows[0].get("id", ""))
        await _request(client, "PATCH", f"/crm/v3/objects/contacts/{contact_id}", token, json={"properties": properties})
    else:
        result = await _request(client, "POST", "/crm/v3/objects/contacts", token, json={"properties": properties})
        contact_id = str(result.get("id", ""))
    if contact_id and company_id:
        await _request(
            client,
            "PUT",
            f"/crm/v4/objects/contacts/{contact_id}/associations/default/companies/{company_id}",
            token,
        )
    return True


@router.post("/sync")
async def sync_saved_records(organization_id: str, db: Session = Depends(get_db)):
    connection = _connection(db, organization_id)
    if connection is None:
        raise HTTPException(status_code=409, detail="Connect a HubSpot private app before syncing.")
    token = decrypt_integration_secret(connection.access_token_encrypted)
    accounts = db.scalars(
        select(TargetAccount).where(TargetAccount.organization_id == organization_id)
        .order_by(TargetAccount.created_at.asc()).limit(100)
    ).all()
    companies_synced = contacts_synced = contacts_skipped = 0
    try:
        async with httpx.AsyncClient(timeout=25) as client:
            for account in accounts:
                company_id = await _upsert_company(client, token, account)
                if not company_id:
                    raise HTTPException(status_code=502, detail="HubSpot did not return the saved company's record ID.")
                companies_synced += 1
                contacts = db.scalars(select(TargetContact).where(TargetContact.target_account_id == account.id)).all()
                for contact in contacts:
                    if await _upsert_contact(client, token, contact, company_id):
                        contacts_synced += 1
                    else:
                        contacts_skipped += 1
    except HTTPException as error:
        if companies_synced or contacts_synced:
            raise HTTPException(
                status_code=error.status_code,
                detail=f"Sync stopped after {companies_synced} companies and {contacts_synced} contacts. {error.detail}",
            ) from error
        raise
    return {
        "companies_synced": companies_synced,
        "contacts_synced": contacts_synced,
        "contacts_skipped_without_email": contacts_skipped,
        "message": "Saved companies and contacts were upserted to HubSpot. Existing records were matched by website domain or email.",
    }
