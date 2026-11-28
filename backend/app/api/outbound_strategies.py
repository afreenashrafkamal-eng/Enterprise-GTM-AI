from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.api.dependencies import require_organization_access
from app.db.dependencies import get_db
from app.models.organization import Organization
from app.models.outbound_strategy import OutboundStrategy
from app.models.target_account import TargetAccount
from app.models.target_contact import TargetContact
from app.schemas.outbound_strategy import (
    OutboundPriorityResponse,
    OutboundStrategyResponse,
    OutboundStrategyUpdate,
)


router = APIRouter(
    prefix="/organizations",
    tags=["Outbound Strategy"],
    dependencies=[Depends(require_organization_access)],
)


def get_strategy(db: Session, organization_id: str) -> OutboundStrategy | None:
    return db.scalar(
        select(OutboundStrategy).where(
            OutboundStrategy.organization_id == organization_id
        )
    )


@router.get(
    "/{organization_id}/outbound-strategy",
    response_model=OutboundStrategyResponse,
)
def read_outbound_strategy(
    organization_id: str,
    db: Session = Depends(get_db),
):
    strategy = get_strategy(db, organization_id)
    if strategy is None:
        raise HTTPException(status_code=404, detail="Outbound strategy not found")
    return strategy


@router.put(
    "/{organization_id}/outbound-strategy",
    response_model=OutboundStrategyResponse,
)
def save_outbound_strategy(
    organization_id: str,
    data: OutboundStrategyUpdate,
    db: Session = Depends(get_db),
):
    if db.get(Organization, organization_id) is None:
        raise HTTPException(status_code=404, detail="Organization not found")

    strategy = get_strategy(db, organization_id)
    if strategy is None:
        strategy = OutboundStrategy(organization_id=organization_id)
        db.add(strategy)

    updates = data.model_dump(exclude_unset=True)
    account_ids = updates.get("pilot_account_ids")
    if account_ids is not None:
        unique_account_ids = list(dict.fromkeys(account_ids))
        if unique_account_ids:
            valid_account_ids = set(
                db.scalars(
                    select(TargetAccount.id).where(
                        TargetAccount.organization_id == organization_id,
                        TargetAccount.id.in_(unique_account_ids),
                        TargetAccount.qualification_status == "qualified",
                    )
                ).all()
            )
        else:
            valid_account_ids = set()
        if valid_account_ids != set(unique_account_ids):
            raise HTTPException(
                status_code=422,
                detail="Pilot accounts must be qualified for ICP fit in this organization.",
            )
        updates["pilot_account_ids"] = unique_account_ids

    message_drafts = updates.get("pilot_message_drafts")
    if message_drafts is not None:
        selected_ids = set(
            updates.get(
                "pilot_account_ids",
                strategy.pilot_account_ids if strategy is not None else [],
            )
        )
        draft_account_ids = [draft["account_id"] for draft in message_drafts]
        if len(set(draft_account_ids)) != len(draft_account_ids):
            raise HTTPException(
                status_code=422,
                detail="Only one pilot email draft can be saved per account.",
            )
        if not set(draft_account_ids).issubset(selected_ids):
            raise HTTPException(
                status_code=422,
                detail="Each email draft must belong to a selected pilot account.",
            )

        if draft_account_ids:
            qualified_accounts = set(
                db.scalars(
                    select(TargetAccount.id).where(
                        TargetAccount.organization_id == organization_id,
                        TargetAccount.id.in_(draft_account_ids),
                        TargetAccount.qualification_status == "qualified",
                    )
                ).all()
            )
            if qualified_accounts != set(draft_account_ids):
                raise HTTPException(
                    status_code=422,
                    detail="Email drafts must belong to currently qualified pilot accounts.",
                )

        contact_ids = {
            draft["contact_id"]
            for draft in message_drafts
            if draft.get("contact_id")
        }
        if contact_ids:
            valid_contacts = {
                (contact.id, contact.target_account_id)
                for contact in db.scalars(
                    select(TargetContact)
                    .join(TargetAccount, TargetAccount.id == TargetContact.target_account_id)
                    .where(
                        TargetContact.id.in_(contact_ids),
                        TargetAccount.organization_id == organization_id,
                        TargetContact.qualification_status == "qualified",
                    )
                ).all()
            }
            if any(
                (draft.get("contact_id"), draft["account_id"]) not in valid_contacts
                for draft in message_drafts
                if draft.get("contact_id")
            ):
                raise HTTPException(
                    status_code=422,
                    detail="A selected contact must be qualified and belong to its pilot account.",
                )

    for field, value in updates.items():
        setattr(strategy, field, value)

    db.commit()
    db.refresh(strategy)
    return strategy


@router.get(
    "/{organization_id}/outbound-priorities",
    response_model=list[OutboundPriorityResponse],
)
def list_outbound_priorities(
    organization_id: str,
    db: Session = Depends(get_db),
):
    priority_order = case(
        (TargetAccount.qualification_status == "qualified", 0),
        (TargetAccount.qualification_status == "new", 1),
        else_=2,
    )
    statement = (
        select(
            TargetAccount.id,
            TargetAccount.company_name,
            TargetAccount.industry,
            TargetAccount.location,
            TargetAccount.outreach_reason,
            TargetAccount.evidence_url,
            TargetAccount.qualification_status,
            func.count(TargetContact.id).label("contact_count"),
            func.count(
                case((TargetContact.qualification_status == "qualified", 1))
            ).label("qualified_contact_count"),
            func.count(
                case((TargetContact.email_status == "verified", 1))
            ).label("verified_email_count"),
        )
        .outerjoin(
            TargetContact,
            TargetContact.target_account_id == TargetAccount.id,
        )
        .where(TargetAccount.organization_id == organization_id)
        .group_by(TargetAccount.id)
        .order_by(
            priority_order,
            TargetAccount.company_name.asc(),
        )
    )
    return db.execute(statement).mappings().all()
