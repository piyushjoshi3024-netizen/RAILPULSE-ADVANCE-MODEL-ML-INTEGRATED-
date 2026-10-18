from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.dependencies import (
    get_current_user,
    get_password_service,
    get_token_service,
    get_user_repository,
)
from app.core.security import PasswordService, TokenService
from app.db.repositories.user_repository import UserRepository
from app.schemas.auth import LoginRequest, TokenResponse, UserRegisterRequest, UserResponse

router = APIRouter()


def public_user(user: dict) -> UserResponse:
    return UserResponse(
        username=user["username"],
        role=user["role"],
        full_name=user.get("full_name"),
    )


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register_passenger(
    request: UserRegisterRequest,
    users: Annotated[UserRepository, Depends(get_user_repository)],
):
    if await users.get(request.username) is not None:
        raise HTTPException(status_code=409, detail="Username already registered")
    try:
        user = await users.create(
            username=request.username,
            password=request.password,
            full_name=request.full_name,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return public_user(user)


@router.post("/login", response_model=TokenResponse)
async def login(
    request: LoginRequest,
    users: Annotated[UserRepository, Depends(get_user_repository)],
    passwords: Annotated[PasswordService, Depends(get_password_service)],
    tokens: Annotated[TokenService, Depends(get_token_service)],
):
    user = await users.get(request.username)
    if user is None or not passwords.verify(request.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    return TokenResponse(
        access_token=tokens.create(user["username"], user["role"]),
        user=public_user(user),
    )


@router.get("/me", response_model=UserResponse)
async def get_me(user: dict = Depends(get_current_user)):
    return public_user(user)
