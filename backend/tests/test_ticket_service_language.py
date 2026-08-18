from types import SimpleNamespace

from app.services.ticket_service import TicketService


def test_validate_study_language_ignores_language_when_program_does_not_require_it():
    program = SimpleNamespace(requires_service_language=False)

    assert TicketService.validate_study_language(program, "KAZAKH") is None


def test_validate_study_language_keeps_language_when_program_requires_it():
    program = SimpleNamespace(requires_service_language=True)

    assert TicketService.validate_study_language(program, "KAZAKH") == "KAZAKH"
