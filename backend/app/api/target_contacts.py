from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.organization import Organization
from app.models.target_account import TargetAccount
from app.models.target_contact import TargetContact
from app.schemas.target_contact import (
    TargetContactCreate,
    TargetContactResponse,
    TargetContactUpdate,
)


router = APIRouter(tags=["Target Contacts"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_target_account(
    db: Session,
    organization_id: str,
    account_id: str,
) -> TargetAccount:
    if db.get(Organization, organization_id) is None:
        raise HTTPException(status_code=404, detail="Client not found")

    account = db.scalar(
        select(TargetAccount).where(
            TargetAccount.organization_id == organization_id,
            TargetAccount.id == account_id,
        )
    )
    if account is None:
        raise HTTPException(status_code=404, detail="Target company not found")

    return account


def get_target_contact(
    db: Session,
    account_id: str,
    contact_id: str,
) -> TargetContact:
    contact = db.scalar(
        select(TargetContact).where(
            TargetContact.target_account_id == account_id,
            TargetContact.id == contact_id,
        )
    )
    if contact is None:
        raise HTTPException(status_code=404, detail="Decision-maker contact not found")

    return contact


@router.get(
    "/organizations/{organization_id}/target-accounts/{account_id}/contacts",
    response_model=list[TargetContactResponse],
)
def list_target_contacts(
    organization_id: str,
    account_id: str,
    db: Session = Depends(get_db),
):
    get_target_account(db, organization_id, account_id)

    return db.scalars(
        select(TargetContact)
        .where(TargetContact.target_account_id == account_id)
        .order_by(TargetContact.created_at.desc())
    ).all()


@router.post(
    "/organizations/{organization_id}/target-accounts/{account_id}/contacts",
    response_model=TargetContactResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_target_contact(
    organization_id: str,
    account_id: str,
    data: TargetContactCreate,
    db: Session = Depends(get_db),
):
    get_target_account(db, organization_id, account_id)

    first_name = data.first_name.strip()
    if not first_name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="First name cannot be blank.",
        )

    contact = TargetContact(
        target_account_id=account_id,
        first_name=first_name,
        last_name=data.last_name.strip() or None if data.last_name else None,
        job_title=data.job_title.strip() or None if data.job_title else None,
        email=data.email.strip() or None if data.email else None,
        phone=data.phone.strip() or None if data.phone else None,
        linkedin_url=data.linkedin_url.strip() or None if data.linkedin_url else None,
        source_url=data.source_url.strip() or None if data.source_url else None,
    )

    db.add(contact)
    db.commit()
    db.refresh(contact)
    return contact


@router.put(
    "/organizations/{organization_id}/target-accounts/{account_id}/contacts/{contact_id}",
    response_model=TargetContactResponse,
)
def update_target_contact(
    organization_id: str,
    account_id: str,
    contact_id: str,
    data: TargetContactUpdate,
    db: Session = Depends(get_db),
):
    get_target_account(db, organization_id, account_id)
    contact = get_target_contact(db, account_id, contact_id)

    updates = data.model_dump(exclude_unset=True)

    if "first_name" in updates:
        first_name = updates["first_name"]
        if first_name is None or not first_name.strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="First name cannot be blank.",
            )
        updates["first_name"] = first_name.strip()

    optional_text_fields = (
        "last_name",
        "job_title",
        "email",
        "phone",
        "linkedin_url",
        "source_url",
    )
    for field in optional_text_fields:
        if field in updates and updates[field] is not None:
            updates[field] = updates[field].strip() or None

    if (
        "email" in updates
        and updates["email"] != contact.email
        and "email_status" not in updates
    ):
        updates["email_status"] = "not_checked"

    if (
        "email_status" in updates
        and updates["email_status"] is None
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Email status cannot be blank.",
        )

    resulting_email = updates.get("email", contact.email)
    resulting_email_status = updates.get("email_status", contact.email_status)
    if resulting_email_status == "verified" and not resulting_email:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Add an email address before marking it verified.",
        )

    if (
        "qualification_status" in updates
        and updates["qualification_status"] is None
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Qualification status cannot be blank.",
        )

    for field, value in updates.items():
        setattr(contact, field, value)

    db.commit()
    db.refresh(contact)
    return contact