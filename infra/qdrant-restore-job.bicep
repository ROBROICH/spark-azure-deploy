// One-off Qdrant restore job: uploads the staged snapshot of the `data` collection into the
// internal Azure Qdrant via its snapshot-upload API (recreates the collection + 637 points).
// Single-line command (CRLF-safe). Mounts the `migration` Azure Files share.
param location string = resourceGroup().location
param environmentName string = 'cae-spark-demo'

resource env 'Microsoft.App/managedEnvironments@2023-05-01' existing = {
  name: environmentName
}

resource qdrantRestore 'Microsoft.App/jobs@2023-05-01' = {
  name: 'qdrant-restore'
  location: location
  properties: {
    environmentId: env.id
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 600
      replicaRetryLimit: 1
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
      }
    }
    template: {
      volumes: [
        {
          name: 'migration'
          storageType: 'AzureFile'
          storageName: 'migration'
        }
      ]
      containers: [
        {
          name: 'restore'
          image: 'curlimages/curl:8.11.1'
          command: [ '/bin/sh', '-c' ]
          args: [
            'until curl -sf http://qdrant:6333/ >/dev/null; do echo waiting-qdrant; sleep 2; done; echo uploading-snapshot; curl -sS -X POST "http://qdrant:6333/collections/data/snapshots/upload?priority=snapshot" -F "snapshot=@/migration/qdrant/data.snapshot"; echo; echo verify:; curl -sS http://qdrant:6333/collections/data; echo; echo qdrant-restore-done'
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          volumeMounts: [
            {
              volumeName: 'migration'
              mountPath: '/migration'
            }
          ]
        }
      ]
    }
  }
}
