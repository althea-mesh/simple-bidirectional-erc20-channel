pragma solidity ^0.4.23;

import "./ECTools.sol";
import "zeppelin-solidity/contracts/token/ERC20/ERC20.sol";

contract ChannelManager {
    event ChannelOpen(
        bytes32 indexed channelId,
        address indexed agentA,
        address indexed agentB,
        address tokenContract,
        uint256 depositA,
        uint256 challenge
    );
    event ChannelJoin(
        bytes32 indexed channelId,
        address indexed agentA,
        address indexed agentB,
        uint256 depositA,
        uint256 depositB
    );
    event ChannelChallenge(
        bytes32 indexed channelId,
        uint256 closeTime,
        address challengeStartedBy
    );
    event ChannelUpdateState(
        bytes32 indexed channelId,
        uint256 nonce,
        uint256 balanceA,
        uint256 balanceB
    );
    event ChannelClose(bytes32 indexed channelId);

    enum ChannelStatus {
        Open,
        Joined,
        Challenge,
        Closed
    }

    struct Channel {
        address agentA;
        address agentB;
        address tokenContract;
        uint depositA; // Deposit of agent A
        uint depositB; // Deposit of agent B
        ChannelStatus status; 
        uint challenge;
        uint nonce;
        uint closeTime;
        uint balanceA; // for state update
        uint balanceB; // for state update
        address challengeStartedBy; // for fast close
    }

    mapping (bytes32 => Channel) public channels;
    // creator => counterparty => token contract
    mapping (address => mapping(address => mapping(address => bytes32))) public activeIds;

    function openChannel(
        address to,
        address tokenContract,
        uint tokenAmount,
        uint challenge
    ) 
        public 
    {
        require(challenge != 0, "Challenge period must be non-zero.");
        require(to != address(0), "Need counterparty address.");
        require(to != msg.sender, "Cannot create channel with yourself.");
        require(activeIds[msg.sender][to][tokenContract] == bytes32(0), "Channel exists.");
        require(activeIds[to][msg.sender][tokenContract] == bytes32(0), "Channel exists.");

        // channel specific
        bytes32 id = keccak256(msg.sender, to, now);
        Channel memory channel;
        channel.agentA = msg.sender;
        channel.agentB = to;
        channel.depositA = tokenAmount;
        channel.balanceA = tokenAmount; // so that close can happen without any state updates
        channel.tokenContract = tokenContract;

        // transfer tokens, must be approved
        ERC20 erc20 = ERC20(tokenContract);
        require(erc20.transferFrom(msg.sender, address(this), tokenAmount), "Error transferring tokens.");

        // lifecycle
        channel.status = ChannelStatus.Open;
        channel.challenge = challenge;

        // Add it to the lookup table
        activeIds[msg.sender][to][tokenContract] = id;

        // add to storage
        channels[id] = channel;

        emit ChannelOpen(
            id,
            channel.agentA,
            channel.agentB,
            tokenContract,
            channel.depositA,
            channel.challenge
        );
    }

    function joinChannel(bytes32 id, uint tokenAmount) public {
        Channel storage channel = channels[id];

        require(msg.sender == channel.agentB, "Not your channel.");
        require(channel.status == ChannelStatus.Open, "Channel status is not Open.");

        channel.depositB = tokenAmount;
        channel.balanceB = tokenAmount;

        // transfer tokens, must be approved
        ERC20 erc20 = ERC20(channel.tokenContract);
        require(erc20.transferFrom(msg.sender, address(this), tokenAmount), "Error transferring tokens.");

        channel.status = ChannelStatus.Joined;
        emit ChannelJoin(
            id,
            channel.agentA,
            channel.agentB,
            channel.depositA,
            channel.depositB
        );
    }

    function isValidStateUpdate(
        bytes32 channelId,
        uint256 nonce,
        uint256 balanceA,
        uint256 balanceB,
        string sigA,
        string sigB,
        bool requireSigA,
        bool requireSigB
    ) 
        public
        view
        returns (bool)
    {
        Channel memory channel = channels[channelId];

        require(
            balanceA + balanceB == channel.depositA + channel.depositB,
            "Balances do not add up to deposits."
        );
        require(
            channel.status == ChannelStatus.Joined || channel.status == ChannelStatus.Challenge,
            "Channel status is not Joined or Challenge."
        );

        // require state info to be signed by both participants
        // we are using eth_signTypedData, references:
        // https://medium.com/metamask/scaling-web3-with-signtypeddata-91d6efc8b290
        // https://github.com/ukstv/sign-typed-data-test/blob/master/contracts/SignTypedData.sol#L11
        // https://github.com/MetaMask/eth-sig-util/blob/master/index.js
        bytes32 fingerprint = keccak256(
            channelId,
            nonce,
            balanceA,
            balanceB
        );

        bytes32 signTypedDataFingerprint = keccak256(
            keccak256("bytes32 hash"),
            keccak256(fingerprint)
        );

        if (requireSigA) {
            require(
                ECTools.isSignedBy(signTypedDataFingerprint, sigA, channel.agentA) == true,
                "AgentA signature not valid"
            );
        }

        if (requireSigB) {
            require(
                ECTools.isSignedBy(signTypedDataFingerprint, sigB, channel.agentB) == true,
                "AgentA signature not valid"
            );
        }

        // return true if all conditions pass
        return true;
    }

    function updateState(
        bytes32 channelId,
        uint256 nonce,
        uint256 balanceA,
        uint256 balanceB,
        string sigA,
        string sigB
    ) 
        public
    {
        Channel storage channel = channels[channelId];

        // sanity checks
        require(
            msg.sender == channel.agentA || msg.sender == channel.agentB,
            "Not your channel."
        );
        require(
            isValidStateUpdate(
                channelId,
                nonce,
                balanceA,
                balanceB,
                sigA,
                sigB,
                true,
                true
            ) == true,
            "Both signatures not valid."
        );
        require(nonce > channel.nonce, "Nonce is not higher than on chain channel state.");

        // set state variables
        channel.balanceA = balanceA;
        channel.balanceB = balanceB;
        channel.nonce = nonce;

        emit ChannelUpdateState(channelId, nonce, balanceA, balanceB);
    }

    function startChallenge(bytes32 channelId) public {
        Channel storage channel = channels[channelId];

        // sanity checks
        require(
            msg.sender == channel.agentA || msg.sender == channel.agentB,
            "Not your channel."
        );
        require(
            channel.status == ChannelStatus.Open || channel.status == ChannelStatus.Joined,
            "Channel status not Open or Joined"
        );

        // update channel status
        channel.status = ChannelStatus.Challenge;
        channel.closeTime = now + channel.challenge;
        channel.challengeStartedBy = msg.sender;
        
        emit ChannelChallenge(channelId, channel.closeTime, msg.sender);
    }

    function closeChannel(bytes32 channelId) public {
        Channel storage channel = channels[channelId];

        // request must come from agents
        require(
            msg.sender == channel.agentA || msg.sender == channel.agentB,
            "Not your channel."
        );

        // channel must be in challenge and challenge period over
        require(
            channel.status == ChannelStatus.Challenge,
            "Channel status not Challenge."
        );

        // if closer is not the person who started the challenge, fast close channel
        if (msg.sender == channel.challengeStartedBy) {
            require(now > channel.closeTime, "Challenge period not over.");
        }

        // if true, then use final state to close channel
        ERC20 token = ERC20(channel.tokenContract);
        require(
            token.transfer(channel.agentA, channel.balanceA),
            "Error transferring tokens."
        );
        require(
            token.transfer(channel.agentB, channel.balanceB),
            "Error transferring tokens."
        );

        channel.status = ChannelStatus.Closed; // redundant bc channel is deleted
        delete activeIds[channel.agentA][channel.agentB][channel.tokenContract];
        delete channels[channelId];

        emit ChannelClose(channelId);
    }

    function getChannel(bytes32 id) public view returns (
        address,
        address,
        address,
        uint,
        uint,
        uint,
        uint,
        uint,
        uint,
        uint,
        uint,
        address
    ) {
        Channel memory channel = channels[id];
        return (
            channel.agentA,
            channel.agentB,
            channel.tokenContract,
            channel.depositA,
            channel.depositB,
            uint(channel.status),
            channel.challenge,
            channel.nonce,
            channel.closeTime,
            channel.balanceA,
            channel.balanceB,
            channel.challengeStartedBy
        );
    }
}