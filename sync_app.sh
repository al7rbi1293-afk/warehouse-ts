#!/bin/bash

# Auto-Sync Script for Warehouse App
# Usage: ./sync_app.sh "Optional commit message"

# Default message if none provided
MSG=${1:-"Auto-update: $(date '+%Y-%m-%d %H:%M:%S')"}

echo "🔄 Starting Sync Process..."

# 1. Add all changes (respecting .gitignore)
git add .

# 2. Commit changes
# Check if there are changes to commit
if git diff-index --quiet HEAD --; then
    echo "✅ No local changes to save."
else
    git commit -m "$MSG"
    echo "✅ Changes saved locally."
fi

# 3. Pull latest changes (auto-merge strategy set previously)
echo "⬇️  Pulling latest updates..."
git pull origin main

# 4. Push to GitHub
echo "⬆️  Pushing to GitHub..."
git push origin main

echo "🎉 Sync Complete! Your app is up to date."
