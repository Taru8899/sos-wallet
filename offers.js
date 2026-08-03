let walletAddress = "";
const LOCAL_KEY = "sos69069_pending_offers_v1";
const OFFERS_JSON_URL = "offers.json";

let communityOffers = [];
let pendingOffers = [];
let ethUsdPrice = null; // 1 ETH in USDC


const connectButton = document.getElementById("connectButton");
const postOfferBtn = document.getElementById("postOfferBtn");
const signOfferBtn = document.getElementById("signOfferBtn");
const downloadJsonBtn = document.getElementById("downloadJsonBtn");
const reloadJsonBtn = document.getElementById("reloadJsonBtn");

postOfferBtn.disabled = true;
signOfferBtn.disabled = true;

connectButton.onclick = async function () {
  try {
    document.getElementById("status").innerText = "Connecting...";
    walletAddress = await connectWallet();
    document.getElementById("address").innerText = walletAddress;
    await refreshWallet();
    postOfferBtn.disabled = false;
    signOfferBtn.disabled = false;
    document.getElementById("status").innerText = "Connected";
    renderOffers();
  } catch (err) {
    console.error(err);
    document.getElementById("status").innerText = err.message;
  }
};

async function refreshWallet() {
  if (!walletAddress || !contract) return;
  const trust = await getTrust(walletAddress);
  const push = await getPushCount(walletAddress);
  const total = await getTotalSupply();
  document.getElementById("trust").innerText = trust.toString();
  document.getElementById("push").innerText = push.toString();
  document.getElementById("effective").innerText = (BigInt(trust) - BigInt(push)).toString();
  document.getElementById("totalSupply").innerText = total.toString();
}

document.getElementById("methodChips").addEventListener("click", (e) => {
  if (e.target.tagName !== "BUTTON") return;
  document.getElementById("offerMethod").value = e.target.dataset.method;
  document.querySelectorAll("#methodChips button").forEach(b => b.classList.remove("chip-active"));
  e.target.classList.add("chip-active");
});

function loadPending() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
  } catch {
    return [];
  }
}

function savePending(list) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
}

async function fetchCommunityOffers() {
  try {
    const res = await fetch(OFFERS_JSON_URL + "?t=" + Date.now());
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    communityOffers = Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn("Could not load offers.json:", e);
    communityOffers = [];
  }
}

function allOffers() {
  const ids = new Set(communityOffers.map(o => o.id));
  const extra = pendingOffers.filter(o => !ids.has(o.id));
  return [...extra, ...communityOffers];
}

function collectForm() {
  const type = document.getElementById("offerType").value;
  const amount = document.getElementById("offerAmount").value.trim();
  const price = document.getElementById("offerPrice").value.trim();
  const method = document.getElementById("offerMethod").value.trim();
  const contact = document.getElementById("offerContact").value.trim();
  const note = document.getElementById("offerNote").value.trim();

  if (!amount || Number(amount) < 1) {
    alert("Enter a valid amount of SOS (≥ 1)");
    return null;
  }
  if (!price) {
    alert("Describe what you want / offer in return");
    return null;
  }
  if (!method) {
    alert("Choose or type a payment / exchange method");
    return null;
  }
  if (!contact) {
    alert("Add a contact method so people can reach you");
    return null;
  }

  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    type,
    amount: String(Math.floor(Number(amount))),
    price,
    method,
    contact,
    note,
    poster: walletAddress,
    createdAt: new Date().toISOString(),
    filled: false,
    signature: null,
    signedMessage: null,
    mintTx: null
  };
}

function clearForm() {
  document.getElementById("offerAmount").value = "";
  document.getElementById("offerPrice").value = "";
  document.getElementById("offerMethod").value = "";
  document.getElementById("offerContact").value = "";
  document.getElementById("offerNote").value = "";
  document.querySelectorAll("#methodChips button").forEach(b => b.classList.remove("chip-active"));
}

async function mintOneToPoster() {
  document.getElementById("status").innerText = "Minting 1 SOS to you (confirm in wallet)…";
  const receipt = await pushForMe();
  return receipt.hash;
}

