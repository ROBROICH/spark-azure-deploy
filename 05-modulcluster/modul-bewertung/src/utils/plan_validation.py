"""Sanitisation helpers for planner output before Pydantic model_validate."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class PlanSanitisationResult:
    """Result of plan sanitisation with tracking data for correction prompts."""

    plan_data: dict[str, Any]
    unassigned_svm_ids: list[str] = field(default_factory=list)


def sanitise_plan(
    plan_data: dict[str, Any],
    available_svm_ids: set[str],
) -> PlanSanitisationResult:
    """Sanitise a raw planner JSON dict before Pydantic validation.

    1. Removes hallucinated SVM-IDs (not in *available_svm_ids*) in-place.
    2. Tracks unassigned *available_svm_ids* (for correction prompts).

    Structural validation (min chapters, min svm_ids per chapter) is left
    to ``DetailedPlan.model_validate()``.
    """
    if isinstance(plan_data, list):
        plan_data = {"kapitel": plan_data}

    kapitel = plan_data.get("kapitel", [])

    # --- Remove hallucinated IDs ---
    for chapter in kapitel:
        raw_ids = chapter.get("svm_ids") or []
        hallucinated = [sid for sid in raw_ids if sid not in available_svm_ids]
        if hallucinated:
            titel = chapter.get("titel", "?")
            logger.warning(
                "Removing hallucinated SVM-IDs from chapter '%s': %s",
                titel,
                hallucinated,
            )
            chapter["svm_ids"] = [sid for sid in raw_ids if sid in available_svm_ids]

    # --- Track unassigned SVMs (informational) ---
    assigned = {sid for ch in kapitel for sid in (ch.get("svm_ids") or [])}
    unassigned = sorted(available_svm_ids - assigned)
    if unassigned:
        logger.warning("SVMs nicht zugeordnet (vom Planner ausgelassen): %s", unassigned)

    return PlanSanitisationResult(
        plan_data=plan_data,
        unassigned_svm_ids=unassigned,
    )
