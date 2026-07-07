// One-time job that configures Keycloak (realm `local`, client `local-client`, roles,
// test user, audience mapper, long token lifespan). The bootstrap script is passed in
// base64-encoded (scripts/azure/keycloak-bootstrap.sh) to avoid CRLF/quoting issues, then
// decoded and executed inside the Keycloak image (which ships kcadm.sh). Manual trigger.
param location string = resourceGroup().location
param environmentName string = 'cae-spark-demo'

@secure()
param keycloakAdminPassword string

@secure()
param keycloakClientSecret string

@secure()
param localUserPassword string

param localUserId string
param localUserEmail string
param localUserFirstName string = 'Spark'
param localUserLastName string = 'User'

@description('base64-encoded contents of scripts/azure/keycloak-bootstrap.sh')
param scriptB64 string

resource env 'Microsoft.App/managedEnvironments@2023-05-01' existing = {
  name: environmentName
}

resource keycloakBootstrap 'Microsoft.App/jobs@2023-05-01' = {
  name: 'keycloak-bootstrap'
  location: location
  properties: {
    environmentId: env.id
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 600
      replicaRetryLimit: 2
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
      }
      secrets: [
        { name: 'kc-admin-password', value: keycloakAdminPassword }
        { name: 'kc-client-secret', value: keycloakClientSecret }
        { name: 'local-user-password', value: localUserPassword }
      ]
    }
    template: {
      containers: [
        {
          name: 'bootstrap'
          image: 'quay.io/keycloak/keycloak:26.0'
          command: [ '/bin/bash', '-c' ]
          args: [
            'echo "$SCRIPT_B64" | base64 -d > /tmp/keycloak-bootstrap.sh && bash /tmp/keycloak-bootstrap.sh'
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'SCRIPT_B64', value: scriptB64 }
            { name: 'KC_SERVER', value: 'http://keycloak:8080' }
            { name: 'KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD', secretRef: 'kc-admin-password' }
            { name: 'LOCAL_KEYCLOAK_CLIENT_SECRET', secretRef: 'kc-client-secret' }
            { name: 'LOCAL_USER_PASSWORD', secretRef: 'local-user-password' }
            { name: 'LOCAL_USER_ID', value: localUserId }
            { name: 'LOCAL_USER_EMAIL', value: localUserEmail }
            { name: 'LOCAL_USER_FIRST_NAME', value: localUserFirstName }
            { name: 'LOCAL_USER_LAST_NAME', value: localUserLastName }
          ]
        }
      ]
    }
  }
}
