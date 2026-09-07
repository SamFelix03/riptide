"""Unit tests for the RIPTIDE reference math oracle (Phase 0 harness)."""

import unittest

import reference_math


class TestReferenceMathHarness(unittest.TestCase):
    def test_constants(self) -> None:
        self.assertEqual(reference_math.BPS, reference_math.Decimal("10000000"))
        self.assertEqual(reference_math.WAD, reference_math.Decimal("1000000000000000000"))

    def test_imports_cleanly(self) -> None:
        self.assertTrue(hasattr(reference_math, "cpmm_exact_in"))
        self.assertTrue(hasattr(reference_math, "diamond_split"))


if __name__ == "__main__":
    unittest.main()
