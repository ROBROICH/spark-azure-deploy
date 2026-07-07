// One-off verification job: confirms restored databases exist and embedding tables have rows.
// Connects to the internal `postgresql` container app. Single-line command (CRLF-safe).
param location string = resourceGroup().location
param environmentName string = 'cae-spark-demo'

@secure()
param dbPassword string

resource env 'Microsoft.App/managedEnvironments@2023-05-01' existing = {
  name: environmentName
}

resource pgVerify 'Microsoft.App/jobs@2023-05-01' = {
  name: 'pg-verify'
  location: location
  properties: {
    environmentId: env.id
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 300
      replicaRetryLimit: 0
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
      containers: [
        {
          name: 'verify'
          image: 'pgvector/pgvector:pg16'
          command: [
            '/bin/sh'
            '-c'
          ]
          args: [
            'export PGPASSWORD="$DB_PASSWORD"; echo DBCOUNT:; psql -h postgresql -U postgres -tAc "SELECT count(*) FROM pg_database WHERE datname NOT LIKE \'template%\'"; echo NORMS:; psql -h postgresql -U postgres -d gesetze-normen -tAc "SELECT count(*) FROM norm" 2>&1; echo BEGR_CHUNK:; psql -h postgresql -U postgres -d begruendungen-db -tAc "SELECT count(*) FROM chunk" 2>&1; echo JURA_CHUNKS:; psql -h postgresql -U postgres -d jura-db -tAc "SELECT count(*) FROM chunks" 2>&1; echo PROJECT_TABLES:; psql -h postgresql -U postgres -d project_logic -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema=\'public\'" 2>&1; echo verify-done'
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            {
              name: 'DB_PASSWORD'
              secretRef: 'db-password'
            }
          ]
        }
      ]
    }
  }
}
