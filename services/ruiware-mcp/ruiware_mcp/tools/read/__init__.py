"""只读类 MCP 工具。"""

from .attachments import execute as get_attachment
from .current_draft import execute as get_current_draft_status
from .draft_context import execute as get_draft_context
from .validation import execute as get_validation_result
from .audit import execute as get_audit_log

__all__ = ["get_attachment", "get_audit_log", "get_current_draft_status", "get_draft_context", "get_validation_result"]
