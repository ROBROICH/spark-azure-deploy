from functools import cache

from authentification.client_credentials import ClientCredentialsTokenProvider

from src.env import ENV


@cache
def get_keycloak_token_provider() -> ClientCredentialsTokenProvider | None:
    client_secret = ENV.OIDC_CLIENT_SECRET.get_secret_value()
    if not ENV.OIDC_CLIENT_ID or not client_secret or not ENV.OIDC_TOKEN_URL:
        return None
    return ClientCredentialsTokenProvider(ENV.OIDC_TOKEN_URL, ENV.OIDC_CLIENT_ID, client_secret)
