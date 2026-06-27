from pathlib import Path


REPO = Path(__file__).resolve().parent.parent
UI_DIR = REPO / "ui"


def test_index_uses_auditor_workbench_structure():
    html = (UI_DIR / "index.html").read_text(encoding="utf-8")

    assert 'class="app-shell"' in html
    assert 'class="workflow-sidebar"' in html
    assert 'data-step="source"' in html
    assert 'data-step="sql"' in html
    assert 'data-step="config"' in html
    assert 'data-step="results"' in html
    assert 'id="readiness-list"' in html
    assert 'id="btn-run-pipeline"' in html


def test_styles_define_responsive_workbench_layout():
    css = (UI_DIR / "css" / "style.css").read_text(encoding="utf-8")

    assert ".app-shell" in css
    assert ".workflow-sidebar" in css
    assert ".workspace" in css
    assert "@media (max-width: 860px)" in css
    assert "grid-template-columns" in css


def test_app_updates_step_state_and_readiness_summary():
    js = (UI_DIR / "js" / "app.js").read_text(encoding="utf-8")

    assert "refreshWorkflowState" in js
    assert "setStep" in js
    assert "renderReadiness" in js
    assert "getReadinessItems" in js


def test_remote_connection_form_includes_schema_field():
    html = (UI_DIR / "index.html").read_text(encoding="utf-8")

    assert 'id="remote-schema"' in html
    assert "Schema" in html


def test_remote_payload_sends_schema_and_validates_config():
    js = (UI_DIR / "js" / "app.js").read_text(encoding="utf-8")

    assert 'document.getElementById("remote-schema")' in js
    assert "db_schema: schema" in js
    assert "var missing = validateConfig(this.config);" in js
    assert "return this.runAuditRemote();" in js


def test_remote_progress_uses_api_step_results():
    js = (UI_DIR / "js" / "app.js").read_text(encoding="utf-8")

    assert "appendRemoteProgress" in js
    assert "data.step4" in js
    assert "data.step5" in js
    assert "data.step6" in js
