---
title: "Pricing"
url: "https://docs.magicblock.gg/pages/overview/additional-information/pricing"
---

> ## Documentation Index
> Fetch the complete documentation index at: https://docs.magicblock.gg/llms.txt
> Use this file to discover all available pages before exploring further.

# Pricing

> MagicBlock’s pricing is modeled after decentralized cloud infrastructure. The goal is to keep computing costs **predictable for developers**, while still providing **flexibility for enterprises** that need priority access or dedicated resources.

export const VRFCostSimulator = () => {
  const [vrfpm, setVrf] = useState(5);
  const [isER, setIsER] = useState(false);
  const alternativeVrfFeePerTx = 0.002;
  const magicblockVrfFeePerTx = 0.0005;
  const magicblockVrfFeePerTxDiscounted = 0.0;
  const solPriceUSD = 200;
  const days = Array.from({
    length: 30
  }, (_, i) => i + 1);
  const width = 600;
  const height = 300;
  const padding = 50;
  const minutesPerDay = 24 * 60;
  const alternativeVrfCosts = days.map((_, i) => (i + 1) * vrfpm * minutesPerDay * alternativeVrfFeePerTx * solPriceUSD);
  const magicblockVrfCosts = days.map((_, i) => {
    const feePerTx = isER ? magicblockVrfFeePerTxDiscounted : magicblockVrfFeePerTx;
    return (i + 1) * vrfpm * minutesPerDay * feePerTx * solPriceUSD;
  });
  const totalAlternativeVrfCost = vrfpm * minutesPerDay * days.length;
  const maxCost = Math.max(...alternativeVrfCosts, ...magicblockVrfCosts);
  const xStep = (width - padding * 2) / (days.length - 1);
  const yScale = val => height - padding - val / maxCost * (height - padding * 2);
  const linePath = data => data.map((val, i) => `${i === 0 ? "M" : "L"}${padding + i * xStep},${yScale(val)}`).join(" ");
  const lastIndex = days.length - 1;
  return <div style={{
    maxWidth: width
  }}>

            {}
      <div style={{
    marginBottom: "1rem",
    display: "flex",
    alignItems: "center",
    gap: "0.5rem"
  }}>
        <span style={{
    fontSize: "14px"
  }}>Solana</span>
        <label style={{
    position: "relative",
    display: "inline-block",
    width: "36px",
    height: "20px",
    marginBottom: 0,
    verticalAlign: "middle"
  }}>
          <input type="checkbox" checked={isER} onChange={() => setIsER(!isER)} style={{
    opacity: 0,
    width: 0,
    height: 0
  }} />
          {}
          <span style={{
    position: "absolute",
    cursor: "pointer",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: isER ? "#2545f6" : "#2545f6",
    transition: ".4s",
    borderRadius: "24px"
  }} />

          {}
          <span style={{
    position: "absolute",
    height: "18px",
    width: "18px",
    left: isER ? "calc(100% - 19px)" : "1px",
    top: 1,
    bottom: "3px",
    backgroundColor: "white",
    transition: ".4s",
    borderRadius: "50%"
  }} />
        </label>
        <span style={{
    fontSize: "14px"
  }}>With ER</span>
      </div>

      {}
      <div style={{
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    marginTop: "1rem",
    marginBottom: "1rem"
  }}>
        {}
        <label style={{
    fontSize: "14px"
  }}>
          VRF request(s) per minute: {vrfpm.toLocaleString()}
          <input type="range" min="1" max="100" step="1" value={vrfpm} onChange={e => setVrf(Number(e.target.value))} style={{
    width: "100%"
  }} />
        </label>
      </div>

      {}
      <div style={{
    marginTop: "1rem",
    lineHeight: 1.5,
    fontSize: "14px"
  }}>
        <p>
          <strong>{(totalAlternativeVrfCost / 1_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })}M randomness provisions</strong> over 30 days.
            </p>

          <p style={{
    marginTop: "0.5rem"
  }}>
            {" "}You save{" "}
            <span style={{
    fontWeight: "bold",
    color: "#aa00ff"
  }}>
              ${(alternativeVrfCosts[lastIndex] - magicblockVrfCosts[lastIndex]).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })}{', or '}{(alternativeVrfCosts[lastIndex] / magicblockVrfCosts[lastIndex]).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })}x cheaper
            </span>
            .
          </p>

      </div>

      {}
      <div style={{
    width: "100%",
    maxWidth: "600px",
    margin: "0 auto",
    paddingLeft: "40px",
    paddingRight: "10px"
  }}>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} width="100%" height="auto" preserveAspectRatio="xMidYMid meet" style={{
    overflow: "visible"
  }}>
          {Array.from({
    length: 5
  }, (_, i) => {
    const y = padding + i * ((height - 2 * padding) / 4);
    const price = ((4 - i) / 4 * maxCost).toFixed(0);
    return <g key={i}>
                <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#eee" />
                <text x={padding - 5} y={y + 4} textAnchor="end" fontSize="12" fill="#555" fontWeight="bold">
                  ${Number(price).toLocaleString()}
                </text>
              </g>;
  })}

          {days.map((day, i) => {
    if ((i + 1) % 10 === 0) {
      const x = padding + i * xStep;
      return <g key={i}>
                  <line x1={x} y1={padding} x2={x} y2={height - padding} stroke="#eee" />
                  <text x={x} y={height - padding + 15} textAnchor="middle" fontSize="12" fill="#555" fontWeight="bold">
                    {day}
                  </text>
                  <circle cx={x} cy={yScale(alternativeVrfCosts[i])} r={3} fill="#59e09d" />
                  <text x={x} y={yScale(alternativeVrfCosts[i]) - 8} fontSize="14" fill="#59e09d" textAnchor="middle" fontWeight="bold">
                    ${alternativeVrfCosts[i].toLocaleString()}
                  </text>
                  <circle cx={x} cy={yScale(magicblockVrfCosts[i])} r={3} fill="#aa00ff" />
                  <text x={x} y={yScale(magicblockVrfCosts[i]) - 8} fontSize="14" fill="#aa00ff" textAnchor="middle" fontWeight="bold">
                    ${magicblockVrfCosts[i].toLocaleString()}
                  </text>
                </g>;
    }
    return null;
  })}

          <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#aaa" />
          <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#aaa" />

          {}
          <text x={width / 2} y={height - padding + 40} fontSize="12" fill="#555" textAnchor="middle">
            Day
          </text>
          <path d={linePath(alternativeVrfCosts)} stroke="#59e09d" strokeWidth="2" fill="none" />
          <path d={linePath(magicblockVrfCosts)} stroke="#aa00ff" strokeWidth="2" fill="none" />
        </svg>
      </div>

      {}
      <div style={{
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "0.5rem",
    marginBottom: "1rem"
  }}>
        {}
        <div style={{
    display: "flex",
    gap: "0rem 1rem",
    flexWrap: "wrap"
  }}>
          <div style={{
    display: "flex",
    alignItems: "center",
    gap: "0.5rem"
  }}>
            <div style={{
    width: 12,
    height: 12,
    backgroundColor: "#59e09d"
  }} />
            <span style={{
    fontSize: "14px"
  }}>
              Other VRFs
            </span>
          </div>
          <div style={{
    display: "flex",
    alignItems: "center",
    gap: "0.5rem"
  }}>
            <div style={{
    width: 12,
    height: 12,
    backgroundColor: "#aa00ff"
  }} />
            <span style={{
    fontSize: "14px"
  }}>MagicBlock VRF</span>
          </div>
        </div>

        {}
        <div style={{
    display: "flex",
    alignItems: "center"
  }}>
          <span style={{
    fontSize: "14px"
  }}>Price: {solPriceUSD} USD/SOL</span>
        </div>
      </div>

    </div>;
};

