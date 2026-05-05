# CrewAI Orchestration

This folder contains the CrewAI-based multi-agent coordination layer for the ABM engine.

## Setup

1. Create a virtual environment:

```bash
python -m venv venv
```

2. Activate the environment:

- Windows PowerShell:

```bash
venv\Scripts\Activate.ps1
```

- macOS/Linux:

```bash
source venv/bin/activate
```

3. Install dependencies:

```bash
pip install -r requirements.txt
```

4. Ensure `.env` contains:

- `ANTHROPIC_API_KEY=<your-key>`

5. Run the crew:

```bash
python crew.py
```
