// Durable staging layer for ephemeral-state snapshots.
// Provisions a single Azure Files share `snapshots` on the existing demo storage account and
// registers it as ACA managed-environment storage so the snapshot/rehydrate Jobs (snapshot-jobs.bicep)
// can mount it. This is the ONLY persistent volume in the demo; the data stores themselves stay
// ephemeral (min-1) and are captured/restored by the Jobs. Deploy this BEFORE snapshot-jobs.bicep.
param environmentName string = 'cae-spark-demo'
param storageAccountName string = 'stsparkdemo'
param shareName string = 'snapshots'
param shareQuotaGb int = 100

resource env 'Microsoft.App/managedEnvironments@2023-05-01' existing = {
  name: environmentName
}

resource sa 'Microsoft.Storage/storageAccounts@2023-01-01' existing = {
  name: storageAccountName
}

// `default` fileService already exists on the account; declaring it is idempotent.
resource fileService 'Microsoft.Storage/storageAccounts/fileServices@2023-01-01' = {
  parent: sa
  name: 'default'
}

resource share 'Microsoft.Storage/storageAccounts/fileServices/shares@2023-01-01' = {
  parent: fileService
  name: shareName
  properties: {
    shareQuota: shareQuotaGb
    enabledProtocols: 'SMB'
  }
}

resource snapshotsStorage 'Microsoft.App/managedEnvironments/storages@2023-05-01' = {
  parent: env
  name: 'snapshots'
  properties: {
    azureFile: {
      accountName: sa.name
      accountKey: sa.listKeys().keys[0].value
      shareName: shareName
      accessMode: 'ReadWrite'
    }
  }
  dependsOn: [
    share
  ]
}

output storageName string = snapshotsStorage.name
output shareName string = share.name
