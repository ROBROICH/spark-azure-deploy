from collections.abc import AsyncIterable, Awaitable, Callable, Iterable, Sequence
from typing import Any, cast, override

import grpc  # type: ignore[untyped-import]
from authzed.api.v1 import Client

type UnaryContinuation = Callable[[grpc.aio.ClientCallDetails, Any], Awaitable[Any]]
type StreamRequest = AsyncIterable[Any] | Iterable[Any]
type StreamContinuation = Callable[[grpc.aio.ClientCallDetails, StreamRequest], Awaitable[Any]]


class BaseAuthInterceptor:
    """Base class for gRPC interceptors that add Bearer token authentication."""

    def __init__(self, token: str) -> None:
        """Initialize the interceptor with a Bearer token.

        Args:
            token: The JWT or API token to use in the Authorization header.
        """
        self._token = token

    def _add_auth(self, client_call_details: grpc.aio.ClientCallDetails) -> grpc.aio.ClientCallDetails:
        """Add Bearer authorization header to the call metadata.

        Args:
            client_call_details: The original call details.

        Returns:
            Updated call details with Authorization header added.
        """
        metadata = list(client_call_details.metadata or [])
        metadata.append(("authorization", f"Bearer {self._token}"))

        return grpc.aio.ClientCallDetails(
            method=client_call_details.method,
            timeout=client_call_details.timeout,
            metadata=cast(Any, metadata),
            credentials=client_call_details.credentials,
            wait_for_ready=client_call_details.wait_for_ready,
        )


class AsyncAuthUnaryUnaryInterceptor(
    BaseAuthInterceptor,
    grpc.aio.UnaryUnaryClientInterceptor,
):
    """Interceptor that adds Bearer auth to unary-unary RPCs."""

    @override
    async def intercept_unary_unary(
        self,
        continuation: UnaryContinuation,
        client_call_details: grpc.aio.ClientCallDetails,
        request: Any,
    ) -> Any:
        """Intercept and authenticate a unary-unary call.

        Args:
            continuation: The next interceptor or the RPC stub.
            client_call_details: Call metadata and configuration.
            request: The request message.

        Returns:
            The response future from the authenticated call.
        """
        return await continuation(self._add_auth(client_call_details), request)


class AsyncAuthUnaryStreamInterceptor(
    BaseAuthInterceptor,
    grpc.aio.UnaryStreamClientInterceptor,
):
    """Interceptor that adds Bearer auth to unary-stream RPCs (e.g. LookupResources)."""

    @override
    async def intercept_unary_stream(
        self,
        continuation: UnaryContinuation,
        client_call_details: grpc.aio.ClientCallDetails,
        request: Any,
    ) -> Any:
        """Intercept and authenticate a unary-stream call.

        Args:
            continuation: The next interceptor or the RPC stub.
            client_call_details: Call metadata and configuration.
            request: The request message.

        Returns:
            An async iterator of response messages.
        """
        return await continuation(self._add_auth(client_call_details), request)


class AsyncAuthStreamUnaryInterceptor(
    BaseAuthInterceptor,
    grpc.aio.StreamUnaryClientInterceptor,
):
    """Interceptor that adds Bearer auth to stream-unary RPCs."""

    @override
    async def intercept_stream_unary(
        self,
        continuation: StreamContinuation,
        client_call_details: grpc.aio.ClientCallDetails,
        request_iterator: StreamRequest,
    ) -> Any:
        """Intercept and authenticate a stream-unary call.

        Args:
            continuation: The next interceptor or the RPC stub.
            client_call_details: Call metadata and configuration.
            request_iterator: Async iterator of request messages.

        Returns:
            The response future.
        """
        return await continuation(self._add_auth(client_call_details), request_iterator)


class AsyncAuthStreamStreamInterceptor(
    BaseAuthInterceptor,
    grpc.aio.StreamStreamClientInterceptor,
):
    """Interceptor that adds Bearer auth to stream-stream RPCs."""

    @override
    async def intercept_stream_stream(
        self,
        continuation: StreamContinuation,
        client_call_details: grpc.aio.ClientCallDetails,
        request_iterator: StreamRequest,
    ) -> Any:
        """Intercept and authenticate a stream-stream call.

        Args:
            continuation: The next interceptor or the RPC stub.
            client_call_details: Call metadata and configuration.
            request_iterator: Async iterator of request messages.

        Returns:
            An async iterator of response messages.
        """
        return await continuation(
            self._add_auth(client_call_details),
            request_iterator,
        )


class AsyncInsecureClient(Client):
    """Insecure (plaintext) async gRPC client for SpiceDB with Bearer token auth."""

    def __init__(
        self,
        target: str,
        token: str,
        options: Sequence[tuple[str, Any]] | None = None,
        compression: grpc.Compression | None = None,
    ) -> None:
        """Initialize an insecure SpiceDB client with Bearer token authentication.

        Args:
            target: The SpiceDB server address (e.g. "localhost:50051").
            token: Bearer token (JWT or API key) to authenticate requests.
            options: Optional list of gRPC channel arguments
                (e.g. [('grpc.max_receive_message_length', -1)]).
            compression: Optional gRPC compression algorithm
                (e.g. grpc.Compression.Gzip).

        Note:
            This uses an insecure channel (no TLS). Do NOT use in production without
            encryption.
        """
        channel = grpc.aio.insecure_channel(
            target,
            options,
            compression,
            [
                AsyncAuthUnaryUnaryInterceptor(token),
                AsyncAuthUnaryStreamInterceptor(token),
                AsyncAuthStreamUnaryInterceptor(token),
                AsyncAuthStreamStreamInterceptor(token),
            ],
        )

        self.init_stubs(channel)  # type: ignore
