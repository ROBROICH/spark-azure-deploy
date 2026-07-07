// Remaining stateless-data infra containers: Qdrant, MinIO (S3), SpiceDB.
// All use TCP ingress with exposedPort=targetPort so in-environment DNS matches the original
// docker-compose hostnames/ports (qdrant:6333, minio:9000, spicedb:50051) — no app config change.
// Ephemeral storage, min-1 (demo). Buckets are (re)created by a separate minio-init job.
param location string = resourceGroup().location
param environmentName string = 'cae-spark-demo'

@secure()
param s3AccessKey string

@secure()
param s3SecretKey string

@secure()
param spicedbToken string

resource env 'Microsoft.App/managedEnvironments@2023-05-01' existing = {
  name: environmentName
}

resource qdrant 'Microsoft.App/containerApps@2023-05-01' = {
  name: 'qdrant'
  location: location
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: false
        transport: 'tcp'
        targetPort: 6333
        exposedPort: 6333
      }
    }
    template: {
      containers: [
        {
          name: 'qdrant'
          image: 'qdrant/qdrant:v1.17.1'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 1
      }
    }
  }
}

resource minio 'Microsoft.App/containerApps@2023-05-01' = {
  name: 'minio'
  location: location
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: false
        transport: 'tcp'
        targetPort: 9000
        exposedPort: 9000
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
          name: 'minio'
          image: 'minio/minio'
          // entrypoint prepends `minio`, so args become `minio server /data --console-address :9001`
          args: [
            'server'
            '/data'
            '--console-address'
            ':9001'
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            {
              name: 'MINIO_ROOT_USER'
              secretRef: 's3-access-key'
            }
            {
              name: 'MINIO_ROOT_PASSWORD'
              secretRef: 's3-secret-key'
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

resource spicedb 'Microsoft.App/containerApps@2023-05-01' = {
  name: 'spicedb'
  location: location
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: false
        transport: 'tcp'
        targetPort: 50051
        exposedPort: 50051
      }
      secrets: [
        {
          name: 'spicedb-token'
          value: spicedbToken
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'spicedb'
          image: 'authzed/spicedb:v1.49.0'
          command: [
            'spicedb'
          ]
          args: [
            'serve'
            '--datastore-engine=memory'
            '--grpc-preshared-key=$(ZED_TOKEN)'
          ]
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            {
              name: 'ZED_TOKEN'
              secretRef: 'spicedb-token'
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
