// SPARK demo — foundations for `azd up`.
//
// Resource-group scoped. Provisions only the base resources the app-tier
// orchestrator (scripts/azure/deploy-all.ps1, run as an azd postprovision hook)
// depends on: Log Analytics, the Azure Container Apps managed environment, a
// Key Vault for secrets, a Storage account (golden-snapshot seed + snapshots
// share), and — for the maintainer image-build path only — an optional ACR.
//
// Customer deployments pull pre-built PUBLIC images (GHCR, produced by the
// sync-and-build pipeline) and set deployRegistry=false, so no ACR is billed.
//
// The stores, jobs, auth, app services, frontend and seed are deployed by
// deploy-all.ps1 (which reuses the proven per-component Bicep + scripts),
// reading the outputs below from the azd environment.

targetScope = 'resourceGroup'

@description('Environment base name (azd env name). Drives resource names.')
param environmentName string

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Object id of the deploying principal (azd sets AZURE_PRINCIPAL_ID); granted Key Vault secret access. Empty = no access policy (e.g. CI service principal added later).')
param principalId string = ''

@description('Create a container registry (maintainer build path). Set to "false" for customer GHCR deployments (public images, no ACR).')
param deployRegistry string = 'true'
var createRegistry = toLower(deployRegistry) == 'true'

@description('Monthly cost budget for this resource group, in the billing currency. 0 disables the budget.')
param monthlyBudgetAmount int = 500

@description('Comma-separated emails alerted at 80% actual / 100% forecast spend. Empty disables the budget.')
param budgetAlertEmailsCsv string = ''

@description('Budget start date (first of the current month). Defaults via utcNow(); do not set manually.')
param budgetStartDate string = '${utcNow('yyyy-MM')}-01T00:00:00Z'

var resourceToken = toLower(uniqueString(subscription().id, environmentName, location))
var tags = {
  'azd-env-name': environmentName
  workload: 'spark-demo'
}

resource law 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: 'log-${environmentName}'
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource acaEnv 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: 'cae-${environmentName}'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: law.properties.customerId
        sharedKey: law.listKeys().primarySharedKey
      }
    }
  }
}

resource kv 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: 'kv-${resourceToken}'
  location: location
  tags: tags
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    // Access-policy mode (not RBAC) to match the deploy scripts, which read/write
    // secrets with `az keyvault secret show/set` under the deploying principal.
    enableRbacAuthorization: false
    accessPolicies: empty(principalId) ? [] : [
      {
        tenantId: subscription().tenantId
        objectId: principalId
        permissions: {
          secrets: [ 'get', 'list', 'set', 'delete' ]
        }
      }
    ]
  }
}

resource storage 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: 'st${resourceToken}'
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
  }
}

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = if (createRegistry) {
  name: 'acr${resourceToken}'
  location: location
  tags: tags
  sku: {
    name: 'Standard'
  }
  properties: {
    adminUserEnabled: true
  }
}

// Cost guardrail: an RG-scoped monthly budget with actual/forecast email alerts.
// Enabled only when at least one alert email is supplied (a budget without a
// notification target is not useful). OpenAI token spend is billed separately by
// the LLM provider and is not covered here - keep the provider-side cap too.
var budgetEmails = empty(budgetAlertEmailsCsv) ? [] : split(budgetAlertEmailsCsv, ',')
resource budget 'Microsoft.Consumption/budgets@2023-05-01' = if (monthlyBudgetAmount > 0 && !empty(budgetEmails)) {
  name: 'budget-${environmentName}'
  properties: {
    category: 'Cost'
    amount: monthlyBudgetAmount
    timeGrain: 'Monthly'
    timePeriod: {
      startDate: budgetStartDate
    }
    notifications: {
      actual80: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 80
        contactEmails: budgetEmails
        thresholdType: 'Actual'
      }
      forecast100: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 100
        contactEmails: budgetEmails
        thresholdType: 'Forecasted'
      }
    }
  }
}

// Outputs are captured by azd into the environment (.azure/<env>/.env) and read
// by deploy-all.ps1 as SPARK_* / AZURE_* variables.
output AZURE_LOCATION string = location
output SPARK_ENVIRONMENT_NAME string = acaEnv.name
output SPARK_ENVIRONMENT_DOMAIN string = acaEnv.properties.defaultDomain
output SPARK_LOG_ANALYTICS_CUSTOMER_ID string = law.properties.customerId
output SPARK_KEY_VAULT_NAME string = kv.name
output SPARK_STORAGE_ACCOUNT string = storage.name
output SPARK_ACR_NAME string = createRegistry ? acr!.name : ''
output SPARK_ACR_LOGIN_SERVER string = createRegistry ? acr!.properties.loginServer : ''
