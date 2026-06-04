Write-Host "1. Installing any new dependencies..."
npm install

Write-Host "`n2. Rebuilding browser extensions..."
cd apps\extension
npm run package:browsers
cd ..\..

Write-Host "`n3. Copying extension packages to the landing page server..."
Copy-Item "apps\extension\dist-packages\*.zip" -Destination "apps\landing-page\public\packages\" -Force

Write-Host "`nDone! The local landing page is now serving your latest updates."
