// ===============================
// SOS69069 Ethereum Mainnet Wallet
// ===============================


const SOS_CONTRACT =
"0x61af906f53Eb927790055AC8eA99916a01873c15";


const ETH_CHAIN_ID = 1n;


// Minimal ABI

const SOS_ABI = [

{
    "inputs":[
        {
            "internalType":"address",
            "name":"account",
            "type":"address"
        }
    ],
    "name":"balanceOf",
    "outputs":[
        {
            "internalType":"uint256",
            "name":"",
            "type":"uint256"
        }
    ],
    "stateMutability":"view",
    "type":"function"
},


{
    "inputs":[
        {
            "internalType":"address",
            "name":"user",
            "type":"address"
        }
    ],
    "name":"pushCountOf",
    "outputs":[
        {
            "internalType":"uint256",
            "name":"",
            "type":"uint256"
        }
    ],
    "stateMutability":"view",
    "type":"function"
},


{
    "inputs":[],
    "name":"totalSupply",
    "outputs":[
        {
            "internalType":"uint256",
            "name":"",
            "type":"uint256"
        }
    ],
    "stateMutability":"view",
    "type":"function"
},


{
    "inputs":[
        {
            "internalType":"address",
            "name":"to",
            "type":"address"
        }
    ],
    "name":"pushTo",
    "outputs":[],
    "stateMutability":"nonpayable",
    "type":"function"
},


{
    "inputs":[],
    "name":"pushForMe",
    "outputs":[],
    "stateMutability":"nonpayable",
    "type":"function"
}

];



// ===============================
// GLOBAL VARIABLES
// ===============================


let provider = null;
let signer = null;
let contract = null;



// ===============================
// FORCE ETHEREUM MAINNET
// ===============================


async function switchToEthereum(){


    const current =
    await window.ethereum.request({

        method:"eth_chainId"

    });


    console.log(
        "Current chain:",
        current
    );


    if(current !== "0x1"){


        await window.ethereum.request({

            method:"wallet_switchEthereumChain",

            params:[
                {
                    chainId:"0x1"
                }
            ]

        });

    }

}



// ===============================
// CONNECT WALLET
// ===============================


async function connectWallet(){


    if(!window.ethereum){

        throw new Error(
            "MetaMask not installed"
        );

    }



    // IMPORTANT
    // switch BEFORE creating provider

    await switchToEthereum();



    provider =
    new ethers.BrowserProvider(
        window.ethereum
    );



    await provider.send(
        "eth_requestAccounts",
        []
    );



    const network =
    await provider.getNetwork();



    console.log(
        "Network ID:",
        network.chainId.toString()
    );



    if(network.chainId !== ETH_CHAIN_ID){

        throw new Error(
            "Wrong network. Ethereum Mainnet required."
        );

    }



    // Check contract exists

    const code =
    await provider.getCode(
        SOS_CONTRACT
    );



    console.log(
        "Contract bytecode:",
        code
    );



    if(code === "0x"){


        throw new Error(
            "SOS69069 contract not found on Ethereum Mainnet"
        );


    }



    signer =
    await provider.getSigner();



    contract =
    new ethers.Contract(

        SOS_CONTRACT,

        SOS_ABI,

        signer

    );



    console.log(
        "SOS69069 connected"
    );



    return await signer.getAddress();


}



// ===============================
// READ FUNCTIONS
// ===============================


async function getTrust(address){


    const result =
    await contract.balanceOf(
        address
    );


    return result;


}



async function getPushCount(address){


    const result =
    await contract.pushCountOf(
        address
    );


    return result;


}



async function getTotalSupply(){


    const result =
    await contract.totalSupply();


    return result;


}



// ===============================
// MINT TO ADDRESS
// ===============================


async function pushTo(receiver){



    const network =
    await provider.getNetwork();



    if(network.chainId !== ETH_CHAIN_ID){

        throw new Error(
            "Ethereum Mainnet required"
        );

    }



    console.log(
        "Minting to:",
        receiver
    );



    const tx =
    await contract.pushTo(
        receiver
    );



    console.log(
        "TX HASH:",
        tx.hash
    );



    const receipt =
    await tx.wait();



    console.log(
        "CONFIRMED:",
        receipt
    );



    return receipt;


}



// ===============================
// SELF MINT
// ===============================


async function pushForMe(){



    const network =
    await provider.getNetwork();



    if(network.chainId !== ETH_CHAIN_ID){

        throw new Error(
            "Ethereum Mainnet required"
        );

    }



    const tx =
    await contract.pushForMe();



    console.log(
        "TX HASH:",
        tx.hash
    );



    return await tx.wait();


}



// ===============================
// NETWORK CHANGE LISTENER
// ===============================


if(window.ethereum){


    window.ethereum.on(

        "chainChanged",

        function(chainId){


            console.log(
                "Chain changed:",
                chainId
            );


            window.location.reload();


        }

    );


}
