"""
Pipeline automation endpoint.

POST /api/pipeline/run-all   - run the full pipeline end-to-end for a client
POST /api/pipeline/run-step  - run a single named step
GET  /api/pipeline/run-status/{run_id} - poll automation run status
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.db.session import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/pipeline", tags=["pipeline"])

STEPS = ["icp_scout", "buyer_intel", "signal_intel", "cp2_auto_approve", "verifier", "storyteller"]


class RunAllRequest(BaseModel):
    client_id: str
    steps: list[str] | None = None


class RunStepRequest(BaseModel):
    client_id: str
    step: Literal["icp_scout", "buyer_intel", "signal_intel", "cp2_auto_approve", "verifier", "storyteller"]


def _db_set(run_id: str, **kwargs: Any) -> None:
    """Update pipeline run record in DB — survives server restarts."""
    from backend.db.session import SessionLocal
    from backend.db.models import PipelineRunRecord
    db = SessionLocal()
    try:
        rec = db.query(PipelineRunRecord).filter(PipelineRunRecord.id == run_id).first()
        if rec:
            for k, v in kwargs.items():
                setattr(rec, k, v)
            rec.updated_at = datetime.now(tz=timezone.utc)
            db.commit()
    except Exception as exc:
        logger.warning("_db_set failed for run_id=%s: %s", run_id, exc)
    finally:
        db.close()


async def _run_icp_scout(client_id: str, db: Session) -> str:
    from backend.agents.icp_scout.agent import ICPScoutAgent
    from backend.db.models import ICPRunRecord, MasterContextRecord, ICPAccountRecord
    from backend.schemas.models import ICPAccountList, MasterContext
    import uuid as _uuid

    mc = db.query(MasterContextRecord).filter(
        MasterContextRecord.client_id == client_id
    ).order_by(MasterContextRecord.created_at.desc()).first()
    if not mc:
        raise ValueError(f"No MasterContext for client_id={client_id}")

    run_id = str(_uuid.uuid4())
    run_record = ICPRunRecord(
        id=run_id, client_id=client_id,
        started_at=datetime.now(tz=timezone.utc), status="running",
    )
    db.add(run_record)
    db.commit()

    master_context = MasterContext.model_validate(mc.data)
    agent = ICPScoutAgent()
    result: ICPAccountList = await agent.run(master_context)

    for account in result.accounts:
        existing = db.query(ICPAccountRecord).filter(
            ICPAccountRecord.client_id == client_id,
            ICPAccountRecord.domain == account.domain,
        ).first()
        if not existing:
            db.add(ICPAccountRecord(
                id=str(_uuid.uuid4()), client_id=client_id, run_id=run_id,
                domain=account.domain, company_name=account.company_name,
                tier=account.tier.value, icp_score=account.icp_score,
                source=account.source.value, data=account.model_dump(mode="json"),
                is_removed=False,
            ))

    run_record.status = "complete"
    run_record.finished_at = datetime.now(tz=timezone.utc)
    run_record.total_found = result.meta.total_found
    db.commit()
    return f"{result.meta.total_found} accounts"


async def _run_buyer_intel(client_id: str) -> str:
    from backend.api.routes.buyers import _run_buyer_intel as _do
    await _do(client_id, str(uuid.uuid4()))
    return "buyer intel complete"


async def _run_signal_intel(client_id: str) -> str:
    from backend.api.routes.signals import _run_signal_intel as _do
    await _do(client_id, str(uuid.uuid4()))
    return "signal intel complete"


async def _run_cp2_auto(client_id: str, db: Session) -> str:
    from backend.agents.cp2.state_manager import auto_approve_cp2
    auto_approve_cp2(client_id=client_id, reviewer="auto-pipeline", db=db)
    return "CP2 auto-approved"


async def _run_verifier(client_id: str) -> str:
    from backend.api.routes.verify import _run_verify
    await _run_verify(client_id, str(uuid.uuid4()))
    return "verification complete"


async def _run_storyteller(client_id: str, db: Session) -> str:
    from backend.agents.storyteller.agent import StorytellerAgent
    StorytellerAgent(db).run(client_id, "all")
    return "storyteller complete"


async def _execute_pipeline(run_id: str, client_id: str, steps: list[str]) -> None:
    from backend.db.session import SessionLocal
    db = SessionLocal()
    try:
        _db_set(run_id, status="running", current_step=None, error=None,
                started_at=datetime.now(tz=timezone.utc))

        step_fns = {
            "icp_scout":        lambda: _run_icp_scout(client_id, db),
            "buyer_intel":      lambda: _run_buyer_intel(client_id),
            "signal_intel":     lambda: _run_signal_intel(client_id),
            "cp2_auto_approve": lambda: _run_cp2_auto(client_id, db),
            "verifier":         lambda: _run_verifier(client_id),
            "storyteller":      lambda: _run_storyteller(client_id, db),
        }

        completed: list[str] = []
        for step in steps:
            if step not in step_fns:
                logger.warning("Pipeline: unknown step %s — skipping", step)
                continue
            _db_set(run_id, current_step=step)
            logger.info("Pipeline run_id=%s: starting step=%s", run_id, step)
            try:
                result = await step_fns[step]()
                completed.append(step)
                _db_set(run_id, completed_steps=list(completed))
                logger.info("Pipeline run_id=%s: step=%s done — %s", run_id, step, result)
            except Exception as exc:
                logger.error("Pipeline run_id=%s: step=%s FAILED: %s", run_id, step, exc)
                _db_set(run_id, status="failed", current_step=None, error=f"{step}: {exc}")
                return

        _db_set(run_id, status="complete", current_step=None,
                updated_at=datetime.now(tz=timezone.utc))
        logger.info("Pipeline run_id=%s: all steps complete", run_id)
    except Exception as exc:
        logger.exception("Pipeline run_id=%s: unexpected error", run_id)
        _db_set(run_id, status="failed", error=str(exc))
    finally:
        db.close()


@router.post("/run-all")
async def run_all(
    body: RunAllRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    from backend.db.models import PipelineRunRecord
    steps = body.steps or STEPS
    run_id = str(uuid.uuid4())
    db.add(PipelineRunRecord(
        id=run_id, client_id=body.client_id,
        status="queued", steps=steps, completed_steps=[],
    ))
    db.commit()
    background_tasks.add_task(_execute_pipeline, run_id, body.client_id, steps)
    return {"run_id": run_id, "status": "queued", "steps": steps,
            "message": f"Pipeline started. Poll /api/pipeline/run-status/{run_id} for progress."}


@router.post("/run-step")
async def run_step(
    body: RunStepRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    from backend.db.models import PipelineRunRecord
    run_id = str(uuid.uuid4())
    db.add(PipelineRunRecord(
        id=run_id, client_id=body.client_id,
        status="queued", steps=[body.step], completed_steps=[],
    ))
    db.commit()
    background_tasks.add_task(_execute_pipeline, run_id, body.client_id, [body.step])
    return {"run_id": run_id, "status": "queued", "step": body.step,
            "message": f"Step '{body.step}' queued."}


@router.get("/run-status/{run_id}")
def run_status(run_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    from backend.db.models import PipelineRunRecord
    rec = db.query(PipelineRunRecord).filter(PipelineRunRecord.id == run_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail=f"run_id={run_id!r} not found")
    return {
        "run_id": run_id,
        "client_id": rec.client_id,
        "status": rec.status,
        "steps": rec.steps,
        "completed_steps": rec.completed_steps,
        "current_step": rec.current_step,
        "error": rec.error,
        "started_at": rec.started_at.isoformat() if rec.started_at else None,
        "updated_at": rec.updated_at.isoformat() if rec.updated_at else None,
    }
