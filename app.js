let walletAddress = null;


const connectButton =
document.getElementById("connectButton");


connectButton.onclick = async () => {


    if (!window.ethereum) {

        alert("Install MetaMask Mobile");

        return;

    }


    const accounts =
    await window.ethereum.request({

        method: "eth_requestAccounts"

    });


    walletAddress = accounts[0];


    document.getElementById("address")
    .innerText = walletAddress;


};



document.getElementById("mintButton")
.onclick = () => {

    alert(
    "SOS Mint function will be connected next"
    );

};
