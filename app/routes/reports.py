from fastapi import APIRouter, HTTPException, status, Depends, Query
from fastapi.responses import StreamingResponse
from datetime import datetime, date, timedelta
from typing import List, Optional
from bson import ObjectId
from bson.errors import InvalidId
import io
import csv
import pytz
from ..database import get_database
from ..models.user import UserRole
from ..utils.dependencies import get_current_active_user, require_roles

router = APIRouter(prefix="/reports", tags=["Reports"])

IST = pytz.timezone('Asia/Kolkata')


# ============ PRODUCTIVITY REPORT ============

@router.get("/productivity")
async def get_productivity_report(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    employee_id: Optional[str] = Query(None),
    current_user: dict = Depends(require_roles([UserRole.ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD]))
):
    """Get employee productivity report"""
    db = get_database()
    user_role = current_user["role"]
    user_id = str(current_user["_id"])

    # Build employee filter
    employee_query = {}
    if user_role == UserRole.TEAM_LEAD.value:
        employee_query["team_lead_id"] = user_id
    elif user_role == UserRole.MANAGER.value:
        employee_query["manager_id"] = user_id

    if employee_id:
        if not ObjectId.is_valid(employee_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid employee ID format",
            )
        employee_query["_id"] = ObjectId(employee_id)

    employees = await db.users.find({
        **employee_query,
        "role": UserRole.ASSOCIATE.value
    }).to_list(length=1000)

    # Date range
    if not start_date:
        start_date = datetime.now(IST).date() - timedelta(days=30)
    if not end_date:
        end_date = datetime.now(IST).date()

    report_data = []

    for emp in employees:
        emp_id = str(emp["_id"])

        # Tasks completed
        tasks_query = {
            "assigned_to": emp_id,
            "status": "completed",
        }
        if start_date:
            tasks_query["completed_at"] = {"$gte": IST.localize(datetime.combine(start_date, datetime.min.time()))}
        if end_date:
            if "completed_at" in tasks_query:
                tasks_query["completed_at"]["$lte"] = IST.localize(datetime.combine(end_date, datetime.max.time()))
            else:
                tasks_query["completed_at"] = {"$lte": IST.localize(datetime.combine(end_date, datetime.max.time()))}

        tasks_completed = await db.tasks.count_documents(tasks_query)

        # Total tasks assigned
        total_tasks = await db.tasks.count_documents({"assigned_to": emp_id})

        # Attendance data
        attendance_query = {
            "employee_id": emp_id,
            "date": {
                "$gte": start_date.isoformat(),
                "$lte": end_date.isoformat()
            }
        }
        sessions = await db.time_sessions.find(attendance_query).to_list(length=1000)

        total_work_hours = sum(s.get("total_work_hours", 0) for s in sessions)
        total_overtime = sum(s.get("overtime_hours", 0) for s in sessions)
        days_worked = len(sessions)

        # Worksheets
        worksheet_query = {
            "employee_id": emp_id,
            "date": {
                "$gte": start_date.isoformat(),
                "$lte": end_date.isoformat()
            }
        }
        total_worksheets = await db.worksheets.count_documents(worksheet_query)
        approved_worksheets = await db.worksheets.count_documents({
            **worksheet_query,
            "status": "manager_approved"
        })

        report_data.append({
            "employee_id": emp_id,
            "employee_name": emp["full_name"],
            "employee_email": emp.get("email", ""),
            "department": emp.get("department", ""),
            "tasks_completed": tasks_completed,
            "total_tasks": total_tasks,
            "completion_rate": round((tasks_completed / total_tasks * 100) if total_tasks > 0 else 0, 2),
            "days_worked": days_worked,
            "total_work_hours": round(total_work_hours, 2),
            "total_overtime_hours": round(total_overtime, 2),
            "average_hours_per_day": round(total_work_hours / days_worked if days_worked > 0 else 0, 2),
            "worksheets_submitted": total_worksheets,
            "worksheets_approved": approved_worksheets,
            "worksheet_approval_rate": round((approved_worksheets / total_worksheets * 100) if total_worksheets > 0 else 0, 2),
        })

    return {
        "report_type": "productivity",
        "date_range": {"start": start_date.isoformat(), "end": end_date.isoformat()},
        "generated_at": datetime.now(IST).isoformat(),
        "data": report_data
    }


# ============ ATTENDANCE REPORT ============

