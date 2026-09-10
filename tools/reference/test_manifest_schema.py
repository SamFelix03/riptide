"""Schema checks for the Anvil deployment-manifest fixture."""

import unittest
from pathlib import Path

from tools.validate_manifest import validate_path

REPO_ROOT = Path(__file__).resolve().parents[2]
EXAMPLE = REPO_ROOT / "deployments" / "31337.example.json"


class TestManifestSchema(unittest.TestCase):
    def test_example_fixture_validates(self) -> None:
        errors = validate_path(EXAMPLE)
        self.assertEqual(errors, [], msg="\n".join(errors))


if __name__ == "__main__":
    unittest.main()
