// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// @title RiptideConstants
/// @notice Frozen opcode indices for pinned swap-vm v1.0.2 at runtime (via-ir optimizer build).
/// @dev Source-line indices in AquaOpcodes.sol are +1 vs these values because `_opcodes()`
///      overwrites slot 0 with the dynamic array length when materializing the table.
library RiptideConstants {
    uint256 public constant USE_AQUA_TRAIT = 1 << 254;

    // Stock AquaOpcodes runtime indices (v1.0.2, optimizer + via_ir)
    uint8 public constant OP_DEADLINE = 13;
    uint8 public constant OP_XYCSWAP = 17;
    uint8 public constant OP_DECAY = 19;
    uint8 public constant OP_SALT = 20;
    uint8 public constant OP_DYNAMIC_PROTOCOL_FEE = 29;
    uint8 public constant OP_AQUA_DYNAMIC_PROTOCOL_FEE = 30;

    // RIPTIDE extensions appended after stock table (runtime indices 34–37)
    uint8 public constant RIPTIDE_REBALANCE_OPCODE = 34;
    // RIPTIDE-owned auction schedule (see RiptideAuctionSchedule.sol for why these are
    // ours and not swap-vm's limit-order-group DutchAuction opcodes).
    uint8 public constant OP_AUCTION_BALANCE_IN = 35;
    uint8 public constant OP_AUCTION_BALANCE_OUT = 36;
    uint8 public constant OP_ORACLE_PRICE_ADJUSTER = 37;

    uint8 public constant STOCK_OPCODE_COUNT = 34;
    uint8 public constant RIPTIDE_OPCODE_COUNT = 38;

    uint8 public constant MAX_FILLS = 8;

    uint256 public constant BPS = 1e7;
    uint256 public constant WAD = 1e18;

    /// @dev Fixed program deadline so shipped Aqua orders stay quotable across blocks.
    uint40 public constant SWAP_ORDER_DEADLINE = type(uint40).max;

    /// @dev outWad baked into seeded rebalance Aqua orders; preview must use the same value.
    uint256 public constant SEED_REBALANCE_OUT_WAD = 1 ether;
}
