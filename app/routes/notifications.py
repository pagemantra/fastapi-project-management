from fastapi import APIRouter, HTTPException, status, Depends, Query
from datetime import datetime
from typing import List, Optional
from bson import ObjectId
from bson.errors import InvalidId
from ..database import get_database
from ..models.notification import (
    NotificationResponse, NotificationCount, NotificationType
)
from ..utils.dependencies import get_current_active_user

router = APIRouter(prefix="/notifications", tags=["Notifications"])


def notification_to_response(notification: dict) -> NotificationResponse:
    # Convert type to lowercase to match enum values
    notification_type = notification["type"].lower() if notification.get("type") else "task_assigned"
    return NotificationResponse(
        id=str(notification["_id"]),
        recipient_id=notification["recipient_id"],
        type=notification_type,
        title=notification["title"],
        message=notification["message"],
        related_id=notification.get("related_id"),
        is_read=notification.get("is_read", False),
        created_at=notification["created_at"],
    )


@router.get("/", response_model=List[NotificationResponse])
async def get_notifications(
    is_read: Optional[bool] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(get_current_active_user)
):
    """Get notifications for current user"""
    db = get_database()
    user_id = str(current_user["_id"])

    query = {"recipient_id": user_id}
    if is_read is not None:
        query["is_read"] = is_read

    cursor = db.notifications.find(query).sort("created_at", -1).skip(skip).limit(limit)
    notifications = await cursor.to_list(length=limit)

    return [notification_to_response(n) for n in notifications]


@router.get("/count", response_model=NotificationCount)
async def get_notification_count(
    current_user: dict = Depends(get_current_active_user)
):
    """Get notification counts for current user"""
    db = get_database()
    user_id = str(current_user["_id"])

    total = await db.notifications.count_documents({"recipient_id": user_id})
    unread = await db.notifications.count_documents({"recipient_id": user_id, "is_read": False})

    return NotificationCount(total=total, unread=unread)


@router.get("/unread", response_model=List[NotificationResponse])
async def get_unread_notifications(
    limit: int = Query(20, ge=1, le=50),
    current_user: dict = Depends(get_current_active_user)
):
    """Get unread notifications for current user"""
    db = get_database()
    user_id = str(current_user["_id"])

    cursor = db.notifications.find({
        "recipient_id": user_id,
        "is_read": False
    }).sort("created_at", -1).limit(limit)

    notifications = await cursor.to_list(length=limit)
    return [notification_to_response(n) for n in notifications]


@router.put("/{notification_id}/read", response_model=NotificationResponse)
async def mark_as_read(
    notification_id: str,
    current_user: dict = Depends(get_current_active_user)
):
    """Mark a notification as read"""
    db = get_database()
    user_id = str(current_user["_id"])

    if not ObjectId.is_valid(notification_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid notification ID",
        )

    notification = await db.notifications.find_one({
        "_id": ObjectId(notification_id),
        "recipient_id": user_id
    })

    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found",
        )

    await db.notifications.update_one(
        {"_id": ObjectId(notification_id)},
        {"$set": {"is_read": True}}
    )

    notification["is_read"] = True
    return notification_to_response(notification)


@router.put("/read-all")
async def mark_all_as_read(
    current_user: dict = Depends(get_current_active_user)
):
    """Mark all notifications as read"""
    db = get_database()
    user_id = str(current_user["_id"])

    result = await db.notifications.update_many(
        {"recipient_id": user_id, "is_read": False},
        {"$set": {"is_read": True}}
    )

    return {"message": f"Marked {result.modified_count} notifications as read"}


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: str,
    current_user: dict = Depends(get_current_active_user)
):
    """Delete a notification"""
    db = get_database()
    user_id = str(current_user["_id"])

    if not ObjectId.is_valid(notification_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid notification ID",
        )

    result = await db.notifications.delete_one({
        "_id": ObjectId(notification_id),
        "recipient_id": user_id
    })

    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found",
        )

    return {"message": "Notification deleted"}


@router.delete("/")
async def delete_all_notifications(
    current_user: dict = Depends(get_current_active_user)
):
    """Delete all notifications for current user"""
    db = get_database()
    user_id = str(current_user["_id"])

    result = await db.notifications.delete_many({"recipient_id": user_id})

    return {"message": f"Deleted {result.deleted_count} notifications"}
