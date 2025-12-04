from fastapi import APIRouter, HTTPException, status, Depends, Query
from datetime import datetime, date
from typing import List, Optional
from bson import ObjectId
from bson.errors import InvalidId
from ..database import get_database
from ..models.task import TaskCreate, TaskUpdate, TaskResponse, TaskStatus, TaskPriority, WorkLog
from ..models.user import UserRole
from ..utils.dependencies import get_current_active_user, require_roles

router = APIRouter(prefix="/tasks", tags=["Tasks"])


def task_to_response(task: dict) -> TaskResponse:
    return TaskResponse(
        id=str(task["_id"]),
        title=task["title"],
        description=task.get("description"),
        priority=task["priority"],
        status=task["status"],
        due_date=task.get("due_date"),
        estimated_hours=task.get("estimated_hours"),
        actual_hours=task.get("actual_hours", 0),
        assigned_to=task["assigned_to"],
        assigned_by=task["assigned_by"],
        team_id=task.get("team_id"),
        work_logs=task.get("work_logs", []),
        created_at=task["created_at"],
        updated_at=task["updated_at"],
        completed_at=task.get("completed_at"),
    )


@router.post("/", response_model=TaskResponse)
async def create_task(
    task: TaskCreate,
    current_user: dict = Depends(require_roles([UserRole.ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD]))
):
    """
    Create a new task and assign to an employee.
    - Admin can assign to any employee
    - Manager can assign to employees under their management
    - Team Lead can assign to employees in their team
    """
    db = get_database()
    user_role = current_user["role"]
    user_id = str(current_user["_id"])

    # Validate assigned_to user exists and is an employee
    if not ObjectId.is_valid(task.assigned_to):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid employee ID format",
        )

    employee = await db.users.find_one({
        "_id": ObjectId(task.assigned_to),
        "role": UserRole.ASSOCIATE.value
    })
    if not employee:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid employee ID or user is not an employee",
        )

    # Check assignment permissions
    if user_role == UserRole.MANAGER.value:
        if employee.get("manager_id") != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Can only assign tasks to employees under your management",
            )
    elif user_role == UserRole.TEAM_LEAD.value:
        if employee.get("team_lead_id") != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Can only assign tasks to employees in your team",
            )

    now = datetime.utcnow()
    task_dict = {
        "title": task.title,
        "description": task.description,
        "priority": task.priority.value,
        "status": task.status.value,
        "due_date": task.due_date,
        "estimated_hours": task.estimated_hours,
        "actual_hours": 0,
        "assigned_to": task.assigned_to,
        "assigned_by": user_id,
        "team_id": task.team_id,
        "work_logs": [],
        "created_at": now,
        "updated_at": now,
        "completed_at": None,
    }

    result = await db.tasks.insert_one(task_dict)
    task_dict["_id"] = result.inserted_id

    return task_to_response(task_dict)


@router.get("/", response_model=List[TaskResponse])
async def get_tasks(
    status_filter: Optional[TaskStatus] = Query(None, alias="status"),
    priority: Optional[TaskPriority] = Query(None),
    assigned_to: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(get_current_active_user)
):
    """
    Get tasks based on role permissions.
    - Admin: sees all tasks
    - Manager: sees tasks for employees under their management
    - Team Lead: sees tasks for employees in their team
    - Employee: sees only their own tasks
    """
    db = get_database()
    query = {}
    user_role = current_user["role"]
    user_id = str(current_user["_id"])

    if user_role == UserRole.ADMIN.value:
        if assigned_to:
            query["assigned_to"] = assigned_to
    elif user_role == UserRole.MANAGER.value:
        # Get all employees under this manager
        employees = await db.users.find(
            {"manager_id": user_id, "role": UserRole.ASSOCIATE.value}
        ).to_list(length=1000)
        employee_ids = [str(e["_id"]) for e in employees]
        query["assigned_to"] = {"$in": employee_ids}
    elif user_role == UserRole.TEAM_LEAD.value:
        # Get all employees in their team
        employees = await db.users.find(
            {"team_lead_id": user_id, "role": UserRole.ASSOCIATE.value}
        ).to_list(length=1000)
        employee_ids = [str(e["_id"]) for e in employees]
        query["assigned_to"] = {"$in": employee_ids}
    else:  # Employee
        query["assigned_to"] = user_id

    if status_filter:
        query["status"] = status_filter.value
    if priority:
        query["priority"] = priority.value

    cursor = db.tasks.find(query).sort("created_at", -1).skip(skip).limit(limit)
    tasks = await cursor.to_list(length=limit)

    return [task_to_response(task) for task in tasks]


