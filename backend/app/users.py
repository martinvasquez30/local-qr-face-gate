"""User management for the admin portal. Every endpoint requires an admin."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import CurrentAdmin, require_admin
from app.database import DbSession
from app.models import ROLE_ADMIN, User
from app.schemas import UserCreate, UserOut, UserUpdate

# `dependencies` applies require_admin to every endpoint in this router, so no
# endpoint can be left unprotected by mistake.
router = APIRouter(prefix="/users", tags=["users"], dependencies=[Depends(require_admin)])


def _get_user_or_404(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user_not_found")
    return user


@router.get("", response_model=list[UserOut])
def list_users(db: DbSession, include_inactive: bool = False) -> list[User]:
    """List users ordered by name. Inactive users only when asked for."""
    query = select(User).order_by(func.lower(User.name), User.id)
    if not include_inactive:
        query = query.where(User.is_active)
    return list(db.scalars(query))


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(body: UserCreate, db: DbSession) -> User:
    """Create a user. No password is set: members do not log in, and admins
    will log in through SSO."""
    # body.email is already trimmed and lowercase (see UserCreate).
    if db.scalar(select(User).where(User.email == body.email)) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="email_already_exists")

    user = User(name=body.name, email=body.email, role=body.role)
    db.add(user)
    db.commit()
    db.refresh(user)  # Load the values set by the database (id, dates).
    return user


@router.get("/{user_id}", response_model=UserOut)
def get_user(user_id: int, db: DbSession) -> User:
    return _get_user_or_404(db, user_id)


@router.patch("/{user_id}", response_model=UserOut)
def update_user(user_id: int, body: UserUpdate, db: DbSession, admin: CurrentAdmin) -> User:
    """Change name, role or active status. Only the fields sent are changed."""
    user = _get_user_or_404(db, user_id)
    changes = body.model_dump(exclude_none=True)

    # An admin cannot lock themselves out (deactivate or drop their admin
    # role). Otherwise the system could end up with no admin at all.
    if user.id == admin.id:
        deactivating = changes.get("is_active") is False
        losing_admin = changes.get("role", ROLE_ADMIN) != ROLE_ADMIN
        if deactivating or losing_admin:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="cannot_modify_self"
            )

    for field, value in changes.items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user
