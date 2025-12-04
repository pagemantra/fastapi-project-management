from pydantic import BaseModel, Field
from typing import Optional, List, Any, Dict
from datetime import datetime, date
from enum import Enum


class WorksheetStatus(str, Enum):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    TL_VERIFIED = "tl_verified"
    MANAGER_APPROVED = "manager_approved"
    REJECTED = "rejected"


class FormFieldResponse(BaseModel):
    field_id: str
    field_label: str
    value: Any


class WorksheetBase(BaseModel):
    date: date
    notes: Optional[str] = None


class WorksheetCreate(WorksheetBase):
    form_id: str
    form_responses: List[FormFieldResponse] = []
    tasks_completed: List[str] = []  # Task IDs
    total_hours: Optional[float] = 0  # Calculated from login/logout time


class WorksheetUpdate(BaseModel):
    form_responses: Optional[List[FormFieldResponse]] = None
    tasks_completed: Optional[List[str]] = None
    notes: Optional[str] = None


class WorksheetSubmit(BaseModel):
    """Submit worksheet for verification"""
    pass


class WorksheetVerify(BaseModel):
    """Team Lead verification"""
    pass


class WorksheetApprove(BaseModel):
    """Manager approval"""
    pass


class WorksheetReject(BaseModel):
    rejection_reason: str = Field(..., min_length=5, max_length=500)


class BulkApprove(BaseModel):
    worksheet_ids: List[str]


class WorksheetInDB(WorksheetBase):
    id: str = Field(alias="_id")
    employee_id: str
    form_id: str
    form_responses: List[Dict] = []
    tasks_completed: List[str] = []
    total_hours: float = 0
    status: WorksheetStatus = WorksheetStatus.DRAFT
    submitted_at: Optional[datetime] = None
    # Two-level verification
    tl_verified_by: Optional[str] = None
    tl_verified_at: Optional[datetime] = None
    manager_approved_by: Optional[str] = None
    manager_approved_at: Optional[datetime] = None
    # Rejection
    rejection_reason: Optional[str] = None
    rejected_by: Optional[str] = None
    rejected_at: Optional[datetime] = None
    # Timestamps
    created_at: datetime
    updated_at: datetime

    class Config:
        populate_by_name = True


class WorksheetResponse(BaseModel):
    id: str
    employee_id: str
    date: date
    form_id: str
    form_responses: List[FormFieldResponse] = []
    tasks_completed: List[str] = []
    total_hours: float = 0
    notes: Optional[str] = None
    status: WorksheetStatus
    submitted_at: Optional[datetime] = None
    tl_verified_by: Optional[str] = None
    tl_verified_at: Optional[datetime] = None
    manager_approved_by: Optional[str] = None
    manager_approved_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    rejected_by: Optional[str] = None
    rejected_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    # Additional info for display
    employee_name: Optional[str] = None
    form_name: Optional[str] = None

    class Config:
        from_attributes = True


class WorksheetSummary(BaseModel):
    total_worksheets: int
    submitted: int
    tl_verified: int
    manager_approved: int
    rejected: int
    pending_verification: int
    pending_approval: int