@router.get("/attendance")
async def get_attendance_report(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    employee_id: Optional[str] = Query(None),
    current_user: dict = Depends(require_roles([UserRole.ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD]))
):
    """Get attendance report"""
    db = get_database()
    user_role = current_user["role"]
    user_id = str(current_user["_id"])

    if not start_date:
        start_date = datetime.now(IST).date() - timedelta(days=30)
    if not end_date:
        end_date = datetime.now(IST).date()

    # Build query based on role
    query = {
        "date": {
            "$gte": start_date.isoformat(),
            "$lte": end_date.isoformat()
        }
    }

    if employee_id:
        query["employee_id"] = employee_id
    elif user_role == UserRole.TEAM_LEAD.value:
        team_members = await db.users.find({"team_lead_id": user_id}).to_list(length=1000)
        member_ids = [str(m["_id"]) for m in team_members]
        query["employee_id"] = {"$in": member_ids}
    elif user_role == UserRole.MANAGER.value:
        employees = await db.users.find({"manager_id": user_id}).to_list(length=1000)
        employee_ids = [str(e["_id"]) for e in employees]
        query["employee_id"] = {"$in": employee_ids}

    sessions = await db.time_sessions.find(query).sort("date", -1).to_list(length=1000)

    # Enrich with employee names
    report_data = []
    employee_cache = {}

    for session in sessions:
        emp_id = session["employee_id"]
        if emp_id not in employee_cache:
            if ObjectId.is_valid(emp_id):
                emp = await db.users.find_one({"_id": ObjectId(emp_id)})
                employee_cache[emp_id] = emp["full_name"] if emp else "Unknown"
            else:
                employee_cache[emp_id] = "Unknown"

        report_data.append({
            "date": session["date"],
            "employee_id": emp_id,
            "employee_name": employee_cache[emp_id],
            "login_time": session["login_time"].isoformat() if session.get("login_time") else None,
            "logout_time": session["logout_time"].isoformat() if session.get("logout_time") else None,
            "total_work_hours": session.get("total_work_hours", 0),
            "total_break_minutes": session.get("total_break_minutes", 0),
            "overtime_hours": session.get("overtime_hours", 0),
            "status": session["status"],
            "worksheet_submitted": session.get("worksheet_submitted", False),
        })

    return {
        "report_type": "attendance",
        "date_range": {"start": start_date.isoformat(), "end": end_date.isoformat()},
        "generated_at": datetime.now(IST).isoformat(),
        "total_records": len(report_data),
        "data": report_data
    }


# ============ OVERTIME REPORT ============

@router.get("/overtime")
async def get_overtime_report(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    current_user: dict = Depends(require_roles([UserRole.ADMIN, UserRole.MANAGER]))
):
    """Get overtime report"""
    db = get_database()
    user_role = current_user["role"]
    user_id = str(current_user["_id"])

    if not start_date:
        start_date = datetime.now(IST).date() - timedelta(days=30)
    if not end_date:
        end_date = datetime.now(IST).date()

    query = {
        "date": {
            "$gte": start_date.isoformat(),
            "$lte": end_date.isoformat()
        },
        "overtime_hours": {"$gt": 0}
    }

    if user_role == UserRole.MANAGER.value:
        employees = await db.users.find({"manager_id": user_id}).to_list(length=1000)
        employee_ids = [str(e["_id"]) for e in employees]
        query["employee_id"] = {"$in": employee_ids}

    # Aggregate overtime by employee
    pipeline = [
        {"$match": query},
        {
            "$group": {
                "_id": "$employee_id",
                "total_overtime_hours": {"$sum": "$overtime_hours"},
                "overtime_days": {"$sum": 1},
                "sessions": {"$push": {"date": "$date", "overtime_hours": "$overtime_hours"}}
            }
        },
        {"$sort": {"total_overtime_hours": -1}}
    ]

    results = await db.time_sessions.aggregate(pipeline).to_list(length=1000)

    # Enrich with employee data
    report_data = []
    for r in results:
        if not ObjectId.is_valid(r["_id"]):
            continue
        emp = await db.users.find_one({"_id": ObjectId(r["_id"])})
        if emp:
            report_data.append({
                "employee_id": r["_id"],
                "employee_name": emp["full_name"],
                "department": emp.get("department", ""),
                "total_overtime_hours": round(r["total_overtime_hours"], 2),
                "overtime_days": r["overtime_days"],
                "average_overtime_per_day": round(r["total_overtime_hours"] / r["overtime_days"], 2),
                "overtime_sessions": r["sessions"][:10]  # Last 10 sessions
            })

    return {
        "report_type": "overtime",
        "date_range": {"start": start_date.isoformat(), "end": end_date.isoformat()},
        "generated_at": datetime.now(IST).isoformat(),
        "total_employees_with_overtime": len(report_data),
        "data": report_data
    }


# ============ TEAM PERFORMANCE REPORT ============

