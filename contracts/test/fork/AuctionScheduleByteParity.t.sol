// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";
import { MakerTraits } from "@1inch/swap-vm/libs/MakerTraits.sol";
import { RiptideTypes } from "../../src/types/RiptideTypes.sol";
import { RiptideRebalanceRouter } from "../../src/core/RiptideRebalanceRouter.sol";
import { RiptideConstants } from "../../src/core/RiptideConstants.sol";

/// @notice Moving the auction schedule off swap-vm's limit-order `DutchAuction` and onto
///         RIPTIDE's own instruction must not change a single program byte.
/// @dev The args layout (`uint40 start ‖ uint16 duration ‖ uint64 decay`) is unchanged, so
///      the emitted program — and therefore every Aqua order hash and every live position —
///      must be byte-identical to what the already-deployed Base Sepolia router produces.
///      This forks Base Sepolia and diffs the locally-built order against the deployed one.
///      Skipped when no fork URL is configured.
contract AuctionScheduleByteParityTest is Test {
    // NOTE: these are the *pre-migration* Base Sepolia contracts, deliberately pinned.
    // That router is immutable and still runs the old swap-vm `DutchAuction` handlers, so
    // it remains a permanent reference for "the auction args encoding has not drifted".
    // The current deployment has since moved on; see deployments/84532.json.
    address internal constant DEPLOYED_REBALANCE_ROUTER = 0xF2f6AFf9d4BA247F479c67d1a9EB19A4a9C788bf;
    address internal constant DEPLOYED_BASE = 0xCd75c96a6659d94004EFBe528D95eAF933A916be;
    address internal constant DEPLOYED_QUOTE = 0x5A2858D733295000199CA9030e4A094e9E9EF846;
    address internal constant DEPLOYED_FEED = 0x92a149C90d5C43DF299F9db5F8F3c3cC7C7Edd0D;
    address internal constant DEPLOYED_PROVIDER = 0x27fadE9f02fCC91152fdac73b55E1E05C2BB8620;
    address internal constant S1_MAKER = 0xddDe7a54E430B1D85d24956156867fCe2407dC25;
    address internal constant DEPLOYED_AQUA = 0xa6e7714D9956D88C4f26C19a481b12bB60B90Ed2;
    address internal constant DEPLOYED_KERNEL = 0x24670F2a8d04665e1784Dbc3Eb8e58Fb6eACD9f2;
    address internal constant DEPLOYED_ORACLE = 0x9E311E6C2694e475e9F44bB6Bc052823c6b647B3;

    function test_rebalanceProgramBytesUnchangedVsDeployedRouter() public {
        string memory rpc = vm.envOr("RPC_URL_BASE_SEPOLIA", string(""));
        if (bytes(rpc).length == 0) {
            emit log("skipped: set RPC_URL_BASE_SEPOLIA to run byte-parity against the live deployment");
            return;
        }
        vm.createSelectFork(rpc);

        // S1's exact published policy.
        RiptideTypes.Strategy memory s = RiptideTypes.Strategy({
            maker: S1_MAKER,
            baseToken: DEPLOYED_BASE,
            quoteToken: DEPLOYED_QUOTE,
            reserveBaseWad: 100e18,
            reserveQuoteWad: 200_000e18,
            fee: RiptideTypes.FeePolicy({
                feeMin: 10_000,
                feeMax: 50_000,
                lambda: 990_000_000_000_000_000,
                kp: 100_000_000_000_000_000,
                ki: 50_000_000_000_000_000,
                iMax: 500_000_000_000_000_000,
                sigmaMin: 5_000_000_000_000_000,
                sigmaMax: 500_000_000_000_000_000
            }),
            auction: RiptideTypes.AuctionPolicy({
                beta: 970_000_000_000_000_000,
                duration: 7200,
                decay: 995_000_000_000_000_000,
                antiSandwichPeriod: 600
            }),
            oracle: RiptideTypes.OracleConfig({ feed: DEPLOYED_FEED, decimals: 8, maxStaleness: 3600 }),
            feeProvider: DEPLOYED_PROVIDER,
            salt: bytes32(uint256(0x65))
        });

        uint40 auctionStart = 1789075148;
        uint256 outWad = RiptideConstants.SEED_REBALANCE_OUT_WAD;
        address resolver = 0xb57b23D53237573228B2E8b73A4A465F789a92DB;

        // The deployed router still runs the pre-change code.
        ISwapVM.Order memory deployed = RiptideRebalanceRouter(payable(DEPLOYED_REBALANCE_ROUTER))
            .buildRebalanceOrderWithAuctionStart(
                s.maker, s, RiptideConstants.SWAP_ORDER_DEADLINE, outWad, resolver, true, auctionStart
            );

        // A freshly compiled router runs the RIPTIDE-owned auction schedule.
        RiptideRebalanceRouter fresh = RiptideRebalanceRouter(
            payable(address(new RiptideRebalanceRouter(
                DEPLOYED_AQUA, address(0), address(this), "RiptideRebalance", "1",
                DEPLOYED_KERNEL, DEPLOYED_ORACLE, DEPLOYED_PROVIDER
            )))
        );
        ISwapVM.Order memory rebuilt = fresh.buildRebalanceOrderWithAuctionStart(
            s.maker, s, RiptideConstants.SWAP_ORDER_DEADLINE, outWad, resolver, true, auctionStart
        );

        assertEq(rebuilt.data, deployed.data, "rebalance order bytes must be unchanged");
        assertEq(
            MakerTraits.unwrap(rebuilt.traits),
            MakerTraits.unwrap(deployed.traits),
            "maker traits must be unchanged"
        );
        assertEq(
            keccak256(abi.encode(rebuilt)),
            keccak256(abi.encode(deployed)),
            "Aqua strategyHash must be unchanged - live positions stay valid"
        );
    }
}
