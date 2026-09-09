// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";
import { Vm } from "forge-std/Vm.sol";

import { RiptideForkBase } from "../helpers/RiptideForkBase.sol";
import { RiptideStrategyCodec } from "../../src/core/RiptideStrategyCodec.sol";
import { IRiptideEvents } from "../../src/interfaces/IRiptideEvents.sol";
import { FeeController } from "../../src/libraries/FeeController.sol";
import { VolatilityMath } from "../../src/libraries/VolatilityMath.sol";
import { LnExpMath } from "../../src/libraries/LnExpMath.sol";
import { WadMulDiv } from "../../src/libraries/WadMulDiv.sol";

/// @notice Gate 6: a settled rebalance's revealed price must move the next quote's fee.
///
/// Trace (reuse later for the demo script / LoopVisualizer):
///   1. Ship a swap strategy. Quote reports feeMin while σ is still the seeded floor.
///   2. Vol-indexer last price is far from the CPMM. Rebalance observes the auction
///      revealed price, EWMA σ jumps, PI steps the fee toward the new target.
///   3. The next swap quote reads the advanced controller — higher realized vol → higher fee.
contract LoopTest is RiptideForkBase {
    uint128 internal constant SEEDED_LAST_PRICE = 1e18;
    uint256 internal constant DT_SECONDS = 600;

    struct LoopTrace {
        uint24 fee0;
        uint128 sigma0;
        uint128 var0;
        uint256 quoteOut0;
        uint128 revealedPriceWad;
        uint128 sigma1;
        uint24 feeTarget1;
        uint24 fee1;
        uint256 quoteOut1;
    }

    LoopTrace internal trace;

    function setUp() public {
        vm.warp(10_000);
        _deploySystem();
    }

    function test_loopFeeUpdatesAfterRebalance() public {
        ISwapVM.Order memory swapOrder = _shipAndRegister();
        _recordBaseline(swapOrder);
        _settleRebalance();
        _recordAfter(swapOrder);
        _assertLoop();
    }

    function _recordBaseline(ISwapVM.Order memory swapOrder) internal {
        oracle.observe(strategyKey, SEEDED_LAST_PRICE, uint40(block.timestamp), false);
        trace.sigma0 = oracle.sigmaWad(strategyKey);
        trace.var0 = oracle.varWad(strategyKey);
        trace.fee0 = _feeReported();
        (, trace.quoteOut0,) = _quoteExactIn(swapOrder, 100e18);

        emit log_named_uint("loop.fee0", trace.fee0);
        emit log_named_uint("loop.sigma0", trace.sigma0);
        emit log_named_uint("loop.quoteOut0", trace.quoteOut0);

        assertEq(trace.sigma0, strategy.fee.sigmaMin, "seed observe clamps sigma to sigmaMin");
        assertEq(trace.fee0, strategy.fee.feeMin, "controller has not advanced yet");
        assertGt(trace.quoteOut0, 0);
    }

    function _settleRebalance() internal {
        strategy.feeProvider = address(provider);
        uint40 auctionStart = uint40(block.timestamp);
        ISwapVM.Order memory rebOrder =
            rebalanceRouter.buildRebalanceOrder(maker, strategy, uint40(block.timestamp + 1 hours), 1e18, resolver, true);
        bytes32 rebHash = rebalanceRouter.hash(rebOrder);

        tokenQuote.mint(maker, 5_000_000e18);
        vm.startPrank(maker);
        tokenQuote.approve(address(aqua), type(uint256).max);
        aqua.ship(address(rebalanceRouter), abi.encode(rebOrder), _tokens(), _amounts(100e18, 500_000e18));
        rebalanceRouter.registerStrategy(
            strategyKey, rebHash, RiptideStrategyCodec.marketId(strategy.baseToken, strategy.quoteToken)
        );
        rebalanceRouter.setRebalanceAuctionStart(strategyKey, auctionStart);
        vm.stopPrank();

        vm.warp(block.timestamp + DT_SECONDS);
        tokenQuote.mint(taker, 1_000_000e18);
        vm.startPrank(taker);
        tokenQuote.approve(address(rebalanceRouter), type(uint256).max);
        vm.recordLogs();
        rebalanceRouter.swap(rebOrder, address(tokenQuote), address(tokenBase), 1e18, _swapTakerData(false));
        vm.stopPrank();

        trace.revealedPriceWad = _revealedPriceFromLogs(vm.getRecordedLogs());
    }

    function _recordAfter(ISwapVM.Order memory swapOrder) internal {
        trace.sigma1 = oracle.sigmaWad(strategyKey);
        trace.fee1 = _feeReported();
        trace.feeTarget1 =
            FeeController.feeTarget(trace.sigma1, strategy.fee.lambda, strategy.fee.feeMin, strategy.fee.feeMax);
        (, trace.quoteOut1,) = _quoteExactIn(swapOrder, 100e18);

        emit log_named_uint("loop.revealedPriceWad", trace.revealedPriceWad);
        emit log_named_uint("loop.sigma1", trace.sigma1);
        emit log_named_uint("loop.feeTarget", trace.feeTarget1);
        emit log_named_uint("loop.fee1", trace.fee1);
        emit log_named_uint("loop.quoteOut1", trace.quoteOut1);
    }

    function _assertLoop() internal view {
        uint256 ratio =
            WadMulDiv.mulDiv(trace.revealedPriceWad, WadMulDiv.WAD, SEEDED_LAST_PRICE, WadMulDiv.Rounding.Down);
        uint128 expectedSigma = VolatilityMath.sigmaFromVar(
            VolatilityMath.ewmaVar(trace.var0, LnExpMath.lnWad(ratio), strategy.fee.lambda, 0, false),
            uint64(DT_SECONDS * WadMulDiv.WAD),
            strategy.fee.sigmaMin,
            strategy.fee.sigmaMax
        );
        (uint24 expectedFee,) = FeeController.piStep(
            FeeController.PiState({
                feeReported: trace.fee0,
                integral: 0,
                kp: strategy.fee.kp,
                ki: strategy.fee.ki,
                iMax: strategy.fee.iMax,
                feeMin: strategy.fee.feeMin,
                feeMax: strategy.fee.feeMax
            }),
            trace.feeTarget1
        );

        assertEq(trace.sigma1, expectedSigma, "sigma matches Phase 3 EWMA given the revealed return");
        assertGt(trace.sigma1, trace.sigma0, "higher realized vol after the auction observation");
        assertEq(trace.fee1, expectedFee, "fee matches one PI step on the new target");
        assertGt(trace.fee1, trace.fee0, "higher realized vol -> higher fee");
        assertLt(trace.quoteOut1, trace.quoteOut0, "next swap quote worsens for the taker after the fee step");
        assertTrue(trace.revealedPriceWad != SEEDED_LAST_PRICE, "revealed price differs from last observation");
    }

    function _revealedPriceFromLogs(Vm.Log[] memory logs) internal pure returns (uint128 revealed) {
        bytes32 topic0 = IRiptideEvents.RebalanceSettled.selector;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics.length > 0 && logs[i].topics[0] == topic0) {
                bytes memory data = logs[i].data;
                assembly ("memory-safe") {
                    // ABI-encoded non-indexed fields; revealedPriceWad is word 8.
                    revealed := mload(add(data, add(32, mul(8, 32))))
                }
                return revealed;
            }
        }
        revert("RebalanceSettled not found");
    }
}
