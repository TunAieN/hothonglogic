#!/usr/bin/env bash
set -euo pipefail

# Script nay dung de Codex/nguoi dung tu tai anh ve local workspace.
# Neu Pexels doi cau truc URL, Codex can mo trang anh va lay file image goc tu page.

TARGET_DIR="customer-web/public/images/pricing"
TARGET_FILE="$TARGET_DIR/pricing-hero.jpg"
PAGE_URL="https://www.pexels.com/photo/business-man-writing-on-a-paper-6169170/"

mkdir -p "$TARGET_DIR"

echo "Open page: $PAGE_URL"
echo "Download the selected hero image from the page and save to: $TARGET_FILE"
echo "After downloading, optimize/compress if needed and keep a responsive display with object-fit: cover."
