// PostgreSQL (pgvector) as an ACA container app.
// Demo choice: min-1 with the container's ephemeral filesystem (no Azure Files mount) — Postgres
// does not run reliably with its data dir on SMB. Data persists for the life of the replica and is
// re-seeded on boot, which is acceptable for a non-prod demo. Backs both the app and Temporal.
param location string = resourceGroup().location
param environmentName string = 'cae-spark-demo'

@secure()
param dbPassword string

resource env 'Microsoft.App/managedEnvironments@2023-05-01' existing = {
  name: environmentName
}

resource pg 'Microsoft.App/containerApps@2023-05-01' = {
  name: 'postgresql'
  location: location
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: false
        transport: 'tcp'
        targetPort: 5432
        exposedPort: 5432
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
          name: 'postgresql'
          image: 'pgvector/pgvector:pg16'
          resources: {
            cpu: json('1.0')
            memory: '2Gi'
          }
          env: [
            {
              name: 'POSTGRES_USER'
              value: 'postgres'
            }
            {
              name: 'POSTGRES_PASSWORD'
              secretRef: 'db-password'
            }
            {
              name: 'POSTGRES_DB'
              value: 'postgres'
            }
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

output fqdn string = pg.properties.configuration.ingress.fqdn