@router.get("/team-performance")
async def get_team_performance_report(
    team_id: Optional[str] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    current_user: dict = Depends(require_roles([UserRole.ADMIN, UserRole.MANAGER]))
):
    """Get team performance report"""
    db = get_database()
    user_role = current_user["role"]
    user_id = str(current_user["_id"])

    if not start_date:
        start_date = datetime.now(IST).date() - timedelta(days=30)
    if not end_date:
        end_date = datetime.now(IST).date()

    # Get teams
    team_query = {}
    if team_id:
        if not ObjectId.is_valid(team_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid team ID format",
            )
        team_query["_id"] = ObjectId(team_id)
    elif user_role == UserRole.MANAGER.value:
        team_query["manager_id"] = user_id

    teams = await db.teams.find(team_query).to_list(length=100)

    report_data = []

    for team in teams:
        team_id_str = str(team["_id"])
        member_ids = team.get("members", [])

        if not member_ids:
            continue

        # Tasks statistics
        tasks_completed = await db.tasks.count_documents({
            "assigned_to": {"$in": member_ids},
            "status": "completed",
            "completed_at": {
                "$gte": IST.localize(datetime.combine(start_date, datetime.min.time())),
                "$lte": IST.localize(datetime.combine(end_date, datetime.max.time()))
            }
        })

        total_tasks = await db.tasks.count_documents({
            "assigned_to": {"$in": member_ids}
        })

        # Worksheet statistics
        worksheets_submitted = await db.worksheets.count_documents({
            "employee_id": {"$in": member_ids},
            "date": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()}
        })

        worksheets_approved = await db.worksheets.count_documents({
            "employee_id": {"$in": member_ids},
            "date": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()},
            "status": "manager_approved"
        })

        # Attendance
        attendance_pipeline = [
            {
                "$match": {
                    "employee_id": {"$in": member_ids},
                    "date": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()}
                }
            },
            {
                "$group": {
                    "_id": None,
                    "total_work_hours": {"$sum": "$total_work_hours"},
                    "total_overtime": {"$sum": "$overtime_hours"},
                    "sessions": {"$sum": 1}
                }
            }
        ]

        attendance_result = await db.time_sessions.aggregate(attendance_pipeline).to_list(length=1)
        attendance_data = attendance_result[0] if attendance_result else {"total_work_hours": 0, "total_overtime": 0, "sessions": 0}

        # Get team lead name
        team_lead_name = "Unknown"
        if team.get("team_lead_id") and ObjectId.is_valid(team["team_lead_id"]):
            team_lead = await db.users.find_one({"_id": ObjectId(team["team_lead_id"])})
            team_lead_name = team_lead["full_name"] if team_lead else "Unknown"

        report_data.append({
            "team_id": team_id_str,
            "team_name": team["name"],
            "team_lead": team_lead_name,
            "member_count": len(member_ids),
            "tasks_completed": tasks_completed,
            "total_tasks": total_tasks,
            "task_completion_rate": round((tasks_completed / total_tasks * 100) if total_tasks > 0 else 0, 2),
            "worksheets_submitted": worksheets_submitted,
            "worksheets_approved": worksheets_approved,
            "worksheet_approval_rate": round((worksheets_approved / worksheets_submitted * 100) if worksheets_submitted > 0 else 0, 2),
            "total_work_hours": round(attendance_data["total_work_hours"], 2),
            "total_overtime_hours": round(attendance_data["total_overtime"], 2),
            "attendance_sessions": attendance_data["sessions"],
        })

    return {
        "report_type": "team_performance",
        "date_range": {"start": start_date.isoformat(), "end": end_date.isoformat()},
        "generated_at": datetime.now(IST).isoformat(),
        "total_teams": len(report_data),
        "data": report_data
    }


# ============ WORKSHEET ANALYTICS ============

