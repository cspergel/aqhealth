"""
Notification service — stubs for multi-channel communication.
Wire up Twilio (SMS/voice) and SendGrid (email) when ready.
"""

import logging

logger = logging.getLogger(__name__)


async def send_notification(
    channel: str,  # "email", "sms", "voice", "in_app"
    recipient: str,  # email address, phone number, or user ID
    subject: str,
    message: str,
    template: str | None = None,
    metadata: dict | None = None,
) -> dict:
    """Send a notification. Currently stubs external channels, in_app works."""
    if channel == "in_app":
        # STUB: log the intent but not yet persisted to DB
        logger.info(f"In-app notification to {recipient}: {subject}")
        return {"sent": False, "channel": "in_app", "stub": True, "message": "In-app notifications not yet persisted"}
    else:
        # STUB: log the intent, don't actually send
        logger.info(f"STUB: Would send {channel} to {recipient}: {subject}")
        return {
            "sent": False,
            "channel": channel,
            "stub": True,
            "message": "Channel not wired yet",
        }


async def send_care_plan_reminder(
    member_id: int,
    goal_description: str,
    due_date: str,
) -> dict:
    """Send a reminder about an upcoming care plan goal due date."""
    return await send_notification(
        channel="in_app",
        recipient=str(member_id),
        subject="Care Plan Goal Reminder",
        message=f"Goal '{goal_description}' is due on {due_date}.",
        template="care_plan_reminder",
        metadata={"member_id": member_id, "goal": goal_description},
    )


async def send_auth_decision_notification(
    auth_id: int,
    decision: str,
    recipient: str,
) -> dict:
    """Notify about a prior auth decision."""
    return await send_notification(
        channel="email",
        recipient=recipient,
        subject=f"Prior Authorization {decision.upper()} — Auth #{auth_id}",
        message=f"Prior authorization request #{auth_id} has been {decision}.",
        template="auth_decision",
        metadata={"auth_id": auth_id, "decision": decision},
    )


async def send_gap_closure_outreach(
    member_id: int,
    measure_code: str,
    channel: str = "sms",
) -> dict:
    """Send outreach for care gap closure."""
    return await send_notification(
        channel=channel,
        recipient=str(member_id),
        subject=f"Health Screening Reminder — {measure_code}",
        message=f"You have an open care gap for {measure_code}. Please schedule your appointment.",
        template="gap_outreach",
        metadata={"member_id": member_id, "measure_code": measure_code},
    )
