// Public demo frontend: nginx SPA + /api gateway (built from Dockerfile.azure with base "/").
// External ingress. Runtime VITE_* values are injected by the image entrypoint.
param location string = resourceGroup().location
param environmentName string = 'cae-spark-demo'
param acrName string = 'acrsparkdemo'
param acrResourceGroup string = resourceGroup().name
param imageTag string = '0.2'
param revisionSuffix string = ''

@description('Public image registry prefix (e.g. ghcr.io/owner). When set, pull the public frontend image from here instead of the ACR. Empty = use the ACR.')
param imageRegistry string = ''

// Public MinIO reverse-proxy origin baked into the SPA for presigned upload/download CORS.
// Defaults to the live demo domain; override for a clone/QA env with a different ACA domain.
param minioPublicOrigin string = 'https://minio-public.example.invalid'

@secure()
param gatewayAuthToken string = ''

@description('Client IP CIDRs allowed to reach the public frontend. Empty = open to all (demo default).')
param allowedClientIps array = []

resource env 'Microsoft.App/managedEnvironments@2023-05-01' existing = { name: environmentName }

// Image source: a public registry (imageRegistry) when set, else the private ACR.
var useAcr = empty(imageRegistry)
resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = if (useAcr) {
  name: acrName
  scope: resourceGroup(acrResourceGroup)
}
var registryServer = useAcr ? acr!.properties.loginServer : imageRegistry
var feRegistries = useAcr ? [
  {
    server: acr!.properties.loginServer
    username: acr!.listCredentials().username
    passwordSecretRef: 'acr-pw'
  }
] : []
var feSecrets = union(useAcr ? [
  { name: 'acr-pw', value: acr!.listCredentials().passwords[0].value }
] : [], [
  { name: 'gateway-auth-token', value: gatewayAuthToken }
])

resource frontend 'Microsoft.App/containerApps@2023-05-01' = {
  name: 'frontend'
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
        // When allowedClientIps is non-empty, ACA denies everything else; empty = open (demo default).
        ipSecurityRestrictions: [for (ip, i) in allowedClientIps: {
          name: 'allow-${i}'
          ipAddressRange: ip
          action: 'Allow'
        }]
      }
      registries: feRegistries
      secrets: feSecrets
    }
    template: {
      revisionSuffix: revisionSuffix
      containers: [
        {
          name: 'frontend'
          image: '${registryServer}/frontend:${imageTag}'
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: [
            { name: 'VITE_API_BASE_URL', value: '/api' }
            { name: 'VITE_APP_BASE_PATH', value: '/app' }
            { name: 'VITE_TEMPORAL_UI_BASE_URL', value: '' }
            { name: 'VITE_ALLOWED_DOWNLOAD_ORIGINS', value: minioPublicOrigin }
            { name: 'VITE_ALLOWED_UPLOAD_ORIGINS', value: minioPublicOrigin }
            { name: 'VITE_SENTRY_DSN', value: '' }
            { name: 'VITE_SENTRY_ENVIRONMENT', value: 'azure-demo' }
            { name: 'GATEWAY_AUTH_TOKEN', secretRef: 'gateway-auth-token' }
          ]
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 1 }
    }
  }
}

output url string = 'https://${frontend.properties.configuration.ingress.fqdn}'
