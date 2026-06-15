from collections.abc import Awaitable, Callable

from fastapi import HTTPException, Request, status

ResourceResolver = Callable[[Request], Awaitable[str]]


def snake_to_camel(s: str) -> str:
    """
    Convert snake_case to camelCase.

    Examples:
        "project_id" -> "projectId"
        "file_id"    -> "fileId"
    """
    parts = s.split("_")
    return parts[0] + "".join(word.capitalize() for word in parts[1:])


def verify_resource(s: str) -> str:
    """
    Check if parsed resource ID is valid.
    """
    s = s.strip()
    if len(s) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not parse resource ID from request",
        ) from None
    return s


def path_param(name: str) -> ResourceResolver:
    """
    Return a ResourceResolver based on a path parameter name for snake_case
    and camelCase.

    Args:
        name: Name of the parameter.

    Returns:
        A ResourceResolver instance.
    """

    async def resolver(request: Request) -> str:
        value = request.path_params.get(name) or request.path_params.get(snake_to_camel(name))
        if value is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Missing path parameter '{name}'",
            ) from None
        return verify_resource(value)

    return resolver


def body_field(name: str) -> ResourceResolver:
    """
    Resolver that looks for `snake_case` or `camelCase` in JSON body.

    Args:
        name: Name of the parameter.

    Returns:
        A ResourceResolver instance.
    """

    async def resolver(request: Request) -> str:
        try:
            body = await request.json()
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or missing JSON body",
            ) from None

        # Check both snake_case and camelCase
        value = body.get(name) or body.get(snake_to_camel(name))
        if value is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Missing body field '{name}' or '{snake_to_camel(name)}'",
            ) from None
        return verify_resource(value)

    return resolver


def body_path(*path: str) -> ResourceResolver:
    """
    Traverse a nested JSON body, trying snake_case or camelCase at each level.

    Args:
        path: Nested JSON body path.

    Returns:
        A ResourceResolver instance.
    """

    async def resolver(request: Request) -> str:
        try:
            data = await request.json()
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or missing JSON body",
            ) from None

        for key in path:
            key_camel = snake_to_camel(key)
            if isinstance(data, dict):
                data = data.get(key) or data.get(key_camel)
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid body structure at {'.'.join(path)}",
                ) from None

            if data is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Missing body path {'.'.join(path)} (tried camelCase too)",
                ) from None

        return verify_resource(data)

    return resolver


def query_param(name: str) -> ResourceResolver:
    """
    Return a ResourceResolver based on a query parameter name for snake_case
    and camelCase.

    Args:
        name: Name of the query parameter.

    Returns:
        A ResourceResolver instance.
    """

    async def resolver(request: Request) -> str:
        value = request.query_params.get(name) or request.query_params.get(snake_to_camel(name))

        if value is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(f"Missing query parameter '{name}' or '{snake_to_camel(name)}'"),
            ) from None

        return verify_resource(value)

    return resolver
