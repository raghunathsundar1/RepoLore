"""Tiny throwaway app used to exercise the scanner and producer in tests."""
from pkg.routes import handle_request
from pkg import utils


def main():
    utils.log("starting")
    handle_request("/")


if __name__ == "__main__":
    main()
