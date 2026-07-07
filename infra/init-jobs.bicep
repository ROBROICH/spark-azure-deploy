// One-time init jobs (ACA Jobs, Manual trigger). Triggered via `az rest` POST .../start.
// - temporal-init: waits for Temporal SERVING, registers ProjectId/ProjectVersion search
//   attributes and sets namespace retention (required by the app workflows). Also verifies
//   Temporal actually connected to Postgres.
// - minio-init: creates the buckets the app expects. Also verifies MinIO is serving.
param location string = resourceGroup().location
param environmentName string = 'cae-spark-demo'

@secure()
param s3AccessKey string

@secure()
param s3SecretKey string

resource env 'Microsoft.App/managedEnvironments@2023-05-01' existing = {
  name: environmentName
}

resource temporalInit 'Microsoft.App/jobs@2023-05-01' = {
  name: 'temporal-init'
  location: location
  properties: {
    environmentId: env.id
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 600
      replicaRetryLimit: 3
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
      }
    }
    template: {
      containers: [
        {
          name: 'init'
          image: 'temporalio/admin-tools:1.29'
          command: [
            '/bin/sh'
            '-c'
          ]
          args: [
            'until temporal operator cluster health --address temporal:7233 | grep -q SERVING; do echo waiting-for-temporal; sleep 2; done; temporal operator search-attribute create --address temporal:7233 --namespace default --name ProjectId --type Keyword || true; temporal operator search-attribute create --address temporal:7233 --namespace default --name ProjectVersion --type Int || true; temporal operator namespace update --address temporal:7233 --namespace default --retention 60d || true; echo temporal-init-done'
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
        }
      ]
    }
  }
}

resource minioInit 'Microsoft.App/jobs@2023-05-01' = {
  name: 'minio-init'
  location: location
  properties: {
    environmentId: env.id
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 300
      replicaRetryLimit: 3
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
      }
      secrets: [
        {
          name: 's3-access-key'
          value: s3AccessKey
        }
        {
          name: 's3-secret-key'
          value: s3SecretKey
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'init'
          image: 'minio/mc'
          command: [
            '/bin/sh'
            '-c'
          ]
          args: [
            'until mc alias set local http://minio:9000 "$S3_ACCESS_KEY_ID" "$S3_SECRET_ACCESS_KEY"; do echo waiting-for-minio; sleep 2; done; mc mb -p local/dms-local || true; mc mb -p local/temporal-payloads || true; mc mb -p local/quarantine-bucket || true; echo minio-init-done'
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            {
              name: 'S3_ACCESS_KEY_ID'
              secretRef: 's3-access-key'
            }
            {
              name: 'S3_SECRET_ACCESS_KEY'
              secretRef: 's3-secret-key'
            }
          ]
        }
      ]
    }
  }
}
