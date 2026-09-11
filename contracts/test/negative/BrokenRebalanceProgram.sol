// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { RiptideTypes } from "../../src/types/RiptideTypes.sol";
import { RiptideConstants } from "../../src/core/RiptideConstants.sol";
import { ControlsArgsBuilder } from "@1inch/swap-vm/instructions/Controls.sol";
import { DecayArgsBuilder } from "@1inch/swap-vm/instructions/Decay.sol";
import { DutchAuctionArgsBuilder } from "@1inch/swap-vm/instructions/DutchAuction.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";

/// @notice Negative control: Deadline after balance-touching instructions (must fail V5).
library BrokenRebalanceProgram {
    using SafeCast for uint256;

    function build(
        RiptideTypes.Strategy memory s,
        uint40 deadline,
        uint256 staleInWad,
        address resolver,
        bool useAuctionBalanceIn
    ) internal view returns (bytes memory program) {
        uint40 start = uint40(block.timestamp);
        bytes memory auctionArgs = DutchAuctionArgsBuilder.build(start, s.auction.duration, s.auction.decay);
        bytes memory rebalanceArgs = abi.encodePacked(s.auction.beta, uint128(staleInWad), resolver);

        program = bytes.concat(
            useAuctionBalanceIn
                ? _encode(RiptideConstants.OP_AUCTION_BALANCE_IN, auctionArgs)
                : _encode(RiptideConstants.OP_AUCTION_BALANCE_OUT, auctionArgs),
            _encode(RiptideConstants.OP_DECAY, DecayArgsBuilder.build(s.auction.antiSandwichPeriod)),
            _encode(RiptideConstants.OP_XYCSWAP, ""),
            _encode(RiptideConstants.RIPTIDE_REBALANCE_OPCODE, rebalanceArgs),
            _encode(RiptideConstants.OP_DEADLINE, ControlsArgsBuilder.buildDeadline(deadline)),
            _encode(RiptideConstants.OP_SALT, ControlsArgsBuilder.buildSalt(uint64(uint256(s.salt))))
        );
    }

    function _encode(uint8 opcode, bytes memory args) private pure returns (bytes memory) {
        return abi.encodePacked(opcode, args.length.toUint8(), args);
    }
}
