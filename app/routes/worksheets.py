from fastapi import APIRouter, HTTPException, status, Depends, Query
from datetime import datetime, date
from typing import List, Optional
from bson import ObjectId
from bson.errors import InvalidId
from ..database import get_database
from ..models.worksheet import (
    WorksheetCreate, WorksheetUpdate, WorksheetResponse, WorksheetStatus,
    WorksheetSubmit, WorksheetVerify, WorksheetApprove, WorksheetReject,
    BulkApprove, FormFieldResponse, WorksheetSummary
)
from ..models.user import UserRole
from ..utils.dependencies import get_current_active_user, require_roles

router = APIRouter(prefix="/worksheets", tags=["Worksheets"])


async def worksheet_to_response(db, worksheet: dict) -> WorksheetResponse:
    # Get employee name
    employee_name = None
    if worksheet.get("employee_id") and ObjectId.is_valid(worksheet["employee_id"]):
        employee = await db.users.find_one({"_id": ObjectId(worksheet["employee_id"])})
        employee_name = employee["full_name"] if employee else None

    # Get form name
    form_name = None
    if worksheet.get("form_id") and ObjectId.is_valid(worksheet["form_id"]):
        form = await db.forms.find_one({"_id": ObjectId(worksheet["form_id"])})
        form_name = form["name"] if form else None

    # Convert form_responses to FormFieldResponse objects
    form_responses = []
    for resp in worksheet.get("form_responses", []):
        form_responses.append(FormFieldResponse(
            field_id=resp["field_id"],
            field_label=resp.get("field_label", ""),
            value=resp["value"]
        ))

    return WorksheetResponse(
        id=str(worksheet["_id"]),
        employee_id=worksheet["employee_id"],
        date=worksheet["date"] if isinstance(worksheet["date"], date) else date.fromisoformat(worksheet["date"]),
        form_id=worksheet["form_id"],
        form_responses=form_responses,
        tasks_completed=worksheet.get("tasks_completed", []),
        total_hours=worksheet.get("total_hours", 0),
        notes=worksheet.get("notes"),
        status=worksheet["status"],
        submitted_at=worksheet.get("submitted_at"),
        tl_verified_by=worksheet.get("tl_verified_by"),
        tl_verified_at=worksheet.get("tl_verified_at"),
        manager_approved_by=worksheet.get("manager_approved_by"),
        manager_approved_at=worksheet.get("manager_approved_at"),
        rejection_reason=worksheet.get("rejection_reason"),
        rejected_by=worksheet.get("rejected_by"),
        rejected_at=worksheet.get("rejected_at"),
        created_at=worksheet["created_at"],
        updated_at=worksheet["updated_at"],
        employee_name=employee_name,
        form_name=form_name,
    )


async def create_notification(db, recipient_id: str, notif_type: str, title: str, message: str, related_id: str):
    """Helper to create notifications"""
    await db.notifications.insert_one({
        "recipient_id": recipient_id,
        "type": notif_type,
        "title": title,
        "message": message,
        "related_id": related_id,
        "is_read": False,
        "created_at": datetime.utcnow(),
    })


# ============ CREATE & UPDATE ============

