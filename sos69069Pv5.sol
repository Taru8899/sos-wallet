// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SOS69069 Presence Logger (Compact, Gas-Optimized, Creator-Mint-Enforced, Hard-Bounded Capacity)
 * @author SOS69069
 * @notice Permissionless pure logger. Minimal on-chain data.
 * @dev Data format (compact, 4 storage slots):
 * - id                 : block.timestamp (uint40) — used as both the mapping key and the visible id
 * - pType              : 'Y' = FOR_YOU , 'M' = FOR_ME
 * - priceAndMethod     : bytes6 — byte[0] = method, bytes[1..5] = priceInReturn (fixed)
 * - amount             : uint256 (SOS units)
 * - contact            : bytes15 (fixed, max 15 chars)
 * - effective          : snapshot at post time (trust - push)
 *
 * Poster address is intentionally NOT stored in the Presence struct.
 * It is only available transiently during logPresence (via msg.sender)
 * and is emitted in the PresenceLogged event for indexers.
 *
 * Rules:
 * 1. Caller must have nonzero pushCountOf(msg.sender) on SOS.
 * 2. Every logPresence calls sos.pushTo(CREATOR).
 * 3. FOR_YOU ('Y') requires effective > amount (SOS units).
 *    FOR_ME ('M') has no effective check.
 * 4. Hard capacity bound of MAX_LIVE_PRESENCES (1 000 000).
 *    - On every new logPresence that would exceed the limit, the oldest
 *      record is automatically erased.
 *    - Independently, once the live count has ever reached the limit,
 *      ANY address may call eraseOldest() to delete the current oldest
 *      record in strict order (and claim the gas refund).
 * 5. getPosterPresenceIds is paginated.
 *
 * Note: because id == block.timestamp, only one Presence can be logged
 * per second (second call in the same second reverts with "id already used").
 *
 * SOS : 0x61af906f53Eb927790055AC8eA99916a01873c15
 * Creator : 0x1C10e6574ee696f54b21A611a21313E4714628ad
 */

interface ISOS {
    function balanceOf(address account) external view returns (uint256);
    function pushCountOf(address user) external view returns (uint256);
    function pushTo(address to) external;
}

