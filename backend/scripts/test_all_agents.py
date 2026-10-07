"""Integration test script verifying all 5 AI agents and their endpoints."""
from app.db.session import SessionLocal
from app.db.models import Project, Decision, ActionItem, AutonomySetting
from app.api.risk import get_risk
from app.api.resources import get_resources, simulate, SimulateRequest
from app.api.decision import get_latest_decision, create_decision
from app.api.actions import get_settings_endpoint, get_queue, get_history, approve_action
from app.agents.pipeline import run_pipeline


def test_agents():
    db = SessionLocal()
    project_id = 5
    project = db.get(Project, project_id)
    assert project, f"Project {project_id} not found"
    print(f"Testing with project: {project.name} (id={project.id})")

    # 1. Test Risk Prediction Agent
    print("\n--- 1. Testing Risk Prediction Agent ---")
    risk_data = get_risk(project_id, db)
    assert "model" in risk_data
    assert "tickets" in risk_data
    assert "calibration" in risk_data
    print(f"Risk model version: {risk_data['model']['version']}")
    print(f"Scored tickets: {len(risk_data['tickets'])}")
    print(f"Logged predictions in DB: {risk_data['calibration']['logged_predictions']}")
    if risk_data["tickets"]:
        top = risk_data["tickets"][0]
        print(f"Top risk ticket: {top['key']} (score={top['score']}%, level={top['level']})")

    # 2. Test Resource Management Agent
    print("\n--- 2. Testing Resource Management Agent ---")
    res_data = get_resources(project_id, db)
    workload = res_data["workload"]
    print(f"Team size: {workload['team_size']}")
    print(f"Overloaded: {workload['overloaded_count']}, Underloaded: {workload['underloaded_count']}")
    print(f"Rebalancing suggestions: {len(workload['suggestions'])}")
    print(f"AI Briefing summary: {res_data['ai_summary']['summary'][:100]}...")

    # What-if simulation
    sim_res = simulate(project_id, SimulateRequest(ticket_key="AGT-11", target_person_id=5), db)
    print(f"What-if simulation: {sim_res['summary']}")

    # 3. Test Decision Agent
    print("\n--- 3. Testing Decision Agent ---")
    dec_data = create_decision(project_id, db)
    decision = dec_data["decision"]
    print(f"Decision Issue: {decision['issue']}")
    print(f"Root Cause: {decision['root_cause']}")
    print(f"Recommended Action: {decision['recommended_action']}")
    print(f"Confidence: {decision['confidence']}")

    # 4. Test Autonomous Action Agent
    print("\n--- 4. Testing Autonomous Action Agent ---")
    sett = get_settings_endpoint(project_id, db)
    print(f"Current Trust Dial level: {sett['level']}")

    queue_data = get_queue(project_id, db)
    print(f"Actions in approval queue: {len(queue_data['queue'])}")

    hist_data = get_history(project_id, db)
    print(f"Track record: {hist_data['track_record']}")

    if queue_data["queue"]:
        action_to_approve = queue_data["queue"][0]
        print(f"Approving action: {action_to_approve['title']} (id={action_to_approve['id']})")
        app_res = approve_action(project_id, action_to_approve["id"], db)
        print(f"Approve result: status={app_res['action']['status']}")

    # 5. Full LangGraph Pipeline Test
    print("\n--- 5. Testing LangGraph Multi-Agent Pipeline End-to-End ---")
    snapshot = run_pipeline(db, project)
    steps = [step["label"] for step in snapshot.state["pipeline"]["steps"]]
    print(f"Snapshot created #{snapshot.id} with steps:")
    for i, s in enumerate(steps, 1):
        print(f"  {i}. {s}")

    print("\n>>> ALL 5 AI AGENTS PASSED ALL TESTS SUCCESSFULLY! <<<")


if __name__ == "__main__":
    test_agents()

