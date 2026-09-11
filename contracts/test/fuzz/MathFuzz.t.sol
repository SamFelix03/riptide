// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { WadMulDiv } from "../../src/libraries/WadMulDiv.sol";
import { LnExpMath } from "../../src/libraries/LnExpMath.sol";
import { FeeController } from "../../src/libraries/FeeController.sol";
import { DiamondSplit } from "../../src/libraries/DiamondSplit.sol";
import { RiptideErrors } from "../../src/types/RiptideErrors.sol";
import { CpmmMath } from "../differential/CpmmMath.sol";

contract MathFuzzTest is Test {
    uint256 internal constant BPS = 1e7;

    function testFuzz_cpmmExactIn(uint128 reserveIn, uint128 reserveOut, uint96 amountIn, uint24 feeBps) public {
        vm.assume(reserveIn > 0 && reserveOut > 0 && amountIn > 0 && feeBps < BPS);
        uint256 out = CpmmMath.exactIn(reserveIn, reserveOut, amountIn, feeBps);
        assertLe(out, reserveOut);
    }

    function testFuzz_diamondSplitConservation(uint128 surplus, uint256 beta) public {
        vm.assume(beta > 0 && beta < WadMulDiv.WAD);
        (uint256 pay, uint256 retain) = DiamondSplit.split(surplus, beta);
        assertEq(pay + retain, surplus);
        uint256 betaFloor = WadMulDiv.mulDiv(beta, surplus, WadMulDiv.WAD, WadMulDiv.Rounding.Down);
        assertGe(retain, betaFloor);
    }

    function testFuzz_feeControllerPiBounds(uint24 feeMin, uint24 feeMax, uint24 feePrev, int64 integralPrev, uint64 kp, uint64 ki, uint64 iMax, uint24 target) public {
        feeMin = uint24(bound(feeMin, 1, type(uint24).max - 2));
        feeMax = uint24(bound(feeMax, feeMin + 1, type(uint24).max));
        feePrev = uint24(bound(feePrev, feeMin, feeMax));
        target = uint24(bound(target, feeMin, feeMax));
        FeeController.PiState memory state = FeeController.PiState({
            feeReported: feePrev,
            integral: int192(integralPrev),
            kp: kp,
            ki: ki,
            iMax: iMax,
            feeMin: feeMin,
            feeMax: feeMax
        });
        (uint24 feeReported, int192 integral) = FeeController.piStep(state, target);
        assertGe(feeReported, feeMin);
        assertLe(feeReported, feeMax);
        int256 maxI = int256(uint256(iMax));
        assertGe(int256(integral), -maxI);
        assertLe(int256(integral), maxI);
    }

    function testFuzz_feeTargetBounds(uint64 sigma, uint64 lambdaQ, uint24 feeMin, uint24 feeMax) public {
        vm.assume(lambdaQ > 0);
        feeMin = uint24(bound(feeMin, 0, type(uint24).max - 1));
        feeMax = uint24(bound(feeMax, feeMin, type(uint24).max));
        uint24 t = FeeController.feeTarget(sigma, lambdaQ, feeMin, feeMax);
        assertGe(t, feeMin);
        assertLe(t, feeMax);
    }

    function testFuzz_transcendentalDomains(uint128 x) public {
        vm.assume(x > 0 && x < type(uint128).max / 2);
        LnExpMath.lnWad(x);
    }

    function testFuzz_transcendentalOutOfDomain() public {
        vm.expectRevert(abi.encodeWithSelector(RiptideErrors.RiptideLogInputOutOfDomain.selector, uint256(0)));
        this.revertLnWad(0);
    }

    function revertLnWad(uint256 x) external pure {
        LnExpMath.lnWad(x);
    }
}
