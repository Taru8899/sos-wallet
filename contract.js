const SOS_CONTRACT =
"0x61af906f53Eb927790055AC8eA99916a01873c15";


const SOS_ABI = [

    // balanceOf(address)
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "account",
                "type": "address"
            }
        ],
        "name": "balanceOf",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },


    // pushCountOf(address)
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "user",
                "type": "address"
            }
        ],
        "name": "pushCountOf",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },


    // totalSupply()
    {
        "inputs": [],
        "name": "totalSupply",
        "outputs": [
            {
                "internalType": "uint256",
                "name": "",
                "type": "uint256"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },


    // pushTo(address)
    {
        "inputs": [
            {
                "internalType": "address",
                "name": "to",
                "type": "address"
            }
        ],
        "name": "pushTo",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },


    // pushForMe()
    {
        "inputs": [],
        "name": "pushForMe",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }


];



let provider = null;
let signer = null;
let contract = null;



async function connectWallet() {


    if (!window.ethereum) {

        throw new Error(
            "MetaMask not found"
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
        "Connected contract:",
        SOS_CONTRACT
    );


    console.log(
        "Contract code:",
        await provider.getCode(SOS_CONTRACT)
    );



    console.log(
        "Chain:",
        (await provider.getNetwork()).chainId.toString()
    );



    console.log(
        "Direct pushCount test:",
        (
            await contract.pushCountOf(
                await signer.getAddress()
            )
        ).toString()
    );



    return await signer.getAddress();

}




async function getTrust(address) {


    return await contract.balanceOf(
        address
    );


}



async function getPushCount(address) {


    return await contract.pushCountOf(
        address
    );


}




async function getTotalSupply() {


    return await contract.totalSupply();


}




async function pushTo(receiver) {


    const tx =
    await contract.pushTo(
        receiver
    );


    return await tx.wait();


}





async function pushForMe() {


    const tx =
    await contract.pushForMe();


    return await tx.wait();


}