@router.get("/my-tasks", response_model=List[TaskResponse])
async def get_my_tasks(
    status_filter: Optional[TaskStatus] = Query(None, alias="status"),
    current_user: dict = Depends(get_current_active_user)
):
    """Get tasks assigned to the current user"""
    db = get_database()
    query = {"assigned_to": str(current_user["_id"])}

    if status_filter:
        query["status"] = status_filter.value

    cursor = db.tasks.find(query).sort("created_at", -1)
    tasks = await cursor.to_list(length=100)

    return [task_to_response(task) for task in tasks]


@router.get("/assigned-by-me", response_model=List[TaskResponse])
async def get_tasks_assigned_by_me(
    status_filter: Optional[TaskStatus] = Query(None, alias="status"),
    current_user: dict = Depends(require_roles([UserRole.ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD]))
):
    """Get tasks assigned by the current user"""
    db = get_database()
    query = {"assigned_by": str(current_user["_id"])}

    if status_filter:
        query["status"] = status_filter.value

    cursor = db.tasks.find(query).sort("created_at", -1)
    tasks = await cursor.to_list(length=100)

    return [task_to_response(task) for task in tasks]


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: str,
    current_user: dict = Depends(get_current_active_user)
):
    """Get a specific task by ID"""
    db = get_database()

    if not ObjectId.is_valid(task_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid task ID format",
        )

    task = await db.tasks.find_one({"_id": ObjectId(task_id)})
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    # Check access permissions
    user_role = current_user["role"]
    user_id = str(current_user["_id"])

    if user_role == UserRole.ASSOCIATE.value:
        if task["assigned_to"] != user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    elif user_role == UserRole.TEAM_LEAD.value:
        employee = await db.users.find_one({"_id": ObjectId(task["assigned_to"])})
        if employee and employee.get("team_lead_id") != user_id and task["assigned_by"] != user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    elif user_role == UserRole.MANAGER.value:
        employee = await db.users.find_one({"_id": ObjectId(task["assigned_to"])})
        if employee and employee.get("manager_id") != user_id and task["assigned_by"] != user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    return task_to_response(task)


@router.put("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: str,
    task_update: TaskUpdate,
    current_user: dict = Depends(get_current_active_user)
):
    """
    Update a task.
    - Admins, Managers, Team Leads can update all fields
    - Employees can only update status and add work logs
    """
    db = get_database()

    if not ObjectId.is_valid(task_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid task ID format",
        )

    task = await db.tasks.find_one({"_id": ObjectId(task_id)})
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    user_role = current_user["role"]
    user_id = str(current_user["_id"])

    # Permission checks
    if user_role == UserRole.ASSOCIATE.value:
        if task["assigned_to"] != user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        # Employees can only update status
        allowed_fields = {"status"}
        update_dict = task_update.model_dump(exclude_unset=True)
        for key in list(update_dict.keys()):
            if key not in allowed_fields:
                del update_dict[key]
    else:
        update_dict = {k: v for k, v in task_update.model_dump().items() if v is not None}

    # Handle status completion
    if update_dict.get("status") == TaskStatus.COMPLETED.value or update_dict.get("status") == TaskStatus.COMPLETED:
        update_dict["completed_at"] = datetime.utcnow()
        update_dict["status"] = TaskStatus.COMPLETED.value

    if "status" in update_dict and hasattr(update_dict["status"], "value"):
        update_dict["status"] = update_dict["status"].value
    if "priority" in update_dict and hasattr(update_dict["priority"], "value"):
        update_dict["priority"] = update_dict["priority"].value

    update_dict["updated_at"] = datetime.utcnow()

    await db.tasks.update_one(
        {"_id": ObjectId(task_id)},
        {"$set": update_dict}
    )

    updated_task = await db.tasks.find_one({"_id": ObjectId(task_id)})
    return task_to_response(updated_task)


