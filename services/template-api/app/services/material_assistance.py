"""材料辅助：材料匹配、绑定预览和确认写入。"""

from __future__ import annotations

from typing import Any, Literal

from template_core.material import material_requirement_mismatches
from template_core.models import MaterialValidationSample, TemplateDraft

from ..errors import api_error
from ..repository import Repository
from ._common import draft_or_404, save_draft
from .context import validate_stage_with_context


def _material_preview(repository: Repository, draft: TemplateDraft, source_record_id: str, mode: Literal["reference", "copy"], role: str) -> dict[str, Any]:
    try:
        material = repository.material_library.get(source_record_id)
    except KeyError as error:
        raise api_error("MATERIAL_NOT_FOUND", status_code=404, context={"sourceRecordId": source_record_id}) from error
    requirement = draft.materialRequirements[0] if draft.materialRequirements else None
    mismatches = material_requirement_mismatches(requirement, material) if requirement else []
    thickness = material.get("thickness")
    return {
        "material": material,
        "mode": mode,
        "role": role,
        "compatible": not mismatches,
        "mismatches": mismatches,
        "thickness": thickness,
        "thicknessImpact": {"parameterId": requirement.thickness.parameterId if requirement else "thickness", "value": thickness, "willUpdate": isinstance(thickness, (int, float))},
    }


def preview_material_binding(repository: Repository, draft_id: str, base_revision: int, source_record_id: str, mode: Literal["reference", "copy"], role: Literal["minimum", "nominal", "maximum", "special"] = "nominal") -> dict[str, Any]:
    draft = draft_or_404(repository, draft_id)
    if draft.revision != base_revision:
        raise api_error("DRAFT_REVISION_CONFLICT", status_code=409, message=f"材料提案基于 R{base_revision}，当前已是 R{draft.revision}。", context={"baseRevision": base_revision, "currentRevision": draft.revision})
    preview = _material_preview(repository, draft, source_record_id, mode, role)
    return {"draftId": draft.id, "baseRevision": base_revision, **preview, "canAccept": preview["compatible"]}


def apply_material_binding(repository: Repository, draft_id: str, base_revision: int, source_record_id: str, mode: Literal["reference", "copy"], role: Literal["minimum", "nominal", "maximum", "special"] = "nominal", confirmed: bool = False) -> dict[str, Any]:
    if not confirmed:
        raise api_error("MATERIAL_CONFIRMATION_REQUIRED", status_code=422)
    draft = draft_or_404(repository, draft_id)
    preview = preview_material_binding(repository, draft_id, base_revision, source_record_id, mode, role)
    if not preview["canAccept"]:
        raise api_error("MATERIAL_PREVIEW_FAILED", status_code=422, context={"mismatches": preview["mismatches"]})
    binding = repository.create_binding(source_record_id, mode)
    candidate = draft.model_copy(deep=True)
    requirement = candidate.materialRequirements[0] if candidate.materialRequirements else None
    if requirement is not None:
        if requirement.selectionMode == "specificRecord":
            requirement.specificBindingId = binding.id
        requirement.reviewed = True
        thickness_parameter = requirement.thickness.parameterId
        if thickness_parameter and isinstance(preview["thickness"], (int, float)):
            candidate.parameterDefinitions = [item.model_copy(update={"default": float(preview["thickness"])}) if item.id == thickness_parameter else item for item in candidate.parameterDefinitions]
    sample_id = f"material.{role}"
    samples = [item for item in candidate.materialValidationSamples if item.role != role and item.id != sample_id]
    samples.append(MaterialValidationSample(id=sample_id, role=role, name={"minimum": "最小材料样例", "nominal": "标称材料样例", "maximum": "最大材料样例", "special": "特殊材料样例"}[role], bindingId=binding.id, bindingMode=mode, materialCode=preview["material"].get("code") or source_record_id, materialName=preview["material"].get("name") or source_record_id, materialThickness=preview["thickness"], reviewed=True))
    candidate.materialValidationSamples = samples
    saved = save_draft(repository, candidate, expected_revision=base_revision, reason="material-assistance-apply")
    return {"draft": saved.model_dump(), "binding": binding.model_dump(), "material": preview["material"], "thickness": preview["thickness"], "validation": validate_stage_with_context(repository, "material", saved).model_dump(), "geometryValidation": validate_stage_with_context(repository, "baseSketch", saved).model_dump()}