@router.post("/", response_model=WorksheetResponse)
async def create_worksheet(
    worksheet: WorksheetCreate,
    current_user: dict = Depends(get_current_active_user)
):
    """Create a new worksheet (draft)"""
    db = get_database()
    user_id = str(current_user["_id"])

    # Check if worksheet already exists for this date
    existing = await db.worksheets.find_one({
        "employee_id": user_id,
        "date": worksheet.date.isoformat(),
    })

    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Worksheet already exists for this date. Use PUT to update.",
        )

    # Verify form exists and is assigned to user's team
    form = await db.forms.find_one({"_id": ObjectId(worksheet.form_id)})
    if not form:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form not found",
        )

    # Use total_hours from request if provided, otherwise get from time_session
    total_hours = worksheet.total_hours or 0
    if not total_hours:
        time_session = await db.time_sessions.find_one({
            "employee_id": user_id,
            "date": worksheet.date.isoformat(),
        })
        total_hours = time_session.get("total_work_hours", 0) if time_session else 0

    now = datetime.utcnow()
    worksheet_dict = {
        "employee_id": user_id,
        "date": worksheet.date.isoformat(),
        "form_id": worksheet.form_id,
        "form_responses": [r.model_dump() for r in worksheet.form_responses],
        "tasks_completed": worksheet.tasks_completed,
        "total_hours": total_hours,
        "notes": worksheet.notes,
        "status": WorksheetStatus.DRAFT.value,
        "submitted_at": None,
        "tl_verified_by": None,
        "tl_verified_at": None,
        "manager_approved_by": None,
        "manager_approved_at": None,
        "rejection_reason": None,
        "rejected_by": None,
        "rejected_at": None,
        "created_at": now,
        "updated_at": now,
    }

    result = await db.worksheets.insert_one(worksheet_dict)
    worksheet_dict["_id"] = result.inserted_id

    return await worksheet_to_response(db, worksheet_dict)


@router.put("/{worksheet_id}", response_model=WorksheetResponse)
async def update_worksheet(
    worksheet_id: str,
    worksheet_update: WorksheetUpdate,
    current_user: dict = Depends(get_current_active_user)
):
    """Update a worksheet (only if in DRAFT or REJECTED status)"""
    db = get_database()
    user_id = str(current_user["_id"])

    worksheet = await db.worksheets.find_one({"_id": ObjectId(worksheet_id)})
    if not worksheet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Worksheet not found",
        )

    # Only owner can update
    if worksheet["employee_id"] != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Can only update your own worksheet",
        )

    # Can only update if DRAFT or REJECTED
    if worksheet["status"] not in [WorksheetStatus.DRAFT.value, WorksheetStatus.REJECTED.value]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only update worksheets in DRAFT or REJECTED status",
        )

    update_data = {}
    if worksheet_update.form_responses is not None:
        update_data["form_responses"] = [r.model_dump() for r in worksheet_update.form_responses]
    if worksheet_update.tasks_completed is not None:
        update_data["tasks_completed"] = worksheet_update.tasks_completed
    if worksheet_update.notes is not None:
        update_data["notes"] = worksheet_update.notes
    if worksheet_update.total_hours is not None:
        update_data["total_hours"] = worksheet_update.total_hours

    # Reset rejection fields if updating after rejection
    if worksheet["status"] == WorksheetStatus.REJECTED.value:
        update_data["status"] = WorksheetStatus.DRAFT.value
        update_data["rejection_reason"] = None
        update_data["rejected_by"] = None
        update_data["rejected_at"] = None

    update_data["updated_at"] = datetime.utcnow()

    await db.worksheets.update_one(
        {"_id": ObjectId(worksheet_id)},
        {"$set": update_data}
    )

    updated = await db.worksheets.find_one({"_id": ObjectId(worksheet_id)})
    return await worksheet_to_response(db, updated)


# ============ SUBMIT ============

