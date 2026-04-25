# n8n Workflow Assets

This folder stores exported n8n workflow JSON definitions that back the ABM orchestration layer.

## Export from n8n UI

1. Open n8n UI at `http://localhost:5678`.
2. Open the workflow you want to export.
3. Click the workflow menu (top-right) and choose **Download** or **Export** as JSON.
4. Save the JSON file into this folder.

## Naming Convention

Use:

`[agent-name]_[action].workflow.json`

Examples:

- `icp-scout_account-discovery.workflow.json`
- `buyer-intel_committee-enrichment.workflow.json`
- `intake_context-parse.workflow.json`
