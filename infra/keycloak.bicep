// Keycloak (OIDC provider) for the Azure demo. Internal TCP ingress on 8080, reachable at
// http://keycloak:8080 like the other infra apps. dev-file H2 on ephemeral storage: the
// gateway injects one long-lived token and backends run optional_verify_dry_run, so a replica
// restart (which resets H2 and signing keys) degrades gracefully instead of breaking the demo.
// Realm/client/roles/test-user are configured by keycloak-bootstrap-job.bicep.
param location string = resourceGroup().location
param environmentName string = 'cae-spark-demo'

@secure()
param keycloakAdminPassword string

// Full `local` realm export (roles, client, audience mapper, test user) rendered from
// infra/keycloak-realm.template.json. Imported at startup via --import-realm; sslRequired=none
// so the token-mint job can use the HTTP password grant (only the master realm is `external`).
@secure()
param keycloakRealmJson string

resource env 'Microsoft.App/managedEnvironments@2023-05-01' existing = {
  name: environmentName
}

resource keycloak 'Microsoft.App/containerApps@2023-05-01' = {
  name: 'keycloak'
  location: location
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: false
        transport: 'tcp'
        targetPort: 8080
        exposedPort: 8080
      }
      secrets: [
        { name: 'kc-admin-password', value: keycloakAdminPassword }
        { name: 'realm-json', value: keycloakRealmJson }
      ]
    }
    template: {
      containers: [
        {
          name: 'keycloak'
          image: 'quay.io/keycloak/keycloak:26.0'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          command: [ '/opt/keycloak/bin/kc.sh' ]
          args: [ 'start-dev', '--http-port=8080', '--import-realm' ]
          env: [
            { name: 'KC_BOOTSTRAP_ADMIN_USERNAME', value: 'admin' }
            { name: 'KC_BOOTSTRAP_ADMIN_PASSWORD', secretRef: 'kc-admin-password' }
            { name: 'KC_DB', value: 'dev-file' }
            { name: 'KC_HTTP_ENABLED', value: 'true' }
            // Pin the frontend URL so the token `iss` is deterministic and matches
            // AUTH_BASE_URL on the backends (http://keycloak:8080/realms/local).
            { name: 'KC_HOSTNAME', value: 'http://keycloak:8080' }
            { name: 'KC_HOSTNAME_STRICT', value: 'false' }
            { name: 'KC_HEALTH_ENABLED', value: 'true' }
          ]
          volumeMounts: [
            { volumeName: 'kc-import', mountPath: '/opt/keycloak/data/import' }
          ]
        }
      ]
      volumes: [
        {
          name: 'kc-import'
          storageType: 'Secret'
          secrets: [
            { secretRef: 'realm-json', path: 'local-realm.json' }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 1
      }
    }
  }
}

output fqdn string = keycloak.properties.configuration.ingress.fqdn
