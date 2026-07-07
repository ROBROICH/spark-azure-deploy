// ACA managed environment (Consumption) + Log Analytics. No Azure Files storage.
// Cost-optimized demo: every stateful container (postgresql, qdrant, minio, spicedb, keycloak)
// already runs on the container's ephemeral filesystem — none mounts an SMB share — so no
// persistent Azure Files shares are provisioned or billed, and no storage-account key is needed.
// Deployed via `az deployment group create` because the `containerapp` CLI extension
// cannot be installed in this environment (bundled pip is broken). ARM/Bicep needs no extension.
param location string = resourceGroup().location
param environmentName string = 'cae-spark-demo'
param logAnalyticsName string = 'log-spark-demo'

resource law 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: logAnalyticsName
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource env 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: environmentName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: law.properties.customerId
        sharedKey: law.listKeys().primarySharedKey
      }
    }
  }
}

output environmentId string = env.id
output defaultDomain string = env.properties.defaultDomain
