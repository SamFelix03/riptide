// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";
import { TakerTraitsLib } from "@1inch/swap-vm/libs/TakerTraits.sol";
import { stdJson } from "forge-std/StdJson.sol";
import { TokenMock } from "@1inch/solidity-utils/contracts/mocks/TokenMock.sol";
import { Aqua } from "@1inch/aqua/src/Aqua.sol";

import { RiptideTypes } from "../../src/types/RiptideTypes.sol";
import { RiptideStrategyCodec } from "../../src/core/RiptideStrategyCodec.sol";
import { RiptideQuoter } from "../../src/periphery/RiptideQuoter.sol";
import { RiptideConstants } from "../../src/core/RiptideConstants.sol";
import { MockChainlinkAggregator } from "../mocks/MockChainlinkAggregator.sol";
import { VectorLoader } from "./VectorLoader.sol";
import { RiptideSystemDeployer } from "../helpers/RiptideSystemDeployer.sol";

/// @notice Quoter matches router-wrapped quotes for committed CPMM vector inputs.
contract RiptideQuoterTest is VectorLoader {
    using stdJson for string;

    Aqua internal aqua;
    TokenMock internal tokenBase;
    TokenMock internal tokenQuote;
    RiptideQuoter internal quoter;
    RiptideSystemDeployer.System internal sys;
    MockChainlinkAggregator internal feed;
    address internal maker = makeAddr("quoterMaker");

    function setUp() public {
        aqua = new Aqua();
        tokenBase = new TokenMock("Base", "BASE");
        tokenQuote = new TokenMock("Quote", "QUOTE");
        feed = new MockChainlinkAggregator();
        feed.setRound(2_000e8, block.timestamp);

        RiptideSystemDeployer deployer = new RiptideSystemDeployer();
        sys = deployer.deploy(address(aqua), address(this));
        quoter = sys.quoter;
    }

    function test_quoterMatchesCpmmVectors() public {
        string memory json = _loadVector("cpmm_swap_v1.json");
        uint256 n = _caseCount(json);
        for (uint256 i = 0; i < n; i++) {
            string memory base = string.concat(".cases[", vm.toString(i), "]");
            string memory kind = json.readString(string.concat(base, ".inputs.kind"));
            uint256 reserveIn = json.readUint(string.concat(base, ".inputs.reserveIn"));
            uint256 reserveOut = json.readUint(string.concat(base, ".inputs.reserveOut"));
            uint24 feeBps = uint24(json.readUint(string.concat(base, ".inputs.feeBps")));

            RiptideTypes.Strategy memory s =
                _strategy(uint128(reserveOut), uint128(reserveIn), feeBps, bytes32(uint256(i + 1)));
            _ship(s);

            bool exactIn = keccak256(bytes(kind)) == keccak256("exact_in");
            uint256 raw = exactIn
                ? json.readUint(string.concat(base, ".inputs.amountIn"))
                : json.readUint(string.concat(base, ".inputs.amountOut"));

            RiptideTypes.QuoteKind qKind =
                exactIn ? RiptideTypes.QuoteKind.ExactInput : RiptideTypes.QuoteKind.ExactOutput;

            ISwapVM.Order memory order = sys.swapRouter.buildSwapOrder(s.maker, s, RiptideConstants.SWAP_ORDER_DEADLINE);
            bytes memory takerData = _quoteTakerData(exactIn);
            (uint256 routerIn, uint256 routerOut,) =
                sys.swapRouter.asView().quote(order, s.quoteToken, s.baseToken, raw, takerData);

            (uint256 quoterIn, uint256 quoterOut, uint24 feeApplied,) = quoter.quoteSwap(s, qKind, raw);

            assertEq(quoterIn, routerIn);
            assertEq(quoterOut, routerOut);
            uint24 expectedFee = feeBps == 0 ? uint24(1) : feeBps;
            assertEq(feeApplied, expectedFee);
        }
    }

    function _quoteTakerData(bool exactIn) internal pure returns (bytes memory) {
        return TakerTraitsLib.build(
            TakerTraitsLib.Args({
                taker: address(0),
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

    function _strategy(uint128 reserveBase, uint128 reserveQuote, uint24 feeBps, bytes32 salt)
        internal
        view
        returns (RiptideTypes.Strategy memory s)
    {
        s = RiptideTypes.Strategy({
            maker: maker,
            baseToken: address(tokenBase),
            quoteToken: address(tokenQuote),
            reserveBaseWad: reserveBase,
            reserveQuoteWad: reserveQuote,
            fee: RiptideTypes.FeePolicy({
                feeMin: feeBps == 0 ? uint24(1) : feeBps,
                feeMax: (feeBps == 0 ? uint24(1) : feeBps) + 1000,
                lambda: 100_000_000_000_000_000,
                kp: 0,
                ki: 0,
                iMax: 0,
                sigmaMin: 0,
                sigmaMax: 1_000_000_000_000_000_000
            }),
            auction: RiptideTypes.AuctionPolicy({
                beta: 950_000_000_000_000_000,
                duration: 3600,
                decay: 990_000_000_000_000_000,
                antiSandwichPeriod: 300
            }),
            oracle: RiptideTypes.OracleConfig({ feed: address(feed), decimals: 8, maxStaleness: 3600 }),
            feeProvider: address(sys.provider),
            salt: salt
        });
    }

    function _ship(RiptideTypes.Strategy memory s) internal {
        bytes32 strategyKey = RiptideStrategyCodec.runtimeStrategyKey(s.maker, s.salt);
        ISwapVM.Order memory order = sys.swapRouter.buildSwapOrder(s.maker, s, RiptideConstants.SWAP_ORDER_DEADLINE);
        bytes32 orderHash = sys.swapRouter.hash(order);

        tokenBase.mint(s.maker, uint256(s.reserveBaseWad) * 10);
        tokenQuote.mint(s.maker, uint256(s.reserveQuoteWad) * 10);
        vm.startPrank(s.maker);
        tokenBase.approve(address(aqua), type(uint256).max);
        tokenQuote.approve(address(aqua), type(uint256).max);
        aqua.ship(address(sys.swapRouter), abi.encode(order), _pair(), _amounts(s.reserveBaseWad, s.reserveQuoteWad));
        sys.swapRouter.registerStrategy(strategyKey, orderHash, s, s.maker);
        vm.stopPrank();
    }

    function _pair() internal view returns (address[] memory tokens) {
        tokens = new address[](2);
        tokens[0] = address(tokenBase);
        tokens[1] = address(tokenQuote);
    }

    function _amounts(uint128 baseAmt, uint128 quoteAmt) internal pure returns (uint256[] memory amounts) {
        amounts = new uint256[](2);
        amounts[0] = baseAmt;
        amounts[1] = quoteAmt;
    }
}
