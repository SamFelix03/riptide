// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";

import { RiptideForkBase } from "../helpers/RiptideForkBase.sol";

/// @notice Runtime: docked strategy rejects swap.
contract RuntimeDockedTest is RiptideForkBase {
    function setUp() public {
        _deploySystem();
    }

    function test_dockedStrategyReverts() public {
        ISwapVM.Order memory order = _shipAndRegister();

        vm.prank(maker);
        aqua.dock(address(swapRouter), orderHash, _tokens());

        vm.expectRevert();
        aqua.safeBalances(maker, address(swapRouter), orderHash, address(tokenBase), address(tokenQuote));

        tokenQuote.mint(taker, 1000e18);
        vm.startPrank(taker);
        tokenQuote.approve(address(swapRouter), 1000e18);
        vm.expectRevert();
        swapRouter.riptideSwap(order, address(tokenQuote), address(tokenBase), 1000e18, _swapTakerData(true));
        vm.stopPrank();
    }
}
