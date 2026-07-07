// Idle auto-pause watchdog for the SPARK demo.
//
// A scheduled ACA Job that pauses the whole demo after a period of no frontend HTTP traffic, so the
// stateful tier stops paying for idle compute. Every run it: (1) checks the `frontend` Requests metric
// over the last `idleMinutes`; (2) skips if a Temporal workflow is running (via /temporal/load);
// (3) if idle, snapshots the four stores and scales EVERY container app to min-replicas 0. It is a
// no-op while already paused. Resume stays manual (scripts/azure/resume-demo.ps1).
//
// The watchdog logic lives in scripts/azure/autopause-watchdog.sh and is embedded here (base64) so the
// Job image can stay the stock public az-CLI image (no custom build, no ACR dependency).
//
// Strategy + rationale: analysis/10-ephemeral-state-snapshots.md

@description('Region for the watchdog Job and its identity.')
param location string = resourceGroup().location

@description('ACA managed environment that hosts the demo.')
param environmentName string = 'cae-spark-demo'

@description('Frontend container app whose Requests metric is the idle signal.')
param frontendAppName string = 'frontend'

@description('Key Vault (access-policy mode) holding the gateway bearer token.')
param keyVaultName string = 'kv-sparkdemo'

@description('Secret name of the gateway bearer token used for the workflow-guard call.')
param gatewayTokenSecretName string = 'gateway-auth-token'

@description('Storage account backing the snapshots share (used to verify the spicedb backup).')
param snapshotStorageAccount string = 'stsparkdemo'

@description('Azure Files share holding the store snapshots.')
param snapshotShare string = 'snapshots'

@description('Idle threshold in minutes: pause after this long with no frontend requests.')
param idleMinutes int = 10

@description('Cron schedule for the watchdog (UTC). Default: every 5 minutes.')
param cronExpression string = '*/5 * * * *'

@description('When true the watchdog logs its decision but never snapshots or scales down.')
param dryRun bool = false

@description('Public container image with the az CLI for the watchdog.')
param watchdogImage string = 'mcr.microsoft.com/azure-cli:latest'

// Contributor (RG-scoped) covers every ARM action the watchdog needs: read metrics, start the snapshot
// jobs, update container-app scale, and list the snapshot storage key. It can be replaced by a narrower
// custom role, but is bounded to this single resource group.
var contributorRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b24988ac-6180-42a0-ab88-20f7382dd24c')
var watchdogScript = loadTextContent('../scripts/azure/autopause-watchdog.sh')

resource env 'Microsoft.App/managedEnvironments@2023-05-01' existing = {
  name: environmentName
}

resource frontend 'Microsoft.App/containerApps@2023-05-01' existing = {
  name: frontendAppName
}

resource kv 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVaultName
}

resource watchdogIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-autopause-watchdog'
  location: location
}

resource contributorAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, watchdogIdentity.id, 'contributor')
  properties: {
    roleDefinitionId: contributorRoleId
    principalId: watchdogIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// Key Vault is in access-policy mode: grant the watchdog identity `get` on secrets (append-only).
resource kvPolicy 'Microsoft.KeyVault/vaults/accessPolicies@2023-07-01' = {
  parent: kv
  name: 'add'
  properties: {
    accessPolicies: [
      {
        tenantId: subscription().tenantId
        objectId: watchdogIdentity.properties.principalId
        permissions: {
          secrets: [ 'get' ]
        }
      }
    ]
  }
}

resource watchdog 'Microsoft.App/jobs@2023-05-01' = {
  name: 'autopause-watchdog'
  location: location
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${watchdogIdentity.id}': {}
    }
  }
  properties: {
    environmentId: env.id
    configuration: {
      triggerType: 'Schedule'
      replicaTimeout: 900
      replicaRetryLimit: 0
      scheduleTriggerConfig: {
        cronExpression: cronExpression
        parallelism: 1
        replicaCompletionCount: 1
      }
    }
    template: {
      containers: [
        {
          name: 'watchdog'
          image: watchdogImage
          command: [ '/bin/sh', '-c' ]
          // Decode the embedded script to a file and run it (base64 sidesteps shell quoting + CRLF).
          args: [
            format('printf %s {0} | base64 -d > /tmp/w.sh && /bin/sh /tmp/w.sh', base64(watchdogScript))
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'RESOURCE_GROUP', value: resourceGroup().name }
            { name: 'SUBSCRIPTION_ID', value: subscription().subscriptionId }
            { name: 'MI_CLIENT_ID', value: watchdogIdentity.properties.clientId }
            { name: 'FRONTEND_APP_NAME', value: frontendAppName }
            { name: 'FRONTEND_RESOURCE_ID', value: frontend.id }
            { name: 'IDLE_MINUTES', value: string(idleMinutes) }
            { name: 'KEY_VAULT_NAME', value: keyVaultName }
            { name: 'GATEWAY_TOKEN_SECRET', value: gatewayTokenSecretName }
            { name: 'SNAPSHOT_STORAGE_ACCOUNT', value: snapshotStorageAccount }
            { name: 'SNAPSHOT_SHARE', value: snapshotShare }
            { name: 'TEMPORAL_LOAD_URL', value: 'http://temporal-job/temporal/load' }
            { name: 'DRY_RUN', value: dryRun ? 'true' : 'false' }
            { name: 'AZURE_EXTENSION_USE_DYNAMIC_INSTALL', value: 'yes_without_prompt' }
          ]
        }
      ]
    }
  }
  dependsOn: [
    contributorAssignment
    kvPolicy
  ]
}

output identityPrincipalId string = watchdogIdentity.properties.principalId
output jobName string = watchdog.name
