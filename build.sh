#!/bin/bash
set -e

echo ">>> Building React frontend..."
cd frontend
REACT_APP_API_BASE_URL="https://ops-bot-a2h3fkekhygtg4aj.eastus-01.azurewebsites.net" ./node_modules/.bin/react-scripts build
cd ..

echo ">>> Copying build to backend/static..."
rm -rf backend/static
cp -r frontend/build backend/static

echo ">>> Build complete. backend/ is ready to deploy to Azure App Service."
echo "    Startup command: uvicorn main:app --host 0.0.0.0 --port 8000"