@router.post("/{worksheet_id}/submit", response_model=WorksheetResponse)
async def submit_worksheet(
    worksheet_id: str,
    current_user: dict = Depends(get_current_active_user)
):
    """Submit worksheet for Team Lead verification"""
    db = get_database()
    user_id = str(current_user["_id"])

    worksheet = await db.worksheets.find_one({"_id": ObjectId(worksheet_id)})
    if not worksheet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Worksheet not found",
        )

    if worksheet["employee_id"] != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Can only submit your own worksheet",
        )

    if worksheet["status"] not in [WorksheetStatus.DRAFT.value, WorksheetStatus.REJECTED.value]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Worksheet already submitted",
        )

    now = datetime.utcnow()
    await db.worksheets.update_one(
        {"_id": ObjectId(worksheet_id)},
        {
            "$set": {
                "status": WorksheetStatus.SUBMITTED.value,
                "submitted_at": now,
                "updated_at": now,
                "rejection_reason": None,
                "rejected_by": None,
                "rejected_at": None,
            }
        }
    )

    # Mark worksheet as submitted in time session
    await db.time_sessions.update_one(
        {"employee_id": user_id, "date": worksheet["date"]},
        {"$set": {"worksheet_submitted": True}}
    )

    # Notify Team Lead
    employee = await db.users.find_one({"_id": ObjectId(user_id)})
    if employee and employee.get("team_lead_id"):
        await create_notification(
            db,
            employee["team_lead_id"],
            "WORKSHEET_SUBMITTED",
            "New Worksheet Submitted",
            f"{employee['full_name']} has submitted their worksheet for {worksheet['date']}",
            worksheet_id
        )

    updated = await db.worksheets.find_one({"_id": ObjectId(worksheet_id)})
    return await worksheet_to_response(db, updated)


# ============ TEAM LEAD VERIFICATION ============

@router.post("/{worksheet_id}/verify", response_model=WorksheetResponse)
async def verify_worksheet(
    worksheet_id: str,
    current_user: dict = Depends(require_roles([UserRole.ADMIN, UserRole.TEAM_LEAD]))
):
    """Team Lead verifies a worksheet (individual verification)"""
    db = get_database()
    user_id = str(current_user["_id"])

    worksheet = await db.worksheets.find_one({"_id": ObjectId(worksheet_id)})
    if not worksheet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Worksheet not found",
        )

    if worksheet["status"] != WorksheetStatus.SUBMITTED.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Worksheet must be in SUBMITTED status to verify",
        )

    # Verify that employee is in TL's team (unless admin)
    if current_user["role"] == UserRole.TEAM_LEAD.value:
        employee = await db.users.find_one({"_id": ObjectId(worksheet["employee_id"])})
        if not employee or employee.get("team_lead_id") != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Can only verify worksheets from your team members",
            )

    now = datetime.utcnow()
    await db.worksheets.update_one(
        {"_id": ObjectId(worksheet_id)},
        {
            "$set": {
                "status": WorksheetStatus.TL_VERIFIED.value,
                "tl_verified_by": user_id,
                "tl_verified_at": now,
                "updated_at": now,
            }
        }
    )

    # Notify Employee
    await create_notification(
        db,
        worksheet["employee_id"],
        "WORKSHEET_VERIFIED",
        "Worksheet Verified",
        f"Your worksheet for {worksheet['date']} has been verified by Team Lead",
        worksheet_id
    )

    # Notify Manager
    employee = await db.users.find_one({"_id": ObjectId(worksheet["employee_id"])})
    if employee and employee.get("manager_id"):
        await create_notification(
            db,
            employee["manager_id"],
            "WORKSHEET_VERIFIED",
            "Worksheet Pending Approval",
            f"{employee['full_name']}'s worksheet for {worksheet['date']} is verified and pending your approval",
            worksheet_id
        )

    updated = await db.worksheets.find_one({"_id": ObjectId(worksheet_id)})
    return await worksheet_to_response(db, updated)


# ============ MANAGER APPROVAL ============

