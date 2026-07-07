// One-time job that mints a long-lived access token for the test user via the OAuth2
// password grant, then prints it wrapped in ACCESS_TOKEN_BEGIN/END markers. The caller
// reads the token from the job logs and stores it in Key Vault (gateway-auth-token); the
// frontend gateway injects it as `Authorization: Bearer <token>` on all /api calls.
param location string = resourceGroup().location
param environmentName string = 'cae-spark-demo'

@secure()
param keycloakClientSecret string

@secure()
param localUserPassword string

param localUserEmail string

resource env 'Microsoft.App/managedEnvironments@2023-05-01' existing = {
  name: environmentName
}

resource keycloakToken 'Microsoft.App/jobs@2023-05-01' = {
  name: 'keycloak-token'
  location: location
  properties: {
    environmentId: env.id
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 300
      replicaRetryLimit: 2
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
      }
      secrets: [
        { name: 'kc-client-secret', value: keycloakClientSecret }
        { name: 'local-user-password', value: localUserPassword }
      ]
    }
    template: {
      containers: [
        {
          name: 'token'
          image: 'curlimages/curl:8.11.1'
          command: [ '/bin/sh', '-c' ]
          args: [
            'until curl -sf http://keycloak:8080/realms/local/.well-known/openid-configuration >/dev/null; do echo waiting-for-keycloak; sleep 5; done; TOKEN=$(curl -s -X POST http://keycloak:8080/realms/local/protocol/openid-connect/token -d grant_type=password -d client_id=local-client --data-urlencode client_secret="$CLIENT_SECRET" --data-urlencode username="$LOCAL_USER_EMAIL" --data-urlencode password="$LOCAL_USER_PASSWORD" --data-urlencode scope="openid email profile" | sed -n "s/.*\\"access_token\\":\\"\\([^\\"]*\\)\\".*/\\1/p"); echo "ACCESS_TOKEN_BEGIN\${TOKEN}ACCESS_TOKEN_END"'
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            { name: 'CLIENT_SECRET', secretRef: 'kc-client-secret' }
            { name: 'LOCAL_USER_PASSWORD', secretRef: 'local-user-password' }
            { name: 'LOCAL_USER_EMAIL', value: localUserEmail }
          ]
        }
      ]
    }
  }
}
