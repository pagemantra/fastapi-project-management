from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from starlette.middleware.base import BaseHTTPMiddleware

from .config import settings
from .database import connect_to_mongo, close_mongo_connection
from .routes import auth_router, users_router, teams_router, tasks_router
from .routes.attendance import router as attendance_router
from .routes.forms import router as forms_router
from .routes.worksheets import router as worksheets_router
from .routes.notifications import router as notifications_router
from .routes.reports import router as reports_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await connect_to_mongo()
    yield
    # Shutdown
    await close_mongo_connection()


app = FastAPI(
    title=settings.APP_NAME,
    redirect_slashes=False,
    description="""
    Associate Work Tracking System API

    ## Features
    - **Authentication**: JWT-based authentication
    - **Role-based Access Control**: Admin, Manager, Team Lead, Associate
    - **User Management**: CRUD operations with hierarchical permissions
    - **Team Management**: Create and manage teams
    - **Task Management**: Assign, track, and manage tasks
    - **Attendance**: Clock in/out, break management, overtime tracking
    - **Dynamic Forms**: Custom forms assigned to teams
    - **Worksheets**: Daily work logs with two-level verification
    - **Notifications**: Real-time alerts for actions
    - **Reports**: Analytics and export capabilities

    ## Role Hierarchy
    - **Admin**: Full access, creates managers, team leads, and associates
    - **Manager**: Manages team leads and associates, bulk approves worksheets
    - **Team Lead**: Manages team, individually verifies worksheets
    - **Associate**: Tracks time, submits worksheets, views tasks
    """,
    version="2.0.0",
    lifespan=lifespan,
)


# Custom CORS middleware that works reliably
class CORSHandler(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        origin = request.headers.get("origin", "")

        # Handle preflight OPTIONS request
        if request.method == "OPTIONS":
            response = JSONResponse(content={"message": "OK"})
            response.headers["Access-Control-Allow-Origin"] = origin or "*"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
            response.headers["Access-Control-Allow-Headers"] = "*"
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Access-Control-Max-Age"] = "600"
            return response

        # Handle regular requests
        response = await call_next(request)
        response.headers["Access-Control-Allow-Origin"] = origin or "*"
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS, PATCH"
        response.headers["Access-Control-Allow-Headers"] = "*"
        return response


app.add_middleware(CORSHandler)

# Include routers
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(teams_router)
app.include_router(tasks_router)
app.include_router(attendance_router)
app.include_router(forms_router)
app.include_router(worksheets_router)
app.include_router(notifications_router)
app.include_router(reports_router)


@app.get("/", tags=["Health"])
async def root():
    return {
        "message": "Associate Work Tracking System API",
        "version": "1.0.0",
        "docs": "/docs",
    }


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "healthy"}
