from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from enum import Enum


class NotificationType(str, Enum):
    WORKSHEET_SUBMITTED = "worksheet_submitted"
    WORKSHEET_VERIFIED = "worksheet_verified"
    WORKSHEET_REJECTED = "worksheet_rejected"
    TASK_ASSIGNED = "task_assigned"
    TASK_UPDATED = "task_updated"
    OVERTIME_ALERT = "overtime_alert"
    BREAK_LIMIT_WARNING = "break_limit_warning"
    TEAM_MEMBER_ADDED = "team_member_added"
    FORM_ASSIGNED = "form_assigned"


class NotificationBase(BaseModel):
    type: NotificationType
    title: str
    message: str
    related_id: Optional[str] = None


class NotificationCreate(NotificationBase):
    recipient_id: str


class NotificationInDB(NotificationBase):
    id: str = Field(alias="_id")
    recipient_id: str
    is_read: bool = False
    created_at: datetime

    class Config:
        populate_by_name = True


class NotificationResponse(BaseModel):
    id: str
    recipient_id: str
    type: NotificationType
    title: str
    message: str
    related_id: Optional[str] = None
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True


class NotificationCount(BaseModel):
    total: int
    unread: int
