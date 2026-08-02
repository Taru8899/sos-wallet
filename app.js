let provider;
let signer;
let walletAddress;


const connectButton =
document.getElementById("connectButton");


connectButton.onclick = async () => {


    if (!window.ethereum) {

        alert("Open this inside MetaMask Mobile");

        return;

    }


    provider =
    new ethers.BrowserProvider(window.ethereum);


    signer =
    await provider.getSigner();


    walletAddress =
    await signer.getAddress();


    document.getElementById("address")
    .innerText = walletAddress;


    loadSOSData();

};



async function loadSOSData(){


    const contract =
    new ethers.Contract(
        SOS_CONTRACT,
        SOS_ABI,
        provider
    );


    const trust =
    await contract.trustOf(walletAddress);


    const push =
    await contract.pushOf(walletAddress);


    const balance =
    await contract.balanceOf(walletAddress);



    document.getElementById("trust")
    .innerText = trust.toString();


    document.getElementById("push")
    .innerText = push.toString();


    document.getElementById("balance")
    .innerText = balance.toString();


}

document.getElementById("mintButton")
.onclick = () => {

    alert(
    "SOS Mint function will be connected next"
    );

};
document.getElementById("mintButton")
.onclick = async () => {


    const receiver =
    document.getElementById("receiver").value;


    if(!receiver){

        alert("Enter receiver address");

        return;

    }


    const contract =
    new ethers.Contract(
        SOS_CONTRACT,
        SOS_ABI,
        signer
    );


    try {


        const tx =
        await contract.pushTo(receiver);


        alert(
        "Transaction sent: "
        + tx.hash
        );


        await tx.wait();


        alert(
        "SOS Mint completed"
        );


        loadSOSData();


    catch(error){

    console.log(error);

    alert(
        "ERROR:\n" + error.message
    );

}


};
