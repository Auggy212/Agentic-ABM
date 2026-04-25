"""
Intake Agent — deterministic validation + rule-based clarifying questions.

NOT an LLM call. All logic is pure Python. Phase 1.5 will layer an LLM
conversational interface on top; this module remains the ground-truth validator.
"""

from __future__ import annotations

import csv
import io
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from pydantic import ValidationError

from backend.schemas.models import MasterContext
from backend.agents.intake import vague_detectors as vd

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------

@dataclass
class ValidationResult:
    valid: bool
    errors: List[Dict[str, Any]] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    clarifying_questions: List[Dict[str, str]] = field(default_factory=list)

    def add_error(self, field_path: str, message: str, code: str = "INVALID") -> None:
        self.errors.append({"field": field_path, "message": message, "code": code})
        self.valid = False

    def add_warning(self, message: str) -> None:
        self.warnings.append(message)

    def add_clarifying_question(self, field_path: str, question: str) -> None:
        self.clarifying_questions.append({"field": field_path, "question": question})


@dataclass
class CsvParseResult:
    rows: List[Dict[str, str]] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    valid: bool = True

    REQUIRED_COLUMNS = {"Company Name", "Website"}


# ---------------------------------------------------------------------------
# Intake Agent
# ---------------------------------------------------------------------------

