$ResourceGroup = "pdf-toolkit-rg"
$ProfileName = "pdf-toolkit-afd"
$EndpointName = "pdf-toolkit-endpoint"
$OriginGroupName = "default-origin-group"
$OriginName = "blob-origin"
$RouteName = "default-route"

# 1. Create Storage Account
$StorageAccountName = "pdfstore" + (-join ((65..90) + (97..122) | Get-Random -Count 10 | % {[char]$_})).ToLower()
Write-Host "Creating Storage Account: $StorageAccountName"
az storage account create --name $StorageAccountName --resource-group $ResourceGroup --location eastus --sku Standard_LRS --allow-blob-public-access true

Write-Host "Creating Blob Container 'packages'"
az storage container create --name packages --account-name $StorageAccountName --public-access blob

# Get Storage Hostname
$StorageHostname = (az storage account show --name $StorageAccountName --resource-group $ResourceGroup --query primaryEndpoints.blob -o tsv) -replace "https://", "" -replace "/", ""

# 2. Create Azure Front Door Profile
Write-Host "Creating Azure Front Door Profile"
az afd profile create --profile-name $ProfileName --resource-group $ResourceGroup --sku Standard_AzureFrontDoor

# 3. Create Endpoint
Write-Host "Creating AFD Endpoint"
az afd endpoint create --resource-group $ResourceGroup --profile-name $ProfileName --endpoint-name $EndpointName

# 4. Create Origin Group
Write-Host "Creating AFD Origin Group"
az afd origin-group create --resource-group $ResourceGroup --profile-name $ProfileName --origin-group-name $OriginGroupName --probe-request-type HEAD --probe-protocol Https --probe-interval-in-seconds 100 --probe-path /

# 5. Create Origin (Points to Storage Account)
Write-Host "Creating AFD Origin"
az afd origin create --resource-group $ResourceGroup --host-name $StorageHostname --profile-name $ProfileName --origin-group-name $OriginGroupName --origin-name $OriginName --origin-host-header $StorageHostname --priority 1 --weight 1000 --enabled-state Enabled --http-port 80 --https-port 443

# 6. Create Route
Write-Host "Creating AFD Route"
az afd route create --resource-group $ResourceGroup --profile-name $ProfileName --endpoint-name $EndpointName --forwarding-protocol MatchRequest --route-name $RouteName --https-redirect Enabled --origin-group $OriginGroupName --supported-protocols Http Https --link-to-default-domain Enabled

Write-Host "Deployment Complete!"
Write-Host "Storage Account: $StorageAccountName"
Write-Host "Front Door Endpoint: $EndpointName.azurefd.net"
