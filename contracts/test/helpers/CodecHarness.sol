// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { RiptideStrategyCodec } from "../../src/core/RiptideStrategyCodec.sol";
import { RiptideTypes } from "../../src/types/RiptideTypes.sol";

contract CodecHarness {
    function encode(RiptideTypes.Strategy memory s) external pure returns (bytes memory) {
        return RiptideStrategyCodec.encode(s);
    }

    function decode(bytes memory payload) external pure returns (RiptideTypes.Strategy memory) {
        return RiptideStrategyCodec.decode(payload);
    }
}
