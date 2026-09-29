import re

_NON_DIGITS = re.compile(r"\D+")


def _digits(raw):
    return _NON_DIGITS.sub("", raw or "")


def normalize_phone(raw):
    """Return '+' followed by the digits of raw, or '' when there are none."""
    digits = _digits(raw)
    return f"+{digits}" if digits else ""