@router.post("/{worksheet_id}/approve", response_model=WorksheetResponse)
async def approve_worksheet(
    worksheet_id: str,
    current_user: dict = Depends(require_roles([UserRole.ADMIN, UserRole.MANAGER]))
):
    """Manager approves a TL-verified worksheet"""
    db = get_database()
    user_id = str(current_user["_id"])

    worksheet = await db.worksheets.find_one({"_id": ObjectId(worksheet_id)})
    if not worksheet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Worksheet not found",
        )

    if worksheet["status"] != WorksheetStatus.TL_VERIFIED.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Worksheet must be TL_VERIFIED to approve",
        )

    # Verify employee is under this manager (unless admin)
    if current_user["role"] == UserRole.MANAGER.value:
        employee = await db.users.find_one({"_id": ObjectId(worksheet["employee_id"])})
        if not employee or employee.get("manager_id") != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Can only approve worksheets from employees under your management",
            )

    now = datetime.utcnow()
    await db.worksheets.update_one(
        {"_id": ObjectId(worksheet_id)},
        {
            "$set": {
                "status": WorksheetStatus.MANAGER_APPROVED.value,
                "manager_approved_by": user_id,
                "manager_approved_at": now,
                "updated_at": now,
            }
        }
    )

    # Notify Employee
    await create_notification(
        db,
        worksheet["employee_id"],
        "WORKSHEET_VERIFIED",
        "Worksheet Approved",
        f"Your worksheet for {worksheet['date']} has been approved by Manager",
        worksheet_id
    )

    updated = await db.worksheets.find_one({"_id": ObjectId(worksheet_id)})
    return await worksheet_to_response(db, updated)


@router.post("/bulk-approve", response_model=List[WorksheetResponse])
async def bulk_approve_worksheets(
    bulk: BulkApprove,
    current_user: dict = Depends(require_roles([UserRole.ADMIN, UserRole.MANAGER]))
):
    """Manager bulk approves multiple TL-verified worksheets"""
    db = get_database()
    user_id = str(current_user["_id"])
    now = datetime.utcnow()

    approved_worksheets = []

    for worksheet_id in bulk.worksheet_ids:
        worksheet = await db.worksheets.find_one({"_id": ObjectId(worksheet_id)})
        if not worksheet:
            continue

        if worksheet["status"] != WorksheetStatus.TL_VERIFIED.value:
            continue

        # Check manager permission
        if current_user["role"] == UserRole.MANAGER.value:
            employee = await db.users.find_one({"_id": ObjectId(worksheet["employee_id"])})
            if not employee or employee.get("manager_id") != user_id:
                continue

        await db.worksheets.update_one(
            {"_id": ObjectId(worksheet_id)},
            {
                "$set": {
                    "status": WorksheetStatus.MANAGER_APPROVED.value,
                    "manager_approved_by": user_id,
                    "manager_approved_at": now,
                    "updated_at": now,
                }
            }
        )

        # Notify Employee
        await create_notification(
            db,
            worksheet["employee_id"],
            "WORKSHEET_VERIFIED",
            "Worksheet Approved",
            f"Your worksheet for {worksheet['date']} has been approved",
            worksheet_id
        )

        updated = await db.worksheets.find_one({"_id": ObjectId(worksheet_id)})
        approved_worksheets.append(await worksheet_to_response(db, updated))

    return approved_worksheets


# ============ REJECTION ============

@router.post("/{worksheet_id}/reject", response_model=WorksheetResponse)
async def reject_worksheet(
    worksheet_id: str,
    rejection: WorksheetReject,
    current_user: dict = Depends(require_roles([UserRole.ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD]))
):
    """Reject a worksheet at any verification stage"""
    db = get_database()
    user_id = str(current_user["_id"])

    worksheet = await db.worksheets.find_one({"_id": ObjectId(worksheet_id)})
    if not worksheet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Worksheet not found",
        )

    # Can only reject SUBMITTED or TL_VERIFIED
    if worksheet["status"] not in [WorksheetStatus.SUBMITTED.value, WorksheetStatus.TL_VERIFIED.value]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only reject worksheets in SUBMITTED or TL_VERIFIED status",
        )

    now = datetime.utcnow()
    await db.worksheets.update_one(
        {"_id": ObjectId(worksheet_id)},
        {
            "$set": {
                "status": WorksheetStatus.REJECTED.value,
                "rejection_reason": rejection.rejection_reason,
                "rejected_by": user_id,
                "rejected_at": now,
                "updated_at": now,
            }
        }
    )

    # Reset worksheet_submitted in time session
    await db.time_sessions.update_one(
        {"employee_id": worksheet["employee_id"], "date": worksheet["date"]},
        {"$set": {"worksheet_submitted": False}}
    )

    # Notify Employee
    rejector = await db.users.find_one({"_id": ObjectId(user_id)})
    await create_notification(
        db,
        worksheet["employee_id"],
        "WORKSHEET_REJECTED",
        "Worksheet Rejected",
        f"Your worksheet for {worksheet['date']} was rejected by {rejector['full_name']}. Reason: {rejection.rejection_reason}",
        worksheet_id
    )

    updated = await db.worksheets.find_one({"_id": ObjectId(worksheet_id)})
    return await worksheet_to_response(db, updated)


