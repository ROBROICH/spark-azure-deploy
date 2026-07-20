from typing import Annotated, cast

from authentification.dependencies import get_current_user, get_oidc_client, get_privileged_oidc_client, require_role
from authentification.enums import OidcRoles
from authentification.models import OidcUserInfo
from authentification.oidc import OidcClient
from event_logging import EventAction, EventCategory, EventOutcome
from fastapi import APIRouter, Depends, HTTPException, status

from src.models.schemas.identity import IdentityListResponse, IdentityResponse, UpdateRolesRequest, UpdateRolesResponse
from src.utils.logger import logger

router = APIRouter(
    tags=["identity"],
    dependencies=[
        Depends(
            require_role(allowed_roles=[OidcRoles.ADMIN, OidcRoles.USER, OidcRoles.SERVICE]),
        ),
    ],
)


@router.get("/me", response_model=IdentityResponse)
async def get_identity(
    user: OidcUserInfo | None = Depends(get_current_user),
) -> IdentityResponse:
    """Return identity claims from the validated access token.

    Requires a valid Bearer token. No external calls are made — all fields
    are read directly from the token payload.
    """
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.email:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email claim required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return IdentityResponse(
        userId=user.sub,
        email=user.email,
        firstName=user.given_name,
        lastName=user.family_name,
        role=user.role,
    )


@router.get(
    "/users",
    response_model=IdentityListResponse,
)
async def get_all_identities(
    oidc_client: Annotated[
        OidcClient,
        Depends(get_oidc_client),
    ],
    search: str | None = None,
) -> IdentityListResponse:
    """Return all users from OIDC provider.

    Args:
        oidc_client: Injected OIDC admin client.
        search: Search string to filter users by.

    Returns:
        IdentityListResponse: List of all OIDC users.

    Raises:
        HTTPException: If request fails.
    """
    if search is None:
        users = await oidc_client.list_all_users()
    else:
        users = await oidc_client.list_users(search=search)

    mapped_users = []
    for user in users:
        if (
            not user.sub
            or not user.enabled
            or not user.email
            or not user.name
            or user.name.startswith("service-account-")
            or user.name in {"admin"}
        ):
            continue

        mapped_users.append(
            IdentityResponse(
                userId=user.sub,
                email=user.email,
                firstName=user.given_name,
                lastName=user.family_name,
                role=OidcRoles.USER if user.role == OidcRoles.ADMIN else user.role,
            )
        )

    return IdentityListResponse(users=mapped_users)


@router.post(
    "/me/roles",
    response_model=UpdateRolesResponse,
)
async def update_user_roles(
    payload: UpdateRolesRequest,
    user: OidcUserInfo = Depends(get_current_user),
    oidc_client: OidcClient = Depends(get_privileged_oidc_client),
) -> UpdateRolesResponse:
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    await oidc_client.set_user_realm_roles(
        user_id=user.sub,
        roles=cast(list[OidcRoles], payload.roles),
        changeable_roles=cast(list[OidcRoles], [OidcRoles.ADMIN, OidcRoles.USER]),
    )

    logger.info(
        action=EventAction.NOTIFY,
        outcome=EventOutcome.SUCCESS,
        category=EventCategory.SECURITY,
        message=f"User {user.sub} changed his roles to {payload.roles}.",
    )

    return UpdateRolesResponse(
        success=True,
        roles=payload.roles,
    )
