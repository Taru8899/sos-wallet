// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SOS69069 Presence Logger (Compact, Gas-Optimized, Creator-Mint-Enforced, Capacity-Based Pruning)
 * @author SOS69069
 * @notice Permissionless pure logger. Minimal on-chain data.
 * @dev Data format (compact):
 * - id              : sequential
 * - poster          : msg.sender
 * - type            : 'Y' = FOR_YOU , 'M' = FOR_ME
 * - amount          : uint256 (SOS units)
 * - priceInReturn   : short string (max 5 chars)
 * - method          : single letter or short code (last letter of the old scheme)
 * - contact         : short (email / messenger handle) (max 15 chars)
 * - effective       : snapshot at post time (trust - push)
 * - timestamp       : block.timestamp (stored as uint40 for storage packing;
 *                      valid until year 36,812, no practical data loss)
 *
 * Note, Trust and Push are NOT stored (can be read later from SOS).
 *
 * Rules still apply:
 * 1. Caller must have a nonzero pushCountOf(msg.sender) on SOS (general
 *    standing gate) — satisfied by calling SOS.pushForMe() (recommended)
 *    or any other pushTo() call the poster makes themselves.
 * 2. CREATOR-MINT ENFORCEMENT: logPresence() calls sos.pushTo(CREATOR) on
 *    EVERY call, guaranteeing CREATOR's trustOf increments once per
 *    Presence logged. Attributed to address(this) on SOS, not msg.sender —
 *    does NOT satisfy the poster's own gate check in point 1.
 * 3. FOR_YOU ('Y'): effective (trust - push) must be STRICTLY GREATER THAN
 *    the posted `amount` (same SOS units). You are offering independent
 *    effective, so your current effective must exceed the amount you post.
 *    FOR_ME ('M'): no effective check — you are seeking to refill effective,
 *    any amount is allowed.
 * 4. CAPACITY PRUNING (replaces former 14-day expiry): the system keeps a
 *    rolling window of the most recent MAX_LIVE_PRESENCES (1 000 000)
 *    entries. Once more than 1 000 000 Presences have been logged after a
 *    given id, that id becomes eligible for erasure. Anyone may call
 *    erasePresence(id) on any eligible id; this permanently deletes its
 *    storage (gas-refunding). The process naturally “resets the first 100”
 *    (and subsequent batches) as new posts push the window forward —
 *    repeatedly. Until erased, an old Presence still exists in storage and
 *    getPresence() reverts for it once erased, making state explicit to
 *    callers/indexers.
 *
 * Gas note: the Presence struct is packed into 6 storage slots (down from
 * 8 in the unoptimized layout) by grouping poster/pType/method/timestamp
 * into a single slot. Struct field order was chosen for storage packing;
 * it does not need to match the event's parameter order.
 * Named returns are used throughout to avoid unnecessary local-variable
 * allocation and extra RETURN opcodes.
 *
 * SOS : 0x61af906f53Eb927790055AC8eA99916a01873c15
 * Creator : 0x1C10e6574ee696f54b21A611a21313E4714628ad
 */

/**
 * @title ISOS
 * @notice Minimal external interface into the SOS contract used for
 * trust (balance), push-count lookups, and performing the enforced
 * creator mint.
 */
interface ISOS {
    /**
     * @notice Returns the SOS trust balance of an account (total units
     * received via pushTo, from any sender).
     * @param account Address to query.
     * @return The account's SOS token balance.
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @notice Returns how many times a user has called pushTo() as sender,
     * to ANY recipient. SOS does not track per-(sender,target) history.
     * @param user Address to query.
     * @return The account's push count.
     */
    function pushCountOf(address user) external view returns (uint256);

    /**
     * @notice Mints exactly 1 unit to `to`. Permissionless, no return value.
     * Reverts only if `to == address(0)`.
     * @param to Recipient of the push.
     */
    function pushTo(address to) external;
}

/**
 * @title PresenceLogger
 * @notice Permissionless, fund-free logger for "Presence" posts, gated by
 * a caller's standing on the external SOS contract, with an enforced
 * mint-to-CREATOR on every post and a capacity-based (1 000 000 live)
 * pruning lifecycle that repeatedly clears the oldest entries in batches.
 * @dev Holds no ETH/ERC20 value itself; purely stores structured post data
 * and emits a matching event per post. All external SOS reads are `view`
 * calls (STATICCALL), so no reentrancy risk exists from those calls. The
 * sos.pushTo(CREATOR) call is state-changing but SOS itself makes no
 * external calls, so it cannot reenter this contract.
 */
