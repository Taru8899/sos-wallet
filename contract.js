const SOS_CONTRACT =
"0x61af906f53Eb927790055AC8eA99916a01873c15";


const ETH_CHAIN_ID = 1n;


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


let provider;
let signer;
let contract;



async function connectWallet(){


    if(!window.ethereum){

        throw new Error(
            "MetaMask not installed"
        );

    }



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
        "Network:",
        network.chainId.toString()
    );



    if(network.chainId !== ETH_CHAIN_ID){

        throw new Error(
            "Wrong network. Please switch MetaMask to Ethereum Mainnet."
        );

    }



    const code =
    await provider.getCode(
        SOS_CONTRACT
    );



    console.log(
        "Contract code:",
        code
    );



    if(code === "0x"){

        throw new Error(
            "SOS69069 contract not found on Ethereum Mainnet."
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
        "SOS contract connected:",
        SOS_CONTRACT
    );



    return await signer.getAddress();

}




async function getTrust(address){

    return await contract.balanceOf(
        address
    );

}



async function getPushCount(address){

    return await contract.pushCountOf(
        address
    );

}



async function getTotalSupply(){

    return await contract.totalSupply();

}



async function pushTo(receiver){


    const network =
    await provider.getNetwork();


    if(network.chainId !== ETH_CHAIN_ID){

        throw new Error(
            "Wrong network"
        );

    }


    const tx =
    await contract.pushTo(
        receiver
    );


    console.log(
        "Transaction hash:",
        tx.hash
    );


    return await tx.wait();

}




async function pushForMe(){


    const network =
    await provider.getNetwork();


    if(network.chainId !== ETH_CHAIN_ID){

        throw new Error(
            "Wrong network"
        );

    }


    const tx =
    await contract.pushForMe();



    console.log(
        "Transaction hash:",
        tx.hash
    );


    return await tx.wait();

}
