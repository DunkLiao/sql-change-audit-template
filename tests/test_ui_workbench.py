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
