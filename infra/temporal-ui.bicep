// Temporal Web UI (admin/monitoring) behind an nginx Basic-Auth sidecar, external HTTPS ingress.
// Container 'ui' runs the Temporal UI on :8080 and talks to the internal temporal:7233 frontend.
// Container 'auth' (nginx) is the ingress target (:80), enforces Basic Auth (credential from Key
// Vault, injected into the config), and reverse-proxies to the UI over localhost.
param location string = resourceGroup().location
param environmentName string = 'cae-spark-demo'

@secure()
param nginxConf string

resource env 'Microsoft.App/managedEnvironments@2023-05-01' existing = {
  name: environmentName
}

resource temporalUi 'Microsoft.App/containerApps@2023-05-01' = {
  name: 'temporal-ui'
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
          name: 'ui'
          image: 'temporalio/ui:2.44.1'
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: [
            { name: 'TEMPORAL_ADDRESS', value: 'temporal:7233' }
            { name: 'TEMPORAL_UI_PORT', value: '8080' }
            { name: 'TEMPORAL_CSRF_COOKIE_INSECURE', value: 'true' }
          ]
        }
        {
          name: 'auth'
          image: 'nginx:1.27-alpine'
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
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

output url string = 'https://${temporalUi.properties.configuration.ingress.fqdn}'
