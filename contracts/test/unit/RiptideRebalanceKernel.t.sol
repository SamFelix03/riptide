// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { stdJson } from "forge-std/StdJson.sol";

import { RiptideTypes } from "../../src/types/RiptideTypes.sol";
import { RiptideErrors } from "../../src/types/RiptideErrors.sol";
import { WadMulDiv } from "../../src/libraries/WadMulDiv.sol";
import { CpmmMath } from "../../src/libraries/CpmmMath.sol";
import { DutchPow } from "../../src/libraries/DutchPow.sol";
import { RiptideRebalanceKernel } from "../../src/core/RiptideRebalanceKernel.sol";
import { VectorLoader } from "../differential/VectorLoader.sol";

contract RiptideRebalanceKernelTest is VectorLoader {
    using stdJson for string;

    RiptideRebalanceKernel internal kernel;

    function setUp() public {
        kernel = new RiptideRebalanceKernel();
    }

    function test_v1SplitConservationFuzz(uint256 surplus, uint64 beta) public view {
        beta = uint64(bound(beta, 1, WadMulDiv.WAD - 1));
        surplus = bound(surplus, 0, type(uint128).max);

        RiptideTypes.RebalanceResult memory r = kernel.splitSurplus(surplus, 0, beta);
        assertEq(r.payToResolver + r.retainToLP, r.surplusWad);
        assertEq(r.surplusWad, surplus);

        uint256 minRetain = WadMulDiv.mulDiv(beta, surplus, WadMulDiv.WAD, WadMulDiv.Rounding.Down);
        assertGe(r.retainToLP, minRetain);
    }

    /// @dev V1 negative control: Up-rounded rebate exceeds Down-rounded (full vector failure in DifferentialDiamondSplit).
    function test_v1NegativeControlOverPayWouldFail() public pure {
        uint256 surplus = 1001;
        uint64 beta = 950_000_000_000_000_000;
        uint256 payUp = WadMulDiv.mulDiv(
            WadMulDiv.WAD - beta, surplus, WadMulDiv.WAD, WadMulDiv.Rounding.Up
        );
        uint256 payDown = WadMulDiv.mulDiv(
            WadMulDiv.WAD - beta, surplus, WadMulDiv.WAD, WadMulDiv.Rounding.Down
        );
        assertGt(payUp, payDown, "Up rounding must over-pay vs Down");
        assertEq(payUp, payDown + 1);
        assertLt(surplus - payUp, surplus - payDown, "Up rounding reduces LP retention");
    }

    function test_v2NoSurplusUnit() public {
        vm.expectRevert(abi.encodeWithSelector(RiptideErrors.RiptideNoSurplus.selector, int256(-1)));
        kernel.splitSurplus(100, 101, 500_000_000_000_000_000);
    }

    function test_v2NoSurplusFuzz(uint256 executedIn, uint256 staleIn, uint64 beta) public {
        beta = uint64(bound(beta, 1, WadMulDiv.WAD - 1));
        vm.assume(executedIn < staleIn);
        vm.expectRevert();
        kernel.splitSurplus(executedIn, staleIn, beta);
    }

    function test_v2NegativeControlUnderflowWithoutGuard() public {
        // Negative control: unchecked surplus subtraction would underflow when executedIn < staleIn.
        vm.expectRevert();
        this._unsafeSurplus(100, 200);
    }

    function _unsafeSurplus(uint256 executedIn, uint256 staleIn) external pure returns (uint256) {
        return executedIn - staleIn;
    }

    function test_staleBaselineExactOutVectors() public view {
        string memory json = _loadVector("cpmm_swap_v1.json");
        uint256 n = _caseCount(json);
        for (uint256 i = 0; i < n; i++) {
            string memory base = string.concat(".cases[", vm.toString(i), "]");
            string memory kind = json.readString(string.concat(base, ".inputs.kind"));
            if (keccak256(bytes(kind)) != keccak256("exact_out")) continue;

            uint256 reserveIn = json.readUint(string.concat(base, ".inputs.reserveIn"));
            uint256 reserveOut = json.readUint(string.concat(base, ".inputs.reserveOut"));
            uint256 amountOut = json.readUint(string.concat(base, ".inputs.amountOut"));
            uint256 feeBps = json.readUint(string.concat(base, ".inputs.feeBps"));

            uint256 expectedWithFee = CpmmMath.exactOut(reserveIn, reserveOut, amountOut, feeBps);
            uint256 baseline = kernel.staleBaselineIn(amountOut, uint128(reserveIn), uint128(reserveOut), RiptideTypes.QuoteKind.ExactOutput);
            assertEq(baseline, CpmmMath.exactOut(reserveIn, reserveOut, amountOut, 0));
            _assertUintOutput(expectedWithFee, json, string.concat(base, ".outputs.amountIn"));
            assertLe(baseline, expectedWithFee);
        }
    }

    function test_auctionBalanceMatchesDiamondVectors() public view {
        string memory json = _loadVector("diamond_split_v1.json");
        uint256 n = _caseCount(json);
        uint40 start = 1000;
        uint16 duration = 10_000;
        uint64 decay = 990_000_000_000_000_000;
        uint256 nowTs = start + 100;

        for (uint256 i = 0; i < n; i++) {
            string memory base = string.concat(".cases[", vm.toString(i), "]");
            uint128 balance = uint128(1000000000000000000000);
            uint128 dutch = kernel.auctionBalance(balance, start, duration, decay, true, nowTs);
            uint256 factor = DutchPow.pow(decay, 100);
            uint256 expected = WadMulDiv.mulDiv(balance, factor, WadMulDiv.WAD, WadMulDiv.Rounding.Down);
            _assertUintOutput(dutch, json, string.concat(base, ".outputs.dutchBalanceIn"));
            assertEq(dutch, expected);
        }
    }

    function test_auctionWindowClosed() public {
        vm.expectRevert(abi.encodeWithSelector(RiptideErrors.RiptideAuctionWindowClosed.selector, uint40(1000), uint16(100), uint256(2000)));
        kernel.auctionBalance(1e18, 1000, 100, 990_000_000_000_000_000, true, 2000);
    }

    function test_diamondSplitVectors() public view {
        string memory json = _loadVector("diamond_split_v1.json");
        uint256 n = _caseCount(json);
        for (uint256 i = 0; i < n; i++) {
            string memory base = string.concat(".cases[", vm.toString(i), "]");
            uint256 surplus = json.readUint(string.concat(base, ".inputs.surplusWad"));
            uint64 beta = uint64(json.readUint(string.concat(base, ".inputs.beta")));
            RiptideTypes.RebalanceResult memory r = kernel.splitSurplus(surplus, 0, beta);
            _assertUintOutput(r.payToResolver, json, string.concat(base, ".outputs.payToResolver"));
            _assertUintOutput(r.retainToLP, json, string.concat(base, ".outputs.retainToLP"));
            _assertUintOutput(r.surplusWad, json, string.concat(base, ".outputs.surplus"));
        }
    }

}