async function finishPost(offer, doSign) {
  if (!walletAddress || !contract || !signer) {
    alert("Connect wallet first");
    return;
  }

  if (offer.type === "sell") {
    try {
      const trust = await getTrust(walletAddress);
      const push = await getPushCount(walletAddress);
      const effective = BigInt(trust) - BigInt(push);
      if (effective < BigInt(offer.amount)) {
        const ok = confirm(
          "Your effective balance is only " + effective + ". You are listing " + offer.amount + " SOS.\nContinue anyway?"
        );
        if (!ok) return;
      }
    } catch (e) {
      console.warn(e);
    }
  }

  if (doSign) {
    const message =
      "SOS69069 Offer\n" +
      "Type: " + offer.type + "\n" +
      "Amount: " + offer.amount + " SOS\n" +
      "Price: " + offer.price + "\n" +
      "Method: " + offer.method + "\n" +
      "Contact: " + offer.contact + "\n" +
      "Poster: " + offer.poster + "\n" +
      "Time: " + offer.createdAt;

    document.getElementById("status").innerText = "Waiting for signature…";
    try {
      offer.signature = await signer.signMessage(message);
      offer.signedMessage = message;
    } catch (err) {
      document.getElementById("status").innerText = err.shortMessage || err.message;
      return;
    }
  }

  try {
    const txHash = await mintOneToPoster();
    offer.mintTx = txHash;
  } catch (err) {
    console.error(err);
    document.getElementById("status").innerText = err.shortMessage || err.message;
    return;
  }

  pendingOffers = loadPending();
  pendingOffers.unshift(offer);
  savePending(pendingOffers);

  clearForm();
  await refreshWallet();
  renderOffers();
  document.getElementById("status").innerText =
    "Offer posted + 1 SOS minted. Download offers.json and commit it so others see your listing.";
}

postOfferBtn.onclick = async function () {
  const offer = collectForm();
  if (!offer) return;
  await finishPost(offer, false);
};

signOfferBtn.onclick = async function () {
  const offer = collectForm();
  if (!offer) return;
  await finishPost(offer, true);
};

