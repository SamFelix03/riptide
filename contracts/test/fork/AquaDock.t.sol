// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";

import { RiptideForkBase } from "../helpers/RiptideForkBase.sol";

/// @notice Aqua dock blocks swaps after the maker docks the strategy.
contract AquaDockTest is RiptideForkBase {
    function setUp() public {
        _deploySystem();
    }

    function test_shipDockSwapBlocked() public {
        ISwapVM.Order memory order = _shipAndRegister();

        vm.prank(maker);
        aqua.dock(address(swapRouter), orderHash, _tokens());

        tokenQuote.mint(taker, 1000e18);
        vm.startPrank(taker);
        tokenQuote.approve(address(swapRouter), 1000e18);
        vm.expectRevert();
        swapRouter.riptideSwap(order, address(tokenQuote), address(tokenBase), 1000e18, _swapTakerData(true));
        vm.stopPrank();
    }
}