export const ERCostSimulator = () => {
  const [tps, setTps] = useState(10000);
  const [cpm, setCpm] = useState(30);
  const [dpm, setDpm] = useState(1);
  const [isDedicated, setIsDedicated] = useState(false);
  const solanaFeePerTx = 0.000005;
  const erFeePerCommit = 0.0001;
  const erFeePerSession = 0.0003;
  const dedicatedBaseFee = 0.00000005;
  const solPriceUSD = 200;
  const days = Array.from({
    length: 30
  }, (_, i) => i + 1);
  const width = 600;
  const height = 300;
  const padding = 50;
  const secondsPerDay = 24 * 60 * 60;
  const commitFeesPerDay = cpm / 60 * secondsPerDay * erFeePerCommit * solPriceUSD;
  const sessionFeesPerDay = dpm / 60 * secondsPerDay * erFeePerSession * solPriceUSD;
  const solanaCosts = days.map((_, i) => (i + 1) * tps * secondsPerDay * solanaFeePerTx * solPriceUSD);
  const erCosts = days.map((_, i) => {
    const base = (i + 1) * (commitFeesPerDay + sessionFeesPerDay);
    const extra = isDedicated ? (i + 1) * tps * secondsPerDay * dedicatedBaseFee * solPriceUSD : 0;
    return base + extra;
  });
  const totalSolanaTx = tps * secondsPerDay * days.length;
  const maxCost = Math.max(...solanaCosts, ...erCosts);
  const xStep = (width - padding * 2) / (days.length - 1);
  const yScale = val => height - padding - val / maxCost * (height - padding * 2);
  const linePath = data => data.map((val, i) => `${i === 0 ? "M" : "L"}${padding + i * xStep},${yScale(val)}`).join(" ");
  const lastIndex = days.length - 1;
  const handleTpsChange = newTps => {
    setTps(newTps);
    const maxCpm = newTps * 20;
    if (cpm > maxCpm) {
      setCpm(maxCpm);
    }
    const maxDpm = newTps * 20;
    if (dpm > maxDpm) {
      setDpm(maxDpm);
    }
  };
  const handleCpmChange = newCpm => {
    const requiredTps = Math.ceil(newCpm / 2);
    if (requiredTps > tps) setTps(requiredTps);
    setCpm(newCpm);
  };
  const handleDpmChange = newDpm => {
    const requiredTps = Math.ceil(newDpm / 2);
    if (requiredTps > tps) setTps(requiredTps);
    setDpm(newDpm);
  };
  return <div style={{
    maxWidth: width
  }}>

      {}
      <div style={{
    marginBottom: "1rem",
    display: "flex",
    alignItems: "center",
    gap: "0.5rem"
  }}>
        <span style={{
    fontSize: "14px"
  }}>Public Node</span>
        <label style={{
    position: "relative",
    display: "inline-block",
    width: "36px",
    height: "20px",
    marginBottom: 0,
    verticalAlign: "middle"
  }}>
          <input type="checkbox" checked={isDedicated} onChange={() => setIsDedicated(!isDedicated)} style={{
    opacity: 0,
    width: 0,
    height: 0
  }} />
          {}
          <span style={{
    position: "absolute",
    cursor: "pointer",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: isDedicated ? "#2545f6" : "#2545f6",
    transition: ".4s",
    borderRadius: "24px"
  }} />

          {}
          <span style={{
    position: "absolute",
    height: "18px",
    width: "18px",
    left: isDedicated ? "calc(100% - 19px)" : "1px",
    top: 1,
    bottom: "3px",
    backgroundColor: "white",
    transition: ".4s",
    borderRadius: "50%"
  }} />
        </label>
        <span style={{
    fontSize: "14px"
  }}>Dedicated Node</span>
      </div>

      {}
      <div style={{
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    marginTop: "1rem",
    marginBottom: "1rem"
  }}>
        {}
        <label style={{
    fontSize: "14px"
  }}>
          Transaction(s) per second: {tps.toLocaleString()}
          <input type="range" min="1" max="50000" step="1" value={tps} onChange={e => handleTpsChange(Number(e.target.value))} style={{
    width: "100%"
  }} />
        </label>

        {}
        <div style={{
    display: "flex",
    gap: "1rem"
  }}>
          <label style={{
    flex: 1,
    fontSize: "14px"
  }}>
            Commit(s) per minute: {cpm}
            <input type="range" min="1" max="100" step="1" value={cpm} onChange={e => handleCpmChange(Number(e.target.value))} style={{
    width: "100%"
  }} />
          </label>
          <label style={{
    flex: 1,
    fontSize: "14px"
  }}>
            Delegation Session(s) per minute: {dpm}
            <input type="range" min="1" max="100" step="1" value={dpm} onChange={e => handleDpmChange(Number(e.target.value))} style={{
    width: "100%"
  }} />
          </label>
        </div>
      </div>

      {}
      <div style={{
    marginTop: "1rem",
    lineHeight: 1.5,
    fontSize: "14px"
  }}>
        <p>
          <strong>{(totalSolanaTx / 1_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })}M transactions</strong> over 30 days.
            </p>

        {erCosts[lastIndex] < solanaCosts[lastIndex] ? <p style={{
    marginTop: "0.5rem"
  }}>
            {" "}You save{" "}
            <span style={{
    fontWeight: "bold",
    color: "#aa00ff"
  }}>
              ${(solanaCosts[lastIndex] - erCosts[lastIndex]).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })}{', or '}{(solanaCosts[lastIndex] / erCosts[lastIndex]).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })}x cheaper
            </span>
            .
          </p> : <p style={{
    marginTop: "0.5rem"
  }}>
            {" "}Try <strong>lowering commits and delegations</strong> to get a cost advantage.
          </p>}
      </div>

      {}
      <div style={{
    width: "100%",
    maxWidth: "600px",
    margin: "0 auto",
    paddingLeft: "40px",
    paddingRight: "10px"
  }}>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} width="100%" height="auto" preserveAspectRatio="xMidYMid meet" style={{
    overflow: "visible"
  }}>
          {Array.from({
    length: 5
  }, (_, i) => {
    const y = padding + i * ((height - 2 * padding) / 4);
    const price = ((4 - i) / 4 * maxCost).toFixed(0);
    return <g key={i}>
                <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#eee" />
                <text x={padding - 5} y={y + 4} textAnchor="end" fontSize="12" fill="#555" fontWeight="bold">
                  ${Number(price).toLocaleString()}
                </text>
              </g>;
  })}

          {days.map((day, i) => {
    if ((i + 1) % 10 === 0) {
      const x = padding + i * xStep;
      return <g key={i}>
                  <line x1={x} y1={padding} x2={x} y2={height - padding} stroke="#eee" />
                  <text x={x} y={height - padding + 15} textAnchor="middle" fontSize="12" fill="#555" fontWeight="bold">
                    {day}
                  </text>
                  <circle cx={x} cy={yScale(solanaCosts[i])} r={3} fill="#59e09d" />
                  <text x={x} y={yScale(solanaCosts[i]) - 8} fontSize="14" fill="#59e09d" textAnchor="middle" fontWeight="bold">
                    ${solanaCosts[i].toLocaleString()}
                  </text>
                  <circle cx={x} cy={yScale(erCosts[i])} r={3} fill="#aa00ff" />
                  <text x={x} y={yScale(erCosts[i]) - 8} fontSize="14" fill="#aa00ff" textAnchor="middle" fontWeight="bold">
                    ${erCosts[i].toLocaleString()}
                  </text>
                </g>;
    }
    return null;
  })}

          <line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#aaa" />
          <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#aaa" />

          {}
          <text x={width / 2} y={height - padding + 40} fontSize="12" fill="#555" textAnchor="middle">
            Day
          </text>
          <path d={linePath(solanaCosts)} stroke="#59e09d" strokeWidth="2" fill="none" />
          <path d={linePath(erCosts)} stroke="#aa00ff" strokeWidth="2" fill="none" />
        </svg>
      </div>

      {}
      <div style={{
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "0.5rem",
    marginBottom: "1rem"
  }}>
        {}
        <div style={{
    display: "flex",
    gap: "0rem 1rem",
    flexWrap: "wrap"
  }}>
          <div style={{
    display: "flex",
    alignItems: "center",
    gap: "0.5rem"
  }}>
            <div style={{
    width: 12,
    height: 12,
    backgroundColor: "#59e09d"
  }} />
            <span style={{
    fontSize: "14px"
  }}>Solana Only</span>
          </div>
          <div style={{
    display: "flex",
    alignItems: "center",
    gap: "0.5rem"
  }}>
            <div style={{
    width: 12,
    height: 12,
    backgroundColor: "#aa00ff"
  }} />
            <span style={{
    fontSize: "14px"
  }}>MagicBlock (ER Sessions + Commits)</span>
          </div>
        </div>

        {}
        <div style={{
    display: "flex",
    alignItems: "center"
  }}>
          <span style={{
    fontSize: "14px"
  }}>Price: {solPriceUSD} USD/SOL</span>
        </div>
      </div>

    </div>;
};

