// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { TokenMock } from "@1inch/solidity-utils/contracts/mocks/TokenMock.sol";
import { Aqua } from "@1inch/aqua/src/Aqua.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";
import { TakerTraitsLib } from "@1inch/swap-vm/libs/TakerTraits.sol";

import { RiptideTypes } from "../../src/types/RiptideTypes.sol";
import { RiptideRebalanceKernel } from "../../src/core/RiptideRebalanceKernel.sol";
import { RiptideVolatilityOracle } from "../../src/oracle/RiptideVolatilityOracle.sol";
import { RiptideLvrFeeProvider } from "../../src/fees/RiptideLvrFeeProvider.sol";
import { RiptideSwapVMRouter } from "../../src/core/RiptideSwapVMRouter.sol";
import { RiptideRebalanceRouter } from "../../src/core/RiptideRebalanceRouter.sol";
import { RiptideAuctionSettler } from "../../src/periphery/RiptideAuctionSettler.sol";
import { RiptideQuoter } from "../../src/periphery/RiptideQuoter.sol";
import { RiptideLens } from "../../src/periphery/RiptideLens.sol";
import { RiptideBatchExecutor } from "../../src/periphery/RiptideBatchExecutor.sol";
import { IRiptideBatchExecutor } from "../../src/interfaces/IRiptideBatchExecutor.sol";
import { RiptideTypes } from "../../src/types/RiptideTypes.sol";
import { RiptideStrategyCodec } from "../../src/core/RiptideStrategyCodec.sol";
import { RiptideConstants } from "../../src/core/RiptideConstants.sol";
import { MockChainlinkAggregator } from "../mocks/MockChainlinkAggregator.sol";
import { RiptideSystemDeployer } from "./RiptideSystemDeployer.sol";