class IntakeAgent:
    """
    Validates intake submissions and emits a complete MasterContext.

    Methods:
        validate()           — field-level validation + vague-value checks
        is_vague()           — single-field vagueness probe (for partial checks)
        build_master_context() — construct final MasterContext, fill meta
        parse_csv_upload()   — validate and parse the optional account list CSV
    """

    # -----------------------------------------------------------------------
    # Public API
    # -----------------------------------------------------------------------

    def validate(self, raw_submission: dict) -> ValidationResult:
        """
        Full validation pass over a raw submission dict.

        Steps:
        1. Pydantic structural validation (field types, enums, required fields)
        2. Vague-value heuristics that produce clarifying questions
        3. Cross-field consistency checks

        Returns a ValidationResult with errors, warnings, and clarifying questions.
        The submission is "complete" only when valid=True AND clarifying_questions=[].
        """
        result = ValidationResult(valid=True)
        confirmed_empty = bool(
            raw_submission.get("negative_icp_confirmed_empty", False)
        )

        # Step 1 — structural + type validation via Pydantic
        # We build a candidate dict (injecting a placeholder meta if absent)
        # so Pydantic can validate everything except meta, which we fill on build.
        candidate = self._inject_placeholder_meta(raw_submission)
        try:
            MasterContext.model_validate(candidate)
        except ValidationError as exc:
            for err in exc.errors():
                loc = ".".join(str(p) for p in err["loc"])
                result.add_error(loc, err["msg"], code=err["type"])

        # Step 2 — vague-value heuristics (run regardless of Pydantic result
        # so the UI can show all questions at once rather than one-at-a-time)
        self._run_vague_checks(raw_submission, result, confirmed_empty)

        # Step 3 — cross-field consistency
        self._cross_field_checks(raw_submission, result)

        return result

    def is_vague(self, field_name: str, value: Any) -> Optional[str]:
        """
        Probe a single field for vagueness.

        field_name uses dot notation: "icp.company_size_employees",
        "company.value_prop", "icp.negative_icp".

        Returns a clarifying question string, or None if the value is specific enough.
        """
        dispatch: dict = {
            "company.value_prop": lambda v: vd.check_value_prop(v) if isinstance(v, str) else None,
            "company.differentiators": lambda v: vd.check_differentiators(v) if isinstance(v, list) else None,
            "company.acv_range": lambda v: vd.check_acv_range(v) if isinstance(v, str) else None,
            "icp.industries": lambda v: vd.check_icp_industries(v) if isinstance(v, list) else None,
            "icp.company_size_employees": lambda v: vd.check_company_size_employees(v) if isinstance(v, str) else None,
            "icp.buying_triggers": lambda v: vd.check_buying_triggers(v) if isinstance(v, list) else None,
            "buyers.titles": lambda v: vd.check_buyer_titles(v) if isinstance(v, list) else None,
            "buyers.pain_points": lambda v: vd.check_pain_points(v) if isinstance(v, list) else None,
        }
        checker = dispatch.get(field_name)
        if checker:
            return checker(value)
        return None

    def build_master_context(self, validated: dict) -> MasterContext:
        """
        Construct the final MasterContext, filling in meta automatically.

        Call this only after validate() returns valid=True with no
        clarifying_questions — downstream agents expect a complete object.
        """
        now = datetime.now(tz=timezone.utc)
        enriched = dict(validated)

        # Strip internal confirmation flag — not part of the schema
        enriched.pop("negative_icp_confirmed_empty", None)

        enriched["meta"] = {
            "created_at": now.isoformat(),
            "client_id": str(uuid.uuid4()),
            "version": "1.0.0",
        }

        return MasterContext.model_validate(enriched)

    def parse_csv_upload(self, file_content: bytes, filename: str = "upload.csv") -> CsvParseResult:
        """
        Parse a CSV upload for the optional existing_account_list.

        Required columns: "Company Name", "Website"
        All other columns are preserved as-is.

        Returns a CsvParseResult with:
          - rows: list of dicts (one per non-header row)
          - warnings: non-fatal issues (extra cols, blank rows, missing optional data)
          - errors: fatal issues (missing required columns)
          - valid: False if any required column is absent
        """
        result = CsvParseResult()

        try:
            text = file_content.decode("utf-8-sig")  # handle BOM from Excel exports
        except UnicodeDecodeError:
            try:
                text = file_content.decode("latin-1")
                result.add_warning(
                    "File encoding detected as Latin-1 (not UTF-8). "
                    "Re-save as UTF-8 to avoid character corruption."
                ) if hasattr(result, "add_warning") else result.warnings.append(
                    "File encoding detected as Latin-1 (not UTF-8). "
                    "Re-save as UTF-8 to avoid character corruption."
                )
            except Exception as exc:  # noqa: BLE001
                result.errors.append(f"Cannot decode file: {exc}")
                result.valid = False
                return result

        reader = csv.DictReader(io.StringIO(text))
        if reader.fieldnames is None:
            result.errors.append("CSV_EMPTY: File appears to be empty.")
            result.valid = False
            return result

        actual_cols = set(reader.fieldnames)
        missing = CsvParseResult.REQUIRED_COLUMNS - actual_cols
        if missing:
            result.errors.append(
                f"CSV_MISSING_COLUMNS: Required column(s) missing: "
                f"{', '.join(sorted(missing))}. "
                f"Found columns: {', '.join(sorted(actual_cols))}."
            )
            result.valid = False
            return result

        extra_cols = actual_cols - CsvParseResult.REQUIRED_COLUMNS
        if extra_cols:
            result.warnings.append(
                f"Extra columns will be preserved: {', '.join(sorted(extra_cols))}."
            )

        blank_rows = 0
        for i, row in enumerate(reader, start=2):  # row 1 is header
            company_name = (row.get("Company Name") or "").strip()
            website = (row.get("Website") or "").strip()

            if not company_name and not website:
                blank_rows += 1
                continue

            if not company_name:
                result.warnings.append(f"Row {i}: missing 'Company Name', website={website!r}.")
            if not website:
                result.warnings.append(f"Row {i}: missing 'Website', company={company_name!r}.")
            elif not (website.startswith("http://") or website.startswith("https://")):
                result.warnings.append(
                    f"Row {i}: Website {website!r} lacks http/https scheme — "
                    "may fail enrichment lookups."
                )

            result.rows.append({k: (v or "").strip() for k, v in row.items()})

        if blank_rows:
            result.warnings.append(f"{blank_rows} completely blank row(s) skipped.")
        if not result.rows:
            result.errors.append("CSV_NO_DATA: File has headers but no data rows.")
            result.valid = False

        logger.info(
            "CSV parse complete: file=%s rows=%d warnings=%d errors=%d",
            filename,
            len(result.rows),
            len(result.warnings),
            len(result.errors),
        )
        return result

    # -----------------------------------------------------------------------
    # Internal helpers
    # -----------------------------------------------------------------------

    # Keys that are valid in a submission dict but NOT part of MasterContext schema.
    # Strip them before passing to Pydantic so extra="forbid" doesn't trip.
    _SUBMISSION_ONLY_KEYS = {"meta", "negative_icp_confirmed_empty"}

    def _inject_placeholder_meta(self, raw: dict) -> dict:
        """
        Strip submission-only keys and inject a syntactically-valid placeholder
        meta so Pydantic can validate all other sections without requiring the
        caller to pre-fill meta fields.
        The real meta is produced by build_master_context().
        """
        enriched = {k: v for k, v in raw.items() if k not in self._SUBMISSION_ONLY_KEYS}
        enriched["meta"] = {
            "created_at": datetime.now(tz=timezone.utc).isoformat(),
            "client_id": str(uuid.uuid4()),
            "version": "1.0.0",
        }
        return enriched

    def _run_vague_checks(
        self,
        raw: dict,
        result: ValidationResult,
        confirmed_empty: bool,
    ) -> None:
        """Apply all vague-value detectors and accumulate clarifying questions."""
        company = raw.get("company") or {}
        icp = raw.get("icp") or {}
        buyers = raw.get("buyers") or {}

        checks: list[tuple[str, Any, Any]] = [
            ("company.value_prop",          company.get("value_prop"),          vd.check_value_prop),
            ("company.differentiators",     company.get("differentiators"),     vd.check_differentiators),
            ("company.acv_range",           company.get("acv_range"),           vd.check_acv_range),
            ("icp.industries",              icp.get("industries"),              vd.check_icp_industries),
            ("icp.company_size_employees",  icp.get("company_size_employees"),  vd.check_company_size_employees),
            ("icp.buying_triggers",         icp.get("buying_triggers"),         vd.check_buying_triggers),
            ("buyers.titles",               buyers.get("titles"),               vd.check_buyer_titles),
            ("buyers.pain_points",          buyers.get("pain_points"),          vd.check_pain_points),
        ]

        for field_path, value, checker in checks:
            if value is None:
                continue  # missing field already caught by Pydantic
            question = checker(value)
            if question:
                result.add_clarifying_question(field_path, question)

        # negative_icp needs the confirmed_empty flag — special-cased
        neg_icp = icp.get("negative_icp")
        if isinstance(neg_icp, list):
            question = vd.check_negative_icp(neg_icp, confirmed_empty)
            if question:
                result.add_clarifying_question("icp.negative_icp", question)

    def _cross_field_checks(self, raw: dict, result: ValidationResult) -> None:
        """Consistency checks that span multiple fields."""
        gtm = raw.get("gtm") or {}
        competitors = raw.get("competitors") or []
        company = raw.get("company") or {}

        # Warn if no competitors listed — may indicate the form was skipped
        if not competitors:
            result.add_warning(
                "No competitors listed. ICP Scout's differentiation scoring will "
                "be weaker. Add at least one competitor with known weaknesses."
            )

        # Warn if crm=None but existing_account_list is provided
        crm = gtm.get("crm")
        existing = gtm.get("existing_account_list")
        if crm == "None" and existing:
            result.add_warning(
                "CRM is set to 'None' but an existing account list was uploaded. "
                "Without CRM sync, the uploaded list won't de-duplicate against "
                "existing pipeline. Confirm this is intentional."
            )

        # Warn if pricing_model=Enterprise but ACV range looks SMB
        pricing = company.get("pricing_model")
        acv = company.get("acv_range", "")
        if pricing == "Enterprise" and acv:
            # Rough heuristic: find first number in the range
            import re
            nums = re.findall(r"\d[\d,]*", acv.replace("k", "000").replace("K", "000"))
            if nums:
                try:
                    low = int(nums[0].replace(",", ""))
                    if low < 10_000:
                        result.add_warning(
                            f"Pricing model is 'Enterprise' but ACV range starts at "
                            f"${low:,}. Enterprise pricing typically implies ACV > $50k. "
                            "Confirm this is correct."
                        )
                except ValueError:
                    pass
