#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-institute-481516}"
DISPLAY_NAME="${DISPLAY_NAME:-brulee-interview-gemini}"
SERVICE_NAME="generativelanguage.googleapis.com"

echo "Creating Brulee Gemini API key in project: ${PROJECT_ID}" >&2
echo "The key string will not be printed." >&2

gcloud services enable "${SERVICE_NAME}" --project="${PROJECT_ID}" --quiet >/dev/null

KEY_JSON="$(mktemp)"
chmod 600 "${KEY_JSON}"
trap 'rm -f "${KEY_JSON}"' EXIT

ACCESS_TOKEN="$(gcloud auth print-access-token --project="${PROJECT_ID}")"

curl -fsS \
  -X POST \
  "https://apikeys.googleapis.com/v2/projects/${PROJECT_ID}/locations/global/keys" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  --data "{\"displayName\":\"${DISPLAY_NAME}\",\"restrictions\":{\"apiTargets\":[{\"service\":\"${SERVICE_NAME}\"}]}}" \
  >"${KEY_JSON}"

KEY_NAME="$(
  gcloud services api-keys list \
    --project="${PROJECT_ID}" \
    --filter="displayName=${DISPLAY_NAME}" \
    --sort-by="~createTime" \
    --limit=1 \
    --format="value(name)"
)"

curl -fsS \
  "https://apikeys.googleapis.com/v2/${KEY_NAME}/keyString" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  >"${KEY_JSON}"

KEY_STRING="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["keyString"])' "${KEY_JSON}")"

if [[ -n "${SUPABASE_PROJECT_REF:-}" ]]; then
  supabase secrets set "GEMINI_API_KEY=${KEY_STRING}" --project-ref "${SUPABASE_PROJECT_REF}"
elif [[ -d "supabase/.temp" ]]; then
  supabase secrets set "GEMINI_API_KEY=${KEY_STRING}"
else
  echo "No Supabase project ref found. Set SUPABASE_PROJECT_REF and rerun:" >&2
  echo "  SUPABASE_PROJECT_REF=your-ref scripts/create-brulee-gemini-key.sh" >&2
  echo "Created key resource: ${KEY_NAME}" >&2
  exit 2
fi

echo "Created key resource: ${KEY_NAME}" >&2
echo "Stored key as Supabase secret: GEMINI_API_KEY" >&2
