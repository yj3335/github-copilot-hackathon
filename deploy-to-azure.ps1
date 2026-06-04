$TIMESTAMP = Get-Date -Format "yyyyMMddHHmmss"
$IMAGE_NAME = "pdftoolkitregistry.azurecr.io/landing-page:$TIMESTAMP"

Write-Host "1. Logging into Azure Container Registry..."
az acr login --name pdftoolkitregistry

Write-Host "`n2. Building the Docker image with the latest UI and Extension packages (Tag: $TIMESTAMP)..."
docker build -f infra/Dockerfile -t $IMAGE_NAME .

Write-Host "`n3. Pushing image to Azure..."
docker push $IMAGE_NAME

Write-Host "`n4. Restarting the Azure Container App to apply changes..."
az containerapp update -n pdf-toolkit-landing-page -g pdf-toolkit-rg --image $IMAGE_NAME

Write-Host "`nDeployment Complete! The Azure Container App is now running your newest code."
