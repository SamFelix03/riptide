// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { RiptideForkBase } from "../helpers/RiptideForkBase.sol";
import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";

/// @notice Aqua dock blocks swaps after maker docks strategy.
contract AquaDockTest is RiptideForkBase {
    function setUp() public {
        _deploySystem();
    }

    function test_shipDockSwapBlocked() public {
        ISwapVM.Order memory order = _shipAndRegister();

        address[] memory tokens = _tokens();
        vm.prank(maker);
        aqua.dock(address(swapRouter), orderHash, tokens);

        tokenQuote.mint(taker, 1000e18);
        vm.startPrank(taker);
        tokenQuote.approve(address(swapRouter), 1000e18);
        vm.expectRevert();
        swapRouter.riptideSwap(order, address(tokenQuote), address(tokenBase), 1000e18, _swapTakerData(true));
        vm.stopPrank();
    }
}