# ============ GET WORKSHEETS ============

@router.get("/", response_model=List[WorksheetResponse])
async def get_worksheets(
    status_filter: Optional[WorksheetStatus] = Query(None, alias="status"),
    employee_id: Optional[str] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(get_current_active_user)
):
    """Get worksheets based on role"""
    db = get_database()
    user_role = current_user["role"]
    user_id = str(current_user["_id"])
    query = {}

    # Role-based filtering
    if user_role == UserRole.ASSOCIATE.value:
        query["employee_id"] = user_id
    elif user_role == UserRole.TEAM_LEAD.value:
        # Get team members
        team_members = await db.users.find({"team_lead_id": user_id}).to_list(length=1000)
        member_ids = [str(m["_id"]) for m in team_members]
        if employee_id and employee_id in member_ids:
            query["employee_id"] = employee_id
        else:
            query["employee_id"] = {"$in": member_ids}
    elif user_role == UserRole.MANAGER.value:
        employees = await db.users.find({"manager_id": user_id}).to_list(length=1000)
        employee_ids = [str(e["_id"]) for e in employees]
        if employee_id and employee_id in employee_ids:
            query["employee_id"] = employee_id
        else:
            query["employee_id"] = {"$in": employee_ids}
    else:  # Admin
        if employee_id:
            query["employee_id"] = employee_id

    if status_filter:
        query["status"] = status_filter.value
    if start_date:
        query["date"] = {"$gte": start_date.isoformat()}
    if end_date:
        if "date" in query:
            query["date"]["$lte"] = end_date.isoformat()
        else:
            query["date"] = {"$lte": end_date.isoformat()}

    cursor = db.worksheets.find(query).sort("date", -1).skip(skip).limit(limit)
    worksheets = await cursor.to_list(length=limit)

    return [await worksheet_to_response(db, w) for w in worksheets]


@router.get("/pending-verification", response_model=List[WorksheetResponse])
async def get_pending_verification(
    current_user: dict = Depends(require_roles([UserRole.ADMIN, UserRole.TEAM_LEAD]))
):
    """Get worksheets pending Team Lead verification"""
    db = get_database()
    user_id = str(current_user["_id"])
    query = {"status": WorksheetStatus.SUBMITTED.value}

    if current_user["role"] == UserRole.TEAM_LEAD.value:
        team_members = await db.users.find({"team_lead_id": user_id}).to_list(length=1000)
        member_ids = [str(m["_id"]) for m in team_members]
        query["employee_id"] = {"$in": member_ids}

    cursor = db.worksheets.find(query).sort("date", -1)
    worksheets = await cursor.to_list(length=100)

    return [await worksheet_to_response(db, w) for w in worksheets]


@router.get("/pending-approval", response_model=List[WorksheetResponse])
async def get_pending_approval(
    current_user: dict = Depends(require_roles([UserRole.ADMIN, UserRole.MANAGER]))
):
    """Get TL-verified worksheets pending Manager approval"""
    db = get_database()
    user_id = str(current_user["_id"])
    query = {"status": WorksheetStatus.TL_VERIFIED.value}

    if current_user["role"] == UserRole.MANAGER.value:
        employees = await db.users.find({"manager_id": user_id}).to_list(length=1000)
        employee_ids = [str(e["_id"]) for e in employees]
        query["employee_id"] = {"$in": employee_ids}

    cursor = db.worksheets.find(query).sort("date", -1)
    worksheets = await cursor.to_list(length=100)

    return [await worksheet_to_response(db, w) for w in worksheets]


