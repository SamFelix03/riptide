// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { IAqua } from "@1inch/aqua/src/interfaces/IAqua.sol";

/// @notice Phase 1 fork smoke test: ship a strategy into real Aqua and read safeBalances.
contract ProvenanceTest is Test {
    address internal constant AQUA_REGISTRY = 0x1111113CCf1426A8E30e2bfF5E005d929bF6a90a;
    address internal constant WETH = 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2;
    address internal constant USDC = 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48;

    IAqua internal aqua;
    address internal maker;
    address internal app;

    function setUp() public {
        string memory rpc = vm.envOr("RPC_URL_TARGET", string("https://ethereum.publicnode.com"));
        vm.createSelectFork(rpc);

        aqua = IAqua(AQUA_REGISTRY);
        maker = makeAddr("maker");
        app = makeAddr("riptide-app");
        vm.startPrank(maker);
    }

    function test_shipAndReadSafeBalances() public {
        bytes memory strategy = abi.encode("riptide-provenance-smoke-v1");
        address[] memory tokens = new address[](2);
        tokens[0] = WETH;
        tokens[1] = USDC;

        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1 ether;
        amounts[1] = 1_000e6;

        bytes32 strategyHash = aqua.ship(app, strategy, tokens, amounts);

        (uint256 balance0, uint256 balance1) =
            aqua.safeBalances(maker, app, strategyHash, WETH, USDC);

        assertEq(balance0, amounts[0], "WETH balance mismatch");
        assertEq(balance1, amounts[1], "USDC balance mismatch");
        assertTrue(strategyHash != bytes32(0), "strategyHash must be non-zero");
    }
}
