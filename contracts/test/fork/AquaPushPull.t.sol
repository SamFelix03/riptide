// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { RiptideForkBase } from "../helpers/RiptideForkBase.sol";

/// @notice Explicit Aqua push/pull balance accounting.
contract AquaPushPullTest is RiptideForkBase {
    function setUp() public {
        _deploySystem();
    }

    function test_pushPullAccounting() public {
        _shipAndRegister();

        (uint256 baseBefore, uint256 quoteBefore) =
            aqua.safeBalances(maker, address(swapRouter), orderHash, address(tokenBase), address(tokenQuote));

        tokenQuote.mint(address(this), 10_000e18);
        tokenQuote.approve(address(aqua), 10_000e18);
        aqua.push(maker, address(swapRouter), orderHash, address(tokenQuote), 10_000e18);

        (uint256 baseMid, uint256 quoteMid) =
            aqua.safeBalances(maker, address(swapRouter), orderHash, address(tokenBase), address(tokenQuote));
        assertEq(baseMid, baseBefore);
        assertEq(quoteMid, quoteBefore + 10_000e18);

        vm.prank(address(swapRouter));
        aqua.pull(maker, orderHash, address(tokenQuote), 5_000e18, address(this));

        (uint256 baseAfter, uint256 quoteAfter) =
            aqua.safeBalances(maker, address(swapRouter), orderHash, address(tokenBase), address(tokenQuote));
        assertEq(baseAfter, baseBefore);
        assertEq(quoteAfter, quoteMid - 5_000e18);
    }
}
