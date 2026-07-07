// Public MinIO reverse proxy (nginx) with external HTTPS ingress. Fronts the internal
// minio:9000 S3 API so the browser can PUT/GET documents via presigned URLs. The nginx
// config is injected as a Secret volume (no custom image needed).
param location string = resourceGroup().location
param environmentName string = 'cae-spark-demo'

@secure()
param nginxConf string

resource env 'Microsoft.App/managedEnvironments@2023-05-01' existing = {
  name: environmentName
}

resource minioPublic 'Microsoft.App/containerApps@2023-05-01' = {
  name: 'minio-public'
  location: location
  properties: {
    managedEnvironmentId: env.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 80
        transport: 'http'
        allowInsecure: false
      }
      secrets: [
        { name: 'nginx-conf', value: nginxConf }
      ]
    }
    template: {
      containers: [
        {
          name: 'nginx'
          image: 'nginx:1.27-alpine'
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          volumeMounts: [
            { volumeName: 'conf', mountPath: '/etc/nginx/conf.d' }
          ]
        }
      ]
      volumes: [
        {
          name: 'conf'
          storageType: 'Secret'
          secrets: [
            { secretRef: 'nginx-conf', path: 'default.conf' }
          ]
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 1 }
    }
  }
}

output fqdn string = minioPublic.properties.configuration.ingress.fqdn
output url string = 'https://${minioPublic.properties.configuration.ingress.fqdn}'
