#!/bin/bash
# Configure Keycloak for the Azure demo (gateway-injected-token auth, no login page).
# Runs inside the quay.io/keycloak/keycloak:26.0 image as an ACA Job. Idempotent.
# Mirrors docker/keycloak/bootstrap.sh but targets the in-cluster Keycloak and mints
# a long-lived access token (the gateway injects one static token for all API calls).
set -euo pipefail

KCADM=/opt/keycloak/bin/kcadm.sh
SERVER="${KC_SERVER:-http://keycloak:8080}"

for var in KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD LOCAL_KEYCLOAK_CLIENT_SECRET LOCAL_USER_ID LOCAL_USER_EMAIL LOCAL_USER_PASSWORD; do
  if [ -z "${!var:-}" ]; then
    echo "Missing $var." >&2
    exit 1
  fi
done

json_escape() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }

# Wait for the Keycloak admin API to accept credentials (the app may still be starting).
# Capture stdout+stderr so the real failure (connection refused vs invalid_grant) is visible.
ready=0
for i in $(seq 1 50); do
  if out="$("$KCADM" config credentials --server "$SERVER" --realm master --user admin \
      --password "$KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD" 2>&1)"; then
    echo "keycloak-admin-ready"
    ready=1
    break
  fi
  echo "waiting-for-keycloak ($i): ${out}"
  sleep 10
done
if [ "$ready" -ne 1 ]; then
  echo "keycloak-admin-unreachable" >&2
  exit 1
fi

if ! "$KCADM" get realms/local >/dev/null 2>&1; then
  "$KCADM" create realms -s realm=local -s enabled=true
fi

# The gateway injects one static access token, so give tokens a very long lifespan.
# Combined with the backends' optional_verify_dry_run mode this keeps the demo working.
"$KCADM" update realms/local \
  -s enabled=true \
  -s loginWithEmailAllowed=true \
  -s accessTokenLifespan=315360000 \
  -s accessTokenLifespanForImplicitFlow=315360000 \
  -s ssoSessionIdleTimeout=315360000 \
  -s ssoSessionMaxLifespan=315360000

for role in admin user service; do
  if ! "$KCADM" get "roles/$role" -r local >/dev/null 2>&1; then
    "$KCADM" create roles -r local -s "name=$role"
  fi
done

client_id="$("$KCADM" get clients -r local -q clientId=local-client --fields id --format csv --noquotes 2>/dev/null | head -n 1)"
if [ -z "$client_id" ]; then
  "$KCADM" create clients -r local \
    -s clientId=local-client \
    -s enabled=true \
    -s publicClient=false \
    -s secret="$LOCAL_KEYCLOAK_CLIENT_SECRET" \
    -s directAccessGrantsEnabled=true \
    -s standardFlowEnabled=false \
    -s serviceAccountsEnabled=false
  client_id="$("$KCADM" get clients -r local -q clientId=local-client --fields id --format csv --noquotes | head -n 1)"
fi
"$KCADM" update "clients/$client_id" -r local \
  -s secret="$LOCAL_KEYCLOAK_CLIENT_SECRET" \
  -s directAccessGrantsEnabled=true

# Backends validate the access-token audience; Keycloak only adds `aud` via a mapper.
if ! "$KCADM" get "clients/$client_id/protocol-mappers/models" -r local --fields name --format csv --noquotes | grep -qx "local-client-audience"; then
  "$KCADM" create "clients/$client_id/protocol-mappers/models" -r local \
    -s name=local-client-audience \
    -s protocol=openid-connect \
    -s protocolMapper=oidc-audience-mapper \
    -s 'config."included.client.audience"=local-client' \
    -s 'config."access.token.claim"=true' \
    -s 'config."id.token.claim"=false'
fi

# Test user. The id is pinned so `created_by` matches the demo identity everywhere.
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
        { "type": "password", "value": "$(json_escape "$LOCAL_USER_PASSWORD")", "temporary": false }
      ],
      "realmRoles": ["admin", "user"]
    }
  ]
}
JSON
"$KCADM" create partialImport -r local -s ifResourceExists=OVERWRITE -o -f /tmp/local-user.json
rm -f /tmp/local-user.json

echo "keycloak-bootstrap-done"
