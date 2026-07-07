// Temporal server (auto-setup) as an ACA container app, backed by the postgresql container app.
// auto-setup waits for the DB, creates the temporal + temporal_visibility databases, runs schema
// setup, starts the server, and creates the default namespace. Internal TCP ingress on 7233.
param location string = resourceGroup().location
param environmentName string = 'cae-spark-demo'

@secure()
param dbPassword string

resource env 'Microsoft.App/managedEnvironments@2023-05-01' existing = {
  name: environmentName
}

resource temporal 'Microsoft.App/containerApps@2023-05-01' = {
  name: 'temporal'
  location: location
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: false
        transport: 'tcp'
        targetPort: 7233
        exposedPort: 7233
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
          name: 'temporal'
          image: 'temporalio/auto-setup:1.29.0'
          resources: {
            cpu: json('1.0')
            memory: '2Gi'
          }
          env: [
            { name: 'DB', value: 'postgres12' }
            { name: 'DB_PORT', value: '5432' }
            { name: 'POSTGRES_USER', value: 'postgres' }
            { name: 'POSTGRES_PWD', secretRef: 'db-password' }
            { name: 'POSTGRES_SEEDS', value: 'postgresql' }
            { name: 'BIND_ON_IP', value: '0.0.0.0' }
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

output fqdn string = temporal.properties.configuration.ingress.fqdn
