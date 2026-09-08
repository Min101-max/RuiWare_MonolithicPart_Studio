from __future__ import annotations

import json
import sys
from typing import Any

from .api_client import RuiWareApiClient
from .core.protocol import McpProtocolHandler, parse_error_response
from .core.responses import tool_result
from .core.additional_tools import ADDITIONAL_TOOLS
from .tools.authoring import apply_material, apply_parameter_changes, apply_sketch, get_parameter_contract, preview_material, preview_parameter_changes, preview_proposal, preview_sketch, search_materials, solve_sketch, submit_proposal, validate_parameter_values
from .tools.guidance import explain_error, get_next_actions, get_parameter_help
from .tools.read import get_attachment, get_audit_log, get_current_draft_status, get_draft_context, get_validation_result
from .tools.workflow import check_brep, compile_draft, complete_stage, create_template, evaluate_draft, execute_task, get_compile_artifacts, get_latest_compile, plan_task, publish_template, rollback_draft


TOOLS = [
    {
        "name": "ruiware_get_draft_context",
        "description": "读取指定零部件模板修订的完整工程上下文；不改变平台数据。",
        "inputSchema": {"type": "object", "required": ["draftId"], "properties": {"draftId": {"type": "string"}}},
    },
    {
        "name": "ruiware_get_attachment",
        "description": "读取模板中一项工程证据的元数据和受控下载地址；不改变平台数据。",
        "inputSchema": {"type": "object", "required": ["draftId", "attachmentId"], "properties": {"draftId": {"type": "string"}, "attachmentId": {"type": "string"}}},
    },
    {
        "name": "ruiware_solve_sketch",
        "description": "对草图进行最小、标称、最大工况的确定性求解；不保存修改。",
        "inputSchema": {"type": "object", "required": ["draft"], "properties": {"draft": {"type": "object"}, "overrides": {"type": "object", "additionalProperties": {"type": "number"}}}},
    },
    {
        "name": "ruiware_preview_proposal",
        "description": "预览结构化工程提案的差异、草图求解和阶段校验；不保存修改。proposal 必须基于当前 baseRevision。",
        "inputSchema": {"type": "object", "required": ["draftId", "proposal"], "properties": {"draftId": {"type": "string"}, "proposal": {"type": "object"}, "selectedCommandIds": {"type": "array", "items": {"type": "string"}}}},
    },
    {
        "name": "ruiware_submit_proposal",
        "description": "将已确认的结构化工程提案写入平台并生成新修订。仅在用户明确确认后调用。",
        "inputSchema": {"type": "object", "required": ["draftId", "proposal"], "properties": {"draftId": {"type": "string"}, "proposal": {"type": "object"}, "selectedCommandIds": {"type": "array", "items": {"type": "string"}}}},
    },
    {
        "name": "ruiware_get_validation_result",
        "description": "读取一个模板阶段的确定性校验结果；不改变平台数据。",
        "inputSchema": {"type": "object", "required": ["draftId", "stage"], "properties": {"draftId": {"type": "string"}, "stage": {"type": "string", "enum": ["templateInfo", "material", "baseSketch", "features", "variants", "review", "admission"]}}},
    },
]
TOOLS.extend(ADDITIONAL_TOOLS)


class McpApplication:
    def __init__(self, client: RuiWareApiClient | None = None) -> None:
        self.client = client or RuiWareApiClient()
        self.protocol = McpProtocolHandler(self.call_tool, TOOLS)

    def call_tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        draft_id = arguments.get("draftId", "")
        if name == "create_template":
            return create_template(self.client, arguments)
        if name == "ruiware_get_audit_log":
            return get_audit_log(self.client, arguments)
        if name == "ruiware_rollback_draft":
            return rollback_draft(self.client, arguments)
        if name == "ruiware_get_current_draft_status":
            return get_current_draft_status(self.client, arguments)
        if name == "ruiware_get_draft_context":
            return get_draft_context(self.client, arguments)
        if name == "ruiware_get_attachment":
            return get_attachment(self.client, arguments)
        if name == "ruiware_solve_sketch":
            return solve_sketch(self.client, arguments)
        if name == "ruiware_preview_proposal":
            return preview_proposal(self.client, arguments)
        if name == "ruiware_submit_proposal":
            return submit_proposal(self.client, arguments)
        if name == "ruiware_get_parameter_contract":
            return get_parameter_contract(self.client, arguments)
        if name == "ruiware_validate_parameter_values":
            return validate_parameter_values(self.client, arguments)
        if name == "ruiware_preview_parameter_changes":
            return preview_parameter_changes(self.client, arguments)
        if name == "ruiware_apply_parameter_changes":
            return apply_parameter_changes(self.client, arguments)
        if name == "ruiware_preview_sketch_edit":
            return preview_sketch(self.client, arguments)
        if name == "ruiware_apply_sketch_edit":
            return apply_sketch(self.client, arguments)
        if name == "ruiware_preview_material_binding":
            return preview_material(self.client, arguments)
        if name == "ruiware_apply_material_binding":
            return apply_material(self.client, arguments)
        if name == "ruiware_search_materials":
            return search_materials(self.client, arguments)
        if name == "ruiware_plan_task":
            return plan_task(self.client, arguments)
        if name == "ruiware_execute_task":
            return execute_task(self.client, arguments)
        if name == "ruiware_publish_template":
            return publish_template(self.client, arguments)
        if name == "ruiware_get_validation_result":
            return get_validation_result(self.client, arguments)
        if name == "ruiware_compile_draft":
            return compile_draft(self.client, arguments)
        if name == "ruiware_get_latest_compile":
            return get_latest_compile(self.client, arguments)
        if name == "ruiware_check_brep":
            return check_brep(self.client, arguments)
        if name == "ruiware_get_compile_artifacts":
            return get_compile_artifacts(self.client, arguments)
        if name == "ruiware_evaluate_draft":
            return evaluate_draft(self.client, arguments)
        if name == "ruiware_complete_stage":
            return complete_stage(self.client, arguments)
        if name == "ruiware_get_next_actions":
            return get_next_actions(self.client, arguments)
        if name == "ruiware_get_parameter_help":
            return get_parameter_help(self.client, arguments)
        if name == "ruiware_explain_error":
            return explain_error(arguments)
        raise ValueError(f"Unknown tool: {name}")

    def handle(self, request: dict[str, Any]) -> dict[str, Any] | None:
        return self.protocol.handle(request)


def main() -> None:
    app = McpApplication()
    for line in sys.stdin:
        try:
            response = app.handle(json.loads(line))
            if response is not None:
                print(json.dumps(response, ensure_ascii=False), flush=True)
        except json.JSONDecodeError as error:
            print(json.dumps(parse_error_response(error), ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
