// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { RiptideForkBase } from "../helpers/RiptideForkBase.sol";
import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";

/// @notice One test per SWAPVM_INTEGRATION.md §9 invariant (smoke level).
contract SwapVMInvariantsTest is RiptideForkBase {
    function setUp() public {
        _deploySystem();
    }

    function test_invariant1_exactInOutSymmetry() public {
        ISwapVM.Order memory order = _shipAndRegister();
        (, uint256 out,) = _quoteExactIn(order, 1000e18);
        assertGt(out, 0);
    }

    function test_invariant2_additivity() public {
        ISwapVM.Order memory order = _shipAndRegister();
        (, uint256 out1,) = _quoteExactIn(order, 500e18);
        (, uint256 out2,) = _quoteExactIn(order, 500e18);
        (, uint256 outCombined,) = _quoteExactIn(order, 1000e18);
        assertLe(outCombined, out1 + out2);
    }

    function test_invariant3_quoteSwapConsistency() public {
        ISwapVM.Order memory order = _shipAndRegister();
        (, uint256 quoteOut,) = _quoteExactIn(order, 1000e18);
        (, uint256 swapOut,) = _riptideSwapExactIn(order, 1000e18);
        assertEq(quoteOut, swapOut);
    }

    function test_invariant4_priceMonotonicity() public {
        ISwapVM.Order memory order = _shipAndRegister();
        (, uint256 small,) = _quoteExactIn(order, 100e18);
        (, uint256 large,) = _quoteExactIn(order, 1000e18);
        assertGt(large, small);
    }

    function test_invariant5_makerFavorableRounding() public {
        ISwapVM.Order memory order = _shipAndRegister();
        _riptideSwapExactIn(order, 1000e18);
        (uint256 balBase,) = aqua.safeBalances(maker, address(swapRouter), orderHash, address(tokenBase), address(tokenQuote));
        assertGt(balBase, 0);
    }

    function test_invariant6_balanceSufficiency() public {
        ISwapVM.Order memory order = _shipAndRegister();
        (uint256 baseBal,) =
            aqua.safeBalances(maker, address(swapRouter), orderHash, address(tokenBase), address(tokenQuote));
        tokenQuote.mint(taker, type(uint256).max / 2);
        vm.startPrank(taker);
        tokenQuote.approve(address(swapRouter), type(uint256).max);
        vm.expectRevert();
        swapRouter.riptideSwap(order, address(tokenQuote), address(tokenBase), baseBal + 1, _swapTakerData(false));
        vm.stopPrank();
    }

    function test_invariant7_strategyLiveness() public {
        ISwapVM.Order memory order = _shipAndRegister();
        _riptideSwapExactIn(order, 100e18);
        _quoteExactIn(order, 100e18);
    }
}
