param location string = resourceGroup().location
param storageAccountName string = take('pdfstore${uniqueString(resourceGroup().id)}', 24)
param cdnProfileName string = 'pdf-toolkit-afd'
param cdnEndpointName string = 'pdf-toolkit-endpoint'

// Storage Account for hosting extension packages
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: true
  }
}

// Blob Service and Container
resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
}

resource container 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: 'packages'
  properties: {
    publicAccess: 'Blob'
  }
}

// Azure Front Door Profile
resource profile 'Microsoft.Cdn/profiles@2023-05-01' = {
  name: cdnProfileName
  location: 'global'
  sku: {
    name: 'Standard_AzureFrontDoor'
  }
}

// Azure Front Door Endpoint
resource endpoint 'Microsoft.Cdn/profiles/afdEndpoints@2023-05-01' = {
  parent: profile
  name: cdnEndpointName
  location: 'global'
  properties: {
    enabledState: 'Enabled'
  }
}

// Azure Front Door Origin Group
resource originGroup 'Microsoft.Cdn/profiles/afdOriginGroups@2023-05-01' = {
  parent: profile
  name: 'default-origin-group'
  properties: {
    loadBalancingSettings: {
      sampleSize: 4
      successfulSamplesRequired: 3
    }
    healthProbeSettings: {
      probePath: '/'
      probeRequestType: 'HEAD'
      probeProtocol: 'Https'
      probeIntervalInSeconds: 100
    }
  }
}

// Azure Front Door Origin
resource origin 'Microsoft.Cdn/profiles/afdOriginGroups/afdOrigins@2023-05-01' = {
  parent: originGroup
  name: 'blob-origin'
  properties: {
    hostName: replace(replace(storageAccount.properties.primaryEndpoints.blob, 'https://', ''), '/', '')
    httpPort: 80
    httpsPort: 443
    originHostHeader: replace(replace(storageAccount.properties.primaryEndpoints.blob, 'https://', ''), '/', '')
    priority: 1
    weight: 1000
    enabledState: 'Enabled'
  }
}

// Azure Front Door Route
resource route 'Microsoft.Cdn/profiles/afdEndpoints/routes@2023-05-01' = {
  parent: endpoint
  name: 'default-route'
  dependsOn: [
    origin
  ]
  properties: {
    originGroup: {
      id: originGroup.id
    }
    supportedProtocols: [
      'Http'
      'Https'
    ]
    patternsToMatch: [
      '/*'
    ]
    forwardingProtocol: 'HttpsOnly'
    linkToDefaultDomain: 'Enabled'
    httpsRedirect: 'Enabled'
  }
}

output storageAccountName string = storageAccount.name
output cdnEndpointHostName string = endpoint.properties.hostName
