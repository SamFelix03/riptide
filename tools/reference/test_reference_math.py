"""Unit tests for the RIPTIDE reference math oracle."""

import unittest
from decimal import Decimal

from tools.reference import reference_math as rm
from tools.reference.reference_math import DomainError


class TestReferenceMath(unittest.TestCase):
    def test_cpmm_round_trip(self) -> None:
        rin = Decimal("5000000000000000000000")
        rout = Decimal("5000000000000000000000")
        fee = Decimal("50000")
        out_case = rm.cpmm_exact_out(rin, rout, Decimal("500000000000000000000"), fee)
        amount_in = Decimal(out_case["amountIn"]["ceiling"])
        in_case = rm.cpmm_exact_in(rin, rout, amount_in, fee)
        self.assertGreaterEqual(Decimal(in_case["amountOut"]["floor"]), Decimal("500000000000000000000"))

    def test_lvr_identity(self) -> None:
        sigma = Decimal("400000000000000000")
        rin = rout = Decimal("5000000000000000000000")
        value = rin + rout
        price = rin * rm.WAD // rout
        ell_gen = rm.lvr_rate_general(sigma, price, value)
        ell_cpmm = rm.lvr_rate_cpmm(sigma, value)
        self.assertEqual(ell_gen, ell_cpmm)
        sigma2 = rm.mul_div(sigma, sigma, rm.WAD, rm.Rounding.DOWN)
        reconstructed = rm.mul_div(ell_cpmm, Decimal(8) * rm.WAD, sigma2, rm.Rounding.DOWN)
        self.assertEqual(reconstructed, value)

    def test_diamond_conservation(self) -> None:
        split = rm.diamond_split(Decimal("1000000000000000000000"), Decimal("950000000000000000"))
        pay = Decimal(split["payToResolver"]["floor"])
        retain = Decimal(split["retainToLP"]["floor"])
        self.assertEqual(pay + retain, Decimal("1000000000000000000000"))
        beta_floor = rm.mul_div(Decimal("950000000000000000"), Decimal("1000000000000000000000"), rm.WAD, rm.Rounding.DOWN)
        self.assertGreaterEqual(retain, beta_floor)

    def test_pi_within_bounds(self) -> None:
        fee_min = Decimal("30000")
        fee_max = Decimal("500000")
        target = rm.fee_target(Decimal("300000000000000000"), Decimal("100000000000000000"), fee_min, fee_max)
        reported, _ = rm.pi_step(Decimal("100000"), Decimal(0), target, Decimal("500000000000000000"), Decimal("100000000000000000"), Decimal("1000000000000000000"), fee_min, fee_max)
        self.assertGreaterEqual(reported, fee_min)
        self.assertLessEqual(reported, fee_max)

    def test_invalid_domains(self) -> None:
        with self.assertRaises(DomainError):
            rm.diamond_split(Decimal("-1"), Decimal("950000000000000000"))
        with self.assertRaises(DomainError):
            rm.ln_wad(Decimal(0))


if __name__ == "__main__":
    unittest.main()
