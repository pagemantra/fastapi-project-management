from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from .config import settings
from .database import connect_to_mongo, close_mongo_connection
from .routes import auth_router, users_router, teams_router, tasks_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await connect_to_mongo()
    yield
    # Shutdown
    await close_mongo_connection()


app = FastAPI(
    title=settings.APP_NAME,
    description="""
    Employee Work Tracking System API

    ## Features
    - **Authentication**: JWT-based authentication
    - **Role-based Access Control**: Admin, Manager, Team Lead, Employee
    - **User Management**: CRUD operations with hierarchical permissions
    - **Team Management**: Create and manage teams
    - **Task Management**: Assign, track, and manage tasks
    - **Work Logging**: Track hours worked on tasks

    ## Role Hierarchy
    - **Admin**: Full access, creates managers, team leads, and employees
    - **Manager**: Manages team leads and employees under them
    - **Team Lead**: Manages employees in their team
    - **Employee**: Views and updates their own tasks
    """,
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(teams_router)
app.include_router(tasks_router)


@app.get("/", tags=["Health"])
async def root():
    return {
        "message": "Employee Work Tracking System API",
        "version": "1.0.0",
        "docs": "/docs",
    }


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "healthy"}