@router.get("/my-worksheets", response_model=List[WorksheetResponse])
async def get_my_worksheets(
    status_filter: Optional[WorksheetStatus] = Query(None, alias="status"),
    current_user: dict = Depends(get_current_active_user)
):
    """Get current user's worksheets"""
    db = get_database()
    user_id = str(current_user["_id"])
    query = {"employee_id": user_id}

    if status_filter:
        query["status"] = status_filter.value

    cursor = db.worksheets.find(query).sort("date", -1)
    worksheets = await cursor.to_list(length=100)

    return [await worksheet_to_response(db, w) for w in worksheets]


@router.get("/summary", response_model=WorksheetSummary)
async def get_worksheet_summary(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    current_user: dict = Depends(require_roles([UserRole.ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD]))
):
    """Get worksheet summary statistics"""
    db = get_database()
    user_role = current_user["role"]
    user_id = str(current_user["_id"])
    match_stage = {}

    if user_role == UserRole.TEAM_LEAD.value:
        team_members = await db.users.find({"team_lead_id": user_id}).to_list(length=1000)
        member_ids = [str(m["_id"]) for m in team_members]
        match_stage["employee_id"] = {"$in": member_ids}
    elif user_role == UserRole.MANAGER.value:
        employees = await db.users.find({"manager_id": user_id}).to_list(length=1000)
        employee_ids = [str(e["_id"]) for e in employees]
        match_stage["employee_id"] = {"$in": employee_ids}

    if start_date:
        match_stage["date"] = {"$gte": start_date.isoformat()}
    if end_date:
        if "date" in match_stage:
            match_stage["date"]["$lte"] = end_date.isoformat()
        else:
            match_stage["date"] = {"$lte": end_date.isoformat()}

    pipeline = [
        {"$match": match_stage} if match_stage else {"$match": {}},
        {
            "$group": {
                "_id": "$status",
                "count": {"$sum": 1}
            }
        }
    ]

    results = await db.worksheets.aggregate(pipeline).to_list(length=10)

    summary = {
        "total_worksheets": 0,
        "submitted": 0,
        "tl_verified": 0,
        "manager_approved": 0,
        "rejected": 0,
        "pending_verification": 0,
        "pending_approval": 0,
    }

    for r in results:
        count = r["count"]
        summary["total_worksheets"] += count

        if r["_id"] == WorksheetStatus.SUBMITTED.value:
            summary["submitted"] = count
            summary["pending_verification"] = count
        elif r["_id"] == WorksheetStatus.TL_VERIFIED.value:
            summary["tl_verified"] = count
            summary["pending_approval"] = count
        elif r["_id"] == WorksheetStatus.MANAGER_APPROVED.value:
            summary["manager_approved"] = count
        elif r["_id"] == WorksheetStatus.REJECTED.value:
            summary["rejected"] = count

    return WorksheetSummary(**summary)


@router.get("/{worksheet_id}", response_model=WorksheetResponse)
async def get_worksheet(
    worksheet_id: str,
    current_user: dict = Depends(get_current_active_user)
):
    """Get a specific worksheet"""
    db = get_database()

    worksheet = await db.worksheets.find_one({"_id": ObjectId(worksheet_id)})
    if not worksheet:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Worksheet not found",
        )

    # Check access
    user_role = current_user["role"]
    user_id = str(current_user["_id"])

    if user_role == UserRole.ASSOCIATE.value:
        if worksheet["employee_id"] != user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    elif user_role == UserRole.TEAM_LEAD.value:
        employee = await db.users.find_one({"_id": ObjectId(worksheet["employee_id"])})
        if not employee or employee.get("team_lead_id") != user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    elif user_role == UserRole.MANAGER.value:
        employee = await db.users.find_one({"_id": ObjectId(worksheet["employee_id"])})
        if not employee or employee.get("manager_id") != user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return await worksheet_to_response(db, worksheet)
