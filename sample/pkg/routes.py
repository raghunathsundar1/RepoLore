"""Request routing for the sample app."""
from . import utils


def handle_request(path):
    utils.log(f"handling {path}")
    return {"status": "ok", "path": path}