@router.post("/{task_id}/work-log", response_model=TaskResponse)
async def add_work_log(
    task_id: str,
    work_log: WorkLog,
    current_user: dict = Depends(get_current_active_user)
):
    """Add a work log entry to a task (for tracking hours worked)"""
    db = get_database()

    if not ObjectId.is_valid(task_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid task ID format",
        )

    task = await db.tasks.find_one({"_id": ObjectId(task_id)})
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    user_id = str(current_user["_id"])

    # Only assigned employee or admins can log work
    if current_user["role"] != UserRole.ADMIN.value and task["assigned_to"] != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only assigned employee can log work hours",
        )

    log_entry = {
        "logged_by": user_id,
        "hours_worked": work_log.hours_worked,
        "work_date": work_log.work_date.isoformat(),
        "notes": work_log.notes,
        "logged_at": datetime.utcnow().isoformat(),
    }

    # Update task with new work log and increment actual_hours
    await db.tasks.update_one(
        {"_id": ObjectId(task_id)},
        {
            "$push": {"work_logs": log_entry},
            "$inc": {"actual_hours": work_log.hours_worked},
            "$set": {"updated_at": datetime.utcnow()}
        }
    )

    updated_task = await db.tasks.find_one({"_id": ObjectId(task_id)})
    return task_to_response(updated_task)


@router.get("/reports/summary", response_model=dict)
async def get_task_summary(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    current_user: dict = Depends(require_roles([UserRole.ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD]))
):
    """Get task summary report"""
    db = get_database()
    user_role = current_user["role"]
    user_id = str(current_user["_id"])

    match_stage = {}

    if user_role == UserRole.MANAGER.value:
        employees = await db.users.find({"manager_id": user_id}).to_list(length=1000)
        employee_ids = [str(e["_id"]) for e in employees]
        match_stage["assigned_to"] = {"$in": employee_ids}
    elif user_role == UserRole.TEAM_LEAD.value:
        employees = await db.users.find({"team_lead_id": user_id}).to_list(length=1000)
        employee_ids = [str(e["_id"]) for e in employees]
        match_stage["assigned_to"] = {"$in": employee_ids}

    if start_date:
        match_stage["created_at"] = {"$gte": datetime.combine(start_date, datetime.min.time())}
    if end_date:
        if "created_at" in match_stage:
            match_stage["created_at"]["$lte"] = datetime.combine(end_date, datetime.max.time())
        else:
            match_stage["created_at"] = {"$lte": datetime.combine(end_date, datetime.max.time())}

    pipeline = [
        {"$match": match_stage} if match_stage else {"$match": {}},
        {
            "$group": {
                "_id": "$status",
                "count": {"$sum": 1},
                "total_estimated_hours": {"$sum": "$estimated_hours"},
                "total_actual_hours": {"$sum": "$actual_hours"},
            }
        }
    ]

    results = await db.tasks.aggregate(pipeline).to_list(length=100)

    summary = {
        "total_tasks": 0,
        "by_status": {},
        "total_estimated_hours": 0,
        "total_actual_hours": 0,
    }

    for result in results:
        status_name = result["_id"]
        summary["by_status"][status_name] = result["count"]
        summary["total_tasks"] += result["count"]
        summary["total_estimated_hours"] += result.get("total_estimated_hours") or 0
        summary["total_actual_hours"] += result.get("total_actual_hours") or 0

    return summary


@router.delete("/{task_id}")
async def delete_task(
    task_id: str,
    current_user: dict = Depends(require_roles([UserRole.ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD]))
):
    """Delete a task"""
    db = get_database()

    if not ObjectId.is_valid(task_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid task ID format",
        )

    task = await db.tasks.find_one({"_id": ObjectId(task_id)})
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found",
        )

    # Check permissions for managers and team leads
    user_role = current_user["role"]
    user_id = str(current_user["_id"])

    if user_role != UserRole.ADMIN.value:
        if task["assigned_by"] != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Can only delete tasks you assigned",
            )

    await db.tasks.delete_one({"_id": ObjectId(task_id)})

    return {"message": "Task deleted successfully"}
