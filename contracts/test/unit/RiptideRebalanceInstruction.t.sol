// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";

import { RiptideRebalanceKernel } from "../../src/core/RiptideRebalanceKernel.sol";
import { RiptideTypes } from "../../src/types/RiptideTypes.sol";
import { RiptideErrors } from "../../src/types/RiptideErrors.sol";

contract RiptideRebalanceInstructionTest is Test {
    RiptideRebalanceKernel internal kernel;

    function setUp() public {
        kernel = new RiptideRebalanceKernel();
    }

    function test_splitSurplusRevertsOnNoSurplus() public {
        vm.expectRevert(abi.encodeWithSelector(RiptideErrors.RiptideNoSurplus.selector, int256(-1)));
        kernel.splitSurplus(100, 101, 950_000_000_000_000_000);
    }

    function test_splitSurplusConservation() public {
        RiptideTypes.RebalanceResult memory r = kernel.splitSurplus(1000, 500, 950_000_000_000_000_000);
        assertEq(r.payToResolver + r.retainToLP, r.surplusWad);
    }
}