/// @notice Shared deploy + ship helpers for integration/fork tests.
abstract contract RiptideForkBase is Test {
    Aqua internal aqua;
    TokenMock internal tokenBase;
    TokenMock internal tokenQuote;
    RiptideRebalanceKernel internal kernel;
    RiptideVolatilityOracle internal oracle;
    RiptideLvrFeeProvider internal provider;
    RiptideSwapVMRouter internal swapRouter;
    RiptideRebalanceRouter internal rebalanceRouter;
    RiptideAuctionSettler internal settler;
    RiptideQuoter internal quoter;
    RiptideLens internal lens;
    RiptideBatchExecutor internal batchExecutor;
    MockChainlinkAggregator internal feed;

    address internal maker = makeAddr("maker");
    address internal taker = makeAddr("taker");
    address internal resolver = makeAddr("resolver");

    bytes32 internal strategyKey;
    bytes32 internal orderHash;
    RiptideTypes.Strategy internal strategy;

    function _deploySystem() internal {
        aqua = new Aqua();
        tokenBase = new TokenMock("Base", "BASE");
        tokenQuote = new TokenMock("Quote", "QUOTE");

        RiptideSystemDeployer deployer = new RiptideSystemDeployer();
        RiptideSystemDeployer.System memory sys = deployer.deploy(address(aqua), address(this));
        kernel = sys.kernel;
        oracle = sys.oracle;
        provider = sys.provider;
        swapRouter = sys.swapRouter;
        rebalanceRouter = sys.rebalanceRouter;
        settler = sys.settler;
        quoter = sys.quoter;
        lens = sys.lens;
        batchExecutor = sys.batchExecutor;

        feed = new MockChainlinkAggregator();
        feed.setRound(2_000e8, block.timestamp);
        strategy = _defaultStrategy();
    }

    function _defaultStrategy() internal view returns (RiptideTypes.Strategy memory s) {
        s = RiptideTypes.Strategy({
            maker: maker,
            baseToken: address(tokenBase),
            quoteToken: address(tokenQuote),
            reserveBaseWad: 100e18,
            reserveQuoteWad: 200_000e18,
            fee: RiptideTypes.FeePolicy({
                feeMin: 30_000,
                feeMax: 500_000,
                lambda: 100_000_000_000_000_000,
                kp: 500_000_000_000_000_000,
                ki: 100_000_000_000_000_000,
                iMax: 1_000_000_000_000_000_000,
                sigmaMin: 10_000_000_000_000_000,
                sigmaMax: 1_000_000_000_000_000_000
            }),
            auction: RiptideTypes.AuctionPolicy({
                beta: 950_000_000_000_000_000,
                duration: 3600,
                decay: 990_000_000_000_000_000,
                antiSandwichPeriod: 300
            }),
            oracle: RiptideTypes.OracleConfig({ feed: address(feed), decimals: 8, maxStaleness: 3600 }),
            feeProvider: address(0),
            salt: bytes32(uint256(1))
        });
        s.feeProvider = address(provider);
    }

    function _shipAndRegister() internal returns (ISwapVM.Order memory order) {
        strategy.feeProvider = address(provider);
        order = swapRouter.buildSwapOrder(maker, strategy, RiptideConstants.SWAP_ORDER_DEADLINE);
        orderHash = swapRouter.hash(order);
        strategyKey = RiptideStrategyCodec.runtimeStrategyKey(maker, strategy.salt);

        tokenBase.mint(maker, 1000e18);
        tokenQuote.mint(maker, 2_000_000e18);
        vm.startPrank(maker);
        tokenBase.approve(address(aqua), type(uint256).max);
        tokenQuote.approve(address(aqua), type(uint256).max);
        aqua.ship(
            address(swapRouter),
            abi.encode(order),
            _tokens(),
            _amounts(100e18, 200_000e18)
        );
        swapRouter.registerStrategy(strategyKey, orderHash, strategy, maker);
        vm.stopPrank();
    }

    function _tokens() internal view returns (address[] memory tokens) {
        tokens = new address[](2);
        tokens[0] = address(tokenBase);
        tokens[1] = address(tokenQuote);
    }

    function _amounts(uint256 baseAmt, uint256 quoteAmt) internal pure returns (uint256[] memory amounts) {
        amounts = new uint256[](2);
        amounts[0] = baseAmt;
        amounts[1] = quoteAmt;
    }

    function _quoteTakerData(bool exactIn) internal view returns (bytes memory) {
        return TakerTraitsLib.build(
            TakerTraitsLib.Args({
                taker: taker,
                isExactIn: exactIn,
                shouldUnwrapWeth: false,
                isStrictThresholdAmount: false,
                isFirstTransferFromTaker: false,
                useTransferFromAndAquaPush: false,
                threshold: "",
                to: address(0),
                deadline: 0,
                hasPreTransferInCallback: false,
                hasPreTransferOutCallback: false,
                preTransferInHookData: "",
                postTransferInHookData: "",
                preTransferOutHookData: "",
                postTransferOutHookData: "",
                preTransferInCallbackData: "",
                preTransferOutCallbackData: "",
                instructionsArgs: "",
                signature: ""
            })
        );
    }

    function _swapTakerData(bool exactIn) internal view returns (bytes memory) {
        return TakerTraitsLib.build(
            TakerTraitsLib.Args({
                taker: taker,
                isExactIn: exactIn,
                shouldUnwrapWeth: false,
                isStrictThresholdAmount: false,
                isFirstTransferFromTaker: true,
                useTransferFromAndAquaPush: true,
                threshold: "",
                to: address(0),
                deadline: 0,
                hasPreTransferInCallback: false,
                hasPreTransferOutCallback: false,
                preTransferInHookData: "",
                postTransferInHookData: "",
                preTransferOutHookData: "",
                postTransferOutHookData: "",
                preTransferInCallbackData: "",
                preTransferOutCallbackData: "",
                instructionsArgs: "",
                signature: ""
            })
        );
    }

    function _quoteExactIn(ISwapVM.Order memory order, uint256 amountIn)
        internal
        returns (uint256 amountInOut, uint256 amountOut, bytes32 hash)
    {
        return swapRouter.asView().quote(order, address(tokenQuote), address(tokenBase), amountIn, _quoteTakerData(true));
    }

    function _riptideSwapExactIn(ISwapVM.Order memory order, uint256 amountIn)
        internal
        returns (uint256 amountInOut, uint256 amountOut, bytes32 hash)
    {
        tokenQuote.mint(taker, amountIn);
        vm.startPrank(taker);
        tokenQuote.approve(address(swapRouter), amountIn);
        (amountInOut, amountOut, hash) =
            swapRouter.riptideSwap(order, address(tokenQuote), address(tokenBase), amountIn, _swapTakerData(true));
        vm.stopPrank();
    }

    function _feeReported() internal view returns (uint24) {
        (uint24 fee,) = provider.controllerState(strategyKey);
        return fee;
    }

    function _quoteViaQuoter(uint256 amount, bool exactIn)
        internal
        view
        returns (uint256 amountIn, uint256 amountOut, uint24 feeBps, uint128 sigma)
    {
        RiptideTypes.QuoteKind kind =
            exactIn ? RiptideTypes.QuoteKind.ExactInput : RiptideTypes.QuoteKind.ExactOutput;
        return quoter.quoteSwap(strategy, kind, amount);
    }

    function _settleViaSettler(uint256 outWad, uint256 maxInWad)
        internal
        returns (RiptideTypes.RebalanceResult memory result)
    {
        strategy.feeProvider = address(provider);
        _shipRebalanceStrategy();
        tokenQuote.mint(resolver, maxInWad);
        vm.startPrank(resolver);
        tokenQuote.approve(address(settler), maxInWad);
        result = settler.settleRebalance(maker, strategy, outWad, maxInWad, uint40(block.timestamp + 1 hours));
        vm.stopPrank();
    }

    function _shipRebalanceStrategy() internal {
        uint40 auctionStart = uint40(block.timestamp);
        ISwapVM.Order memory rebOrder = rebalanceRouter.buildRebalanceOrderWithAuctionStart(
            maker, strategy, RiptideConstants.SWAP_ORDER_DEADLINE, 1e18, true, auctionStart
        );
        bytes32 rebHash = rebalanceRouter.hash(rebOrder);
        strategyKey = RiptideStrategyCodec.runtimeStrategyKey(maker, strategy.salt);

        tokenBase.mint(maker, 1000e18);
        tokenQuote.mint(maker, 2_000_000e18);
        vm.startPrank(maker);
        tokenBase.approve(address(aqua), type(uint256).max);
        tokenQuote.approve(address(aqua), type(uint256).max);
        aqua.ship(address(rebalanceRouter), abi.encode(rebOrder), _tokens(), _amounts(100e18, 200_000e18));
        swapRouter.registerStrategy(strategyKey, rebHash, strategy, maker);
        rebalanceRouter.registerStrategy(strategyKey, rebHash, RiptideStrategyCodec.marketId(strategy.baseToken, strategy.quoteToken));
        rebalanceRouter.setRebalanceAuctionStart(strategyKey, auctionStart);
        vm.stopPrank();
        orderHash = rebHash;
    }

    function _executeBatch(IRiptideBatchExecutor.Route memory route) internal returns (uint256 inAmt, uint256 outAmt) {
        tokenQuote.mint(route.payer, 10_000_000e18);
        vm.startPrank(route.payer);
        tokenQuote.approve(address(batchExecutor), type(uint256).max);
        (inAmt, outAmt) = batchExecutor.execute(route);
        vm.stopPrank();
    }
}