contract PresenceLogger {

    address public constant SOS_CONTRACT = 0x61af906f53Eb927790055AC8eA99916a01873c15;
    address public constant CREATOR      = 0x1C10e6574ee696f54b21A611a21313E4714628ad;

    uint256 public constant MAX_LIVE_PRESENCES = 1_000_000;

    ISOS public immutable sos;

    /**
     * @dev Packed into 4 slots:
     * slot0: id (uint40) + pType (bytes1) + priceAndMethod (bytes6)   [= 12 bytes]
     * slot1: amount
     * slot2: contact (bytes15)
     * slot3: effective
     */
    struct Presence {
        uint40  id;                 // = block.timestamp
        bytes1  pType;              // 'Y' or 'M'
        bytes6  priceAndMethod;     // [0] = method, [1..5] = priceInReturn
        uint256 amount;
        bytes15 contact;
        int256  effective;
    }

    /// @notice Mapping key is the timestamp used as id.
    mapping(uint256 => Presence) public presences;

    /// @notice Append-only historical list of timestamps (ids) per poster.
    mapping(address => uint256[]) public posterPresenceIds;

    /// @notice Queue of currently live ids (timestamps) for O(1) oldest tracking.
    uint256[] private liveQueue;
    uint256 public liveQueueStart;          // index of the oldest still-live entry

    /// @notice Monotonic counter of all ids ever issued (including erased).
    uint256 public totalLogged;

    /// @notice Flag that becomes true the first time live count hits the cap.
    /// Once true, anyone may call eraseOldest() in strict order.
    bool public capacityReached;

    event PresenceLogged(
        uint256 indexed id,                 // block.timestamp
        address indexed poster,             // emitted only, never stored
        bytes1  pType,
        uint256 amount,
        bytes5  priceInReturn,
        bytes1  method,
        bytes15 contact,
        int256  effective,
        uint256 timestamp
    );

    event PresenceErased(
        uint256 indexed id,
        address erasedBy,
        uint256 erasedAt
    );

    constructor() {
        sos = ISOS(SOS_CONTRACT);
    }

    /**
     * @notice Log a new Presence. id = block.timestamp.
     * @dev Poster is used only for the event and the historical index;
     *      it is never written into the Presence struct.
     *      priceInReturn (max 5 bytes) and method are packed into one bytes6.
     *      When the live count would exceed the cap, the oldest record is
     *      auto-erased in the same transaction.
     */
    function logPresence(
        bytes1 pType,
        uint256 amount,
        bytes5 priceInReturn,
        bytes1 method,
        bytes15 contact
    ) external returns (uint256 id) {
        require(pType == bytes1("Y") || pType == bytes1("M"), "Type must be Y or M");
        require(amount > 0, "Amount must be > 0");
        require(priceInReturn != bytes5(0), "priceInReturn required");
        require(contact != bytes15(0), "contact required");

        uint256 push = sos.pushCountOf(msg.sender);
        require(push > 0, "Must call pushForMe (or any pushTo) on SOS first");

        uint256 trust = sos.balanceOf(msg.sender);
        int256 effective = _safeEffective(trust, push);

        if (pType == bytes1("Y")) {
            require(amount <= uint256(type(int256).max), "amount exceeds int256 range");
            require(effective > int256(amount), "Effective must exceed amount for FOR_YOU");
        }

        // === 1 SOS mint to CREATOR happens here ===
        sos.pushTo(CREATOR);

        id = block.timestamp;
        require(presences[id].id == 0, "id already used"); // only one post per second

        // Hard capacity bound — erase oldest if necessary
        uint256 live = liveQueue.length - liveQueueStart;
        if (live >= MAX_LIVE_PRESENCES) {
            _eraseOldest(address(this));
            capacityReached = true;
        } else if (live + 1 == MAX_LIVE_PRESENCES) {
            capacityReached = true;
        }

        // Pack method + priceInReturn into one bytes6
        bytes6 packed;
        assembly {
            packed := or(shl(40, method), priceInReturn)
        }

        Presence storage p = presences[id];
        p.id             = uint40(id);
        p.pType          = pType;
        p.priceAndMethod = packed;
        p.amount         = amount;
        p.contact        = contact;
        p.effective      = effective;

        liveQueue.push(id);
        posterPresenceIds[msg.sender].push(id);
        unchecked { totalLogged++; }

        // Decode for the event so indexers see clean fields
        bytes5 price = bytes5(packed << 8);
        bytes1 meth  = bytes1(packed[0]);

        emit PresenceLogged(
            id,
            msg.sender,             // poster only here — never stored
            pType,
            amount,
            price,
            meth,
            contact,
            effective,
            block.timestamp
        );
    }

    /**
     * @notice Anyone may delete the current oldest Presence, but only after
     * the live count has reached (or exceeded) MAX_LIVE_PRESENCES at least once.
     * Deletion is strictly in order (oldest first). The caller receives the
     * gas refund from the storage clear.
     */
    function eraseOldest() external {
        require(capacityReached, "Capacity of 1 000 000 not yet reached");
        require(liveQueue.length > liveQueueStart, "Nothing left to erase");
        _eraseOldest(msg.sender);
    }

    /**
     * @dev Internal helper that erases the current oldest record and advances
     * the queue pointer. Used both by auto-prune and by the public eraseOldest.
     */
    function _eraseOldest(address erasedBy) internal {
        uint256 oldId = liveQueue[liveQueueStart];
        if (presences[oldId].id != 0) {
            delete presences[oldId];
            emit PresenceErased(oldId, erasedBy, block.timestamp);
        }
        unchecked { liveQueueStart++; }
    }

    function isExpired(uint256 id) public view returns (bool expired) {
        expired = (presences[id].id == 0) && (id > 0);
    }

    function _safeEffective(uint256 trust, uint256 push) internal pure returns (int256 result) {
        uint256 maxInt = uint256(type(int256).max);
        require(trust <= maxInt, "trust exceeds int256 range");
        require(push <= maxInt, "push exceeds int256 range");
        result = int256(trust) - int256(push);
    }

    function getPresence(uint256 id) external view returns (Presence memory p) {
        p = presences[id];
        require(p.id != 0, "Presence erased or nonexistent");
    }

    /**
     * @notice Paginated historical ids (timestamps) for a poster.
     */
    function getPosterPresenceIds(
        address poster,
        uint256 start,
        uint256 count
    ) external view returns (uint256[] memory ids) {
        uint256[] storage all = posterPresenceIds[poster];
        uint256 len = all.length;
        if (start >= len || count == 0) {
            return new uint256[](0);
        }
        uint256 end = start + count;
        if (end > len) end = len;
        uint256 n = end - start;
        ids = new uint256[](n);
        for (uint256 i = 0; i < n; ) {
            ids[i] = all[start + i];
            unchecked { ++i; }
        }
    }

    function liveCount() external view returns (uint256 live) {
        live = liveQueue.length - liveQueueStart;
    }

    function currentEffective(address wallet) external view returns (int256 result) {
        result = _safeEffective(sos.balanceOf(wallet), sos.pushCountOf(wallet));
    }

    // Convenience view to unpack priceAndMethod
    function getPriceAndMethod(uint256 id) external view returns (bytes5 priceInReturn, bytes1 method) {
        bytes6 packed = presences[id].priceAndMethod;
        method = bytes1(packed[0]);
        priceInReturn = bytes5(packed << 8);
    }

    receive() external payable { revert("No ETH"); }
    fallback() external payable { revert("No ETH"); }
}