@router.get("/worksheet-analytics")
async def get_worksheet_analytics(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    current_user: dict = Depends(require_roles([UserRole.ADMIN, UserRole.MANAGER, UserRole.TEAM_LEAD]))
):
    """Get worksheet analytics"""
    db = get_database()
    user_role = current_user["role"]
    user_id = str(current_user["_id"])

    if not start_date:
        start_date = datetime.now(IST).date() - timedelta(days=30)
    if not end_date:
        end_date = datetime.now(IST).date()

    # Build employee filter
    employee_ids = None
    if user_role == UserRole.TEAM_LEAD.value:
        team_members = await db.users.find({"team_lead_id": user_id}).to_list(length=1000)
        employee_ids = [str(m["_id"]) for m in team_members]
    elif user_role == UserRole.MANAGER.value:
        employees = await db.users.find({"manager_id": user_id}).to_list(length=1000)
        employee_ids = [str(e["_id"]) for e in employees]

    match_stage = {
        "date": {
            "$gte": start_date.isoformat(),
            "$lte": end_date.isoformat()
        }
    }
    if employee_ids:
        match_stage["employee_id"] = {"$in": employee_ids}

    # Status distribution
    status_pipeline = [
        {"$match": match_stage},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}}
    ]
    status_results = await db.worksheets.aggregate(status_pipeline).to_list(length=10)

    status_distribution = {r["_id"]: r["count"] for r in status_results}

    # Daily submission trend
    trend_pipeline = [
        {"$match": match_stage},
        {
            "$group": {
                "_id": "$date",
                "submitted": {"$sum": 1},
                "approved": {
                    "$sum": {"$cond": [{"$eq": ["$status", "manager_approved"]}, 1, 0]}
                }
            }
        },
        {"$sort": {"_id": 1}}
    ]
    trend_results = await db.worksheets.aggregate(trend_pipeline).to_list(length=100)

    # Rejection analysis
    rejection_pipeline = [
        {
            "$match": {
                **match_stage,
                "status": "rejected"
            }
        },
        {"$count": "total_rejected"}
    ]
    rejection_result = await db.worksheets.aggregate(rejection_pipeline).to_list(length=1)
    total_rejected = rejection_result[0]["total_rejected"] if rejection_result else 0

    total_worksheets = sum(status_distribution.values())

    return {
        "report_type": "worksheet_analytics",
        "date_range": {"start": start_date.isoformat(), "end": end_date.isoformat()},
        "generated_at": datetime.now(IST).isoformat(),
        "summary": {
            "total_worksheets": total_worksheets,
            "pending_verification": status_distribution.get("submitted", 0),
            "pending_approval": status_distribution.get("tl_verified", 0),
            "approved": status_distribution.get("manager_approved", 0),
            "rejected": total_rejected,
            "rejection_rate": round((total_rejected / total_worksheets * 100) if total_worksheets > 0 else 0, 2),
        },
        "status_distribution": status_distribution,
        "daily_trend": [{"date": t["_id"], "submitted": t["submitted"], "approved": t["approved"]} for t in trend_results]
    }


# ============ EXPORT REPORTS ============

@router.get("/export/productivity")
async def export_productivity_report(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    format: str = Query("csv", regex="^(csv|excel)$"),
    current_user: dict = Depends(require_roles([UserRole.ADMIN, UserRole.MANAGER]))
):
    """Export productivity report as CSV or Excel"""
    # Get the report data
    report = await get_productivity_report(start_date, end_date, None, current_user)

    if format == "csv":
        output = io.StringIO()
        if report["data"]:
            writer = csv.DictWriter(output, fieldnames=report["data"][0].keys())
            writer.writeheader()
            writer.writerows(report["data"])

        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=productivity_report_{datetime.now(IST).date()}.csv"}
        )
    else:
        # For Excel, we'd use openpyxl - simplified CSV for now
        output = io.StringIO()
        if report["data"]:
            writer = csv.DictWriter(output, fieldnames=report["data"][0].keys())
            writer.writeheader()
            writer.writerows(report["data"])

        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=productivity_report_{datetime.now(IST).date()}.csv"}
        )


@router.get("/export/attendance")
async def export_attendance_report(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    format: str = Query("csv", regex="^(csv|excel)$"),
    current_user: dict = Depends(require_roles([UserRole.ADMIN, UserRole.MANAGER]))
):
    """Export attendance report as CSV"""
    report = await get_attendance_report(start_date, end_date, None, current_user)

    output = io.StringIO()
    if report["data"]:
        writer = csv.DictWriter(output, fieldnames=report["data"][0].keys())
        writer.writeheader()
        writer.writerows(report["data"])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=attendance_report_{datetime.now(IST).date()}.csv"}
    )


@router.get("/export/overtime")
async def export_overtime_report(
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    format: str = Query("csv", regex="^(csv|excel)$"),
    current_user: dict = Depends(require_roles([UserRole.ADMIN, UserRole.MANAGER]))
):
    """Export overtime report as CSV"""
    report = await get_overtime_report(start_date, end_date, current_user)

    output = io.StringIO()
    if report["data"]:
        # Flatten the data for CSV export
        flat_data = []
        for item in report["data"]:
            flat_item = {k: v for k, v in item.items() if k != "overtime_sessions"}
            flat_data.append(flat_item)

        if flat_data:
            writer = csv.DictWriter(output, fieldnames=flat_data[0].keys())
            writer.writeheader()
            writer.writerows(flat_data)

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=overtime_report_{datetime.now(IST).date()}.csv"}
    )