***

## Product Pricing

<Tabs>
  <Tab title="Ephemeral Rollup">
    **Public nodes** make it simple to start building on MagicBlock with free transactions and zero friction. Fees are only charged when you close a session or commit data back to Solana.

    <table style={{ width: "100%", tableLayout: "fixed" }}>
      <thead>
        <tr>
          <th>Fee type</th>
          <th>Amount (SOL)</th>
          <th>Description</th>
        </tr>
      </thead>

      <tbody>
        <tr>
          <td>Base fee</td>
          <td>0</td>
          <td>Per transaction (Tx)</td>
        </tr>

        <tr>
          <td>Session fee</td>
          <td>0.0003</td>
          <td>Per ER session (at undelegation)</td>
        </tr>

        <tr>
          <td>Commit fee</td>
          <td>0.0001</td>
          <td>Per commit to Solana</td>
        </tr>
      </tbody>
    </table>

    **Dedicated nodes** are ideal for enterprises and high-scale teams. They provide maximum reliability, predictable costs, and MEV protection with your own dedicated infrastructure.

    [Learn more about ER →](/pages/ephemeral-rollups-ers/how-to-guide/quickstart)

    ### ER Cost Simulator: 30-Days

    <ERCostSimulator />
  </Tab>

  <Tab title="Private Ephemeral Rollup">
    Private Ephemeral Rollup supports custom private computation defined by your smart contract.

    Custom PER logic uses standard ER pricing. [See Ephemeral Rollup pricing →](#ephemeral-rollup)
  </Tab>

  <Tab title="VRF">
    The VRF service provides **provably fair randomness on-chain**. Fees cover proof generation + posting on-chain.

    > ⚠️ Note: Costs do not include the transaction to request randomness. On ER transactions are free, on Solana transactions may vary based on your priority fees.

    <table style={{ width: "100%", tableLayout: "fixed" }}>
      <thead>
        <tr>
          <th>VRF type</th>
          <th>Amount (SOL)</th>
          <th>Description</th>
        </tr>
      </thead>

      <tbody>
        <tr>
          <td>ER (\<50 ms)</td>
          <td>Free</td>
          <td>Per randomness request</td>
        </tr>

        <tr>
          <td>Solana (\<500 ms)</td>
          <td>0.0008</td>
          <td>Per randomness request</td>
        </tr>

        <tr>
          <td>Solana (1/2 seconds)</td>
          <td>0.0005</td>
          <td>Per randomness request</td>
        </tr>
      </tbody>
    </table>

    ### VRF Cost Simulator: 30-Days

    <VRFCostSimulator />

    [Learn more about VRF →](/pages/verifiable-randomness-functions-vrfs/how-to-guide/quickstart)
  </Tab>

  <Tab title="Private Payments API">
    Private Payment API make it simple to send private stablecoin transfers on Solana Mainnet and/or on an a Private ER.

    <table style={{ width: "100%", tableLayout: "fixed" }}>
      <thead>
        <tr>
          <th>Payment type</th>
          <th>Fixed fee (SOL)</th>
          <th>Volume fee</th>
        </tr>
      </thead>

      <tbody>
        <tr>
          <td>Solana Mainnet</td>
          <td>0.002</td>
          <td>0.1%</td>
        </tr>
      </tbody>
    </table>

    <CardGroup cols={1}>
      <Card title="API Reference" icon="book" href="/pages/private-ephemeral-rollups-pers/api-reference/per/introduction" iconType="duotone">
        Explore the Private Payments API endpoints
      </Card>
    </CardGroup>
  </Tab>
</Tabs>

***

## Customer Support

For support to **run your own nodes**, reach out to:

📧 [development@magicblock.xyz](mailto:development@magicblock.xyz)

<CardGroup cols={2}>
  <Card title="Ephemeral Rollup (ER)" icon="bolt" href="/pages/ephemeral-rollups-ers/how-to-guide/quickstart" iconType="duotone">
    Execute real-time, zero-fee transactions securely on Solana.
  </Card>

  <Card title="Private Ephemeral Rollup (PER)" icon="shield-check" href="/pages/private-ephemeral-rollups-pers/how-to-guide/quickstart" iconType="duotone">
    Protect sensitive data with compliance — built on top of Ephemeral Rollups.
  </Card>

  <Card title="Private Payment API" icon="bag-shopping-plus" href="/pages/private-ephemeral-rollups-pers/api-reference/per/introduction" iconType="duotone">
    Add private onchain transfers to your app in seconds — compliant by default.
  </Card>

  <Card title="Verifiable Randomness Function (VRF)" icon="dice" href="/pages/verifiable-randomness-functions-vrfs/how-to-guide/quickstart" iconType="duotone">
    Add provably fair onchain randomness within a second — for free.
  </Card>

  <Card title="Pricing Oracle" icon="waveform" href="/pages/tools/oracle/introduction" iconType="duotone">
    Access low-latency onchain price feeds for trading and DeFi.
  </Card>
</CardGroup>
