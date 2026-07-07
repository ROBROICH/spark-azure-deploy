// One-shot job that writes the SpiceDB schema (see infra/spicedb-schema.zed) directly to the
// in-memory SpiceDB over plaintext gRPC. Needed because SpiceDB is ephemeral while
// identity-management records applied schema migrations in Postgres, so it won't re-write the
// schema after a SpiceDB restart. Re-run this job whenever SpiceDB has restarted.
param location string = resourceGroup().location
param environmentName string = 'cae-spark-demo'

@secure()
param spicedbToken string

@secure()
param schemaText string

resource env 'Microsoft.App/managedEnvironments@2023-05-01' existing = {
  name: environmentName
}

resource spicedbSchema 'Microsoft.App/jobs@2023-05-01' = {
  name: 'spicedb-schema'
  location: location
  properties: {
    environmentId: env.id
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 180
      replicaRetryLimit: 3
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
      }
      secrets: [
        { name: 'zed-token', value: spicedbToken }
        { name: 'schema', value: schemaText }
      ]
    }
    template: {
      containers: [
        {
          name: 'zed'
          image: 'authzed/zed:latest'
          args: [
            'schema'
            'write'
            '/schema/schema.zed'
            '--endpoint'
            'spicedb:50051'
            '--token'
            '$(ZED_TOKEN)'
            '--insecure'
          ]
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            { name: 'ZED_TOKEN', secretRef: 'zed-token' }
          ]
          volumeMounts: [
            { volumeName: 'schemavol', mountPath: '/schema' }
          ]
        }
      ]
      volumes: [
        {
          name: 'schemavol'
          storageType: 'Secret'
          secrets: [
            { secretRef: 'schema', path: 'schema.zed' }
          ]
        }
      ]
    }
  }
}