downloadJsonBtn.onclick = function () {
  const merged = allOffers().filter(o => !o.filled);
  const blob = new Blob([JSON.stringify(merged, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "offers.json";
  a.click();
  URL.revokeObjectURL(url);
  document.getElementById("status").innerText = "offers.json downloaded — commit it to the repo";
};

reloadJsonBtn.onclick = async function () {
  document.getElementById("status").innerText = "Reloading offers.json…";
  await fetchCommunityOffers();
  pendingOffers = loadPending();
  renderOffers();
  document.getElementById("status").innerText = "Reloaded";
};

let currentFilter = "all";

document.querySelectorAll(".filter-btn").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    renderOffers();
  };
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function renderOffers() {
  updateMarketMids();
  const listEl = document.getElementById("offersList");
  let offers = allOffers().filter(o => !o.filled);

  if (currentFilter !== "all") {
    offers = offers.filter(o => o.type === currentFilter);
  }

  if (offers.length === 0) {
    listEl.innerHTML = '<p class="muted">No open offers yet. Be the first!</p>';
    return;
  }

  listEl.innerHTML = "";

  for (const o of offers) {
    const card = document.createElement("div");
    card.className = "offer-card " + o.type;

    const typeLabel = o.type === "sell" ? "SELL" : "BUY";
    const typeColor = o.type === "sell" ? "#16a34a" : "#2563eb";

    let balanceHtml = "";
    if (o.type === "sell" && contract) {
      try {
        const trust = await getTrust(o.poster);
        const push = await getPushCount(o.poster);
        const effective = (BigInt(trust) - BigInt(push)).toString();
        balanceHtml = '<div class="offer-balance">On-chain effective: <strong>' + effective + '</strong> SOS</div>';
      } catch {
        balanceHtml = '<div class="offer-balance muted">Balance check failed</div>';
      }
    }

    const shortAddr = o.poster.slice(0, 6) + "…" + o.poster.slice(-4);
    const etherscan = "https://etherscan.io/address/" + o.poster;
    const time = new Date(o.createdAt).toLocaleString();
    const mintLink = o.mintTx
      ? ' · <a href="https://etherscan.io/tx/' + o.mintTx + '" target="_blank" rel="noopener">mint tx</a>'
      : "";
    const isPending = pendingOffers.some(p => p.id === o.id);

    card.innerHTML =
      '<div class="offer-header">' +
        '<span class="offer-type" style="background:' + typeColor + '">' + typeLabel + '</span>' +
        '<span class="offer-amount">' + o.amount + ' SOS</span>' +
        (o.signature ? '<span class="signed-badge">Signed</span>' : '') +
        (isPending ? '<span class="pending-badge">Pending commit</span>' : '') +
      '</div>' +
      '<div class="offer-price">' + escapeHtml(o.price) + '</div>' +
      '<div class="offer-method">via <strong>' + escapeHtml(o.method) + '</strong></div>' +
      balanceHtml +
      '<div class="offer-contact">Contact: ' + escapeHtml(o.contact) + '</div>' +
      (o.note ? '<div class="offer-note">' + escapeHtml(o.note) + '</div>' : '') +
      '<div class="offer-meta">' +
        '<a href="' + etherscan + '" target="_blank" rel="noopener">' + shortAddr + '</a>' +
        ' · ' + time + mintLink +
      '</div>' +
      '<div class="offer-actions">' +
        '<button class="small-btn copy-btn" data-id="' + o.id + '">Copy text</button>' +
        (o.poster.toLowerCase() === (walletAddress || "").toLowerCase()
          ? '<button class="small-btn danger fill-btn" data-id="' + o.id + '">Mark filled</button>'
          : '') +
        (o.signature
          ? '<button class="small-btn verify-btn" data-id="' + o.id + '">Verify sig</button>'
          : '') +
      '</div>';
    listEl.appendChild(card);
  }

  listEl.querySelectorAll(".copy-btn").forEach(btn => {
    btn.onclick = () => copyOfferText(btn.dataset.id);
  });
  listEl.querySelectorAll(".fill-btn").forEach(btn => {
    btn.onclick = () => markFilled(btn.dataset.id);
  });
  listEl.querySelectorAll(".verify-btn").forEach(btn => {
    btn.onclick = () => verifySignature(btn.dataset.id);
  });
}

function copyOfferText(id) {
  const offer = allOffers().find(o => o.id === id);
  if (!offer) return;
  const text =
    "SOS69069 " + offer.type.toUpperCase() + " offer\n" +
    offer.amount + " SOS for: " + offer.price + "\n" +
    "Method: " + offer.method + "\n" +
    "Contact: " + offer.contact + "\n" +
    (offer.note ? "Note: " + offer.note + "\n" : "") +
    "Poster: " + offer.poster + "\n" +
    "Etherscan: https://etherscan.io/address/" + offer.poster + "\n" +
    (offer.mintTx ? "Mint tx: https://etherscan.io/tx/" + offer.mintTx + "\n" : "") +
    (offer.signature ? "(Signed offer)\n" : "");
  navigator.clipboard.writeText(text).then(() => {
    document.getElementById("status").innerText = "Offer text copied";
  });
}

function markFilled(id) {
  pendingOffers = loadPending();
  const pIdx = pendingOffers.findIndex(o => o.id === id);
  if (pIdx !== -1) {
    pendingOffers[pIdx].filled = true;
    savePending(pendingOffers);
  }
  const cIdx = communityOffers.findIndex(o => o.id === id);
  if (cIdx !== -1) communityOffers[cIdx].filled = true;
  renderOffers();
  document.getElementById("status").innerText =
    "Marked filled locally. Download offers.json and commit to update the public list.";
}

async function verifySignature(id) {
  const offer = allOffers().find(o => o.id === id);
  if (!offer || !offer.signature || !offer.signedMessage) {
    alert("No signature on this offer");
    return;
  }
  try {
    const recovered = ethers.verifyMessage(offer.signedMessage, offer.signature);
    if (recovered.toLowerCase() === offer.poster.toLowerCase()) {
      alert("✅ Signature valid\nRecovered address matches the poster.\n\nThis only proves the wallet authored the text — it does not lock tokens or create a trade.");
    } else {
      alert("❌ Signature does NOT match the poster address!");
    }
  } catch (e) {
    alert("Verification failed: " + e.message);
  }
}


// ---------- MARKET MID PRICES ----------
async function fetchEthUsd() {
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd");
    const data = await res.json();
    if (data && data.ethereum && data.ethereum.usd) {
      ethUsdPrice = Number(data.ethereum.usd);
    }
  } catch (e) {
    console.warn("ETH/USD fetch failed", e);
  }
}

/**
 * Try to extract a price in USDC per 1 SOS from free-text.
 * Accepts: "5 USDC", "5$", "$5", "5 USD", "5 USDT", "0.002 ETH", "0.002 eth / sos", etc.
 * Returns USDC number or null.
 */
function parsePriceToUsdc(priceText, amountSos) {
  if (!priceText) return null;
  const t = String(priceText).trim();
  const amt = Math.max(1, Number(amountSos) || 1);

  // ETH patterns
  let m = t.match(/([\d.,]+)\s*(ETH|eth|Ξ)/);
  if (m && ethUsdPrice) {
    const eth = parseFloat(m[1].replace(",", "."));
    if (!isNaN(eth) && eth > 0) return (eth * ethUsdPrice) / amt;
  }

  // USDC / USD / USDT / $ patterns
  m = t.match(/(?:USDC|USD|USDT|\$)\s*([\d.,]+)/i) ||
      t.match(/([\d.,]+)\s*(?:USDC|USD|USDT|\$|bucks|dollars)/i) ||
      t.match(/^([\d.,]+)$/); // bare number treated as USDC
  if (m) {
    const usd = parseFloat(m[1].replace(",", "."));
    if (!isNaN(usd) && usd > 0) return usd / amt;
  }

  return null;
}

function median(nums) {
  if (!nums.length) return null;
  const a = nums.slice().sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function formatEthUsdc(usdcPerSos) {
  if (usdcPerSos == null || isNaN(usdcPerSos)) return "—";
  const usdcStr = usdcPerSos >= 1
    ? usdcPerSos.toFixed(2)
    : usdcPerSos.toPrecision(3);
  if (ethUsdPrice && ethUsdPrice > 0) {
    const eth = usdcPerSos / ethUsdPrice;
    const ethStr = eth >= 0.001 ? eth.toFixed(5) : eth.toExponential(2);
    return ethStr + " ETH (" + usdcStr + " USDC)";
  }
  return usdcStr + " USDC";
}

function updateMarketMids() {
  const offers = allOffers().filter(o => !o.filled);
  const sellUsdc = []; // asks — price to BUY from sellers
  const buyUsdc = [];  // bids — price you can SELL into

  for (const o of offers) {
    const p = parsePriceToUsdc(o.price, o.amount);
    if (p == null) continue;
    if (o.type === "sell") sellUsdc.push(p);
    else if (o.type === "buy") buyUsdc.push(p);
  }

  const midAsk = median(sellUsdc); // middle price to buy SOS
  const midBid = median(buyUsdc);  // middle price to sell SOS

  const elBuy = document.getElementById("midBuy");
  const elSell = document.getElementById("midSell");
  const elMeta = document.getElementById("midMeta");
  if (!elBuy) return;

  elBuy.innerText = formatEthUsdc(midAsk);
  elSell.innerText = formatEthUsdc(midBid);

  const parts = [];
  if (sellUsdc.length) parts.push(sellUsdc.length + " sell offer" + (sellUsdc.length > 1 ? "s" : ""));
  if (buyUsdc.length) parts.push(buyUsdc.length + " buy offer" + (buyUsdc.length > 1 ? "s" : ""));
  if (ethUsdPrice) parts.push("ETH ≈ $" + ethUsdPrice.toFixed(0));
  elMeta.innerText = parts.length
    ? "Based on " + parts.join(" · ")
    : "No USDC/ETH-priced offers yet — add prices like “5 USDC” or “0.002 ETH”";
}


(async function init() {
  pendingOffers = loadPending();
  await Promise.all([fetchCommunityOffers(), fetchEthUsd()]);
  renderOffers();
  updateMarketMids();
})();
