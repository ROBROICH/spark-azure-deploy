#!/bin/bash
# Configures the local Keycloak for the local development stack:
# - "local" realm with email/password login
# - "local-client" used by oauth2-proxy (login) and backend services (admin API)
# - application realm roles (admin, user, service)
# - the local login user from .env (LOCAL_USER_*)
set -euo pipefail

KCADM=/opt/keycloak/bin/kcadm.sh

for var in KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD LOCAL_KEYCLOAK_CLIENT_SECRET LOCAL_USER_ID LOCAL_USER_EMAIL LOCAL_USER_PASSWORD; do
  if [ -z "${!var:-}" ]; then
    echo "Missing $var. Regenerate .env with scripts/create_secrets.sh (wipe Docker volumes afterwards)." >&2
    exit 1
  fi
done

json_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

"$KCADM" config credentials \
  --server http://keycloak:9090 \
  --realm master \
  --user admin \
  --password "$KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD"

if ! "$KCADM" get realms/local >/dev/null 2>&1; then
  "$KCADM" create realms -s realm=local -s enabled=true
fi
# Long token lifespans keep the local development session alive without refresh churn.
"$KCADM" update realms/local \
  -s enabled=true \
  -s loginWithEmailAllowed=true \
  -s accessTokenLifespan=28800 \
  -s ssoSessionIdleTimeout=86400 \
  -s ssoSessionMaxLifespan=86400

for role in admin user service; do
  if ! "$KCADM" get "roles/$role" -r local >/dev/null 2>&1; then
    "$KCADM" create roles -r local -s "name=$role"
  fi
done

client_id="$("$KCADM" get clients -r local -q clientId=local-client --fields id --format csv --noquotes 2>/dev/null | head -n 1)"
if [ -z "$client_id" ]; then
  "$KCADM" create clients \
    -r local \
    -s clientId=local-client \
    -s enabled=true \
    -s publicClient=false \
    -s secret="$LOCAL_KEYCLOAK_CLIENT_SECRET" \
    -s serviceAccountsEnabled=true \
    -s directAccessGrantsEnabled=true \
    -s standardFlowEnabled=true
  client_id="$("$KCADM" get clients -r local -q clientId=local-client --fields id --format csv --noquotes | head -n 1)"
fi
"$KCADM" update "clients/$client_id" -r local \
  -s 'redirectUris=["http://localhost:3000/oauth2/callback"]' \
  -s 'webOrigins=["http://localhost:3000"]'

# oauth2-proxy requires an aud claim in the access token, which Keycloak
# only adds through an explicit audience mapper.
if ! "$KCADM" get "clients/$client_id/protocol-mappers/models" -r local --fields name --format csv --noquotes | grep -qx "local-client-audience"; then
  "$KCADM" create "clients/$client_id/protocol-mappers/models" -r local \
    -s name=local-client-audience \
    -s protocol=openid-connect \
    -s protocolMapper=oidc-audience-mapper \
    -s 'config."included.client.audience"=local-client' \
    -s 'config."access.token.claim"=true' \
    -s 'config."id.token.claim"=false'
fi

# Backend services list users and their realm roles through the
# local-client service account.
"$KCADM" add-roles \
  -r local \
  --uusername service-account-local-client \
  --cclientid realm-management \
  --rolename view-users \
  --rolename view-realm \
  --rolename query-users || true

# partialImport keeps the user id from .env so frontend and Keycloak agree on it.
cat > /tmp/local-user.json <<JSON
{
  "users": [
    {
      "id": "$(json_escape "$LOCAL_USER_ID")",
      "username": "$(json_escape "$LOCAL_USER_EMAIL")",
      "email": "$(json_escape "$LOCAL_USER_EMAIL")",
      "emailVerified": true,
      "enabled": true,
      "firstName": "$(json_escape "${LOCAL_USER_FIRST_NAME:-Spark}")",
      "lastName": "$(json_escape "${LOCAL_USER_LAST_NAME:-User}")",
      "credentials": [
        {
          "type": "password",
          "value": "$(json_escape "$LOCAL_USER_PASSWORD")",
          "temporary": false
        }
      ],
      "realmRoles": ["admin", "user"]
    }
  ]
}
JSON
"$KCADM" create partialImport -r local -s ifResourceExists=SKIP -o -f /tmp/local-user.json
rm -f /tmp/local-user.json

echo "Keycloak bootstrap finished."
