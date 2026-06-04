param (
    [Parameter(Mandatory=$true)]
    [string]$StorageAccountName,

    [Parameter(Mandatory=$true)]
    [string]$CdnProfileName,

    [Parameter(Mandatory=$true)]
    [string]$CdnEndpointName,

    [Parameter(Mandatory=$true)]
    [string]$Version,

    [string]$ResourceGroup = "pdf-toolkit-rg"
)

$ErrorActionPreference = "Stop"

Write-Host "Publishing extension packages version $Version to Azure Storage..."

# Define the local build output folder and the remote destination path
$LocalPath = ".\apps\extension\dist"
$RemotePath = "packages/v$Version"

# Upload to Blob Storage Container 'packages'
# Note: Using az storage blob directory upload or sync (requires Azure CLI)
Write-Host "Uploading to Blob Storage: $StorageAccountName"
az storage blob upload-batch `
    --account-name $StorageAccountName `
    --destination "packages" `
    --destination-path $RemotePath `
    --source $LocalPath `
    --auth-mode login

Write-Host "Upload complete."

Write-Host "Publish complete! Version $Version is now live at https://$StorageAccountName.blob.core.windows.net/packages/v$Version"
