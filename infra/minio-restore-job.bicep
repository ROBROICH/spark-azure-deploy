// One-off MinIO restore job: mirrors the staged dms-local objects into the internal Azure MinIO.
// Single-line command (CRLF-safe). Mounts the `migration` share; creds from Key Vault.
param location string = resourceGroup().location
param environmentName string = 'cae-spark-demo'

@secure()
param s3AccessKey string
@secure()
param s3SecretKey string

resource env 'Microsoft.App/managedEnvironments@2023-05-01' existing = {
  name: environmentName
}

resource minioRestore 'Microsoft.App/jobs@2023-05-01' = {
  name: 'minio-restore'
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
      secrets: [
        { name: 's3-access-key', value: s3AccessKey }
        { name: 's3-secret-key', value: s3SecretKey }
      ]
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
          image: 'minio/mc'
          command: [ '/bin/sh', '-c' ]
          args: [
            'until mc alias set az http://minio:9000 "$S3_KEY" "$S3_SECRET" >/dev/null 2>&1; do echo waiting-minio; sleep 2; done; mc mb -p az/dms-local || true; mc mirror --overwrite /migration/minio/dms-local az/dms-local; echo COUNT:; mc ls --recursive az/dms-local | wc -l; echo minio-restore-done'
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'S3_KEY', secretRef: 's3-access-key' }
            { name: 'S3_SECRET', secretRef: 's3-secret-key' }
          ]
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