contract PresenceLogger {

    /// @notice Address of the external SOS contract used for trust/push checks.
    address public constant SOS_CONTRACT = 0x61af906f53Eb927790055AC8eA99916a01873c15;

    /// @notice Address designated as the required push-to target ("CREATOR").
    /// @dev logPresence() calls sos.pushTo(CREATOR) on every call.
    address public constant CREATOR      = 0x1C10e6574ee696f54b21A611a21313E4714628ad;

    /// @notice Maximum allowed length (in bytes) for the `priceInReturn` field.
    uint256 public constant MAX_PRICE_IN_RETURN_LEN = 5;

    /// @notice Maximum allowed length (in bytes) for the `contact` field.
    uint256 public constant MAX_CONTACT_LEN = 15;

    /// @notice Maximum number of live (not-yet-erased) Presences the contract
    /// is intended to retain. Once more than this many newer entries exist,
    /// older ids become eligible for permissionless erasure.
    /// @dev 1 000 000 (= 1000k). Pruning repeatedly clears the oldest
    /// entries (naturally in batches of \~100 or any size) as the window
    /// advances.
    uint256 public constant MAX_LIVE_PRESENCES = 1_000_000;

    /// @notice Immutable handle to the SOS contract, set once at deployment.
    ISOS public immutable sos;

    /**
     * @notice Compact on-chain record of a single Presence post.
     * @dev Field order is chosen for storage packing (6 slots total):
     * slot0: id | slot1: poster+pType+method+timestamp (packed) |
     * slot2: amount | slot3: priceInReturn | slot4: contact | slot5: effective.
     * @param id Sequential identifier assigned at creation.
     * @param poster Address that created the post (msg.sender at post time).
     * @param pType Post type: 'Y' = FOR_YOU, 'M' = FOR_ME.
     * @param method Single-byte code identifying payment/contact method (e.g. 'E'=ETH, 'U'=USDT, 'F'=Fiat).
     * @param timestamp Block timestamp at which the post was created (uint40, packs with poster/pType/method).
     * @param amount Amount associated with the Presence post (SOS units).
     * @param priceInReturn Short string describing what is asked/offered (max 5 chars).
     * @param contact Short contact string, e.g. email or handle (max 15 chars).
     * @param effective Snapshot of (trust - push) computed at post time.
     */
    struct Presence {
        uint256  id;
        address  poster;
        bytes1   pType;          // 'Y' or 'M'
        bytes1   method;         // single letter / short code
        uint40   timestamp;
        uint256  amount;
        string   priceInReturn;
        string   contact;
        int256   effective;      // only value we keep from SOS state
    }

    /// @notice ID to be assigned to the next logged Presence (starts at 1).
    uint256 public nextId = 1;

    /// @notice Maps a Presence id to its stored record.
    mapping(uint256 => Presence) public presences;

    /// @notice Maps a poster address to the list of Presence ids they created.
    /// @dev Ids remain listed here even after erasePresence() deletes the
    /// underlying record — this is an append-only index, not a live set.
    /// Callers should use getPresence()/isExpired() to check current state.
    mapping(address => uint256[]) public posterPresenceIds;

    /**
     * @notice Emitted whenever a new Presence is logged.
     * @dev Parameter order matches the original (pre-optimization) layout
     * for downstream indexer/ABI stability, independent of struct packing.
     * @param id Sequential identifier of the new Presence.
     * @param poster Address that created the post.
     * @param pType Post type: 'Y' = FOR_YOU, 'M' = FOR_ME.
     * @param amount Amount associated with the Presence post (SOS units).
     * @param priceInReturn Short string describing what is asked/offered.
     * @param method Single-byte code identifying payment/contact method.
     * @param contact Short contact string.
     * @param effective Snapshot of (trust - push) computed at post time.
     * @param timestamp Block timestamp at which the post was created.
     */
    event PresenceLogged(
        uint256 indexed id,
        address indexed poster,
        bytes1  pType,
        uint256 amount,
        string  priceInReturn,
        bytes1  method,
        string  contact,
        int256  effective,
        uint256 timestamp
    );

    /**
     * @notice Emitted when an eligible (out-of-window) Presence's storage is erased.
     * @param id The Presence id that was erased.
     * @param poster The original poster of the erased Presence.
     * @param erasedBy The address that called erasePresence().
     * @param erasedAt Block timestamp at which erasure occurred.
     */
    event PresenceErased(
        uint256 indexed id,
        address indexed poster,
        address erasedBy,
        uint256 erasedAt
    );

    /**
     * @notice Deploys the logger and binds it to the fixed SOS contract address.
     * @dev SOS_CONTRACT is a hardcoded constant; this binding cannot be changed later.
     */
    constructor() {
        sos = ISOS(SOS_CONTRACT);
    }

    /**
     * @notice Log a new Presence (permissionless, compact).
     * @dev Order of operations (checks-effects-interactions):
     * 1. Checks: input validation (type, amount, string lengths).
     * 2. Interactions: read pushCountOf/balanceOf (STATICCALL, no state
     *    change), then call sos.pushTo(CREATOR) — a real state-changing
     *    mint guaranteeing CREATOR receives credit for this post, every
     *    call. Cannot reenter this contract since SOS makes no external
     *    calls of its own.
     * 3. Effects: write the Presence struct and emit the event.
     *
     * FOR_YOU ('Y'): effective (trust - push) must be STRICTLY GREATER THAN
     * the posted amount (same SOS units). You are offering independent
     * effective, so your current effective must exceed the amount you post.
     * Example: posting amount = 5 requires effective > 5.
     *
     * FOR_ME ('M'): no effective check — you are seeking to refill
     * effective; any amount > 0 is allowed.
     *
     * Capacity: once more than MAX_LIVE_PRESENCES (1 000 000) newer
     * entries exist after a given id, that id becomes erasable via
     * erasePresence. The window advances automatically with new posts,
     * repeatedly clearing the oldest entries.
     * @param pType          'Y' = FOR_YOU, 'M' = FOR_ME
     * @param amount         amount of Presence (SOS units)
     * @param priceInReturn  short description of what is asked/offered (max 5 chars)
     * @param method         single byte (e.g. 'E'=ETH, 'U'=USDT, 'F'=Fiat ...)
     * @param contact        short contact (email / @handle / number) (max 15 chars)
     * @return id The sequential id assigned to the newly logged Presence.
     */
    function logPresence(
        bytes1 pType,
        uint256 amount,
        string calldata priceInReturn,
        bytes1 method,
        string calldata contact
    ) external returns (uint256 id) {
        require(pType == bytes1("Y") || pType == bytes1("M"), "Type must be Y or M");
        require(amount > 0, "Amount must be > 0");
        require(bytes(priceInReturn).length > 0, "priceInReturn required");
        require(bytes(priceInReturn).length <= MAX_PRICE_IN_RETURN_LEN, "priceInReturn too long");
        require(bytes(contact).length > 0, "contact required");
        require(bytes(contact).length <= MAX_CONTACT_LEN, "contact too long");

        uint256 push = sos.pushCountOf(msg.sender);
        require(push > 0, "Must call pushForMe (or any pushTo) on SOS first");

        uint256 trust = sos.balanceOf(msg.sender);
        int256 effective = _safeEffective(trust, push);

        // FOR_YOU: effective must strictly exceed the posted amount (SOS units).
        // You are offering independent effective, so current effective > amount.
        // FOR_ME: no check — seeking to refill effective.
        if (pType == bytes1("Y")) {
            require(amount <= uint256(type(int256).max), "amount exceeds int256 range");
            require(effective > int256(amount), "Effective must exceed amount for FOR_YOU");
        }

        // Enforced creator mint: runs on every call, guaranteeing real
        // value flow to CREATOR per post. Always succeeds (CREATOR is
        // never the zero address). Attributed to this contract's own
        // address on SOS, not to msg.sender.
        sos.pushTo(CREATOR);

        unchecked {
            id = nextId;
            nextId = id + 1;
        }

        Presence storage p = presences[id];
        p.id            = id;
        p.poster        = msg.sender;
        p.pType         = pType;
        p.method        = method;
        p.timestamp     = uint40(block.timestamp);
        p.amount        = amount;
        p.priceInReturn = priceInReturn;
        p.contact       = contact;
        p.effective     = effective;

        posterPresenceIds[msg.sender].push(id);

        emit PresenceLogged(
            id,
            msg.sender,
            pType,
            amount,
            priceInReturn,
            method,
            contact,
            effective,
            block.timestamp
        );
    }

    /**
     * @notice Permanently erases a Presence that has fallen outside the
     * live window of the most recent MAX_LIVE_PRESENCES entries.
     * @dev Permissionless — anyone may call this once a Presence is
     * eligible (more than 1 000 000 newer posts exist after it). Deleting
     * the struct zeroes its storage slots, which refunds a portion of gas
     * to the caller under current EVM rules. The id remains permanently in
     * posterPresenceIds[poster] as a historical index entry even after
     * erasure; getPresence(id) will revert for an erased id since its
     * timestamp resets to 0 on deletion.
     *
     * As new Presences are logged the window advances, so the oldest
     * entries (first \~100, then the next \~100, …) become erasable again
     * and again.
     * @param id The Presence id to erase.
     */
    function erasePresence(uint256 id) external {
        require(id > 0 && id < nextId, "Invalid id");
        Presence storage p = presences[id];
        require(p.timestamp != 0, "Already erased");
        require(id + MAX_LIVE_PRESENCES < nextId, "Presence still inside live window");

        address poster = p.poster;
        delete presences[id];

        emit PresenceErased(id, poster, msg.sender, block.timestamp);
    }

    /**
     * @notice Checks whether a Presence has fallen outside the live window
     * of the most recent MAX_LIVE_PRESENCES (1 000 000) entries.
     * @dev Returns false for an id that has already been erased (its
     * timestamp is 0) — callers should treat false + a zeroed
     * getPresence() result as "gone."
     * @param id The Presence id to check.
     * @return expired True if the Presence exists and is outside the live window
     *         (eligible for erasure), false otherwise.
     */
    function isExpired(uint256 id) public view returns (bool expired) {
        require(id > 0 && id < nextId, "Invalid id");
        Presence storage p = presences[id];
        if (p.timestamp == 0) {
            expired = false; // already erased
        } else {
            expired = id + MAX_LIVE_PRESENCES < nextId;
        }
    }

    // ---------- Internal ----------

    /**
     * @notice Safely computes (trust - push) as a signed value.
     * @dev Explicit `int256(uint256)` casts do not benefit from Solidity 0.8.x
     * checked-arithmetic overflow protection — they only reinterpret bits.
     * This helper guards against that by requiring both inputs to fit within
     * `type(int256).max` before casting, reverting otherwise instead of
     * silently producing an incorrect negative value. The point-in-time
     * nature of this check (recomputed fresh each call) is unchanged by design.
     * @param trust The account's SOS trust balance (received pushes).
     * @param push The account's SOS push count (sent pushes).
     * @return result The signed difference (trust - push).
     */
    function _safeEffective(uint256 trust, uint256 push) internal pure returns (int256 result) {
        uint256 maxInt = uint256(type(int256).max);
        require(trust <= maxInt, "trust exceeds int256 range");
        require(push <= maxInt, "push exceeds int256 range");
        result = int256(trust) - int256(push);
    }

    // ---------- Views ----------

    /**
     * @notice Retrieves a previously logged Presence by id.
     * @dev Reverts if the Presence has been erased (capacity pruning)
     * so callers/indexers get an explicit signal rather than a silently
     * zeroed struct. Use isExpired() beforehand if you want to distinguish
     * "outside window but not yet erased" from "erased."
     * @param id The Presence id to look up (must be in range [1, nextId)).
     * @return p The full Presence record.
     */
    function getPresence(uint256 id) external view returns (Presence memory p) {
        require(id > 0 && id < nextId, "Invalid id");
        p = presences[id];
        require(p.timestamp != 0, "Presence erased");
    }

    /**
     * @notice Lists all Presence ids created by a given poster.
     * @dev May include ids for Presences that have since been erased — see
     * struct-level docs on posterPresenceIds.
     * @param poster Address whose Presence ids should be returned.
     * @return ids Array of Presence ids created by `poster`.
     */
    function getPosterPresenceIds(address poster) external view returns (uint256[] memory ids) {
        ids = posterPresenceIds[poster];
    }

    /**
     * @notice Returns the total number of Presence records ever logged.
     * @dev Does not subtract erased records — this is a monotonic counter
     * of ids issued, not a count of currently-live Presences.
     * @return total Total count of Presence ids issued so far.
     */
    function totalLogged() external view returns (uint256 total) {
        total = nextId - 1;
    }

    /**
     * @notice Computes the current effective (trust - push) value for a wallet.
     * @dev Reads live values from SOS; not stored, purely a view calculation.
     * Uses the same overflow-safe path as `logPresence`.
     * @param wallet Address to compute the effective value for.
     * @return result The signed effective value (trust - push).
     */
    function currentEffective(address wallet) external view returns (int256 result) {
        uint256 trust = sos.balanceOf(wallet);
        uint256 push  = sos.pushCountOf(wallet);
        result = _safeEffective(trust, push);
    }

    /// @notice Rejects any plain ETH transfer to this contract.
    receive() external payable { revert("No ETH"); }

    /// @notice Rejects any ETH sent with non-matching calldata.
    fallback() external payable { revert("No ETH"); }
}