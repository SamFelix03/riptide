// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { RiptideForkBase } from "../helpers/RiptideForkBase.sol";
import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";
import { AquaSwapVMRouter } from "@1inch/swap-vm/routers/AquaSwapVMRouter.sol";
import { RiptideConstants } from "../../src/core/RiptideConstants.sol";
import { RiptideStrategyCodec } from "../../src/core/RiptideStrategyCodec.sol";

/// @notice Does RIPTIDE's Mechanism-1 swap program run on 1inch's *stock* AquaSwapVMRouter?
/// @dev 1inch's guidance is that AMM strategies belong on `AquaSwapVMRouter` (the router
///      actually deployed on mainnets) and that AMM opcodes must not be mixed with the
///      limit-order set. RIPTIDE deploys its own slimmed router, so the question that
///      matters is whether the swap program it emits is still a plain Aqua-AMM program —
///      i.e. every opcode it uses is dispatched by stock `AquaOpcodes` at the same runtime
///      index. If this test passes, Mechanism 1 is portable to the official router.
contract StockAquaRouterCompatTest is RiptideForkBase {
    function setUp() public {
        _deploySystem();
    }

    function test_mechanism1ProgramRunsOnStockAquaSwapVMRouter() public {
        // A stock, unmodified 1inch router — no RIPTIDE code in its inheritance chain.
        AquaSwapVMRouter stock = new AquaSwapVMRouter(address(aqua), address(0), address(this), "stock", "1");

        // The real RIPTIDE swap order, built by RIPTIDE's own codec.
        strategy.feeProvider = address(provider);
        ISwapVM.Order memory order =
            swapRouter.buildSwapOrder(maker, strategy, RiptideConstants.SWAP_ORDER_DEADLINE);

        // Register with the fee provider so the 0x1e (index 30) staticcall resolves. The
        // provider is keyed by orderHash, which is keccak256(abi.encode(order)) and
        // therefore identical whichever router executes it.
        bytes32 orderHash = stock.hash(order);
        bytes32 key = RiptideStrategyCodec.runtimeStrategyKey(maker, strategy.salt);
        provider.registerStrategy(key, orderHash, strategy.fee, maker);

        // Ship the very same strategy bytes to Aqua, but with the STOCK router as the app.
        tokenBase.mint(maker, 1000e18);
        tokenQuote.mint(maker, 2_000_000e18);
        vm.startPrank(maker);
        tokenBase.approve(address(aqua), type(uint256).max);
        tokenQuote.approve(address(aqua), type(uint256).max);
        aqua.ship(address(stock), abi.encode(order), _tokens(), _amounts(100e18, 200_000e18));
        vm.stopPrank();

        (uint256 amountIn, uint256 amountOut,) =
            stock.asView().quote(order, address(tokenQuote), address(tokenBase), 1000e18, _quoteTakerData(true));

        assertEq(amountIn, 1000e18, "stock router consumed the exact input");
        assertGt(amountOut, 0, "stock AquaSwapVMRouter priced the RIPTIDE swap program");

        // And it must agree with RIPTIDE's own router to the wei: same program, same
        // opcodes, same indices — the router is not what determines the price.
        (, uint256 riptideOut,) = _quoteExactIn(_shipAndRegister(), 1000e18);
        assertEq(amountOut, riptideOut, "stock and RIPTIDE routers must price identically");
    }
}
