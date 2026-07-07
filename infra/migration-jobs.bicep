// Data migration restore job.
// Mounts the `migration` Azure Files share (staged pg_dump files) and restores each database
// into the internal `postgresql` container app. `createdb` also provisions the databases the app
// services expect. Idempotent (--clean --if-exists). Triggered via `az rest .../start`.
param location string = resourceGroup().location
param environmentName string = 'cae-spark-demo'

@secure()
param dbPassword string

resource env 'Microsoft.App/managedEnvironments@2023-05-01' existing = {
  name: environmentName
}

resource pgRestore 'Microsoft.App/jobs@2023-05-01' = {
  name: 'pg-restore'
  location: location
  properties: {
    environmentId: env.id
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 1800
      replicaRetryLimit: 1
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
      }
      secrets: [
        {
          name: 'db-password'
          value: dbPassword
        }
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
          image: 'pgvector/pgvector:pg16'
          command: [
            '/bin/sh'
            '-c'
          ]
          args: [
            'export PGPASSWORD="$DB_PASSWORD"; until pg_isready -h postgresql -U postgres; do echo waiting-for-postgres; sleep 2; done; for f in /migration/pg/*.dump; do db=$(basename "$f" .dump); echo restoring-$db; createdb -h postgresql -U postgres "$db" 2>/dev/null || true; pg_restore -h postgresql -U postgres -d "$db" --no-owner --no-privileges --clean --if-exists "$f" || true; done; echo pg-restore-done'
          ]
          resources: {
            cpu: json('1.0')
            memory: '2Gi'
          }
          env: [
            {
              name: 'DB_PASSWORD'
              secretRef: 'db-password'
            }
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
