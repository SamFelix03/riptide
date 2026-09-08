// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IPriceOracle } from "@1inch/swap-vm/instructions/interfaces/IPriceOracle.sol";

import { RiptideTypes } from "../types/RiptideTypes.sol";
import { RiptideErrors } from "../types/RiptideErrors.sol";
import { WadMulDiv } from "../libraries/WadMulDiv.sol";
import { LnExpMath } from "../libraries/LnExpMath.sol";
import { VolatilityMath } from "../libraries/VolatilityMath.sol";
import { IRiptideVolatilityOracle } from "./IRiptideVolatilityOracle.sol";

/// @title RiptideVolatilityOracle
/// @notice EWMA/Garman-Klass realized volatility per strategy (CONTRACTS.md §7).
contract RiptideVolatilityOracle is IRiptideVolatilityOracle {
    struct OracleState {
        uint128 varWad;
        uint128 sigmaWad;
        uint40 lastObsTs;
        uint128 lastPriceWad;
        bool initialized;
    }

    struct OraclePolicy {
        uint64 lambda;
        uint64 sigmaMin;
        uint64 sigmaMax;
        uint16 maxStaleness;
    }

    address public immutable router;
    address public immutable swapRouter;
    address public immutable volIndexer;

    mapping(bytes32 => OracleState) internal _state;
    mapping(bytes32 => OraclePolicy) internal _policy;

    modifier onlyObserver() {
        if (msg.sender != router && msg.sender != volIndexer) {
            revert RiptideErrors.RiptideUnauthorizedObserver(msg.sender);
        }
        _;
    }

    modifier onlyConfigurer() {
        if (msg.sender != router && msg.sender != swapRouter && msg.sender != volIndexer) {
            revert RiptideErrors.RiptideUnauthorizedObserver(msg.sender);
        }
        _;
    }

    constructor(address router_, address swapRouter_, address volIndexer_) {
        if (router_ == address(0) || swapRouter_ == address(0) || volIndexer_ == address(0)) {
            revert RiptideErrors.RiptideZeroAddress();
        }
        router = router_;
        swapRouter = swapRouter_;
        volIndexer = volIndexer_;
    }

    function configureStrategy(
        bytes32 strategyKey,
        RiptideTypes.FeePolicy calldata fee,
        RiptideTypes.OracleConfig calldata oracle
    ) external onlyConfigurer {
        _policy[strategyKey] = OraclePolicy({
            lambda: fee.lambda,
            sigmaMin: fee.sigmaMin,
            sigmaMax: fee.sigmaMax,
            maxStaleness: oracle.maxStaleness
        });
    }

    function sigmaWad(bytes32 strategyKey) external view returns (uint128) {
        return _state[strategyKey].sigmaWad;
    }

    function varWad(bytes32 strategyKey) external view returns (uint128) {
        return _state[strategyKey].varWad;
    }

    function observe(bytes32 strategyKey, uint128 priceWad, uint40 ts, bool isStatic)
        external
        onlyObserver
        returns (uint128 sigmaWadOut)
    {
        OracleState storage st = _state[strategyKey];
        if (isStatic) {
            return st.sigmaWad;
        }
        return _observePrice(strategyKey, priceWad, ts, 0, false);
    }

    function observeRange(bytes32 strategyKey, uint128 h, uint128 l, uint128 c, uint128 o, uint40 ts)
        external
        onlyObserver
        returns (uint128)
    {
        uint128 gk = VolatilityMath.gkTerm(h, l, c, o);
        return _observePrice(strategyKey, c, ts, gk, true);
    }

    /// @notice Freshness read path matching OraclePriceAdjuster (`block.timestamp > updatedAt + maxStaleness`).
    function assertFeedFresh(address feed, uint16 maxStaleness) external view {
        if (maxStaleness == 0) return;
        (, , , uint256 updatedAt,) = IPriceOracle(feed).latestRoundData();
        if (block.timestamp > updatedAt + maxStaleness) {
            revert RiptideErrors.RiptideStaleOracleRound(updatedAt, maxStaleness);
        }
    }

    function _observePrice(bytes32 strategyKey, uint128 priceWad, uint40 ts, uint128 gkTermWad, bool useGk)
        internal
        returns (uint128 sigmaWadOut)
    {
        OracleState storage st = _state[strategyKey];
        int256 logReturnWad;
        if (st.initialized && st.lastPriceWad > 0) {
            uint256 ratio = WadMulDiv.mulDiv(priceWad, WadMulDiv.WAD, st.lastPriceWad, WadMulDiv.Rounding.Down);
            logReturnWad = LnExpMath.lnWad(ratio);
        }
        return _observeWithLogReturn(strategyKey, logReturnWad, priceWad, ts, gkTermWad, useGk);
    }

    function _observeWithLogReturn(
        bytes32 strategyKey,
        int256 logReturnWad,
        uint128 priceWad,
        uint40 ts,
        uint128 gkTermWad,
        bool useGk
    ) internal returns (uint128 sigmaWadOut) {
        OracleState storage st = _state[strategyKey];
        OraclePolicy storage pol = _policy[strategyKey];

        uint40 dtRaw = st.initialized && ts > st.lastObsTs ? ts - st.lastObsTs : 1;
        if (dtRaw == 0) dtRaw = 1;
        uint64 dtWad = uint64(uint256(dtRaw) * WadMulDiv.WAD);

        uint128 varNext = VolatilityMath.ewmaVar(st.varWad, logReturnWad, pol.lambda, gkTermWad, useGk);
        uint128 sigmaCandidate = VolatilityMath.sigmaFromVar(varNext, dtWad, pol.sigmaMin, pol.sigmaMax);

        bool isStale = pol.maxStaleness != 0 && block.timestamp > uint256(ts) + pol.maxStaleness;
        uint128 sigmaNext = VolatilityMath.applyStaleFreeze(st.sigmaWad, sigmaCandidate, isStale);

        st.varWad = varNext;
        st.sigmaWad = sigmaNext;
        st.lastObsTs = ts;
        st.lastPriceWad = priceWad;
        st.initialized = true;

        return sigmaNext;
    }
}
