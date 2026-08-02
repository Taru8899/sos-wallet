const SOS_CONTRACT =
"0x61af906f53Eb927790055AC8eA99916a01873c15";


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


let provider = null;
let signer = null;
let contract = null;



async function connectWallet(){

    if(!window.ethereum){

        throw new Error(
        "MetaMask not detected"
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


    signer =
    await provider.getSigner();


    contract =
    new ethers.Contract(
        SOS_CONTRACT,
        SOS_ABI,
        signer
    );


    console.log(
        "Contract connected:",
        SOS_CONTRACT
    );


    return await signer.getAddress();

}



async function getTrust(address){

    const result =
    await contract.balanceOf(address);

    console.log(
        "Trust:",
        result.toString()
    );

    return result;

}



async function getPushCount(address){

    const result =
    await contract.pushCountOf(address);


    console.log(
        "Push:",
        result.toString()
    );


    return result;

}



async function getTotalSupply(){

    const result =
    await contract.totalSupply();


    console.log(
        "Supply:",
        result.toString()
    );


    return result;

}



async function pushTo(receiver){

    const tx =
    await contract.pushTo(receiver);

    return await tx.wait();

}



async function pushForMe(){

    const tx =
    await contract.pushForMe();

    return await tx.wait();

}
