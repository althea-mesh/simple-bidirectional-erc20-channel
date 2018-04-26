pragma solidity ^0.4.23;

import "./ECTools.sol";
import "zeppelin-solidity/contracts/token/ERC20/ERC20.sol";

contract ChannelManager {
    event ChannelOpen(
        bytes32 indexed channelId,
        address indexed agentA,
        address indexed agentB,
        uint256 depositA,
        address[] tokenContracts,
        uint[] tokenAmounts,
        uint256 challenge
    );
    event ChannelJoin(
        bytes32 indexed channelId,
        address indexed agentA,
        address indexed agentB,
        uint256 depositA,
        uint256 depositB,
        address[] tokenContracts,
        uint[] tokenAmounts
    );
    event ChannelChallenge(
        bytes32 indexed channelId,
        uint256 closeTime
    );
    event ChannelUpdateState(
        bytes32 indexed channelId,
        uint256 nonce,
        uint256[] tokenBalanceA,
        uint256[] tokenBalanceB,
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
        uint depositA; // Deposit of agent A
        uint depositB; // Deposit of agent B
        address[] tokensHeld;
        mapping (address => uint) tokenDepositA;
        mapping (address => uint) tokenDepositB;
        ChannelStatus status; 
        uint challenge;
        uint nonce;
        uint closeTime;
        uint balanceA; // for state update
        uint balanceB; // for state update
        mapping (address => uint) tokenBalanceA;
        mapping (address => uint) tokenBalanceB;
    }

    mapping (bytes32 => Channel) public channels;
    mapping (address => mapping(address => bytes32)) public activeIds;

    function openChannel(
        address to,
        uint challenge,
        address[] tokenContracts,
        uint[] tokenAmounts
    ) 
        payable
        public 
    {
        require(challenge != 0, "Challenge period must be non-zero.");
        require(to != address(0), "Need counterparty address.");
        require(to != msg.sender, "Cannot create channel with yourself.");
        require(activeIds[msg.sender][to] == bytes32(0), "Cannot create multiple channels with counterparty.");
        require(activeIds[to][msg.sender] == bytes32(0), "Cannot create multiple channels with counterparty.");

        bytes32 id = keccak256(msg.sender, to, now);
        Channel storage channel = channels[id];
        channel.agentA = msg.sender;
        channel.agentB = to;
        channel.depositA = msg.value;
        channel.balanceA = msg.value; // so that close can happen without any state updates

        for (uint i = 0; i < tokenContracts.length; i++) {
            ERC20 erc20 = ERC20(tokenContracts[i]);
            require(erc20.transferFrom(msg.sender, address(this), tokenAmounts[i]), "Could not transfer tokens."); // must be approved to send to this address
            channel.tokenDepositA[address(tokenContracts[i])] = tokenAmounts[i];
            channel.tokenBalanceA[address(tokenContracts[i])] = tokenAmounts[i];
            channel.tokensHeld.push(tokenContracts[i]);
        }

        channel.status = ChannelStatus.Open;
        channel.challenge = challenge;

        // Add it to the lookup table
        activeIds[msg.sender][to] = id;

        emit ChannelOpen(
            id,
            channel.agentA,
            channel.agentB,
            channel.depositA,
            tokenContracts,
            tokenAmounts,
            channel.challenge
        );
    }

    function joinChannel(bytes32 id, address[] tokenContracts, uint[] tokenAmounts) payable public {
        Channel storage channel = channels[id];

        require(msg.sender == channel.agentB);
        require(channel.status == ChannelStatus.Open);

        channel.depositB = msg.value;
        channel.balanceB = msg.value;

        for (uint i = 0; i < tokenContracts.length; i++) {
            require(tokenContracts[i] == channel.tokensHeld[i]);

            ERC20 erc20 = ERC20(tokenContracts[i]);
            require(erc20.transferFrom(msg.sender, address(this), tokenAmounts[i])); // must be approved to send to this address
            channel.tokenDepositB[address(tokenContracts[i])] = tokenAmounts[i];
            channel.tokenBalanceB[address(tokenContracts[i])] = tokenAmounts[i];
        }

        channel.status = ChannelStatus.Joined;
        emit ChannelJoin(
            id,
            channel.agentA,
            channel.agentB,
            channel.depositA,
            channel.depositB,
            tokenContracts,
            tokenAmounts
        );
    }

    function isValidStateUpdate(
        bytes32 channelId,
        uint256 nonce,
        uint256[] tokenBalanceA,
        uint256[] tokenBalanceB,
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
        Channel storage channel = channels[channelId];

        // balances must add up to deposit
        require(balanceA + balanceB == channel.depositA + channel.depositB); // eth
        for (uint i = 0; i < channel.tokensHeld.length; i++) {
            // tokens
            // balances must be passed in with same order as tokensHeld
            require(
                tokenBalanceA[i] + tokenBalanceB[i] ==
                    channels[channelId].tokenDepositA[channel.tokensHeld[i]] +
                        channels[channelId].tokenDepositB[channel.tokensHeld[i]]
            );
        }

        require(channel.status == ChannelStatus.Joined || channel.status == ChannelStatus.Challenge); // channel must be joined

        // require state info to be signed by both participants
        // we are using eth_signTypedData, references:
        // https://medium.com/metamask/scaling-web3-with-signtypeddata-91d6efc8b290
        // https://github.com/ukstv/sign-typed-data-test/blob/master/contracts/SignTypedData.sol#L11
        // https://github.com/MetaMask/eth-sig-util/blob/master/index.js
        bytes32 fingerprint = keccak256(
            channelId,
            nonce,
            tokenBalanceA,
            tokenBalanceB,
            balanceA,
            balanceB
        );

        bytes32 signTypedDataFingerprint = keccak256(
            keccak256("bytes32 hash"),
            keccak256(fingerprint)
        );

        if (requireSigA) {
            require(ECTools.isSignedBy(signTypedDataFingerprint, sigA, channel.agentA) == true);
        }

        if (requireSigB) {
            require(ECTools.isSignedBy(signTypedDataFingerprint, sigB, channel.agentB) == true);
        }

        // return true if all conditions pass
        return true;
    }

    function updateState(
        bytes32 channelId,
        uint256 nonce,
        uint256[] tokenBalanceA,
        uint256[] tokenBalanceB,
        uint256 balanceA,
        uint256 balanceB,
        string sigA,
        string sigB
    ) 
        public
    {
        Channel storage channel = channels[channelId];

        // sanity checks
        require(msg.sender == channel.agentA || msg.sender == channel.agentB); // comes from agent
        require(
            isValidStateUpdate(
                channelId,
                nonce,
                tokenBalanceA,
                tokenBalanceB,
                balanceA,
                balanceB,
                sigA,
                sigB,
                true,
                true
            ) == true
        ); // valid signatures from both parties
        require(nonce > channel.nonce); // need a higher sequence update

        // set state variables
        channel.balanceA = balanceA;
        channel.balanceB = balanceB;
        for (uint i = 0; i < channel.tokensHeld.length; i++) {
            channel.tokenBalanceA[channel.tokensHeld[i]];
            channel.tokenBalanceB[channel.tokensHeld[i]];
        }
        channel.nonce = nonce;

        emit ChannelUpdateState(channelId, nonce, tokenBalanceA, tokenBalanceB, balanceA, balanceB);
    }

    function startChallenge(bytes32 channelId) public {
        Channel storage channel = channels[channelId];

        // sanity checks
        require(msg.sender == channel.agentA || msg.sender == channel.agentB); // comes from agent
        require(channel.status == ChannelStatus.Joined || channel.status == ChannelStatus.Open); // channel open or joined status

        // update channel status
        channel.status = ChannelStatus.Challenge;
        channel.closeTime = now + channel.challenge;
        
        emit ChannelChallenge(channelId, channel.closeTime);
    }

    function closeChannel(bytes32 channelId) public {
        Channel storage channel = channels[channelId];

        // request must come from agents
        require(msg.sender == channel.agentA || msg.sender == channel.agentB);

        // channel must be in challenge and challenge period over
        require(channel.status == ChannelStatus.Challenge);
        require(now > channel.closeTime);

        // if true, then use final state to close channel
        channel.agentA.transfer(channel.balanceA);
        channel.agentB.transfer(channel.balanceB);

        for (uint i = 0; i < channel.tokensHeld.length; i++) {
            ERC20 token = ERC20(channel.tokensHeld[i]);
            require(
                token.transfer(
                    channel.agentA,
                    channel.tokenBalanceA[channel.tokensHeld[i]]
                )
            );
            require(
                token.transfer(
                    channel.agentB,
                    channel.tokenBalanceB[channel.tokensHeld[i]]
                )
            );
        }

        channel.status = ChannelStatus.Closed;

        // cannot delete channel anymore in order to be able to withdraw tokens

        emit ChannelClose(channelId);
    }

    function getChannel(bytes32 id) public view returns (
        address,
        address,
        uint,
        uint,
        uint,
        uint,
        uint,
        uint,
        uint,
        uint
    ) {
        Channel memory channel = channels[id];
        return (
            channel.agentA,
            channel.agentB,
            channel.depositA,
            channel.depositB,
            uint(channel.status),
            channel.challenge,
            channel.nonce,
            channel.closeTime,
            channel.balanceA,
            channel.balanceB
        );
    }

    function getChannelTokenDetails(bytes32 channelId) public view returns (
        address[],
        uint[],
        uint[],
        uint[],
        uint[]
    ) {
        Channel storage channel = channels[channelId];
        uint[] memory tokenDepositA = new uint[](channel.tokensHeld.length);
        uint[] memory tokenDepositB = new uint[](channel.tokensHeld.length);
        uint[] memory tokenBalanceA = new uint[](channel.tokensHeld.length);
        uint[] memory tokenBalanceB = new uint[](channel.tokensHeld.length);
        for (uint i = 0; i < channel.tokensHeld.length; i++) {
            tokenDepositA[i] = channel.tokenDepositA[channel.tokensHeld[i]];
            tokenDepositB[i] = channel.tokenDepositB[channel.tokensHeld[i]];
            tokenBalanceA[i] = channel.tokenBalanceA[channel.tokensHeld[i]];
            tokenBalanceB[i] = channel.tokenBalanceB[channel.tokensHeld[i]];
        }
        return (
            channel.tokensHeld,
            tokenDepositA,
            tokenDepositB,
            tokenBalanceA,
            tokenBalanceB
        );
    }
}